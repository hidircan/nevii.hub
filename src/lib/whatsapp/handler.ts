/**
 * WhatsApp Channel Layer — inbound → Orchestrator → Agent Runtime → outbound.
 */

import { runChatTurn } from "../ai/orchestrator";
import {
  createConversation,
  listConversations,
} from "../ai/conversations";
import { runWithTenantAsync } from "../tenant-context";
import { resolveWhatsAppIdentity } from "./phone-map";
import { getWhatsAppTransport } from "./provider-factory";
import type { InboundWhatsAppMessage } from "./types";
import { recordAiExecution } from "../ai/metrics";
import { getProviderConfig } from "../ai/config";
import { claimSmsInboundEvent } from "../sms/inbound-store";

async function getOrCreateWaConversation(
  tenantId: string,
  userId: string,
  phone: string
) {
  const titlePrefix = `wa:${phone}`;
  const existing = (await listConversations(tenantId, userId)).find((c) =>
    c.title.startsWith(titlePrefix)
  );
  if (existing) return existing;
  return createConversation(tenantId, userId, titlePrefix);
}

/**
 * Process one inbound WhatsApp message end-to-end.
 */
export async function handleInboundWhatsAppMessage(
  msg: InboundWhatsAppMessage
): Promise<{ replied: boolean; error?: string }> {
  const transport = getWhatsAppTransport();
  const identity = resolveWhatsAppIdentity(msg.from);

  if (!identity) {
    await transport.sendText({
      to: msg.from,
      text:
        "NeviiHub: Bu numara bir veli hesabına bağlı değil. " +
        "Lütfen okulla iletişime geçin veya WHATSAPP_PHONE_MAP yapılandırmasını kontrol edin.",
    });
    return { replied: true, error: "unmapped_phone" };
  }

  const t0 = Date.now();
  try {
    const result = await runWithTenantAsync(identity.tenantId, async () => {
      const conv = await getOrCreateWaConversation(
        identity.tenantId,
        identity.userId,
        msg.from
      );
      return runChatTurn({
        ctx: { ...identity, channel: "whatsapp" },
        conversationId: conv.id,
        message: msg.text,
      });
    });

    const reply = result.assistantMessage.content.slice(0, 4000);
    const send = await transport.sendText({ to: msg.from, text: reply });

    const cfg = getProviderConfig();
    void recordAiExecution({
      conversationId: result.conversation.id,
      tenantId: identity.tenantId,
      userId: identity.userId,
      provider: `whatsapp:${transport.name}/${result.provider}`,
      model: cfg.model,
      phase: "turn",
      durationMs: Date.now() - t0,
      success: send.ok,
      error: send.error,
      billableUnits: 1,
    });

    if (!send.ok) return { replied: false, error: send.error };
    return { replied: true };
  } catch (e) {
    const err = e instanceof Error ? e.message : "handler failed";
    await transport.sendText({
      to: msg.from,
      text: "NeviiHub: Mesajınız işlenirken bir hata oluştu. Lütfen tekrar deneyin.",
    });
    return { replied: true, error: err };
  }
}

export async function processWhatsAppWebhook(
  body: unknown,
  headers?: Headers
): Promise<{ processed: number; errors: string[] }> {
  const transport = getWhatsAppTransport();
  const messages = transport.parseInbound(body, headers);
  const errors: string[] = [];
  let processed = 0;

  for (const msg of messages) {
    if (!msg.text?.trim()) continue;
    // Replay protection: same provider message id (e.g. redelivered webhook) processed once.
    const claim = await claimSmsInboundEvent({
      providerMessageId: msg.id,
      kind: "whatsapp",
      processedAt: new Date().toISOString(),
    });
    if (claim === "duplicate") continue;
    const r = await handleInboundWhatsAppMessage(msg);
    processed += 1;
    if (r.error && r.error !== "unmapped_phone") errors.push(r.error);
  }

  return { processed, errors };
}

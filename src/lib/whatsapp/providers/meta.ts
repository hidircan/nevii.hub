import type {
  InboundWhatsAppMessage,
  OutboundWhatsAppMessage,
  WhatsAppSendResult,
  WhatsAppTransport,
} from "../types";
import { getWhatsAppConfig, normalizePhone } from "../config";

/** Meta Cloud API (WhatsApp Business Platform) */
export function createMetaTransport(): WhatsAppTransport {
  const cfg = getWhatsAppConfig();

  return {
    name: "meta",

    verifyWebhook(query: URLSearchParams): string | null {
      const mode = query.get("hub.mode");
      const token = query.get("hub.verify_token");
      const challenge = query.get("hub.challenge");
      if (!cfg.verifyToken) return null; // fail closed: no configured token, no match possible
      if (mode === "subscribe" && token === cfg.verifyToken && challenge) {
        return challenge;
      }
      return null;
    },

    parseInbound(body: unknown): InboundWhatsAppMessage[] {
      const out: InboundWhatsAppMessage[] = [];
      const root = body as {
        entry?: Array<{
          changes?: Array<{
            value?: {
              messages?: Array<{
                id?: string;
                from?: string;
                timestamp?: string;
                type?: string;
                text?: { body?: string };
              }>;
            };
          }>;
        }>;
      };

      for (const entry of root.entry || []) {
        for (const change of entry.changes || []) {
          for (const msg of change.value?.messages || []) {
            if (msg.type && msg.type !== "text") continue;
            const text = msg.text?.body?.trim();
            if (!msg.from || !text) continue;
            out.push({
              id: msg.id || `meta_${Date.now()}`,
              from: normalizePhone(msg.from),
              text,
              timestamp: msg.timestamp
                ? new Date(Number(msg.timestamp) * 1000).toISOString()
                : new Date().toISOString(),
              provider: "meta",
              raw: msg,
            });
          }
        }
      }
      return out;
    },

    async sendText(message: OutboundWhatsAppMessage): Promise<WhatsAppSendResult> {
      if (!cfg.metaToken || !cfg.metaPhoneNumberId) {
        return { ok: false, error: "Meta WhatsApp credentials missing" };
      }
      const url = `https://graph.facebook.com/${cfg.metaApiVersion}/${cfg.metaPhoneNumberId}/messages`;
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${cfg.metaToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: normalizePhone(message.to),
            type: "text",
            text: { body: message.text.slice(0, 4096) },
          }),
        });
        const data = (await res.json()) as {
          messages?: Array<{ id?: string }>;
          error?: { message?: string };
        };
        if (!res.ok) {
          return { ok: false, error: data.error?.message || `Meta HTTP ${res.status}` };
        }
        return { ok: true, messageId: data.messages?.[0]?.id };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Meta send failed" };
      }
    },
  };
}

import { getCommunicationProvider } from "@/lib/communication-provider/provider-factory";
import { claimCommunicationInboundEvent } from "@/lib/communication-provider/inbound-store";
import { consumeRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/client-ip";
import { recordAuditLog } from "@/lib/audit/log";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/communications/webhook — Faz 11 iskeleti. Gerçek bir
 * telefoni/mesajlaşma sağlayıcısı henüz BAĞLI DEĞİL (bkz.
 * communication-provider/types.ts dosya başı notu) — bu route yalnızca
 * (1) imza doğrulama ve (2) `providerMessageId+kind` idempotency claim
 * desenini kanıtlar; gerçek bir sağlayıcı entegre edildiğinde payload
 * ayrıştırılıp `createCallLogTool`/`createMessageLogTool`e (bkz.
 * src/lib/services/tools.ts) yönlendirilecek — bu turda BİLİNÇLİ OLARAK
 * yapılmadı (spec'in kendi kapsam sınırı).
 */
export async function POST(request: Request) {
  if (!consumeRateLimit("communications-webhook", clientIp(request), { windowMs: 60_000, max: 60 })) {
    return Response.json({ ok: false, error: { code: "RATE_LIMITED", message: "Too many requests" } }, { status: 429 });
  }

  const provider = getCommunicationProvider();
  if (!provider.isConfigured()) {
    return Response.json(
      { ok: false, error: { code: "UNAVAILABLE", message: "İletişim webhook sağlayıcısı yapılandırılmadı." } },
      { status: 503 }
    );
  }

  const rawBody = await request.text();
  const signatureHeader = request.headers.get("x-signature");
  const verification = await provider.verifyWebhook({ rawBody, signatureHeader });

  if (!verification.ok) {
    void recordAuditLog({
      tenantId: "public",
      actorUserId: "communications-webhook",
      actorRole: "system",
      action: "communications.webhook_rejected",
      entityType: "CommunicationInboundEvent",
      entityId: "signature",
      outcome: "denied",
      meta: { reason: "bad_signature" },
    });
    return Response.json({ ok: false, error: { code: "UNAUTHORIZED", message: verification.error } }, { status: 401 });
  }

  const claim = await claimCommunicationInboundEvent({
    providerMessageId: verification.providerMessageId,
    kind: "communication_webhook",
    processedAt: new Date().toISOString(),
  });

  return Response.json({ ok: true, data: { claim } });
}

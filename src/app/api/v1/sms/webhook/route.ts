import { getSmsConfig } from "@/lib/sms";
import { processInboundSms } from "@/lib/sms/inbound";
import { consumeSmsWebhookRateLimit } from "@/lib/sms/rate-limit";
import { resolveWebhookPublicUrl, verifyTwilioSignature } from "@/lib/sms/twilio-signature";
import { recordAuditLog } from "@/lib/audit/log";
import { clientIp } from "@/lib/http/client-ip";

export const dynamic = "force-dynamic";

async function readParams(request: Request): Promise<Record<string, string>> {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const form = await request.formData();
    const obj: Record<string, string> = {};
    form.forEach((v, k) => {
      obj[k] = String(v);
    });
    return obj;
  }
  const json = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const obj: Record<string, string> = {};
  for (const [k, v] of Object.entries(json)) {
    if (typeof v === "string") obj[k] = v;
  }
  return obj;
}

/**
 * POST /api/v1/sms/webhook — public Twilio inbound/status callback.
 * Auth = Twilio request signature, not JWT.
 */
export async function POST(request: Request) {
  if (!consumeSmsWebhookRateLimit(clientIp(request))) {
    return Response.json({ ok: false, error: { code: "RATE_LIMITED", message: "Too many requests" } }, { status: 429 });
  }

  const cfg = getSmsConfig();
  const authToken = cfg.twilioAuthToken;
  if (!authToken) {
    return Response.json(
      { ok: false, error: { code: "UNAVAILABLE", message: "SMS webhook is not configured" } },
      { status: 503 }
    );
  }

  let params: Record<string, string>;
  try {
    params = await readParams(request);
  } catch {
    return Response.json({ ok: false, error: { code: "VALIDATION_ERROR", message: "Invalid body" } }, { status: 400 });
  }

  const signature = request.headers.get("x-twilio-signature") || "";
  const url = resolveWebhookPublicUrl(request);
  const okSig = verifyTwilioSignature({ authToken, url, params, signature });
  if (!okSig) {
    void recordAuditLog({
      tenantId: "public",
      actorUserId: "sms-webhook",
      actorRole: "system",
      action: "tahsilat.sms.webhook_rejected",
      entityType: "SmsInbound",
      entityId: "signature",
      outcome: "denied",
      meta: { reason: "bad_signature" },
    });
    return Response.json({ ok: false, error: { code: "UNAUTHORIZED", message: "Invalid signature" } }, { status: 401 });
  }

  const result = await processInboundSms({
    messageSid: params.MessageSid || params.SmsSid || "",
    from: params.From || "",
    body: params.Body || "",
    messageStatus: params.MessageStatus || params.SmsStatus || "",
  });

  return Response.json({ ok: true, data: result });
}

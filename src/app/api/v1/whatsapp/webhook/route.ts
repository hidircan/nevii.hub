import { getWhatsAppTransport, processWhatsAppWebhook } from "@/lib/whatsapp";
import { getWhatsAppConfig } from "@/lib/whatsapp/config";
import { verifyMetaSignature } from "@/lib/whatsapp/meta-signature";
import { consumeRateLimit } from "@/lib/rate-limit";
import { recordAuditLog } from "@/lib/audit/log";
import { clientIp } from "@/lib/http/client-ip";

export const dynamic = "force-dynamic";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 60;

/**
 * GET /api/v1/whatsapp/webhook
 * Meta Cloud API verification challenge.
 */
export async function GET(request: Request) {
  const transport = getWhatsAppTransport();
  const url = new URL(request.url);
  if (transport.verifyWebhook) {
    const challenge = transport.verifyWebhook(url.searchParams);
    if (challenge !== null) {
      return new Response(challenge, {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    }
  }
  // Generic health for other providers — fail closed if no verify token configured.
  const cfg = getWhatsAppConfig();
  if (cfg.verifyToken && url.searchParams.get("hub.verify_token") === cfg.verifyToken) {
    return new Response(url.searchParams.get("hub.challenge") || "ok", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }
  return new Response("Forbidden", { status: 403 });
}

/**
 * POST /api/v1/whatsapp/webhook
 * Inbound messages (Meta / Twilio / Evolution / console test payload).
 * Public endpoint — authenticated via provider signature/shared secret, not JWT.
 */
export async function POST(request: Request) {
  if (!consumeRateLimit("whatsapp-webhook", clientIp(request), {
    windowMs: RATE_LIMIT_WINDOW_MS,
    max: RATE_LIMIT_MAX,
  })) {
    return Response.json(
      { ok: false, error: { code: "RATE_LIMITED", message: "Too many requests" } },
      { status: 429 }
    );
  }

  const cfg = getWhatsAppConfig();

  // Read the raw body once so signature verification runs on the exact bytes Meta signed,
  // before any JSON parsing.
  const rawBody = await request.text();

  if (cfg.provider === "meta") {
    // Meta Cloud API: mandatory HMAC-SHA256 over the raw body, verified against the app secret.
    // Fail closed if the secret isn't configured — never accept an unsigned/unsigneable request.
    if (!cfg.metaAppSecret) {
      return Response.json(
        { ok: false, error: { code: "UNAVAILABLE", message: "WhatsApp webhook is not configured" } },
        { status: 503 }
      );
    }
    const signatureHeader = request.headers.get("x-hub-signature-256") || "";
    const okSig = verifyMetaSignature({
      appSecret: cfg.metaAppSecret,
      rawBody,
      signatureHeader,
    });
    if (!okSig) {
      void recordAuditLog({
        tenantId: "public",
        actorUserId: "whatsapp-webhook",
        actorRole: "system",
        action: "whatsapp.webhook_rejected",
        entityType: "WhatsAppInbound",
        entityId: "signature",
        outcome: "denied",
        meta: { reason: "bad_signature" },
      });
      return Response.json(
        { ok: false, error: { code: "UNAUTHORIZED", message: "Invalid signature" } },
        { status: 401 }
      );
    }
  } else {
    // Non-Meta providers (twilio/evolution/console): shared-secret header, required in production.
    if (!cfg.webhookSecret) {
      return Response.json(
        { ok: false, error: { code: "UNAVAILABLE", message: "WhatsApp webhook is not configured" } },
        { status: 503 }
      );
    }
    const secret = request.headers.get("x-webhook-secret") || "";
    if (secret !== cfg.webhookSecret) {
      void recordAuditLog({
        tenantId: "public",
        actorUserId: "whatsapp-webhook",
        actorRole: "system",
        action: "whatsapp.webhook_rejected",
        entityType: "WhatsAppInbound",
        entityId: "secret",
        outcome: "denied",
        meta: { reason: "bad_secret" },
      });
      return Response.json(
        { ok: false, error: { code: "UNAUTHORIZED", message: "Invalid webhook secret" } },
        { status: 401 }
      );
    }
  }

  let body: unknown;
  const contentType = request.headers.get("content-type") || "";
  try {
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const params = new URLSearchParams(rawBody);
      const obj: Record<string, string> = {};
      params.forEach((v, k) => {
        obj[k] = v;
      });
      body = obj;
    } else {
      body = rawBody ? JSON.parse(rawBody) : {};
    }
  } catch {
    return Response.json(
      { ok: false, error: { code: "VALIDATION_ERROR", message: "Invalid body" } },
      { status: 400 }
    );
  }

  const result = await processWhatsAppWebhook(body, request.headers);

  // Meta expects 200 quickly
  return Response.json({
    ok: true,
    data: {
      processed: result.processed,
      errors: result.errors,
      provider: getWhatsAppConfig().provider,
    },
  });
}

import { randomUUID } from "node:crypto";

/**
 * Cloudflare Turnstile — web girişinin gerçek kullanıcı doğrulaması.
 *
 * Etkinleştirme ile hazır olma ayrıdır: `TURNSTILE_ENABLED=true` + iki anahtar
 * birlikte varsa koruma açıktır ve token doğrulaması fail-closed çalışır
 * (Cloudflare'e ulaşılamazsa giriş reddedilir). Anahtar eksikse koruma etkin
 * SAYILMAZ: canlı giriş kilitlenmez, NeviiOS Sistem Sağlığı'nda "yapılandırma
 * eksik" görünür. Canlıda Cloudflare'in her zaman geçen test anahtarları da
 * yapılandırma eksiği sayılır.
 *
 * `TURNSTILE_ENABLED=observe` geçiş aşamasıdır: widget görünür ve token doğrulanır,
 * sonuç denetim kaydına yazılır ama giriş ENGELLENMEZ. Gerçek anahtarlar ve eski
 * mobil sürüm payı `true` yapılmadan önce böyle ölçülür; bu aşamada koruma sayılmaz.
 *
 * Parola doğrulaması, CSRF, oturum ve rate limit'in YERİNE geçmez; ek katmandır.
 * Secret yalnız sunucudadır; token ve secret loglanmaz.
 */
const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const VERIFY_TIMEOUT_MS = 4000;
const VERIFY_ATTEMPTS = 2;
const MAX_TOKEN_LENGTH = 2048;
const TEST_KEY = /^[123]x0{10,}[A-Z]{2}$/;
const ACTION = "login";

export type TurnstileStatus = "off" | "misconfigured" | "observe" | "active";
export type TurnstileFailure = "missing" | "invalid" | "expired" | "mismatch" | "unavailable";

const siteKey = () => process.env.TURNSTILE_SITE_KEY?.trim() ?? "";
const secretKey = () => process.env.TURNSTILE_SECRET_KEY?.trim() ?? "";

export function turnstileStatus(): TurnstileStatus {
  const flag = process.env.TURNSTILE_ENABLED;
  if (flag !== "true" && flag !== "observe") return "off";
  if (!siteKey() || !secretKey()) return "misconfigured";
  const production = process.env.VERCEL_ENV === "production" || process.env.NEVII_DEPLOYMENT_TIER === "production";
  if (production && (TEST_KEY.test(siteKey()) || TEST_KEY.test(secretKey()))) return "misconfigured";
  return flag === "true" ? "active" : "observe";
}

/** Giriş formuna verilecek public anahtar; koruma veya gözlem yoksa widget çizilmez. */
export function turnstileSiteKeyForWidget(): string | null {
  const status = turnstileStatus();
  return status === "active" || status === "observe" ? siteKey() : null;
}

function allowedHostnames(requestHost: string): string[] {
  const configured = (process.env.TURNSTILE_ALLOWED_HOSTNAMES ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return configured.length > 0 ? configured : [requestHost.toLowerCase()];
}

/** Sunucu doğrulaması. Geçici hatada aynı idempotency anahtarıyla bir kez yeniden dener. */
export async function verifyTurnstileToken(
  token: unknown,
  opts: { requestHost: string; remoteIp?: string }
): Promise<{ ok: true } | { ok: false; reason: TurnstileFailure }> {
  if (typeof token !== "string" || !token) return { ok: false, reason: "missing" };
  if (token.length > MAX_TOKEN_LENGTH) return { ok: false, reason: "invalid" };

  const body = new URLSearchParams({ secret: secretKey(), response: token, idempotency_key: randomUUID() });
  if (opts.remoteIp && opts.remoteIp !== "unknown") body.set("remoteip", opts.remoteIp);

  let result: { success?: boolean; hostname?: string; action?: string; "error-codes"?: string[] } | null = null;
  for (let attempt = 0; attempt < VERIFY_ATTEMPTS && !result; attempt++) {
    try {
      const res = await fetch(SITEVERIFY_URL, { method: "POST", body, signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS) });
      if (res.status < 500) result = await res.json();
    } catch {
      // ağ/zaman aşımı: sıradaki denemeye geçilir
    }
  }
  if (!result) return { ok: false, reason: "unavailable" };

  if (result.success) {
    // Test anahtarları sabit hostname/action döner; canlıda test anahtarı zaten etkin sayılmaz.
    if (TEST_KEY.test(secretKey())) return { ok: true };
    if (result.action !== ACTION) return { ok: false, reason: "mismatch" };
    if (!allowedHostnames(opts.requestHost).includes((result.hostname ?? "").toLowerCase())) return { ok: false, reason: "mismatch" };
    return { ok: true };
  }
  const codes = result["error-codes"] ?? [];
  if (codes.includes("timeout-or-duplicate")) return { ok: false, reason: "expired" };
  if (codes.includes("invalid-input-response")) return { ok: false, reason: "invalid" };
  if (codes.includes("missing-input-response")) return { ok: false, reason: "missing" };
  // Yanlış secret veya Cloudflare iç hatası: kullanıcı çözemez, giriş yine kapalı kalır.
  console.error("[turnstile] siteverify hatası", codes.join(","));
  return { ok: false, reason: "unavailable" };
}

export const TURNSTILE_FAILURES: Record<TurnstileFailure, { code: string; status: number; message: string }> = {
  missing: {
    code: "TURNSTILE_REQUIRED",
    status: 400,
    message: "Güvenlik doğrulaması tamamlanmadı. Formdaki doğrulamanın bitmesini bekleyip tekrar deneyin. Mobil uygulamayı kullanıyorsanız uygulamayı güncelleyin.",
  },
  invalid: {
    code: "TURNSTILE_INVALID",
    status: 400,
    message: "Güvenlik doğrulaması geçersiz. Doğrulama yenilendi; bitmesini bekleyip tekrar deneyin.",
  },
  expired: {
    code: "TURNSTILE_EXPIRED",
    status: 400,
    message: "Güvenlik doğrulamasının süresi doldu veya daha önce kullanıldı. Doğrulama yenilendi; bitmesini bekleyip tekrar deneyin.",
  },
  mismatch: {
    code: "TURNSTILE_INVALID",
    status: 400,
    message: "Güvenlik doğrulaması bu giriş sayfasına ait değil. Sayfayı yenileyip tekrar deneyin.",
  },
  unavailable: {
    code: "TURNSTILE_UNAVAILABLE",
    status: 503,
    message: "Güvenlik doğrulama servisine şu anda ulaşılamıyor, bu yüzden giriş yapılamadı. Birkaç dakika sonra tekrar deneyin.",
  },
};

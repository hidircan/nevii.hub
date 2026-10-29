import { z } from "zod";
import { withApiHandler } from "@/lib/api/handler";
import { jsonFail } from "@/lib/api/http";
import { consumePasswordResetToken, hashPassword, updatePasswordHash, auditLog, isRateLimited } from "@/lib/auth";
import { buildPasswordSetupSessionResponse } from "@/lib/auth/password-setup-session";

export const dynamic = "force-dynamic";

const schema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8, "Şifre en az 8 karakter olmalı."),
  /** P0 (2026-09-05) — istemci ortamı; YALNIZ derin bağlantı/sunum seçimi için. Rol/portal kararını ETKİLEMEZ. */
  surface: z.enum(["desktop_web", "mobile_web", "mobile_app"]).optional(),
  /** Kurulum akışı varış değişikliği — yalnız izinli sabit yol (açık yönlendirme YOK). */
  setupNext: z.literal("/abonelik").optional(),
});

const GENERIC_INVALID_MESSAGE =
  "Bu kodun süresi dolmuş veya zaten kullanılmış. Lütfen yeniden şifre sıfırlama isteği gönderin.";

/**
 * POST /api/v1/auth/reset-password — public. Kod tek kullanımlıktır ve `forgot-password`'de
 * üretilen ham değerle eşleşen sha256 hash aranır; süresi dolmuş/kullanılmış/hatalı kod AYNI
 * jenerik mesajla reddedilir (hangisi olduğunu ayırt etmez — kaba kuvvet keşfini zorlaştırır).
 * Şifre hiçbir yerde loglanmaz. Parola yazımı `updatePasswordHash` üzerinden — Hesabım'daki
 * "şifre değiştir" (`changeOwnPassword`) ile AYNI tek yazma yolu, mantık ikilenmez.
 */
export const POST = withApiHandler(
  async ({ body, ctx, request }) => {
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return jsonFail("VALIDATION_ERROR", parsed.error.issues[0]?.message || "Geçersiz istek.");
    }

    // 8 karakterlik kodu kaba kuvvetle denemeye karşı — istemci/IP başına deneme sınırı
    // (kod alanı yeterince geniş olsa da savunma katmanı olarak).
    const ip = request.headers.get("x-forwarded-for") || "unknown";
    if (isRateLimited(`reset-password:${ip}`, 10, 15 * 60 * 1000)) {
      return jsonFail("RATE_LIMITED", "Çok fazla deneme yapıldı. Lütfen birkaç dakika sonra tekrar deneyin.");
    }

    const consumed = await consumePasswordResetToken(parsed.data.token);
    if (!consumed) {
      return jsonFail("VALIDATION_ERROR", GENERIC_INVALID_MESSAGE);
    }

    const newHash = await hashPassword(parsed.data.newPassword);
    const updated = await updatePasswordHash(consumed.userId, newHash);
    if (!updated) return jsonFail("NOT_FOUND", "Kullanıcı bulunamadı.");

    auditLog({
      action: "auth.password_reset_completed",
      requestId: ctx.requestId || "unknown",
      userId: consumed.userId,
      tenantId: consumed.tenantId,
      outcome: "success",
    });

    return buildPasswordSetupSessionResponse({
      userId: consumed.userId,
      request,
      surface: parsed.data.surface,
      webPathOverride: parsed.data.setupNext,
    });
  },
  { public: true }
);

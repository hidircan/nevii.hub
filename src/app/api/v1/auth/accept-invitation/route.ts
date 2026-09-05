import { z } from "zod";
import { withApiHandler } from "@/lib/api/handler";
import { jsonFail } from "@/lib/api/http";
import { consumePasswordResetToken, hashPassword, updatePasswordHash, auditLog, isRateLimited } from "@/lib/auth";
import { activatePendingPortalAccessForUser } from "@/lib/auth/invitation";
import { buildPasswordSetupSessionResponse } from "@/lib/auth/password-setup-session";

export const dynamic = "force-dynamic";

const schema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8, "Şifre en az 8 karakter olmalı."),
  /** P0 (2026-09-05) — istemci ortamı; YALNIZ derin bağlantı/sunum seçimi için. Rol/portal kararını ETKİLEMEZ. */
  surface: z.enum(["desktop_web", "mobile_web", "mobile_app"]).optional(),
});

const GENERIC_INVALID_MESSAGE =
  "Bu davet bağlantısının süresi dolmuş veya zaten kullanılmış. Lütfen kurumunuzdan yeni bir davet isteyin.";

/**
 * POST /api/v1/auth/accept-invitation — public. `POST /api/v1/auth/reset-password` ile
 * AYNI token altyapısını (`consumePasswordResetToken`/`updatePasswordHash`) kullanır —
 * davet AYRI bir mekanizma DEĞİLDİR, yalnızca kabul sonrası bekleyen (varsa) veli/öğrenci
 * portal erişimini de aktive eder (bkz. `activatePendingPortalAccessForUser`).
 */
export const POST = withApiHandler(
  async ({ body, ctx, request }) => {
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return jsonFail("VALIDATION_ERROR", parsed.error.issues[0]?.message || "Geçersiz istek.");
    }

    const ip = request.headers.get("x-forwarded-for") || "unknown";
    if (isRateLimited(`accept-invitation:${ip}`, 10, 15 * 60 * 1000)) {
      return jsonFail("RATE_LIMITED", "Çok fazla deneme yapıldı. Lütfen birkaç dakika sonra tekrar deneyin.");
    }

    const consumed = await consumePasswordResetToken(parsed.data.token);
    if (!consumed) {
      return jsonFail("VALIDATION_ERROR", GENERIC_INVALID_MESSAGE);
    }

    const newHash = await hashPassword(parsed.data.newPassword);
    const updated = await updatePasswordHash(consumed.userId, newHash);
    if (!updated) return jsonFail("NOT_FOUND", "Kullanıcı bulunamadı.");

    const activatedAccessCount = await activatePendingPortalAccessForUser(consumed.tenantId, consumed.userId);

    auditLog({
      action: "auth.invitation_accepted",
      requestId: ctx.requestId || "unknown",
      userId: consumed.userId,
      tenantId: consumed.tenantId,
      outcome: "success",
      meta: { activatedAccessCount },
    });

    // P0 (2026-09-05) — kullanıcıyı `/login`e atmak yerine oturumunu koru ve
    // rolüne göre doğru portalı bildir (bkz. password-setup-session.ts).
    return buildPasswordSetupSessionResponse({
      userId: consumed.userId,
      request,
      surface: parsed.data.surface,
    });
  },
  { public: true }
);

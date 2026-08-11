import { z } from "zod";
import { withApiHandler } from "@/lib/api/handler";
import { ok, fail } from "@/lib/services/result";
import { changeOwnPassword } from "@/lib/auth/users";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

/**
 * POST /api/v1/account/change-password — yalnızca KENDİ hesabı, `ctx.userId`
 * session'dan gelir, body'den değil (PII/tenant güvenliği). Permission
 * gerekmez (self-service) — yalnızca kimlik doğrulama (`withApiHandler`
 * varsayılanı) yeterli.
 */
export const POST = withApiHandler(async ({ ctx, body }) => {
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Geçersiz şifre girdisi (yeni şifre en az 8 karakter olmalı)");

  const result = await changeOwnPassword(ctx.userId, parsed.data.currentPassword, parsed.data.newPassword);
  if (result.ok) return ok({ changed: true });

  switch (result.code) {
    case "MODE_NOT_SUPPORTED":
      return fail(
        "VALIDATION_ERROR",
        "Bu ortamda (json/memory demo modu) şifre değişikliği kalıcı olarak saklanamaz — yalnızca canlı (db) modda çalışır."
      );
    case "WRONG_PASSWORD":
      return fail("VALIDATION_ERROR", "Mevcut şifre yanlış.");
    case "WEAK_PASSWORD":
      return fail("VALIDATION_ERROR", "Yeni şifre en az 8 karakter olmalı.");
    case "USER_NOT_FOUND":
    default:
      return fail("NOT_FOUND", "Kullanıcı bulunamadı.");
  }
});

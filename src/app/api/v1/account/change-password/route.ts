import { z } from "zod";
import { withApiHandler } from "@/lib/api/handler";
import { fail } from "@/lib/services/result";
import { NextResponse } from "next/server";
import { changeOwnPassword, getUserById } from "@/lib/auth/users";
import { issueTokenPair } from "@/lib/auth/jwt";
import { applyAuthCookies } from "@/lib/auth/cookies";

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
  if (result.ok) {
    // Diğer oturumlar iptal edildi; bu oturum yeni token çiftiyle devam eder.
    // Şifre yanıta/audit'e yazılmaz.
    const user = await getUserById(ctx.userId);
    const res = NextResponse.json({ ok: true as const, data: { changed: true, otherSessionsRevoked: true } });
    if (user) applyAuthCookies(res, await issueTokenPair({ ...user, sid: ctx.sid }));
    return res;
  }

  switch (result.code) {
    case "WRONG_PASSWORD":
      return fail("VALIDATION_ERROR", "Mevcut şifre yanlış.");
    case "WEAK_PASSWORD":
      return fail("VALIDATION_ERROR", "Yeni şifre en az 8 karakter olmalı.");
    case "USER_NOT_FOUND":
    default:
      return fail("NOT_FOUND", "Kullanıcı bulunamadı.");
  }
});

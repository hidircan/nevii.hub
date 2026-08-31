import { z } from "zod";
import { withApiHandler } from "@/lib/api/handler";
import { jsonOk, jsonFail } from "@/lib/api/http";
import { changeOwnPassword } from "@/lib/auth/users";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

/**
 * POST /api/v1/auth/change-password — mobil "Hesabım → Şifre Değiştir" ekranının
 * çağırdığı yol (bkz. apps/mobile/src/features/account/change-password-screen.tsx).
 * `/api/v1/account/change-password` (web) ile AYNI kanonik `changeOwnPassword`
 * uygulamasının ince bir sarmalayıcısı — parola güncelleme mantığı TEK yerde
 * (`src/lib/auth/users.ts`), iki route arasında yinelenmez. Yalnızca KENDİ hesabı
 * (`ctx.userId` session'dan gelir, body'den DEĞİL).
 */
export const POST = withApiHandler(async ({ ctx, body }) => {
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return jsonFail("VALIDATION_ERROR", "Geçersiz şifre girdisi (yeni şifre en az 8 karakter olmalı)");

  const result = await changeOwnPassword(ctx.userId, parsed.data.currentPassword, parsed.data.newPassword);
  if (result.ok) return jsonOk({ changed: true });

  switch (result.code) {
    case "WRONG_PASSWORD":
      return jsonFail("VALIDATION_ERROR", "Mevcut şifre yanlış.");
    case "WEAK_PASSWORD":
      return jsonFail("VALIDATION_ERROR", "Yeni şifre en az 8 karakter olmalı.");
    case "USER_NOT_FOUND":
    default:
      return jsonFail("NOT_FOUND", "Kullanıcı bulunamadı.");
  }
});

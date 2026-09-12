import { z } from "zod";
import { withApiHandler } from "@/lib/api/handler";
import { ok, fail } from "@/lib/services/result";
import { requestEmailChange } from "@/lib/auth/email-change";
import { getInstitutionContext } from "@/lib/institution/context";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  currentPassword: z.string().min(1),
  newEmail: z.string().min(3),
});

/**
 * POST /api/v1/account/email-change/request — yalnızca KENDİ hesabı
 * (`ctx.userId` session'dan gelir, body'den değil). Tüm roller (panel +
 * portallar) kullanır — permission gerekmez (self-service), yalnızca
 * kimlik doğrulama yeterli. Mevcut şifre + yeni adrese doğrulama bağlantısı
 * + eski adrese güvenlik bildirimi (bkz. email-change.ts).
 */
export const POST = withApiHandler(async ({ ctx, body }) => {
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Geçerli bir e-posta ve mevcut şifrenizi girin.");

  let institutionName: string | undefined;
  try {
    const kurum = await getInstitutionContext(ctx);
    institutionName = kurum.available.find((k) => k.tenantId === ctx.tenantId)?.name;
  } catch {
    // best-effort — e-posta varsayılan kurum adıyla gider.
  }

  const result = await requestEmailChange({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    currentPassword: parsed.data.currentPassword,
    newEmail: parsed.data.newEmail,
    institutionName,
  });
  if (result.ok) {
    return ok({
      requested: true,
      sentToNew: result.sentToNew,
      notifiedOld: result.notifiedOld,
      // Yalnız sağlayıcı yoksa (local): yanıtı gören hesap sahibi test edebilir.
      ...(result.devToken ? { devToken: result.devToken } : {}),
    });
  }
  switch (result.code) {
    case "WRONG_PASSWORD":
      return fail("VALIDATION_ERROR", "Mevcut şifre yanlış.");
    case "SAME_EMAIL":
      return fail("VALIDATION_ERROR", "Yeni adres mevcut adresinizle aynı.");
    case "INVALID_EMAIL":
      return fail("VALIDATION_ERROR", "Geçerli bir e-posta adresi girin.");
    case "TAKEN":
      return fail("VALIDATION_ERROR", "Bu e-posta adresi zaten başka bir hesaba ait.");
    case "RATE_LIMITED":
      return fail("RATE_LIMITED", "Çok fazla deneme yapıldı. Lütfen bir süre sonra tekrar deneyin.");
    case "USER_NOT_FOUND":
    default:
      return fail("NOT_FOUND", "Kullanıcı bulunamadı.");
  }
});

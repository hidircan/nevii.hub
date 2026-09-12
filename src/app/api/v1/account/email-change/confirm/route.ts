import { z } from "zod";
import { withApiHandler } from "@/lib/api/handler";
import { ok, fail } from "@/lib/services/result";
import { confirmEmailChange } from "@/lib/auth/email-change";

export const dynamic = "force-dynamic";

const BodySchema = z.object({ token: z.string().min(1) });

/**
 * POST /api/v1/account/email-change/confirm — doğrulama bağlantısından
 * gelen tek kullanımlık token'ı kesinleştirir. Token'ın kendisi yetki
 * taşır (e-posta kutusuna erişim kanıtı); session GEREKMEZ (kullanıcı
 * bağlantıyı farklı cihazda açabilir) — public endpoint.
 */
export const POST = withApiHandler(async ({ body }) => {
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Doğrulama bağlantısı eksik.");

  const result = await confirmEmailChange(parsed.data.token);
  if (result.ok) return ok({ confirmed: true, newEmail: result.newEmail });

  switch (result.code) {
    case "EXPIRED":
      return fail("VALIDATION_ERROR", "Bağlantının süresi dolmuş. Hesabınızdan yeniden istek oluşturun.");
    case "TAKEN":
      return fail("VALIDATION_ERROR", "Bu adres artık başka bir hesaba ait. Farklı bir adres deneyin.");
    case "USER_NOT_FOUND":
      return fail("NOT_FOUND", "Hesap bulunamadı.");
    case "UPDATE_FAILED":
      return fail("INTERNAL_ERROR", "E-posta güncellenemedi. Lütfen tekrar deneyin.");
    case "INVALID_TOKEN":
    default:
      return fail("VALIDATION_ERROR", "Bağlantı geçersiz veya daha önce kullanılmış.");
  }
}, { public: true });

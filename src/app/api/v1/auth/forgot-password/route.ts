import { z } from "zod";
import { withApiHandler } from "@/lib/api/handler";
import { jsonOk, jsonFail } from "@/lib/api/http";
import { findUserByEmail, createPasswordResetToken, isRateLimited, auditLog } from "@/lib/auth";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const schema = z.object({ email: z.string().email() });

/** Hesap var/yok fark etmeksizin AYNI metin — enumeration koruması (bkz. görev talebi "does not reveal whether the account exists"). */
const NEUTRAL_MESSAGE = "Bu e-posta adresine kayıtlı bir hesap varsa, şifre sıfırlama talimatları gönderildi.";

/**
 * POST /api/v1/auth/forgot-password — public. Hesap var mı yok mu HER ZAMAN aynı nötr
 * yanıtı döner (timing/response-shape farkı olmaması için hesap bulunamasa bile aynı
 * status/gövde şekli). Gerçek bir e-posta/SMS sağlayıcı bu kod tabanında henüz YOK —
 * `devResetToken` yalnızca production DIŞINDA, geliştirme/demo akışının test
 * edilebilmesi için yanıta eklenir; production'da hiçbir zaman token loglanmaz veya
 * yanıta eklenmez.
 */
export const POST = withApiHandler(
  async ({ body, ctx, request }) => {
    const parsed = schema.safeParse(body);
    if (!parsed.success) return jsonFail("VALIDATION_ERROR", "Geçerli bir e-posta adresi girin.");
    const email = parsed.data.email.trim().toLowerCase();

    const ip = request.headers.get("x-forwarded-for") || "unknown";
    if (
      isRateLimited(`forgot-password:${email}`, 5, 15 * 60 * 1000) ||
      isRateLimited(`forgot-password:ip:${ip}`, 20, 15 * 60 * 1000)
    ) {
      // Nötr yanıt — limit aşıldığını dahi sızdırma.
      return jsonOk({ message: NEUTRAL_MESSAGE });
    }

    const user = await findUserByEmail(email);
    let devResetToken: string | undefined;
    // AI_AGENT bir servis hesabıdır, insan girişi yoktur: sıfırlama başlatılmaz (yanıt yine nötr).
    // Aksi halde e-posta alan adını ele geçiren biri hesabın şifresini belirleyebilirdi (2026-10-02).
    if (user && user.role !== "AI_AGENT") {
      // Düzeltme (portal erişim yönetimi görevi) — bu uç ÖNCEDEN yalnızca
      // token üretiyordu, HİÇBİR e-posta göndermiyordu (`devResetToken`
      // yalnızca geliştirme ortamında yanıt gövdesine ekleniyordu).
      // Production'da kimse kodu ALAMIYORDU — akış sessizce kırıktı.
      // `sendPasswordResetEmail` (admin-tetikli sıfırlamayla AYNI fonksiyon,
      // bkz. src/lib/auth/invitation.ts) artık her zaman çağrılır.
      const raw = await createPasswordResetToken(user.tenantId, user.userId);
      if (process.env.NODE_ENV !== "production") devResetToken = raw;
      try {
        const { sendPasswordResetEmail } = await import("@/lib/auth/invitation");
        const { BRAND } = await import("@/lib/brand");
        const { resolveTenantLanguage } = await import("@/lib/i18n/locale");
        const locale = user.role === "HYPER_ADMIN" ? "tr" : await resolveTenantLanguage(user.tenantId);
        const sent = await sendPasswordResetEmail({
          tenantId: user.tenantId,
          userId: user.userId,
          email,
          recipientName: "",
          institutionName: BRAND.name,
          rawToken: raw,
          locale,
        });
        if (!sent.delivered) {
          // Dışarıya yine nötr yanıt gider. Teslim hatası yalnız denetim kaydındadır.
          auditLog({
            action: "auth.password_reset_delivery",
            requestId: ctx.requestId || "unknown",
            userId: user.userId,
            tenantId: user.tenantId,
            role: user.role,
            outcome: "denied",
            meta: { reason: sent.reason, blocked: sent.blocked },
          });
          logger.error("forgot-password — e-posta teslim edilmedi", { reason: sent.reason, blocked: sent.blocked });
        }
      } catch (error) {
        logger.error("forgot-password — sendPasswordResetEmail failed", error);
        auditLog({
          action: "auth.password_reset_delivery",
          requestId: ctx.requestId || "unknown",
          userId: user.userId,
          tenantId: user.tenantId,
          role: user.role,
          outcome: "denied",
          meta: { reason: "SEND_THREW" },
        });
      }
      auditLog({
        action: "auth.password_reset_requested",
        requestId: ctx.requestId || "unknown",
        userId: user.userId,
        tenantId: user.tenantId,
        role: user.role,
        outcome: "success",
      });
    }

    return jsonOk({ message: NEUTRAL_MESSAGE, ...(devResetToken ? { devResetToken } : {}) });
  },
  { public: true }
);

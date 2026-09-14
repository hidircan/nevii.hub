import { withApiHandler } from "@/lib/api/handler";
import { BRAND } from "@/lib/brand";
import { isDbMode } from "@/lib/config";
import { logger } from "@/lib/logger";
import { ok } from "@/lib/services/result";
import { classifyDbError } from "@/lib/db/error-class";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/ready — PUBLIC readiness (deploy smoke test, native cihazlar).
 *
 * Public yanıt yalnız `{ service, ready, time }` taşır. Store modu, veritabanı,
 * storage, SMS/provider durumu veya DB hata sınıfı public yanıta KONMAZ — bunlar
 * altyapı keşfine yarar. DB erişilemezse `ready: false` döner; hata sınıfı
 * (kapalı liste, ham mesaj değil) yalnız sunucu loguna (Vercel Runtime Logs) yazılır.
 */
export const GET = withApiHandler(
  async () => {
    let ready = true;
    if (isDbMode) {
      try {
        const { prisma } = await import("@/lib/db");
        await prisma.$queryRaw`SELECT 1`;
      } catch (error) {
        ready = false;
        logger.warn("[ready] database unreachable", { errorClass: classifyDbError(error) });
      }
    }
    return ok({ service: BRAND.name, ready, time: new Date().toISOString() });
  },
  { public: true }
);

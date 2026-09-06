import { withApiHandler } from "@/lib/api/handler";
import { STORE_MODE, isDbMode } from "@/lib/config";
import { ok } from "@/lib/services/result";
import { isSmsProviderConfigured, isSmsTestMode } from "@/lib/sms";
import { classifyDbError, type DbErrorClass } from "@/lib/db/error-class";

/**
 * Hata sınıfı YALNIZ preview/test/local ortamda döner; production yanıtı
 * bugünkü haliyle kalır. Fail-closed: ortam kesin olarak "production değil"
 * diye tanınamıyorsa alan hiç eklenmez. DİKKAT: Vercel Preview'de de
 * `NODE_ENV=production`'dır (Next.js production build), ortamı ayıran tek
 * sinyal `VERCEL_ENV`'dir.
 */
function exposesErrorClass(): boolean {
  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv) return vercelEnv === "preview" || vercelEnv === "development";
  return !process.env.VERCEL && process.env.NODE_ENV !== "production";
}

export const dynamic = "force-dynamic";

/** GET /api/v1/ready — public readiness. Never returns secrets. */
export const GET = withApiHandler(
  async () => {
    let databaseReachable: boolean | null = null;
    let errorClass: DbErrorClass | null = null;
    if (isDbMode) {
      try {
        const { prisma } = await import("@/lib/db");
        await prisma.$queryRaw`SELECT 1`;
        databaseReachable = true;
      } catch (error) {
        databaseReachable = false;
        errorClass = classifyDbError(error);
      }
    }
    const storageConfigured = Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    const ready = databaseReachable !== false;
    return ok({
      service: "notaplan",
      ready,
      storeMode: STORE_MODE,
      database: {
        configured: Boolean(process.env.DATABASE_URL),
        reachable: databaseReachable,
        ...(errorClass && exposesErrorClass() ? { errorClass } : {}),
      },
      sms: {
        providerConfigured: isSmsProviderConfigured(),
        testMode: isSmsTestMode(),
        webhookAuthConfigured: Boolean(process.env.TWILIO_AUTH_TOKEN),
      },
      storage: { configured: storageConfigured },
      time: new Date().toISOString(),
    });
  },
  { public: true }
);

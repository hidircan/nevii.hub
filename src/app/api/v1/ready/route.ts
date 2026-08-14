import { withApiHandler } from "@/lib/api/handler";
import { STORE_MODE, isDbMode } from "@/lib/config";
import { ok } from "@/lib/services/result";
import { isSmsProviderConfigured, isSmsTestMode } from "@/lib/sms";

export const dynamic = "force-dynamic";

/** GET /api/v1/ready — public readiness. Never returns secrets. */
export const GET = withApiHandler(
  async () => {
    let databaseReachable: boolean | null = null;
    if (isDbMode) {
      try {
        const { prisma } = await import("@/lib/db");
        await prisma.$queryRaw`SELECT 1`;
        databaseReachable = true;
      } catch {
        databaseReachable = false;
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

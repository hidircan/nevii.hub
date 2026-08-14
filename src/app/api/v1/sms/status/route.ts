import { withApiHandler } from "@/lib/api/handler";
import { fromServiceResult } from "@/lib/api/http";
import { isSmsProviderConfigured, isSmsTestMode } from "@/lib/sms";

export const dynamic = "force-dynamic";

/** Test/live flags only — no allowlist numbers, no credentials. */
export const GET = withApiHandler(async ({ ctx }) => {
  if (ctx.role !== "SCHOOL_ADMIN" && ctx.role !== "SUPER_ADMIN") {
    return fromServiceResult({
      ok: false as const,
      error: { code: "FORBIDDEN" as const, message: "Yetersiz yetki" },
    });
  }
  return fromServiceResult({
    ok: true as const,
    data: {
      testMode: isSmsTestMode(),
      configured: isSmsProviderConfigured(),
    },
  });
});

import { withApiHandler } from "@/lib/api/handler";
import { fail } from "@/lib/services/result";
import { getMobilePolicy } from "@/lib/platform/mobile-policy";

export const dynamic = "force-dynamic";

/**
 * Mobil uygulama sözleşmesi (contractVersion 1):
 *   GET /api/v1/mobile/policy?platform=ios|android&appVersion=x.y.z
 * Bearer token ile çağrılır; tenant ve rol yalnız token'dan gelir.
 */
export const GET = withApiHandler(
  async ({ ctx, searchParams }) => {
    if (ctx.role === "HYPER_ADMIN") return fail("FORBIDDEN", "Platform hesabı mobil kurum portalı kullanmaz.");
    const platform = searchParams.get("platform");
    if (platform && platform !== "ios" && platform !== "android") return fail("VALIDATION_ERROR", "platform ios veya android olmalı");
    return getMobilePolicy(ctx, {
      platform: (platform as "ios" | "android" | null) ?? undefined,
      appVersion: searchParams.get("appVersion") ?? undefined,
    });
  },
  { allowBranchManager: true }
);

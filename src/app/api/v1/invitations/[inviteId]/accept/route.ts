import { withApiHandler } from "@/lib/api/handler";
import { jsonFail } from "@/lib/api/http";
import { consumeRateLimit } from "@/lib/rate-limit";
import { acceptOwnerInvitation } from "@/lib/platform/provision";

export const dynamic = "force-dynamic";

/** Public davet kabulü — token hash + süre + tek kullanım + rate limit. */
export const POST = withApiHandler(
  async ({ request, params, body }) => {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!consumeRateLimit("invite-accept", ip, { windowMs: 15 * 60_000, max: 10 })) {
      return jsonFail("RATE_LIMITED", "Çok fazla deneme. Lütfen biraz sonra tekrar deneyin.");
    }
    if (!params.inviteId) return jsonFail("VALIDATION_ERROR", "Davet gerekli");
    return acceptOwnerInvitation(params.inviteId, body);
  },
  { public: true }
);

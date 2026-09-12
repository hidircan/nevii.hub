import { withApiHandler } from "@/lib/api/handler";
import { jsonFail } from "@/lib/api/http";
import { consumeRateLimit } from "@/lib/rate-limit";
import { completePasswordReset } from "@/lib/platform/user-lifecycle";

export const dynamic = "force-dynamic";

/** Public şifre sıfırlama tamamlama — token hash, süre, tek kullanım, rate limit. */
export const POST = withApiHandler(
  async ({ request, body }) => {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!consumeRateLimit("password-reset", ip, { windowMs: 15 * 60_000, max: 10 })) {
      return jsonFail("RATE_LIMITED", "Çok fazla deneme. Lütfen biraz sonra tekrar deneyin.");
    }
    return completePasswordReset(body);
  },
  { public: true }
);

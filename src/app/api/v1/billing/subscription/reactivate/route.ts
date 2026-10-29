import { withApiHandler } from "@/lib/api/handler";
import { consumeRateLimit } from "@/lib/rate-limit";
import { fail } from "@/lib/services/result";
import { reactivate } from "@/lib/saas-billing/subscriptions";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/billing/subscription/reactivate
 * Yeniden etkinleştirme: ödeme doğrulanmadan hak açılmaz (pending'e döner,
 * checkout akışı tamamlanınca webhook active'e geçirir).
 */
export const POST = withApiHandler(async ({ ctx }) => {
  // §12: yeniden etkinleştirme — kullanıcı başına saatte 10.
  if (!consumeRateLimit("billing-reactivate-user", `u:${ctx.userId}`, { windowMs: 3600_000, max: 10 })) {
    return fail("RATE_LIMITED", "Çok fazla istek. Lütfen daha sonra tekrar deneyin.");
  }
  return reactivate(ctx.tenantId);
}, { permission: "billing:write" });

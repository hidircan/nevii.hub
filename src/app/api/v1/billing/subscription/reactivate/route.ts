import { withApiHandler } from "@/lib/api/handler";
import { reactivate } from "@/lib/saas-billing/subscriptions";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/billing/subscription/reactivate
 * Yeniden etkinleştirme: ödeme doğrulanmadan hak açılmaz (pending'e döner,
 * checkout akışı tamamlanınca webhook active'e geçirir).
 */
export const POST = withApiHandler(
  async ({ ctx }) => reactivate(ctx.tenantId),
  { permission: "billing:write" }
);

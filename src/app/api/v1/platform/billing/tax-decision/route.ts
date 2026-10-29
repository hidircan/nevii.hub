import { withApiHandler } from "@/lib/api/handler";
import { listTaxDecisions, recordTaxDecision } from "@/lib/saas-billing/tax-decisions";

export const dynamic = "force-dynamic";

/**
 * GET/POST /api/v1/platform/billing/tax-decision (HYPER_ADMIN).
 * KDV oranı KARAR kaydı (denetim izli). Yürürlükteki oran yalnız env'den
 * gelir; bu kayıt tek başına oranı değiştirmez.
 */
export const GET = withApiHandler(
  async ({ ctx }) => listTaxDecisions(ctx),
  { hyperAdminOnly: true, permission: "platform:read" }
);

export const POST = withApiHandler(
  async ({ ctx, body }) => recordTaxDecision(ctx, body),
  { hyperAdminOnly: true, permission: "platform:write" }
);

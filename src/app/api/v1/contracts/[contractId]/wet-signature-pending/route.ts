import { withApiHandler } from "@/lib/api/handler";
import { markStudentContractWetSignaturePendingTool } from "@/lib/services";

export const dynamic = "force-dynamic";

/** POST /api/v1/contracts/:contractId/wet-signature-pending — "Islak imza bekleniyor" olarak işaretle. */
export const POST = withApiHandler(
  async ({ ctx, params }) => markStudentContractWetSignaturePendingTool(ctx, { contractId: params.contractId }),
  { permission: "contracts:write" }
);

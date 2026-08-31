import { withApiHandler } from "@/lib/api/handler";
import { getContractHtmlTool } from "@/lib/services";

export const dynamic = "force-dynamic";

/** GET /api/v1/contracts/:contractId/html — yazdırılabilir/görüntülenebilir sözleşme içeriği. */
export const GET = withApiHandler(
  async ({ ctx, params }) => getContractHtmlTool(ctx, { contractId: params.contractId }),
  { permission: "contracts:read" }
);

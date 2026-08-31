import { withApiHandler } from "@/lib/api/handler";
import { printStudentContractTool } from "@/lib/services";

export const dynamic = "force-dynamic";

/** POST /api/v1/contracts/:contractId/print — yazdır/yeniden yazdır ("Yazdırıldı"). */
export const POST = withApiHandler(
  async ({ ctx, params }) => printStudentContractTool(ctx, { contractId: params.contractId }),
  { permission: "contracts:write" }
);

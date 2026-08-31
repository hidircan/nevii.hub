import { withApiHandler } from "@/lib/api/handler";
import { cancelStudentContractTool } from "@/lib/services";

export const dynamic = "force-dynamic";

/** POST /api/v1/contracts/:contractId/cancel — yanlışlıkla oluşturulmuş bir sözleşmeyi iptal eder (hard delete YOK). */
export const POST = withApiHandler(
  async ({ ctx, params }) => cancelStudentContractTool(ctx, { contractId: params.contractId }),
  { permission: "contracts:write" }
);

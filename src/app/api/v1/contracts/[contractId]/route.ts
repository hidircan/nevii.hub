import { withApiHandler } from "@/lib/api/handler";
import { getStudentContractTool } from "@/lib/services";

export const dynamic = "force-dynamic";

/** GET /api/v1/contracts/:contractId — detay + taksit planı. Erişim: staff (admin) veya sözleşmenin sahibi öğrenci/veli. */
export const GET = withApiHandler(
  async ({ ctx, params }) => getStudentContractTool(ctx, { contractId: params.contractId }),
  { permission: "contracts:read" }
);

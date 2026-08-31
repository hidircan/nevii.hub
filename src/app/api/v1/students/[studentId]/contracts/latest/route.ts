import { withApiHandler } from "@/lib/api/handler";
import { getLatestStudentContractTool } from "@/lib/services";

export const dynamic = "force-dynamic";

/** GET /api/v1/students/:studentId/contracts/latest — güncel/aktif sözleşme (Sözleşme Yenile akışının başlangıcı). */
export const GET = withApiHandler(
  async ({ ctx, params }) => getLatestStudentContractTool(ctx, { studentId: params.studentId }),
  { permission: "contracts:read" }
);

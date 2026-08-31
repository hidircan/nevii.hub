import { withApiHandler } from "@/lib/api/handler";
import { listStudentContractsTool } from "@/lib/services";

export const dynamic = "force-dynamic";

/** GET /api/v1/students/:studentId/contracts — sözleşme geçmişi (en yeni versiyon önce). */
export const GET = withApiHandler(
  async ({ ctx, params }) => listStudentContractsTool(ctx, { studentId: params.studentId }),
  { permission: "contracts:read" }
);

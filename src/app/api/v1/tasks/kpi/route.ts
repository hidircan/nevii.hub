import { withApiHandler } from "@/lib/api/handler";
import { getTaskKpiSummaryTool } from "@/lib/services";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/tasks/kpi — görev sayaçları (İşlemler rozeti + iş-takip
 * başlığı). Statik segment `[taskId]`'dan önce eşleşir; daha önce bu yol
 * sessizce task-detay route'una düşüp NOT_FOUND dönüyordu.
 */
export const GET = withApiHandler(async ({ ctx }) => getTaskKpiSummaryTool(ctx), {
  permission: "tasks:read",
});

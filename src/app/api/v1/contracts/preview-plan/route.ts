import { withApiHandler } from "@/lib/api/handler";
import { previewContractInstallmentPlanTool } from "@/lib/services";

export const dynamic = "force-dynamic";

/** POST /api/v1/contracts/preview-plan — kalıcı kayıt YAZMAZ, yalnızca taksit planı + toplam tutarı önizler. */
export const POST = withApiHandler(async ({ ctx, body }) => previewContractInstallmentPlanTool(ctx, body), {
  permission: "contracts:write",
});

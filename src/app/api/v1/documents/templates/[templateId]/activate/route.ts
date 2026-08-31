import { withApiHandler } from "@/lib/api/handler";
import { activateContractTemplateTool } from "@/lib/services";

export const dynamic = "force-dynamic";

/** POST /api/v1/documents/templates/:templateId/activate — etkinleştirir VE aynı tür için diğer tüm şablonları pasifleştirir. */
export const POST = withApiHandler(
  async ({ ctx, params }) => activateContractTemplateTool(ctx, { templateId: params.templateId }),
  { permission: "documents:write" }
);

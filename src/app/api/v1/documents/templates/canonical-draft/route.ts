import { withApiHandler } from "@/lib/api/handler";
import { createContractTemplateDraftFromCanonicalSourceTool } from "@/lib/services";

export const dynamic = "force-dynamic";

/** POST /api/v1/documents/templates/canonical-draft — kurumsal kaynaktan YIKICI OLMAYAN taslak oluşturur (active:false). */
export const POST = withApiHandler(async ({ ctx }) => createContractTemplateDraftFromCanonicalSourceTool(ctx), {
  permission: "documents:write",
});

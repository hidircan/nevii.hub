import { withApiHandler } from "@/lib/api/handler";
import { createContractTemplateDraftFromCanonicalSourceTool } from "@/lib/services";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/documents/templates/canonical-draft — kurumsal kaynaktan
 * YIKICI OLMAYAN taslak oluşturur (`active:false`). Gövdede `kind`
 * verilebilir (`kvkk` / `parent_social_media_consent`); verilmezse eski
 * davranış (kayıt sözleşmesi) korunur. Etkinleştirme AYRI bir adımdır.
 */
export const POST = withApiHandler(async ({ ctx, body }) => createContractTemplateDraftFromCanonicalSourceTool(ctx, body), {
  permission: "documents:write",
});

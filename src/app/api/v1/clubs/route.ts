import { withApiHandler } from "@/lib/api/handler";
import { deleteClubTool, getClubDeleteImpactTool, listClubsTool, saveClubTool } from "@/lib/clubs";

export const dynamic = "force-dynamic";

/** GET /api/v1/clubs — kulüpler + üyelikler; `?deleteImpact=<clubId>` silme etkisi önizlemesi. Rol kapısı tool katmanında. */
export const GET = withApiHandler(async ({ ctx, searchParams }) => {
  const impactFor = searchParams.get("deleteImpact");
  return impactFor ? getClubDeleteImpactTool(ctx, { clubId: impactFor }) : listClubsTool(ctx);
});

/** POST /api/v1/clubs — kulüp oluştur / güncelle (`id` varsa güncelleme). */
export const POST = withApiHandler(async ({ ctx, body }) => saveClubTool(ctx, body));

/** DELETE /api/v1/clubs { clubId, criticalPassword, reason } — yanlış oluşturulan kulübü sil (gizle). */
export const DELETE = withApiHandler(async ({ ctx, body }) => deleteClubTool(ctx, body));

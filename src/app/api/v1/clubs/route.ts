import { withApiHandler } from "@/lib/api/handler";
import { listClubsTool, saveClubTool } from "@/lib/clubs";

export const dynamic = "force-dynamic";

/** GET /api/v1/clubs — kulüpler + üyelikler. Rol kapısı tool katmanında (kurum yöneticisi). */
export const GET = withApiHandler(async ({ ctx }) => listClubsTool(ctx));

/** POST /api/v1/clubs — kulüp oluştur / güncelle (`id` varsa güncelleme). */
export const POST = withApiHandler(async ({ ctx, body }) => saveClubTool(ctx, body));

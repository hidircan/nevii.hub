import { withApiHandler } from "@/lib/api/handler";
import { getClubApplicationTool, listClubApplicationsTool, updateClubApplicationTool } from "@/lib/club-applications";

export const dynamic = "force-dynamic";

/** GET /api/v1/club-applications?clubId&branchId&status&from&to&q&page — veya `?id=` tek başvuru. Rol kapısı tool katmanında. */
export const GET = withApiHandler(async ({ ctx, searchParams }) => {
  const id = searchParams.get("id");
  if (id) return getClubApplicationTool(ctx, { id });
  const f: Record<string, string> = {};
  for (const k of ["clubId", "branchId", "status", "from", "to", "q", "page", "pageSize"]) {
    const v = searchParams.get(k);
    if (v) f[k] = v;
  }
  return listClubApplicationsTool(ctx, f);
});

/** PATCH /api/v1/club-applications { id, status?, staffNote? } — durum / yönetim notu (denetim kaydına yazılır). */
export const PATCH = withApiHandler(async ({ ctx, body }) => updateClubApplicationTool(ctx, body));

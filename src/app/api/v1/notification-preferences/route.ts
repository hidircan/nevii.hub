import { withApiHandler } from "@/lib/api/handler";
import { getNotificationPreferencesTool, setNotificationPreferencesTool } from "@/lib/services";
import { getCategoryDef, isNotificationCategory } from "@/lib/notification-categories";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/notification-preferences — yalnızca çağıranın kendi tercihleri.
 * `getNotificationPreferencesTool` TÜM implemented kategorileri döner (rol-bağımsız
 * varsayılan); mobil/web istemciler için burada çağıranın rolüne uygun olmayan
 * kategoriler filtrelenir — aksi halde etkisi olmayan bir ayar gösterilmiş olurdu.
 */
export const GET = withApiHandler(
  async ({ ctx }) => {
    const res = await getNotificationPreferencesTool(ctx);
    if (!res.ok) return res;
    const preferences = res.data.preferences.filter((p) => {
      if (!isNotificationCategory(p.category)) return false;
      const def = getCategoryDef(p.category);
      return !!def?.roles.includes(ctx.role);
    });
    return { ...res, data: { preferences } };
  },
  { permission: "notifications:read" }
);

/** PATCH /api/v1/notification-preferences — body: { updates: [{category, inAppEnabled}] } — yalnızca çağıranın kendi tercihleri (ctx.userId), body'den hedef userId asla kabul edilmez. */
export const PATCH = withApiHandler(
  async ({ ctx, body }) => setNotificationPreferencesTool(ctx, body),
  { permission: "notifications:read" }
);

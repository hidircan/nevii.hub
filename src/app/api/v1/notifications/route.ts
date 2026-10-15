import { withApiHandler } from "@/lib/api/handler";
import { listNotificationsTool, markNotificationReadTool } from "@/lib/services";
import { presentNotificationBody, resolveNotificationHref } from "@/lib/notification-href";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/notifications?cursor=&limit= — yalnızca çağıranın kendi bildirimleri
 * (userId veya studentId). cursor/limit opsiyonel, verilmezse ilk sayfa döner.
 */
export const GET = withApiHandler(
  async ({ ctx, searchParams }) => {
    const result = await listNotificationsTool(ctx, {
      cursor: searchParams.get("cursor") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });
    if (!result.ok) return result;
    // 2026-10-15 — istemciye okunur metin + ayrı hedef: mobil uygulama `body`'yi olduğu gibi gösterir; teknik yol/kimlik
    // ("Detay: /panel/…", "(ref:…)") sunucuda ayıklanır, hedef `href` alanında. Saklanan satır değişmez (tekilleştirme aynı).
    return {
      ...result,
      data: {
        ...result.data,
        notifications: result.data.notifications.map((n) => ({
          ...n,
          body: presentNotificationBody(n.body),
          href: resolveNotificationHref(n.kind, n.body),
        })),
      },
    };
  },
  { permission: "notifications:read" }
);

/** POST /api/v1/notifications — body: { notificationId } — okundu işaretler. */
export const POST = withApiHandler(
  async ({ ctx, body }) => markNotificationReadTool(ctx, body),
  { permission: "notifications:read" }
);

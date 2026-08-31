import { withApiHandler } from "@/lib/api/handler";
import { listNotificationsTool, markNotificationReadTool } from "@/lib/services";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/notifications?cursor=&limit= — yalnızca çağıranın kendi bildirimleri
 * (userId veya studentId). cursor/limit opsiyonel, verilmezse ilk sayfa döner.
 */
export const GET = withApiHandler(
  async ({ ctx, searchParams }) =>
    listNotificationsTool(ctx, {
      cursor: searchParams.get("cursor") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    }),
  { permission: "notifications:read" }
);

/** POST /api/v1/notifications — body: { notificationId } — okundu işaretler. */
export const POST = withApiHandler(
  async ({ ctx, body }) => markNotificationReadTool(ctx, body),
  { permission: "notifications:read" }
);

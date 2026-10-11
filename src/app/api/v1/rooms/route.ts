import { withApiHandler } from "@/lib/api/handler";
import { listRoomsTool } from "@/lib/services/admin-lists";

export const dynamic = "force-dynamic";

/** GET /api/v1/rooms — kurum odaları (ders reassign). Salt-okunur. */
export const GET = withApiHandler(async ({ ctx }) => listRoomsTool(ctx), {
  permission: "teachers:read",
});

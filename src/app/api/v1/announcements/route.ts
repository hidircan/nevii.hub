import { withApiHandler } from "@/lib/api/handler";
import { createAnnouncementTool, listAnnouncementsForUserTool } from "@/lib/services";
import { enforceUserRateLimit } from "@/lib/api/rate-limit-guard";

export const dynamic = "force-dynamic";

const UPLOAD_RATE_WINDOW_MS = 60_000;
const UPLOAD_RATE_MAX = 20;

/** GET /api/v1/announcements — çağıranın hedef kitlesinde olan, yayındaki duyurular. */
export const GET = withApiHandler(
  async ({ ctx }) => listAnnouncementsForUserTool(ctx),
  { permission: "announcements:read" }
);

/** POST /api/v1/announcements — yeni duyuru oluşturur (SCHOOL_ADMIN/SUPER_ADMIN); ekler bu istekle birlikte yüklenir (bkz. createAnnouncementTool). */
export const POST = withApiHandler(
  async ({ ctx, body }) => {
    const limited = enforceUserRateLimit("upload", ctx.userId, {
      windowMs: UPLOAD_RATE_WINDOW_MS,
      max: UPLOAD_RATE_MAX,
    });
    if (limited) return limited;
    return createAnnouncementTool(ctx, body);
  },
  { permission: "announcements:write" }
);

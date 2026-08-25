import { withApiHandler } from "@/lib/api/handler";
import { listAnnouncementRecipientsTool } from "@/lib/services";

export const dynamic = "force-dynamic";

/** GET /api/v1/announcements/recipients — şahsa özel duyuru için seçilebilir kullanıcı listesi. */
export const GET = withApiHandler(
  async ({ ctx }) => listAnnouncementRecipientsTool(ctx),
  { permission: "announcements:write" }
);

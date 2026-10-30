import { withApiHandler } from "@/lib/api/handler";
import { setSitePage } from "@/lib/platform/site-page";

export const dynamic = "force-dynamic";

export const PUT = withApiHandler(async ({ ctx, body }) => setSitePage(ctx, body), {
  hyperAdminOnly: true,
  permission: "platform:write",
});

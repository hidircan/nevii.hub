import { withApiHandler } from "@/lib/api/handler";
import { getSiteMobileAppsMeta, setSiteMobileApps } from "@/lib/platform/site-mobile-apps";

export const dynamic = "force-dynamic";

export const GET = withApiHandler(async ({ ctx }) => getSiteMobileAppsMeta(ctx), {
  hyperAdminOnly: true,
  permission: "platform:read",
});

export const PUT = withApiHandler(async ({ ctx, body }) => setSiteMobileApps(ctx, body), {
  hyperAdminOnly: true,
  permission: "platform:write",
});

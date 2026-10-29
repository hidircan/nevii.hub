import { withApiHandler } from "@/lib/api/handler";
import { getSiteSocialMeta, setSiteSocial } from "@/lib/platform/site-social";

export const dynamic = "force-dynamic";

export const GET = withApiHandler(async ({ ctx }) => getSiteSocialMeta(ctx), {
  hyperAdminOnly: true,
  permission: "platform:read",
});

export const PUT = withApiHandler(async ({ ctx, body }) => setSiteSocial(ctx, body), {
  hyperAdminOnly: true,
  permission: "platform:write",
});

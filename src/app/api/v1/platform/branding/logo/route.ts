import { withApiHandler } from "@/lib/api/handler";
import { getPlatformLogoMeta, resetPlatformLogo, setPlatformLogo } from "@/lib/platform/branding";

export const dynamic = "force-dynamic";

export const GET = withApiHandler(async ({ ctx }) => getPlatformLogoMeta(ctx), {
  hyperAdminOnly: true,
  permission: "platform:read",
});

export const PUT = withApiHandler(async ({ ctx, body }) => setPlatformLogo(ctx, body), {
  hyperAdminOnly: true,
  permission: "platform:write",
});

export const DELETE = withApiHandler(async ({ ctx }) => resetPlatformLogo(ctx), {
  hyperAdminOnly: true,
  permission: "platform:write",
});

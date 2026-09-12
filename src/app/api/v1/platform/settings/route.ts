import { withApiHandler } from "@/lib/api/handler";
import { getPlatformDefaultSettings, updatePlatformDefaultSetting } from "@/lib/platform/service";

export const dynamic = "force-dynamic";

export const GET = withApiHandler(
  async ({ ctx }) => getPlatformDefaultSettings(ctx),
  { hyperAdminOnly: true, permission: "platform:read" }
);

export const PATCH = withApiHandler(
  async ({ ctx, body }) => updatePlatformDefaultSetting(ctx, body),
  { hyperAdminOnly: true, permission: "platform:write" }
);

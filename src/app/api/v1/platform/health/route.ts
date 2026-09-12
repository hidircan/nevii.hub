import { withApiHandler } from "@/lib/api/handler";
import { getPlatformHealth } from "@/lib/platform/service";

export const dynamic = "force-dynamic";

export const GET = withApiHandler(
  async ({ ctx }) => getPlatformHealth(ctx),
  { hyperAdminOnly: true, permission: "platform:read" }
);

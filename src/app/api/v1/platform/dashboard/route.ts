import { withApiHandler } from "@/lib/api/handler";
import { getPlatformDashboard } from "@/lib/platform/service";

export const dynamic = "force-dynamic";

export const GET = withApiHandler(
  async ({ ctx }) => getPlatformDashboard(ctx),
  { hyperAdminOnly: true, permission: "platform:read" }
);

import { withApiHandler } from "@/lib/api/handler";
import { getPlatformAuditLog } from "@/lib/platform/service";

export const dynamic = "force-dynamic";

export const GET = withApiHandler(
  async ({ ctx, searchParams }) =>
    getPlatformAuditLog(ctx, searchParams.get("tenantId") ?? undefined),
  { hyperAdminOnly: true, permission: "platform:read" }
);

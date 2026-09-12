import { withApiHandler } from "@/lib/api/handler";
import { jsonFail } from "@/lib/api/http";
import { getTenantMembers } from "@/lib/platform/users-admin";

export const dynamic = "force-dynamic";

export const GET = withApiHandler(
  async ({ ctx, params }) => {
    if (!params.tenantId) return jsonFail("VALIDATION_ERROR", "tenantId gerekli");
    return getTenantMembers(ctx, params.tenantId);
  },
  { hyperAdminOnly: true, permission: "platform:read" }
);

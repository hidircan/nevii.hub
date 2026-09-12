import { withApiHandler } from "@/lib/api/handler";
import { jsonFail } from "@/lib/api/http";
import { grantUserBranchAccess, revokeUserBranchAccess } from "@/lib/platform/users-admin";

export const dynamic = "force-dynamic";

export const POST = withApiHandler(
  async ({ ctx, params, body }) => {
    if (!params.tenantId) return jsonFail("VALIDATION_ERROR", "tenantId gerekli");
    return grantUserBranchAccess(ctx, params.tenantId, body);
  },
  { hyperAdminOnly: true, permission: "platform:write" }
);

export const DELETE = withApiHandler(
  async ({ ctx, params, body }) => {
    if (!params.tenantId) return jsonFail("VALIDATION_ERROR", "tenantId gerekli");
    return revokeUserBranchAccess(ctx, params.tenantId, body);
  },
  { hyperAdminOnly: true, permission: "platform:write" }
);

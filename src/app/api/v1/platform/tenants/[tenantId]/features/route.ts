import { withApiHandler } from "@/lib/api/handler";
import { jsonFail } from "@/lib/api/http";
import { getTenantFeatures, updateTenantFeature } from "@/lib/platform/service";

export const dynamic = "force-dynamic";

export const GET = withApiHandler(
  async ({ ctx, params }) => {
    const tenantId = params.tenantId;
    if (!tenantId) return jsonFail("VALIDATION_ERROR", "tenantId gerekli");
    return getTenantFeatures(ctx, tenantId);
  },
  { hyperAdminOnly: true, permission: "platform:read" }
);

export const PATCH = withApiHandler(
  async ({ ctx, params, body }) => {
    const tenantId = params.tenantId;
    if (!tenantId) return jsonFail("VALIDATION_ERROR", "tenantId gerekli");
    return updateTenantFeature(ctx, tenantId, body);
  },
  { hyperAdminOnly: true, permission: "platform:write" }
);

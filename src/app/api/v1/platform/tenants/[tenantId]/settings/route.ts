import { withApiHandler } from "@/lib/api/handler";
import { jsonFail } from "@/lib/api/http";
import { getTenantSettings, resetTenantSetting, updateTenantSetting } from "@/lib/platform/service";

export const dynamic = "force-dynamic";

export const GET = withApiHandler(
  async ({ ctx, params, searchParams }) => {
    const tenantId = params.tenantId;
    if (!tenantId) return jsonFail("VALIDATION_ERROR", "tenantId gerekli");
    return getTenantSettings(ctx, tenantId, searchParams.get("branchId") ?? undefined);
  },
  { hyperAdminOnly: true, permission: "platform:read" }
);

export const PATCH = withApiHandler(
  async ({ ctx, params, body }) => {
    const tenantId = params.tenantId;
    if (!tenantId) return jsonFail("VALIDATION_ERROR", "tenantId gerekli");
    return updateTenantSetting(ctx, tenantId, body);
  },
  { hyperAdminOnly: true, permission: "platform:write" }
);

/** Override'ı kaldırır → değer paket/platform varsayılanından miras alınır. */
export const DELETE = withApiHandler(
  async ({ ctx, params, body }) => {
    const tenantId = params.tenantId;
    if (!tenantId) return jsonFail("VALIDATION_ERROR", "tenantId gerekli");
    return resetTenantSetting(ctx, tenantId, body);
  },
  { hyperAdminOnly: true, permission: "platform:write" }
);

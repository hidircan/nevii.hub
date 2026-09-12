import { withApiHandler } from "@/lib/api/handler";
import { jsonFail } from "@/lib/api/http";
import { endSupportSession, listTenantSupportSessions, openSupportSession } from "@/lib/platform/support-access";

export const dynamic = "force-dynamic";

export const GET = withApiHandler(
  async ({ ctx, params }) => {
    if (!params.tenantId) return jsonFail("VALIDATION_ERROR", "tenantId gerekli");
    return listTenantSupportSessions(ctx, params.tenantId);
  },
  { hyperAdminOnly: true, permission: "platform:read" }
);

export const POST = withApiHandler(
  async ({ ctx, params, body }) => {
    if (!params.tenantId) return jsonFail("VALIDATION_ERROR", "tenantId gerekli");
    return openSupportSession(ctx, params.tenantId, body);
  },
  { hyperAdminOnly: true, permission: "platform:write" }
);

export const PATCH = withApiHandler(
  async ({ ctx, params, body }) => {
    if (!params.tenantId) return jsonFail("VALIDATION_ERROR", "tenantId gerekli");
    return endSupportSession(ctx, params.tenantId, body);
  },
  { hyperAdminOnly: true, permission: "platform:write" }
);

import { withApiHandler } from "@/lib/api/handler";
import { jsonFail } from "@/lib/api/http";
import {
  getIntegrationsForScope,
  testIntegrationForScope,
  updateIntegrationForScope,
} from "@/lib/platform/service";

export const dynamic = "force-dynamic";

export const GET = withApiHandler(
  async ({ ctx, params }) => {
    const tenantId = params.tenantId;
    if (!tenantId) return jsonFail("VALIDATION_ERROR", "tenantId gerekli");
    return getIntegrationsForScope(ctx, "tenant", tenantId);
  },
  { hyperAdminOnly: true, permission: "platform:read" }
);

export const PATCH = withApiHandler(
  async ({ ctx, params, body }) => {
    const tenantId = params.tenantId;
    if (!tenantId) return jsonFail("VALIDATION_ERROR", "tenantId gerekli");
    return updateIntegrationForScope(ctx, "tenant", tenantId, body);
  },
  { hyperAdminOnly: true, permission: "platform:write" }
);

export const POST = withApiHandler(
  async ({ ctx, params, body }) => {
    const tenantId = params.tenantId;
    if (!tenantId) return jsonFail("VALIDATION_ERROR", "tenantId gerekli");
    return testIntegrationForScope(ctx, "tenant", tenantId, body);
  },
  { hyperAdminOnly: true, permission: "platform:write" }
);

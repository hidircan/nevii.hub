import { withApiHandler } from "@/lib/api/handler";
import { getOwnInstitutionIntegrations, updateIntegrationForScope, testIntegrationForScope } from "@/lib/platform/service";

export const dynamic = "force-dynamic";

export const GET = withApiHandler(
  async ({ ctx }) => getOwnInstitutionIntegrations(ctx),
  { permission: "institution:integrations" }
);

export const PATCH = withApiHandler(
  async ({ ctx, body }) => updateIntegrationForScope(ctx, "tenant", ctx.tenantId, body),
  { permission: "institution:integrations" }
);

export const POST = withApiHandler(
  async ({ ctx, body }) => testIntegrationForScope(ctx, "tenant", ctx.tenantId, body),
  { permission: "institution:integrations" }
);

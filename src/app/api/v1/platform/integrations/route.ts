import { withApiHandler } from "@/lib/api/handler";
import {
  getIntegrationsForScope,
  testIntegrationForScope,
  updateIntegrationForScope,
} from "@/lib/platform/service";

export const dynamic = "force-dynamic";

export const GET = withApiHandler(
  async ({ ctx }) => getIntegrationsForScope(ctx, "platform", "*"),
  { hyperAdminOnly: true, permission: "platform:read" }
);

export const PATCH = withApiHandler(
  async ({ ctx, body }) => updateIntegrationForScope(ctx, "platform", "*", body),
  { hyperAdminOnly: true, permission: "platform:write" }
);

export const POST = withApiHandler(
  async ({ ctx, body }) => testIntegrationForScope(ctx, "platform", "*", body),
  { hyperAdminOnly: true, permission: "platform:write" }
);

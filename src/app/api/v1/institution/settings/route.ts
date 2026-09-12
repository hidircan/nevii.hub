import { withApiHandler } from "@/lib/api/handler";
import { getOwnInstitutionSettings, resetTenantSetting, updateOwnInstitutionSetting } from "@/lib/platform/service";

export const dynamic = "force-dynamic";

export const GET = withApiHandler(
  async ({ ctx }) => getOwnInstitutionSettings(ctx),
  { permission: "institution:settings" }
);

export const PATCH = withApiHandler(
  async ({ ctx, body }) => updateOwnInstitutionSetting(ctx, body),
  { permission: "institution:settings" }
);

export const DELETE = withApiHandler(
  async ({ ctx, body }) => resetTenantSetting(ctx, ctx.tenantId, body),
  { permission: "institution:settings" }
);

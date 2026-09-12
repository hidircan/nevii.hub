import { withApiHandler } from "@/lib/api/handler";
import { getOwnInstitutionFeatures, updateOwnInstitutionFeature } from "@/lib/platform/service";

export const dynamic = "force-dynamic";

export const GET = withApiHandler(
  async ({ ctx }) => getOwnInstitutionFeatures(ctx),
  { permission: "institution:settings" }
);

export const PATCH = withApiHandler(
  async ({ ctx, body }) => updateOwnInstitutionFeature(ctx, body),
  { permission: "institution:settings" }
);

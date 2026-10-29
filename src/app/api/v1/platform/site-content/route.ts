import { withApiHandler } from "@/lib/api/handler";
import { getSiteContentMeta, setSiteContentOverrides } from "@/lib/platform/site-content-overrides";

export const dynamic = "force-dynamic";

export const GET = withApiHandler(async ({ ctx }) => getSiteContentMeta(ctx), {
  hyperAdminOnly: true,
  permission: "platform:read",
});

export const PUT = withApiHandler(async ({ ctx, body }) => setSiteContentOverrides(ctx, body), {
  hyperAdminOnly: true,
  permission: "platform:write",
});

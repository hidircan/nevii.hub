import { withApiHandler } from "@/lib/api/handler";
import { createInstitution, listInstitutions } from "@/lib/platform/service";

export const dynamic = "force-dynamic";

export const GET = withApiHandler(
  async ({ ctx, searchParams }) => listInstitutions(ctx, searchParams.get("q") ?? undefined),
  { hyperAdminOnly: true, permission: "platform:read" }
);

export const POST = withApiHandler(
  async ({ ctx, body }) => createInstitution(ctx, body),
  { hyperAdminOnly: true, permission: "platform:write" }
);

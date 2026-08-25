import { withApiHandler } from "@/lib/api/handler";
import { revealStaffIbanTool } from "@/lib/services";

export const dynamic = "force-dynamic";

/** POST /api/v1/people/reveal-staff-iban { staffId } */
export const POST = withApiHandler(async ({ ctx, body }) => revealStaffIbanTool(ctx, body), {
  permission: "pii:full",
});

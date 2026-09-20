import { withApiHandler } from "@/lib/api/handler";
import { listBranchesTool } from "@/lib/services/admin-lists";

export const dynamic = "force-dynamic";

/** GET /api/v1/branches — kurum şubeleri (ders reassign + katalog). Salt-okunur. */
export const GET = withApiHandler(async ({ ctx }) => listBranchesTool(ctx), {
  permission: "teachers:read",
});

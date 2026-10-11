import { withApiHandler } from "@/lib/api/handler";
import { listAccountDeletionRequestsTool } from "@/lib/services/account-deletion-tools";

export const dynamic = "force-dynamic";

/** GET /api/v1/account/deletion-requests — tüm talepler. Yalnız SCHOOL_ADMIN/SUPER_ADMIN. */
export const GET = withApiHandler(async ({ ctx }) => listAccountDeletionRequestsTool(ctx), {
  permission: "students:write",
});

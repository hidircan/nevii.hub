import { withApiHandler } from "@/lib/api/handler";
import { cancelMyDeletionRequestTool } from "@/lib/services/account-deletion-tools";

export const dynamic = "force-dynamic";

/** POST /api/v1/account/deletion-request/cancel — bekleyen talebi geri çeker (self). */
export const POST = withApiHandler(async ({ ctx }) => cancelMyDeletionRequestTool(ctx));

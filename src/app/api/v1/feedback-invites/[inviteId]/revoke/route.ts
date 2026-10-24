import { withApiHandler } from "@/lib/api/handler";
import { revokeFeedbackInviteTool } from "@/lib/services";

export const dynamic = "force-dynamic";

/** POST /api/v1/feedback-invites/<id>/revoke — yönetici: bağlantıyı iptal eder. */
export const POST = withApiHandler(
  async ({ ctx, params }) => revokeFeedbackInviteTool(ctx, { inviteId: params.inviteId }),
  { permission: "teacher_feedback:read" }
);

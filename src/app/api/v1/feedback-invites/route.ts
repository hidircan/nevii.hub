import { withApiHandler } from "@/lib/api/handler";
import { createFeedbackInviteTool } from "@/lib/services";

export const dynamic = "force-dynamic";

/** POST /api/v1/feedback-invites — yönetici: öğrenci için 14 gün geçerli kişiye özel değerlendirme bağlantısı. */
export const POST = withApiHandler(async ({ ctx, body }) => createFeedbackInviteTool(ctx, body), {
  permission: "teacher_feedback:read",
});

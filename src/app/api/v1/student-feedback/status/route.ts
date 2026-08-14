import { withApiHandler } from "@/lib/api/handler";
import { updateStudentFeedbackStatusTool } from "@/lib/services";

export const dynamic = "force-dynamic";

/** POST /api/v1/student-feedback/status { feedbackId, status } */
export const POST = withApiHandler(
  async ({ ctx, body }) => updateStudentFeedbackStatusTool(ctx, body),
  { permission: "student_feedback:read" }
);

import { withApiHandler } from "@/lib/api/handler";
import { getOwnStudentFeedbackThisMonthTool } from "@/lib/services";

export const dynamic = "force-dynamic";

/** GET /api/v1/student-feedback/mine?studentId=... — TEACHER, cari ay kaydı (varsa). */
export const GET = withApiHandler(
  async ({ ctx, searchParams }) =>
    getOwnStudentFeedbackThisMonthTool(ctx, { studentId: searchParams.get("studentId") || "" }),
  { permission: "student_feedback:submit" }
);

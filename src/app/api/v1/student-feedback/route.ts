import { withApiHandler } from "@/lib/api/handler";
import { submitStudentFeedbackTool, listStudentFeedbackTool } from "@/lib/services";

export const dynamic = "force-dynamic";

/** POST /api/v1/student-feedback — TEACHER kendi öğrencisi için. */
export const POST = withApiHandler(
  async ({ ctx, body }) => submitStudentFeedbackTool(ctx, body),
  { permission: "student_feedback:submit" }
);

/**
 * GET /api/v1/student-feedback?teacherId=...&studentId=... — SCHOOL_ADMIN/
 * SUPER_ADMIN tüm kayıtları, TEACHER yalnızca kendi yazdıklarını görür
 * (ctx.teacherId zorlaması tool katmanında).
 */
export const GET = withApiHandler(
  async ({ ctx, searchParams }) =>
    listStudentFeedbackTool(ctx, {
      teacherId: searchParams.get("teacherId") || undefined,
      studentId: searchParams.get("studentId") || undefined,
    }),
  { permission: "student_feedback:read" }
);

import { withApiHandler } from "@/lib/api/handler";
import { getOwnTeacherFeedbackThisMonthTool } from "@/lib/services";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/teacher-feedback/this-month?studentId=...&teacherId=...
 * Kök neden düzeltmesi — mobil değerlendirme formu (apps/mobile/src/features/
 * student-scope/degerlendirme-form.tsx) bu uç noktayı çağırıyordu ama route
 * hiç yoktu (yalnızca `getOwnTeacherFeedbackThisMonthTool` domain katmanında
 * vardı, REST sarmalayıcısı eksikti) → ham Next.js 404. STUDENT/PARENT
 * kendi çocuğu/kendisi için "bu ay zaten değerlendirdi mi" kontrolü — aynı
 * yetki (`teacher_feedback:submit`) POST /api/v1/teacher-feedback ile aynı,
 * sahiplik kontrolü tool içinde (`ctx.studentId === v.data.studentId`) zaten var.
 */
export const GET = withApiHandler(
  async ({ ctx, searchParams }) =>
    getOwnTeacherFeedbackThisMonthTool(ctx, {
      studentId: searchParams.get("studentId") ?? undefined,
      teacherId: searchParams.get("teacherId") ?? undefined,
    }),
  { permission: "teacher_feedback:submit" }
);

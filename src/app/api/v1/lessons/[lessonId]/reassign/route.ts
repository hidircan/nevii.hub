import { withApiHandler } from "@/lib/api/handler";
import { changeLessonTeacherOrBranchTool } from "@/lib/services";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/lessons/:lessonId/reassign { scope, newTeacherId?, newBranchId?, newRoomId? } —
 * öğretmen/şube/oda değişikliği (admin P0). Çakışma kontrolü + audit +
 * bildirim tool içindedir. Yalnız SCHOOL_ADMIN/SUPER_ADMIN.
 */
export const POST = withApiHandler(
  async ({ ctx, params, body }) =>
    changeLessonTeacherOrBranchTool(ctx, {
      ...(typeof body === "object" && body !== null ? body : {}),
      lessonId: params.lessonId,
    }),
  { permission: "students:write" }
);

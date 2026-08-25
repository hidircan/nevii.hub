import { withApiHandler } from "@/lib/api/handler";
import { markTeacherAttendanceTool } from "@/lib/services";

export const dynamic = "force-dynamic";

/** POST /api/v1/lessons/:lessonId/teacher-attendance { status: geldi|gelmedi|mazeretli, note? } */
export const POST = withApiHandler(
  async ({ ctx, body, params }) =>
    markTeacherAttendanceTool(ctx, {
      ...(typeof body === "object" && body !== null ? (body as object) : {}),
      lessonId: params.lessonId,
    }),
  { permission: "teachers:write" }
);

import { withApiHandler } from "@/lib/api/handler";
import { setLessonDisruptionTool } from "@/lib/services";

export const dynamic = "force-dynamic";

/** POST /api/v1/lessons/:lessonId/disruption { disruptionSource, disruptionNote?, teacherAttendance? } */
export const POST = withApiHandler(
  async ({ ctx, body, params }) =>
    setLessonDisruptionTool(ctx, {
      ...(typeof body === "object" && body !== null ? (body as object) : {}),
      lessonId: params.lessonId,
    }),
  { permission: "attendance:write" }
);

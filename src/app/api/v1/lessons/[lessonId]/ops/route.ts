import { withApiHandler } from "@/lib/api/handler";
import { clearLessonOpsFlagTool, setLessonOpsFlagTool } from "@/lib/services";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/lessons/:lessonId/ops { flag: attended|processed|makeup }
 * Geri alma (2026-09-29): { action: "clear", expected: <ekranda görünen statü> }
 */
export const POST = withApiHandler(
  async ({ ctx, body, params }) => {
    const input = { ...(typeof body === "object" && body !== null ? (body as object) : {}), lessonId: params.lessonId };
    return (input as { action?: unknown }).action === "clear"
      ? clearLessonOpsFlagTool(ctx, input)
      : setLessonOpsFlagTool(ctx, input);
  },
  { permission: "attendance:write" }
);

import { withApiHandler } from "@/lib/api/handler";
import { addTaskCommentTool } from "@/lib/services";

export const dynamic = "force-dynamic";

/** POST /api/v1/tasks/:taskId/comments — bkz. addTaskCommentSchema. */
export const POST = withApiHandler(
  async ({ ctx, params, body }) =>
    addTaskCommentTool(ctx, {
      ...(typeof body === "object" && body !== null ? body : {}),
      taskId: params.taskId,
    }),
  { permission: "tasks:write" }
);

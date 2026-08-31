import { withApiHandler } from "@/lib/api/handler";
import { getTaskDetailTool, updateTaskTool } from "@/lib/services";

export const dynamic = "force-dynamic";

/** GET /api/v1/tasks/:taskId — görev + kontrol listesi + yorumlar + etkinlik + ekler (bkz. getTaskDetailTool). */
export const GET = withApiHandler(
  async ({ ctx, params }) => getTaskDetailTool(ctx, { taskId: params.taskId }),
  { permission: "tasks:read" }
);

/**
 * POST /api/v1/tasks/:taskId — kısmi güncelleme (bkz. updateTaskSchema).
 * TEACHER yalnızca `status`/`progressPercent` gönderebilir — diğer alanlar
 * tool katmanında (TEACHER_EDITABLE_TASK_FIELDS) reddedilir.
 */
export const POST = withApiHandler(
  async ({ ctx, params, body }) =>
    updateTaskTool(ctx, {
      ...(typeof body === "object" && body !== null ? body : {}),
      taskId: params.taskId,
    }),
  { permission: "tasks:write" }
);

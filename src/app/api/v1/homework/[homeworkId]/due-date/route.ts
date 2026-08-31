import { withApiHandler } from "@/lib/api/handler";
import { updateHomeworkDueDateTool } from "@/lib/services";

export const dynamic = "force-dynamic";

/** PATCH /api/v1/homework/:homeworkId/due-date { dueDate } — yalnızca ödevi veren öğretmen. */
export const PATCH = withApiHandler(
  async ({ ctx, params, body }) =>
    updateHomeworkDueDateTool(ctx, {
      ...(typeof body === "object" && body !== null ? body : {}),
      homeworkId: params.homeworkId,
    }),
  { permission: "homework:write" }
);

import { withApiHandler } from "@/lib/api/handler";
import { submitHomeworkTool } from "@/lib/services";
import { enforceUserRateLimit } from "@/lib/api/rate-limit-guard";

export const dynamic = "force-dynamic";

const UPLOAD_RATE_WINDOW_MS = 60_000;
const UPLOAD_RATE_MAX = 20;

/** POST /api/v1/homework/:homeworkId/submit — STUDENT, yalnızca kendi ödevi. */
export const POST = withApiHandler(
  async ({ ctx, params, body }) => {
    const limited = enforceUserRateLimit("upload", ctx.userId, {
      windowMs: UPLOAD_RATE_WINDOW_MS,
      max: UPLOAD_RATE_MAX,
    });
    if (limited) return limited;
    return submitHomeworkTool(ctx, {
      ...(typeof body === "object" && body !== null ? body : {}),
      homeworkId: params.homeworkId,
    });
  },
  { permission: "homework:submit" }
);

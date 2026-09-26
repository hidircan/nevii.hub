import { withApiHandler } from "@/lib/api/handler";
import { updateTrialLessonTool } from "@/lib/services";

export const dynamic = "force-dynamic";

/** Deneme dersi düzenleme — plan, hazırlık notu, sonuç notu (bkz. updateTrialLessonTool). */
export const PATCH = withApiHandler(
  async ({ ctx, body, params }) =>
    updateTrialLessonTool(ctx, {
      ...(typeof body === "object" && body !== null ? (body as object) : {}),
      trialId: params.trialId,
    }),
  { permission: "trials:write" }
);

import { withApiHandler } from "@/lib/api/handler";
import { deleteTrialLessonTool, updateTrialLessonTool } from "@/lib/services";

export const dynamic = "force-dynamic";

/** Deneme dersi düzenleme — tüm alanlar her zaman düzenlenebilir (bkz. updateTrialLessonTool). */
export const PATCH = withApiHandler(
  async ({ ctx, body, params }) =>
    updateTrialLessonTool(ctx, {
      ...(typeof body === "object" && body !== null ? (body as object) : {}),
      trialId: params.trialId,
    }),
  { permission: "trials:write" }
);

/** Deneme dersi silme — kalıcı, denetim izli; gövde: { criticalPassword, reason } (bkz. deleteTrialLessonTool). */
export const DELETE = withApiHandler(
  async ({ ctx, body, params }) =>
    deleteTrialLessonTool(ctx, {
      ...(typeof body === "object" && body !== null ? (body as object) : {}),
      trialId: params.trialId,
    }),
  { permission: "trials:write" }
);

import { withApiHandler } from "@/lib/api/handler";
import { listTrialApplicationsTool, updateTrialApplicationTool } from "@/lib/trial-applications";

export const dynamic = "force-dynamic";

/** GET /api/v1/trial-applications — deneme dersi başvuruları (en yeni önce). Rol kapısı tool katmanında. */
export const GET = withApiHandler(async ({ ctx }) => listTrialApplicationsTool(ctx));

/** PATCH /api/v1/trial-applications { id, status?, staffNote? } — durum/not (Planlandı yalnız planlamayla). */
export const PATCH = withApiHandler(async ({ ctx, body }) => updateTrialApplicationTool(ctx, body));

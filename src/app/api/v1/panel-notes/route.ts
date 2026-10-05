import { withApiHandler } from "@/lib/api/handler";
import { addPanelNoteTool, listPanelNotesTool } from "@/lib/panel-notes";

export const dynamic = "force-dynamic";

/** GET /api/v1/panel-notes — Günlük Özet notları (en yeni önce). Rol kapısı tool katmanında. */
export const GET = withApiHandler(async ({ ctx, searchParams }) =>
  listPanelNotesTool(ctx, { limit: Number(searchParams.get("limit")) || undefined })
);

/** POST /api/v1/panel-notes { body } — yeni not; yazan ve zaman sunucuda kaydedilir. */
export const POST = withApiHandler(async ({ ctx, body }) => addPanelNoteTool(ctx, body));

import { withApiHandler } from "@/lib/api/handler";
import { fromServiceResult, jsonFail } from "@/lib/api/http";
import { markCommunicationManualSendTool } from "@/lib/communications/service";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/iletisim-merkezi/:id/manual-send — 11. tur iş #2/#6.
 *
 * wa.me manuel akışı 1. adım: onaylı/queued WhatsApp mesajı için wa.me derin
 * bağlantısını üretir, mesajı `manual_send_pending` alır (aktör+zaman kayıtlı).
 * Gerçek teslimi DOĞRULAMAZ.
 */
export const POST = withApiHandler(async ({ ctx, params }) => {
  const id = params.id;
  if (!id) return jsonFail("VALIDATION_ERROR", "id gerekli");
  const result = await markCommunicationManualSendTool(ctx, { id });
  return fromServiceResult(result);
});

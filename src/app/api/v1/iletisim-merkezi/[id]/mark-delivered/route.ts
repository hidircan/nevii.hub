import { withApiHandler } from "@/lib/api/handler";
import { fromServiceResult, jsonFail } from "@/lib/api/http";
import { markCommunicationDeliveredTool } from "@/lib/communications/service";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/iletisim-merkezi/:id/mark-delivered — 11. tur iş #2/#6.
 *
 * wa.me manuel akışı 2. adım: `{ confirm: true }` ile `manual_send_pending`
 * → `delivered`. Burası teknik teslim doğrulaması DEĞİL, kullanıcının
 * "WhatsApp'ta gönderdim" onayıdır.
 */
export const POST = withApiHandler(async ({ ctx, body, params }) => {
  const id = params.id;
  if (!id) return jsonFail("VALIDATION_ERROR", "id gerekli");
  const confirm = (body as { confirm?: unknown } | null)?.confirm;
  if (confirm !== true) return jsonFail("VALIDATION_ERROR", "Gönderim işareti için açık onay (confirm) gerekir.");
  const result = await markCommunicationDeliveredTool(ctx, { id, confirm: true });
  return fromServiceResult(result);
});

import { withApiHandler } from "@/lib/api/handler";
import { fromServiceResult } from "@/lib/api/http";
import { getContractCancellationImpactTool } from "@/lib/services";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/contracts/:contractId/cancellation-impact — 10. tur iş #9.
 *
 * Sözleşme iptali ÖNCESİ etki özeti (yalnız okuma): taksit/tahsilat/borç +
 * gelecek ders etkisi + kritik-şifre durumu. İptal diyaloğu bunu gösterir;
 * iptalin kendisi (gerekçe + sözleşme-no teyidi + kritik şifre) POST
 * .../cancel ile yapılır.
 */
export const GET = withApiHandler(async ({ ctx, params }) => {
  const result = await getContractCancellationImpactTool(ctx, { contractId: params.contractId });
  return fromServiceResult(result);
});

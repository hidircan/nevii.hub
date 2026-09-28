import { withApiHandler } from "@/lib/api/handler";
import { fromServiceResult } from "@/lib/api/http";
import { getContractHtmlTool } from "@/lib/services";

export const dynamic = "force-dynamic";

/** GET /api/v1/contracts/:contractId/html — yazdırılabilir/görüntülenebilir sözleşme içeriği. */
export const GET = withApiHandler(async ({ ctx, params }) => {
  const res = fromServiceResult(await getContractHtmlTool(ctx, { contractId: params.contractId }));
  // Sözleşme içeriği kullanıcıya özel: ara önbelleklerde tutulmaz (davranış
  // değişmez — dynamic rota zaten no-store; header bunu açık yazar).
  res.headers.set("Cache-Control", "private, max-age=0, no-store");
  return res;
}, { permission: "contracts:read" });

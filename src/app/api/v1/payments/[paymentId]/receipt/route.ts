import { withApiHandler } from "@/lib/api/handler";
import { fromServiceResult } from "@/lib/api/http";
import { getPaymentReceiptTool } from "@/lib/services/mobile-read";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/payments/:paymentId/receipt — makbuz görünüm modeli (salt-okunur).
 * `paymentId` tek başına erişim vermez: tenant `readData()`'dan, sahiplik
 * `assertStudentAccess`'ten. Kaynak web `/makbuz/[paymentId]` ile aynı (`src/lib/receipt.ts`).
 */
export const GET = withApiHandler(async ({ ctx, params }) => {
  const res = fromServiceResult(await getPaymentReceiptTool(ctx, { paymentId: params.paymentId }));
  // Makbuz kullanıcıya özel: ara önbelleklerde tutulmaz (davranış değişmez —
  // dynamic rota zaten no-store; header bunu açık yazar).
  res.headers.set("Cache-Control", "private, max-age=0, no-store");
  return res;
});

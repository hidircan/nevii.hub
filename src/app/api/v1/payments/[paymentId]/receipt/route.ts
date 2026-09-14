import { withApiHandler } from "@/lib/api/handler";
import { getPaymentReceiptTool } from "@/lib/services/mobile-read";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/payments/:paymentId/receipt — makbuz görünüm modeli (salt-okunur).
 * `paymentId` tek başına erişim vermez: tenant `readData()`'dan, sahiplik
 * `assertStudentAccess`'ten. Kaynak web `/makbuz/[paymentId]` ile aynı (`src/lib/receipt.ts`).
 */
export const GET = withApiHandler(async ({ ctx, params }) =>
  getPaymentReceiptTool(ctx, { paymentId: params.paymentId })
);

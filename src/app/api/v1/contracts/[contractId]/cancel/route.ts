import { withApiHandler } from "@/lib/api/handler";
import { cancelStudentContractTool } from "@/lib/services";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/contracts/:contractId/cancel — yanlışlıkla oluşturulmuş bir
 * sözleşmeyi iptal eder (hard delete YOK).
 *
 * Gövde: `{ cancelFutureLessons?: boolean, reason: string,
 * confirmationNumber: string, criticalPassword: string }` — 10. tur iş #9:
 * iptal gerekçesi + sözleşme-no teyidi + kritik işlem şifresi ZORUNLU.
 * `cancelFutureLessons` varsayılan `false`: sessiz/otomatik ders silme
 * YOKTUR, kullanıcı onay ekranında açıkça seçer
 * (bkz. src/components/contract-cancel-dialog.tsx).
 */
export const POST = withApiHandler(
  async ({ ctx, body, params }) =>
    cancelStudentContractTool(ctx, {
      ...(body as Record<string, unknown>),
      contractId: params.contractId,
    }),
  { permission: "contracts:write" }
);

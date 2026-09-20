import { withApiHandler } from "@/lib/api/handler";
import { cancelStudentContractTool } from "@/lib/services";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/contracts/:contractId/cancel — yanlışlıkla oluşturulmuş bir
 * sözleşmeyi iptal eder (hard delete YOK).
 *
 * Gövde: `{ cancelFutureLessons?: boolean }` — bu sözleşmeden ÜRETİLMİŞ
 * gelecek derslerin de iptal edilip edilmeyeceği. Varsayılan `false`:
 * sessiz/otomatik ders silme YOKTUR, kullanıcı onay ekranında açıkça seçer
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

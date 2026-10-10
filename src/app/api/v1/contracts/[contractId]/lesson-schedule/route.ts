import { withApiHandler } from "@/lib/api/handler";
import { fromServiceResult } from "@/lib/api/http";
import { planContractLessonScheduleTool, countContractLessonsTool } from "@/lib/services";

export const dynamic = "force-dynamic";

/**
 * K — Sözleşmeden ders programı üretimi.
 *
 * GET  → bu sözleşmeden üretilmiş GELECEK ders sayısı (iptal uyarısı için).
 * POST → `{ teacherId, roomId, durationMinutes?, dryRun?, skipConflicts? }`.
 *        `dryRun` varsayılan TRUE: kullanıcı önizlemeyi görmeden hiçbir ders
 *        oluşmaz. Gerçek oluşturma açıkça `dryRun: false` ile istenir.
 */
export const GET = withApiHandler(async ({ ctx, params }) => {
  const result = await countContractLessonsTool(ctx, { contractId: params.contractId });
  return fromServiceResult(result);
});

export const POST = withApiHandler(async ({ ctx, body, params }) => {
  const result = await planContractLessonScheduleTool(ctx, {
    ...(body as Record<string, unknown>),
    contractId: params.contractId,
  });
  return fromServiceResult(result);
});

import { withApiHandler } from "@/lib/api/handler";
import { getStudentPaymentLedgerTool } from "@/lib/services/student-ledgers";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/students/:studentId/payment-ledger — tahakkuk/ödeme defteri
 * (ay özetleri + ders zenginleştirmeli kalemler, server-side toplamlar).
 * Query: month=YYYY-MM, from, to, limit, offset. Finans matematiği
 * getParentBalanceTool ile AYNI (değiştirilmedi).
 */
export const GET = withApiHandler(
  async ({ ctx, params, searchParams }) =>
    getStudentPaymentLedgerTool(ctx, {
      studentId: params.studentId,
      month: searchParams.get("month") ?? undefined,
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      offset: searchParams.get("offset") ?? undefined,
    }),
  { permission: "students:read" }
);

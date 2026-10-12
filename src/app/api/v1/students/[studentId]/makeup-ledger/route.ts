import { withApiHandler } from "@/lib/api/handler";
import { getStudentMakeupLedgerTool } from "@/lib/services/student-ledgers";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/students/:studentId/makeup-ledger — öğrencinin telafi
 * kayıtları (kaynak + planlanan/gerçekleşen ders zenginleştirmeli).
 * Query: limit, offset. Kapsam assertStudentAccess — guardian yalnız
 * seçili (erişimli) çocuğun telafilerini görür.
 */
export const GET = withApiHandler(
  async ({ ctx, params, searchParams }) =>
    getStudentMakeupLedgerTool(ctx, {
      studentId: params.studentId,
      limit: searchParams.get("limit") ?? undefined,
      offset: searchParams.get("offset") ?? undefined,
    }),
  { permission: "students:read" }
);

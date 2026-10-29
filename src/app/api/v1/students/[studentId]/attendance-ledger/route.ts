import { withApiHandler } from "@/lib/api/handler";
import { getStudentAttendanceLedgerTool, LEDGER_DISPLAY_KEYS } from "@/lib/services/student-ledgers";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/students/:studentId/attendance-ledger — ders bazında yoklama
 * defteri (geçmiş + planlanan). Query: status (virgüllü displayKey),
 * direction=past|upcoming|all, from, to, sort=asc|desc, limit, offset.
 * Kapsam assertStudentAccess — guardian yalnız erişimli öğrenciyi görür.
 */
export const GET = withApiHandler(
  async ({ ctx, params, searchParams }) => {
    const rawStatus = searchParams.get("status");
    const status = rawStatus
      ? rawStatus
          .split(",")
          .map((s) => s.trim())
          .filter((s) => (LEDGER_DISPLAY_KEYS as string[]).includes(s))
      : undefined;
    return getStudentAttendanceLedgerTool(ctx, {
      studentId: params.studentId,
      status: status?.length ? status : undefined,
      direction: searchParams.get("direction") ?? undefined,
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined,
      sort: searchParams.get("sort") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      offset: searchParams.get("offset") ?? undefined,
    });
  },
  { permission: "students:read" }
);

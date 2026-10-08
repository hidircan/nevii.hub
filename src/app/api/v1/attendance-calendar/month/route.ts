import { withApiHandler } from "@/lib/api/handler";
import { fromServiceResult, jsonFail } from "@/lib/api/http";
import { getAttendanceCalendarMonthTool } from "@/lib/services/tools";

export const dynamic = "force-dynamic";

/** GET ?studentId=&year=&month= — ÖNCELİK 4 Yoklama Takvimi, tek ay. */
export const GET = withApiHandler(async ({ ctx, searchParams }) => {
  const studentId = searchParams.get("studentId");
  const year = Number(searchParams.get("year"));
  const month = Number(searchParams.get("month"));
  if (!studentId || !Number.isFinite(year) || !Number.isFinite(month)) {
    return jsonFail("VALIDATION_ERROR", "studentId, year, month gerekli");
  }
  const result = await getAttendanceCalendarMonthTool(ctx, { studentId, year, month, enrollmentId: searchParams.get("enrollmentId") || undefined });
  return fromServiceResult(result);
});

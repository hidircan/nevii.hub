import { withApiHandler } from "@/lib/api/handler";
import { fromServiceResult, jsonFail } from "@/lib/api/http";
import { getAttendanceCalendarTermTool } from "@/lib/services/tools";

export const dynamic = "force-dynamic";

/**
 * GET ?studentId=&term=guz|yaz&anchorYear= — bir DÖNEMİN tüm ayları, TEK
 * istekte. P0 performans düzeltmesi: istemci eskiden aynı veriyi
 * `/attendance-calendar/month` uç noktasından ay ay, SIRAYLA çekiyordu
 * (güz için 10 istek ≈ 10 sn). Tek ay uç noktası, tekil tazeleme
 * (yoklama/override sonrası) için KORUNUR.
 */
export const GET = withApiHandler(async ({ ctx, searchParams }) => {
  const studentId = searchParams.get("studentId");
  const term = searchParams.get("term");
  const anchorYear = Number(searchParams.get("anchorYear"));
  if (!studentId || (term !== "guz" && term !== "yaz") || !Number.isFinite(anchorYear)) {
    return jsonFail("VALIDATION_ERROR", "studentId, term (guz|yaz), anchorYear gerekli");
  }
  const result = await getAttendanceCalendarTermTool(ctx, { studentId, term, anchorYear });
  return fromServiceResult(result);
});

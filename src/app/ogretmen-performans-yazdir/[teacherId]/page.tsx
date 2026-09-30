import { redirect } from "next/navigation";
import { subDays, format } from "date-fns";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext, readScopedReferenceData } from "@/lib/institution/context";
import { getTeacherPerformanceReportV2Tool } from "@/lib/services";
import { printSurfaceCss } from "@/lib/contract-print-theme";
import { formatDate } from "@/lib/utils";
import { DocumentPrintActions } from "@/components/document-print-actions";
import { PrintReportMeta } from "@/components/print-report-meta";
import { resolvePrintStamp } from "@/lib/contract-payment-plan-view";

export const dynamic = "force-dynamic";

/**
 * P1 (2026-09-11) — öğretmen performans YAZDIRMA rotası. Sözleşme/KVKK ile
 * AYNI ortak baskı mekanizması (`printSurfaceCss` — üçüncü bir print sistemi
 * YOK). Uydurma skor YOK: ekrandaki `TeacherPerformanceReportV2` nesnesinin
 * AYNI verisi basılır (skor null ise "veri yok" yazar).
 *
 * Yetki: SCHOOL_ADMIN/SUPER_ADMIN tüm öğretmenler; TEACHER yalnız kendisi
 * (URL bypass ile başkası AÇILAMAZ — tool + sayfa çift kilit).
 */
export default async function OgretmenPerformansYazdirPage({
  params,
  searchParams,
}: {
  params: Promise<{ teacherId: string }>;
  searchParams: Promise<{ periodStart?: string; periodEnd?: string }>;
}) {
  const { teacherId } = await params;
  const { periodStart: periodStartParam, periodEnd: periodEndParam } = await searchParams;

  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect(`/login?next=/ogretmen-performans-yazdir/${teacherId}`);
  }
  if (session.role !== "SCHOOL_ADMIN" && session.role !== "SUPER_ADMIN" && session.role !== "TEACHER") {
    redirect("/panel");
  }
  if (session.role === "TEACHER" && session.teacherId !== teacherId) {
    redirect("/panel");
  }

  const kurum = await getInstitutionContext(session);
  const data = await readScopedReferenceData(kurum.scope);
  const teacher = data.teachers.find((t) => t.id === teacherId);
  if (!teacher) {
    return (
      <div className="mx-auto max-w-lg px-6 py-20 text-center">
        <p className="text-lg font-semibold">Öğretmen bulunamadı.</p>
      </div>
    );
  }

  const now = new Date();
  const periodStart = periodStartParam || format(subDays(now, 30), "yyyy-MM-dd");
  const periodEnd = periodEndParam || format(now, "yyyy-MM-dd");
  const result = await getTeacherPerformanceReportV2Tool(session, { teacherId, periodStart, periodEnd });

  const branchName =
    data.settings.branches.find((b) => b.id === teacher.branchId)?.shortName ?? "—";
  const { viewer, printedAt } = await resolvePrintStamp({
    tenantId: session.tenantId,
    userId: session.userId,
    teachers: data.teachers,
    now,
  });

  return (
    <div className="print-light-palette min-h-screen bg-[#f4f2f8] px-4 py-8 print:bg-white print:p-0 sm:px-6">
      <style>{`@media print { @page { size: A4; margin: 14mm; } thead { display: table-header-group; } tr { break-inside: avoid; } }${printSurfaceCss("doc-print-surface")}`}</style>
      <div className="mx-auto max-w-3xl">
        <DocumentPrintActions backHref={`/panel/ogretmenler/${teacher.id}/performans`} />
        {!result.ok ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Rapor yüklenemedi: {result.error.message}
          </p>
        ) : (
          <div className="doc-print-surface rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none sm:p-10">
            <h1>Öğretmen Performans Raporu</h1>
            <PrintReportMeta
              institution={data.settings.name}
              rows={[
                ["Öğretmen", teacher.name],
                ["Şube", branchName],
                ["Dönem", `${formatDate(periodStart)} – ${formatDate(periodEnd)}`],
              ]}
              viewer={viewer}
              printedAt={printedAt}
            />

            <h2>Genel skor</h2>
            {result.data.score === null ? (
              <p>Bu dönem için skor hesaplanacak yeterli veri yok.</p>
            ) : (
              <p>
                Performans skoru: <strong>{Math.round(result.data.score)} / 100</strong>
                {" "}(bileşenlerin kurum ağırlıklarıyla birleşimi — ayrıntı aşağıdadır).
              </p>
            )}

            <h2>Bileşenler</h2>
            <table>
              <thead>
                <tr>
                  <th>Bileşen</th>
                  <th className="num">Ağırlık</th>
                  <th className="num">Değer</th>
                  <th className="num">Katkı</th>
                  <th>Açıklama</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Yoklama</td>
                  <td className="num">%{Math.round(result.data.components.attendance.weight * 100)}</td>
                  <td className="num">{result.data.components.attendance.normalizedValue ?? "—"}</td>
                  <td className="num">{result.data.components.attendance.contribution ?? "—"}</td>
                  <td>
                    Planlanan {result.data.components.attendance.plannedLessonCount} ders: katıldı{" "}
                    {result.data.components.attendance.attendedCount}, gelmedi{" "}
                    {result.data.components.attendance.absentCount}, mazeretli{" "}
                    {result.data.components.attendance.excusedCount}, bekleyen{" "}
                    {result.data.components.attendance.pendingCount}.
                  </td>
                </tr>
                <tr>
                  <td>Geri bildirim</td>
                  <td className="num">%{Math.round(result.data.components.feedback.weight * 100)}</td>
                  <td className="num">{result.data.components.feedback.normalizedValue ?? "—"}</td>
                  <td className="num">{result.data.components.feedback.contribution ?? "—"}</td>
                  <td>
                    {result.data.components.feedback.eligible
                      ? `${result.data.components.feedback.responseCount} yanıt değerlendirildi.`
                      : "Değerlendirme için yeterli yanıt yok."}
                  </td>
                </tr>
                <tr>
                  <td>İş takip</td>
                  <td className="num">%{Math.round(result.data.components.tasks.weight * 100)}</td>
                  <td className="num">{result.data.components.tasks.normalizedValue ?? "—"}</td>
                  <td className="num">{result.data.components.tasks.contribution ?? "—"}</td>
                  <td>
                    Atanan {result.data.components.tasks.totalAssigned} iş: tamamlanan{" "}
                    {result.data.components.tasks.completedCount}, açık{" "}
                    {result.data.components.tasks.openCount}, geciken{" "}
                    {result.data.components.tasks.overdueCount}.
                  </td>
                </tr>
                <tr>
                  <td>Ödev disiplini</td>
                  <td className="num">%{Math.round(result.data.components.homework.weight * 100)}</td>
                  <td className="num">{result.data.components.homework.normalizedValue ?? "—"}</td>
                  <td className="num">{result.data.components.homework.contribution ?? "—"}</td>
                  <td>
                    Uygun {result.data.components.homework.eligibleLessonCount} ders: verilen{" "}
                    {result.data.components.homework.assignedCount}, teslim alınan{" "}
                    {result.data.components.homework.submittedCount}, incelenen{" "}
                    {result.data.components.homework.reviewedCount}.
                  </td>
                </tr>
                <tr>
                  <td>Planlanan dersten yeni kayıt</td>
                  <td className="num">%{Math.round(result.data.components.enrollmentFromSchedule.weight * 100)}</td>
                  <td className="num">{result.data.components.enrollmentFromSchedule.normalizedValue ?? "—"}</td>
                  <td className="num">{result.data.components.enrollmentFromSchedule.contribution ?? "—"}</td>
                  <td>Dönemde kaydı açılan öğrenci: {result.data.components.enrollmentFromSchedule.registrationCount}.</td>
                </tr>
              </tbody>
              <tfoot>
                <tr>
                  <th colSpan={3}>Toplam skor</th>
                  <th className="num">{result.data.score ?? "—"}</th>
                  <th />
                </tr>
              </tfoot>
            </table>

            <h2>Yoklama detayları</h2>
            {result.data.components.attendance.rows.length === 0 ? (
              <p>Dönemde yoklama satırı yok.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Tarih</th>
                    <th>Öğrenci</th>
                    <th>Ders</th>
                    <th>Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {result.data.components.attendance.rows.map((r) => (
                    <tr key={r.lessonId}>
                      <td>{formatDate(r.startAt.slice(0, 10))}</td>
                      <td>{r.studentName}</td>
                      <td>{r.instrument}</td>
                      <td>{r.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="mt-4 text-xs">
              Bu rapor sistemdeki gerçek yoklama/geri bildirim/iş/ödev kayıtlarından üretilmiştir; tahmin veya
              örnek veri içermez.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

import { redirect } from "next/navigation";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext, readScopedData } from "@/lib/institution/context";
import { actionComputeTeacherPayout } from "@/lib/actions";
import { printSurfaceCss } from "@/lib/contract-print-theme";
import { formatDate, formatMoney } from "@/lib/utils";
import { DocumentPrintActions } from "@/components/document-print-actions";
import { resolvePrintStamp } from "@/lib/contract-payment-plan-view";
import { PrintReportMeta } from "@/components/print-report-meta";

export const dynamic = "force-dynamic";

/**
 * P1 (2026-09-11) — öğretmen hakediş YAZDIRMA rotası. Sözleşme/KVKK ile AYNI
 * ortak baskı mekanizması (`printSurfaceCss` — üçüncü bir print sistemi YOK).
 * Uydurma hesaplama YOK: ekrandaki hakediş motorunun AYNI çıktısı basılır
 * (`computeTeacherEarningsForPeriod`); ücret kuralı eksik dersler "eksik"
 * işaretlenir, sıfırlanmaz.
 *
 * Yetki: YALNIZ SCHOOL_ADMIN/SUPER_ADMIN (hesap motoru tool-seviyesinde de
 * öğretmene kapalıdır — hakediş sayfasıyla AYNI sınır). Öğretmen kendi
 * hakediş çıktısına bu rotadan ERİŞEMEZ (bilinçli ürün sınırı — raporlanır).
 *
 * VERİ MODELİ NOTU: brüt/net/indirim/kesinti ayrımı mevcut modelde YOKTUR
 * (tek tutar: dakika × kural). Rapor bunu açıkça yazar; bu kalemler backend
 * backlog'udur.
 */
export default async function OgretmenHakedisYazdirPage({
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
    redirect(`/login?next=/ogretmen-hakedis-yazdir/${teacherId}`);
  }
  // Hakediş erişimi: kurum politikası (SUPER_ADMIN her zaman; SCHOOL_ADMIN / unified BRANCH_MANAGER kuruma göre).
  const { canAccessTeacherEarnings } = await import("@/lib/platform/teacher-earnings-access");
  if (!(await canAccessTeacherEarnings(session))) {
    redirect("/panel");
  }

  const kurum = await getInstitutionContext(session);
  const data = await readScopedData(kurum.scope);
  const teacher = data.teachers.find((t) => t.id === teacherId);
  if (!teacher) {
    return (
      <div className="mx-auto max-w-lg px-6 py-20 text-center">
        <p className="text-lg font-semibold">Öğretmen bulunamadı.</p>
      </div>
    );
  }

  const now = new Date();
  const periodStart = periodStartParam || format(startOfMonth(now), "yyyy-MM-dd");
  const periodEnd = periodEndParam || format(endOfMonth(now), "yyyy-MM-dd");
  const result = await actionComputeTeacherPayout({ teacherId, periodStart, periodEnd });

  const { viewer, printedAt } = await resolvePrintStamp({
    tenantId: session.tenantId,
    userId: session.userId,
    teachers: data.teachers,
    now,
  });
  const isYearly = periodStart.slice(0, 7) !== periodEnd.slice(0, 7);
  // Yıllık dökümde ay ara toplamları (yyyy-MM → dakika/tutar).
  const monthly = new Map<string, { lessons: number; minutes: number; amount: number }>();
  if (result.ok) {
    for (const l of result.lines) {
      const key = l.lessonDate.slice(0, 7);
      const row = monthly.get(key) ?? { lessons: 0, minutes: 0, amount: 0 };
      row.lessons += 1;
      row.minutes += l.durationMinutes;
      row.amount += l.amount;
      monthly.set(key, row);
    }
  }
  const statusText = !result.ok
    ? ""
    : result.existingPayout?.status === "paid"
      ? "Ödendi"
      : result.existingPayout
        ? "Hakediş kaydı oluşturuldu — ödeme bekliyor"
        : "Dönem hesabı — hakediş kaydı henüz oluşturulmadı";

  return (
    <div className="min-h-screen bg-[#f4f2f8] px-4 py-8 print:bg-white print:p-0 sm:px-6">
      <style>{`@media print { @page { size: A4; margin: 14mm; } thead { display: table-header-group; } tr { break-inside: avoid; } }${printSurfaceCss("doc-print-surface")}`}</style>
      <div className="mx-auto max-w-3xl">
        <DocumentPrintActions backHref={`/panel/ogretmenler/${teacher.id}/hakedis`} />
        {!result.ok ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Rapor yüklenemedi: {result.message}
          </p>
        ) : (
          <div className="doc-print-surface rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none sm:p-10">
            <h1>{isYearly ? "Yıllık Hakediş Dökümü" : "Aylık Hakediş Dökümü"}</h1>
            <PrintReportMeta
              institution={data.settings.name}
              rows={[
                ["Öğretmen", teacher.name],
                ["Dönem", `${formatDate(periodStart)} – ${formatDate(periodEnd)}`],
                ["Durum", statusText],
              ]}
              viewer={viewer}
              printedAt={printedAt}
            />

            {isYearly && monthly.size > 0 ? (
              <>
                <h2>Aylık özet</h2>
                <table>
                  <thead>
                    <tr>
                      <th>Ay</th>
                      <th className="num">Ders</th>
                      <th className="num">Süre (dk)</th>
                      <th className="num">Tutar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from(monthly.entries())
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([ym, row]) => (
                        <tr key={ym}>
                          <td>{formatDate(`${ym}-01`, "MMMM yyyy")}</td>
                          <td className="num">{row.lessons}</td>
                          <td className="num">{row.minutes}</td>
                          <td className="num">{formatMoney(row.amount)}</td>
                        </tr>
                      ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th>Toplam</th>
                      <th className="num">{result.totalLessons}</th>
                      <th className="num">{result.totalMinutes}</th>
                      <th className="num">{formatMoney(result.totalAmount)}</th>
                    </tr>
                  </tfoot>
                </table>
              </>
            ) : null}

            <h2>Ders detayları</h2>
            {result.lines.length === 0 ? (
              <p>Dönemde hakedişe konu ders yok.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Tarih</th>
                    <th>Öğrenci</th>
                    <th>Şube</th>
                    <th>Ders</th>
                    <th className="num">Süre (dk)</th>
                    <th className="num">Dakika ücreti</th>
                    <th className="num">Tutar</th>
                  </tr>
                </thead>
                <tbody>
                  {result.lines.map((l) => (
                    <tr key={l.lessonId}>
                      <td>{formatDate(l.lessonDate.slice(0, 10))}</td>
                      <td>{l.studentName ?? "—"}{l.issue === "missing-fee-rule" ? " (ücret kuralı eksik)" : ""}</td>
                      <td>{l.branchName ?? "—"}</td>
                      <td>{l.instrument}</td>
                      <td className="num">{l.durationMinutes}</td>
                      <td className="num">{l.perMinuteRate != null ? formatMoney(l.perMinuteRate) : "Tanımsız"}</td>
                      <td className="num">{formatMoney(l.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th colSpan={4}>Toplam — {result.totalLessons} ders</th>
                    <th className="num">{result.totalMinutes}</th>
                    <th />
                    <th className="num">{formatMoney(result.totalAmount)}</th>
                  </tr>
                </tfoot>
              </table>
            )}

            {result.missingFeeRuleLessonIds.length > 0 ? (
              <p>
                Dikkat: {result.missingFeeRuleLessonIds.length} ders için ücret kuralı tanımlı değil — bu satırlar
                tutara 0 olarak yansıdı. Hakediş ücretini tanımlayıp raporu yenileyin.
              </p>
            ) : null}
            <p className="mt-4 text-xs">
              Tutar, ders süresi (dakika) ile tanımlı dakika ücretinin çarpımıdır. Brüt, net ve kesinti ayrımı bu raporda yoktur.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

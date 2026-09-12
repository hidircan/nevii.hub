import { redirect } from "next/navigation";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext, readScopedData } from "@/lib/institution/context";
import { actionComputeTeacherPayout } from "@/lib/actions";
import { printSurfaceCss } from "@/lib/contract-print-theme";
import { formatDate, formatMoney } from "@/lib/utils";
import { DocumentPrintActions } from "@/components/document-print-actions";

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

  const viewer = session.userId;
  const printedAt = formatDate(now.toISOString().slice(0, 10));

  return (
    <div className="min-h-screen bg-[#f4f2f8] px-4 py-8 print:bg-white print:p-0 sm:px-6">
      <style>{`@media print { @page { size: A4; margin: 14mm; } }${printSurfaceCss("doc-print-surface")}`}</style>
      <div className="mx-auto max-w-3xl">
        <DocumentPrintActions backHref={`/panel/ogretmenler/${teacher.id}/hakedis`} />
        {!result.ok ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Rapor yüklenemedi: {result.message}
          </p>
        ) : (
          <div className="doc-print-surface rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none sm:p-10">
            <h1>Öğretmen Hakediş Raporu</h1>
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
              <div><dt className="inline font-semibold">Öğretmen: </dt><dd className="inline">{teacher.name}</dd></div>
              <div><dt className="inline font-semibold">Dönem: </dt><dd className="inline">{formatDate(periodStart)} – {formatDate(periodEnd)}</dd></div>
              <div>
                <dt className="inline font-semibold">Durum: </dt>
                <dd className="inline">{result.existingPayout ? `Kayıtlı (${result.existingPayout.status})` : "Hesap taslağı — snapshot oluşturulmadı"}</dd>
              </div>
              <div><dt className="inline font-semibold">Raporu alan: </dt><dd className="inline">{viewer}</dd></div>
              <div><dt className="inline font-semibold">Oluşturulma: </dt><dd className="inline">{printedAt}</dd></div>
            </dl>

            <h2>Ders/seans detayları</h2>
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
                    <th>Süre (dk)</th>
                    <th>Birim ücret</th>
                    <th>Tutar</th>
                  </tr>
                </thead>
                <tbody>
                  {result.lines.map((l) => (
                    <tr key={l.lessonId}>
                      <td>{formatDate(l.lessonDate.slice(0, 10))}</td>
                      <td>{l.studentName ?? "—"}{l.issue ? ` (${l.issue})` : ""}</td>
                      <td>{l.branchName ?? "—"}</td>
                      <td>{l.instrument}</td>
                      <td>{l.durationMinutes}</td>
                      <td>{l.perMinuteRate != null ? formatMoney(l.perMinuteRate) : "kural yok"}</td>
                      <td>{formatMoney(l.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <h2>Toplam</h2>
            <p>
              Toplam {result.totalLessons} ders, {result.totalMinutes} dakika —{" "}
              <strong>toplam hakediş {formatMoney(result.totalAmount)}</strong>.
            </p>
            {result.missingFeeRuleLessonIds.length > 0 ? (
              <p>
                Dikkat: {result.missingFeeRuleLessonIds.length} ders için ücret kuralı tanımlı değil — bu satırlar
                tutara 0 olarak yansıdı. Hakediş ücretini tanımlayıp raporu yenileyin.
              </p>
            ) : null}
            <p className="mt-4 text-xs">
              Brüt/net/indirim/kesinti ayrımı mevcut veri modelinde yoktur — tek tutar (dakika × kural) basılır.
              Bu kalemler backend backlog listesindedir. Tahmin veya örnek veri içermez.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

import { redirect } from "next/navigation";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext, readScopedReferenceData } from "@/lib/institution/context";
import { actionTeacherEarningsStatement } from "@/lib/actions";
import { printSurfaceCss } from "@/lib/contract-print-theme";
import { formatDate } from "@/lib/utils";
import { DocumentPrintActions } from "@/components/document-print-actions";
import { resolvePrintStamp } from "@/lib/contract-payment-plan-view";
import { PrintReportMeta } from "@/components/print-report-meta";
import { DEFAULT_APP_TIMEZONE, toZonedYmd } from "@/lib/timezone";
import { PAYOUT_STATUS_LABEL } from "@/lib/payout-ledger";
import { STATEMENT_LINE_KIND_LABEL, type StatementMonth } from "@/lib/teacher-earnings-statement";
import { ATTENDED_PLANNED_MAKEUP_HINT, ATTENDED_PLANNED_MAKEUP_LABEL } from "@/lib/lesson-live-status";

export const dynamic = "force-dynamic";

const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const METHOD_LABEL: Record<string, string> = { cash: "Nakit", transfer: "Havale" };

const moneyFmt = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (n: number) => moneyFmt.format(Math.abs(n) < 0.005 ? 0 : n);
const signedMoney = (n: number) => (Math.abs(n) < 0.005 ? money(0) : `${n > 0 ? "+" : "−"}${money(Math.abs(n))}`);
const duration = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h} sa${m ? ` ${m} dk` : ""}` : `${m} dk`;
};
const monthLabel = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

/**
 * Öğretmen hakediş DÖKÜMÜ (aylık / yıllık) — baskı rotası. Sözleşme/KVKK ile AYNI baskı teması
 * (`printSurfaceCss`). Hesap tek yerde: `teacherEarningsStatementTool` → `buildTeacherEarningsStatement`
 * (hakediş ekranıyla aynı kayıt/canlı kuralı; yıllık = 12 aylık sonucun toplamı).
 *
 * Parametreler: `?year=2026&month=9` aylık, `?year=2026` yıllık. Eski bağlantılar (`periodStart`/`periodEnd`)
 * aynı ay/yıla çevrilir. Parametre yoksa İstanbul takvimine göre içinde bulunulan ay.
 *
 * Yetki: hakediş ekranıyla aynı (kurum hakediş politikası + tool rol kontrolü). Öğretmen bu rotaya erişemez.
 */
export default async function OgretmenHakedisYazdirPage({
  params,
  searchParams,
}: {
  params: Promise<{ teacherId: string }>;
  searchParams: Promise<{ year?: string; month?: string; periodStart?: string; periodEnd?: string }>;
}) {
  const { teacherId } = await params;
  const sp = await searchParams;

  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect(`/login?next=/ogretmen-hakedis-yazdir/${teacherId}`);
  }
  const { canAccessTeacherEarnings } = await import("@/lib/platform/teacher-earnings-access");
  if (!(await canAccessTeacherEarnings(session))) {
    redirect("/panel");
  }

  const now = new Date();
  const today = toZonedYmd(now, DEFAULT_APP_TIMEZONE);
  const { year, month } = resolveStatementPeriod(sp, today);
  const isYearly = month === undefined;

  const kurum = await getInstitutionContext(session);
  const data = await readScopedReferenceData(kurum.scope);
  const result = await actionTeacherEarningsStatement({ teacherId, year, month });
  const { viewer, printedAt } = await resolvePrintStamp({
    tenantId: session.tenantId,
    userId: session.userId,
    teachers: data.teachers,
    now,
  });

  const backHref = `/panel/ogretmenler/${teacherId}/hakedis`;
  const title = isYearly ? "Yıllık Hakediş Dökümü" : "Aylık Hakediş Dökümü";
  const periodText = isYearly ? `${year} (Ocak – Aralık)` : `${MONTHS[month - 1]} ${year}`;

  return (
    <div className="print-light-palette min-h-screen bg-[#f4f2f8] px-4 py-8 print:bg-white print:p-0 sm:px-6">
      <style>{statementCss}</style>
      <div className="mx-auto max-w-4xl">
        <DocumentPrintActions backHref={backHref} backLabel="Hakediş ekranına dön" />
        {!result.ok ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Döküm hazırlanamadı: {result.message}
          </p>
        ) : (
          <article className="doc-print-surface stmt rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none sm:p-10">
            <header className="stmt-head">
              <div>
                <p className="stmt-inst">{data.settings.name}</p>
                <h1>{title}</h1>
                <p className="stmt-period">{periodText}</p>
              </div>
            </header>
            <PrintReportMeta
              institution={data.settings.name}
              rows={[
                ["Öğretmen", result.teacherName],
                [
                  "Hakediş dönemi",
                  isYearly
                    ? `01.01.${year} – 31.12.${year}`
                    : `${formatDate(result.months[0]!.periodStart, "dd.MM.yyyy")} – ${formatDate(result.months[0]!.periodEnd, "dd.MM.yyyy")}`,
                ],
                ...(!isYearly ? ([["Kayıt durumu", PAYOUT_STATUS_LABEL[result.months[0]!.status]]] as [string, string][]) : []),
              ]}
              viewer={viewer}
              printedAt={printedAt}
            />

            <table className="stmt-summary">
              <thead>
                <tr>
                  <th className="num">Hak edilen (dersler)</th>
                  <th className="num">Düzeltmeler</th>
                  <th className="num">Net hakediş</th>
                  <th className="num">Ödenen</th>
                  <th className="num">Kalan</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="num">{money(result.totals.accrued)}</td>
                  <td className="num">{signedMoney(result.totals.adjustments)}</td>
                  <td className="num">{money(result.totals.net)}</td>
                  <td className="num">{money(result.totals.paid)}</td>
                  <td className="num strong">{money(result.totals.balance)}</td>
                </tr>
              </tbody>
            </table>
            <p className="stmt-sub">
              {result.totals.lessons} ders kalemi ({result.totals.makeups} telafi, {result.totals.clubSessions} kulüp oturumu) ·{" "}
              {duration(result.totals.minutes)}
            </p>

            {result.irregularPayouts.length > 0 ? (
              <p className="stmt-warn">
                Dikkat: takvim ayıyla örtüşmeyen {result.irregularPayouts.length} hakediş kaydı var (
                {result.irregularPayouts.map((p) => `${formatDate(p.periodStart, "dd.MM.yyyy")}–${formatDate(p.periodEnd, "dd.MM.yyyy")}`).join(", ")}
                ); bu kayıtlar dökümde ayrıca toplanmadı. Hakediş ekranından kontrol edin.
              </p>
            ) : null}
            {result.totals.missingFeeRule > 0 ? (
              <p className="stmt-warn">
                Dikkat: {result.totals.missingFeeRule} ders için geçerli ücret kuralı yok; bu satırlar 0 TL olarak yansıdı.
                Öğretmenin Hakediş sekmesinden ücret kuralını tanımlayıp dökümü yeniden alın.
              </p>
            ) : null}

            {isYearly ? <MonthlySummaryTable months={result.months} totals={result.totals} /> : null}

            <h2>Ödeme ve düzeltme hareketleri</h2>
            {result.ledger.length === 0 ? (
              <p className="stmt-empty">Bu dönemde kayıtlı ödeme veya düzeltme yok.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Hakediş dönemi</th>
                    <th>İşlem</th>
                    <th>İşlem tarihi</th>
                    <th>Yöntem</th>
                    <th>Açıklama</th>
                    <th className="num">Tutar</th>
                  </tr>
                </thead>
                <tbody>
                  {result.ledger.map((e) => (
                    <tr key={`${e.type}-${e.id}`} className={e.reversed ? "reversed" : undefined}>
                      <td>{monthLabel(e.month)}</td>
                      <td>{e.type === "payment" ? "Ödeme" : "Düzeltme"}</td>
                      <td>{formatDate(e.date, "dd.MM.yyyy")}</td>
                      <td>{e.method ? (METHOD_LABEL[e.method] ?? e.method) : "—"}</td>
                      <td>
                        {e.note ?? "—"}
                        {e.reversed ? ` (ters kayıt${e.reverseReason ? `: ${e.reverseReason}` : ""} — toplama girmez)` : ""}
                      </td>
                      <td className="num">{e.type === "adjustment" ? signedMoney(e.amount) : money(e.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <h2>Ders detayları</h2>
            {result.months.map((m) => (m.lines.length > 0 ? <MonthDetail key={m.month} m={m} showHeading={isYearly} /> : null))}
            {(() => {
              const empty = result.months.filter((m) => m.lines.length === 0);
              if (empty.length === 0) return null;
              return (
                <p className="stmt-empty">
                  {isYearly ? `Hakedişe konu ders olmayan aylar: ${empty.map((m) => MONTHS[Number(m.month.slice(5, 7)) - 1]).join(", ")}.` : "Bu ayda hakedişe konu ders yok."}
                </p>
              );
            })()}

            <section className="stmt-legend">
              <h3>Açıklamalar</h3>
              <ul>
                <li>
                  <b>Hakediş dönemi</b>: ders, İstanbul saatine göre yapıldığı aya yazılır. Ödeme ve düzeltmeler, ödendikleri
                  tarihten bağımsız olarak karşıladıkları hakediş ayına yazılır; gerçek işlem günü &quot;İşlem tarihi&quot;
                  sütunundadır.
                </li>
                <li>
                  <b>Net hakediş</b> = hak edilen + düzeltmeler; <b>Kalan</b> = net − ödenen. &quot;Kayıt yok&quot; olan
                  aylarda tutar güncel hesaptır (hakediş kaydı henüz oluşturulmadı).
                </li>
                <li>
                  <b>Tür</b>: Ders · Telafi (planlanan telafi dersi) · Kulüp (saati geçmiş, ertelenmemiş oturum,
                  oturum başına bir kalem) · Deneme. <span className="t-mark" aria-hidden="true">T</span>{" "}
                  {ATTENDED_PLANNED_MAKEUP_LABEL}. Telafi dersi bir kez sayılır; kaçırılan (Telafi işaretli) asıl ders
                  hakedişe girmez.
                </li>
                <li>Tutar = ders süresi × geçerli ücret (ay politikası/öğretmen kuralı). Brüt/net vergi ayrımı bu dökümde yoktur.</li>
              </ul>
            </section>
          </article>
        )}
      </div>
    </div>
  );
}

function MonthlySummaryTable({
  months,
  totals,
}: {
  months: StatementMonth[];
  totals: Pick<StatementMonth, "lessons" | "makeups" | "clubSessions" | "minutes" | "accrued" | "adjustments" | "paid" | "balance">;
}) {
  return (
    <>
      <h2>Aylık özet</h2>
      <table className="stmt-compact">
        <thead>
          <tr>
            <th>Ay</th>
            <th className="num">Ders</th>
            <th className="num">Telafi</th>
            <th className="num">Kulüp</th>
            <th className="num">Süre</th>
            <th className="num">Hak edilen</th>
            <th className="num">Düzeltme</th>
            <th className="num">Ödenen</th>
            <th className="num">Kalan</th>
            <th>Durum</th>
          </tr>
        </thead>
        <tbody>
          {months.map((m) => (
            <tr key={m.month} className={m.lessons === 0 && !m.payoutId ? "muted" : undefined}>
              <td>{MONTHS[Number(m.month.slice(5, 7)) - 1]}</td>
              <td className="num">{m.lessons}</td>
              <td className="num">{m.makeups}</td>
              <td className="num">{m.clubSessions}</td>
              <td className="num">{duration(m.minutes)}</td>
              <td className="num">{money(m.accrued)}</td>
              <td className="num">{signedMoney(m.adjustments)}</td>
              <td className="num">{money(m.paid)}</td>
              <td className="num">{money(m.balance)}</td>
              <td>{PAYOUT_STATUS_LABEL[m.status]}</td>
            </tr>
          ))}
        </tbody>
        <tbody className="keep">
          <tr className="total">
            <th>Toplam</th>
            <th className="num">{totals.lessons}</th>
            <th className="num">{totals.makeups}</th>
            <th className="num">{totals.clubSessions}</th>
            <th className="num">{duration(totals.minutes)}</th>
            <th className="num">{money(totals.accrued)}</th>
            <th className="num">{signedMoney(totals.adjustments)}</th>
            <th className="num">{money(totals.paid)}</th>
            <th className="num">{money(totals.balance)}</th>
            <th />
          </tr>
        </tbody>
      </table>
    </>
  );
}

function MonthDetail({ m, showHeading }: { m: StatementMonth; showHeading: boolean }) {
  const body = m.lines.slice(0, -1);
  const lastLine = m.lines[m.lines.length - 1]!;
  const row = (l: StatementMonth["lines"][number]) => (
    <tr key={l.lessonId}>
      <td className="when">{formatDate(l.lessonDate, "dd.MM.yyyy HH:mm")}</td>
      <td>
        {l.studentName ?? "—"}
        {l.issue === "missing-fee-rule" ? " (ücret kuralı eksik)" : l.issue === "duration-exception" ? " (süre istisnası — orantılı)" : ""}
        {l.original ? " (elle düzeltildi)" : ""}
      </td>
      <td>
        {STATEMENT_LINE_KIND_LABEL[l.kind]}
        {l.attendedPlannedMakeup ? (
          <>
            {" "}
            <span className="t-mark" title={ATTENDED_PLANNED_MAKEUP_HINT} aria-label={ATTENDED_PLANNED_MAKEUP_LABEL}>
              T
            </span>
          </>
        ) : null}
      </td>
      <td>{l.branchName ?? "—"}</td>
      <td>{l.instrument}</td>
      <td className="num">{l.durationMinutes}</td>
      <td className="num">{l.hourlyRate !== undefined ? money(l.hourlyRate) : "Tanımsız"}</td>
      <td className="num">{money(l.amount)}</td>
    </tr>
  );
  return (
    <section className="stmt-month">
      {showHeading ? (
        <h3>
          {monthLabel(m.month)} <span>· {m.lessons} ders · {duration(m.minutes)} · {money(m.accrued)} · {PAYOUT_STATUS_LABEL[m.status]}</span>
        </h3>
      ) : null}
      <table>
        <thead>
          <tr>
            <th>Tarih</th>
            <th>Öğrenci</th>
            <th>Tür</th>
            <th>Şube</th>
            <th>Enstrüman</th>
            <th className="num">Dk</th>
            <th className="num">Saatlik ücret</th>
            <th className="num">Tutar</th>
          </tr>
        </thead>
        <tbody>{body.map(row)}</tbody>
        {/* Son satır ve ara toplam aynı blokta: toplam satırı sayfada yalnız kalmaz. */}
        <tbody className="keep">
          {row(lastLine)}
          <tr className="total">
            <th colSpan={5}>
              {showHeading ? `${monthLabel(m.month)} toplamı` : "Toplam"} — {m.lessons} ders
            </th>
            <th className="num">{m.minutes}</th>
            <th />
            <th className="num">{money(m.accrued)}</th>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

/** URL → (yıl, ay?). Geçersiz değerde İstanbul takvimindeki içinde bulunulan ay. */
function resolveStatementPeriod(
  sp: { year?: string; month?: string; periodStart?: string; periodEnd?: string },
  todayYmd: string
): { year: number; month: number } | { year: number; month: undefined } {
  const valid = (y: number) => Number.isInteger(y) && y >= 2000 && y <= 2100;
  if (sp.year) {
    const y = Number(sp.year);
    if (valid(y)) {
      if (sp.month === undefined || sp.month === "") return { year: y, month: undefined };
      const m = Number(sp.month);
      if (Number.isInteger(m) && m >= 1 && m <= 12) return { year: y, month: m };
    }
  } else if (sp.periodStart && /^\d{4}-\d{2}/.test(sp.periodStart)) {
    // Eski bağlantı biçimi: aynı ay → aylık, farklı ay → başlangıç yılının yıllık dökümü.
    const y = Number(sp.periodStart.slice(0, 4));
    const sameMonth = !sp.periodEnd || sp.periodEnd.slice(0, 7) === sp.periodStart.slice(0, 7);
    if (valid(y)) return sameMonth ? { year: y, month: Number(sp.periodStart.slice(5, 7)) } : { year: y, month: undefined };
  }
  return { year: Number(todayYmd.slice(0, 4)), month: Number(todayYmd.slice(5, 7)) };
}

const statementCss = `
@media print {
  @page { size: A4; margin: 14mm 12mm 16mm; @bottom-center { content: "Sayfa " counter(page) " / " counter(pages); font-size: 9px; color: #555; } }
  thead { display: table-header-group; }
  tr, tbody.keep { break-inside: avoid; }
  h2, h3 { break-after: avoid; }
  .stmt-month { break-before: auto; }
}
${printSurfaceCss("doc-print-surface")}
.stmt { font-size: 12px; line-height: 1.45; }
.stmt h1 { font-size: 20px; font-weight: 700; margin: 2px 0 0; }
.stmt h2 { font-size: 14px; font-weight: 700; margin: 22px 0 6px; padding-bottom: 4px; border-bottom: 2px solid var(--color-border); }
.stmt h3 { font-size: 12.5px; font-weight: 700; margin: 16px 0 4px; }
.stmt h3 span { font-weight: 400; color: var(--color-text-muted); }
.stmt-head { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid var(--color-text); padding-bottom: 8px; }
.stmt-inst { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--color-text-muted); margin: 0; }
.stmt-period { font-size: 13px; margin: 2px 0 0; }
.stmt table { font-size: 11px; }
.stmt table.stmt-compact { font-size: 10px; }
.stmt table.stmt-compact th, .stmt table.stmt-compact td { padding: 4px 5px; }
.stmt-summary { margin-top: 14px !important; table-layout: fixed; }
.stmt-summary td { font-size: 14px; font-weight: 600; padding: 10px 8px !important; }
.stmt-summary td.strong { font-weight: 800; }
.stmt-sub { font-size: 11px; color: var(--color-text-muted); margin: 4px 0 0; text-align: right; }
.stmt-warn { margin-top: 10px; padding: 6px 8px; border: 1px solid #d97706; font-size: 11px; }
.stmt-empty { font-size: 11px; color: var(--color-text-muted); margin: 6px 0; }
.stmt tr.total th { background: var(--color-surface-muted); }
.stmt tr.muted td { color: var(--color-text-muted); }
.stmt tr.reversed td { color: var(--color-text-muted); text-decoration: line-through; text-decoration-thickness: 1px; }
.stmt td { word-break: break-word; }
.stmt td.num, .stmt th.num, .stmt td.when { white-space: nowrap; }
.stmt .t-mark { display: inline-flex; align-items: center; justify-content: center; width: 14px; height: 14px; border-radius: 3px; background: #15803d; color: #fff; font-size: 9px; font-weight: 800; line-height: 1; vertical-align: middle; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.stmt-legend { margin-top: 22px; font-size: 10.5px; color: var(--color-text-muted); break-inside: avoid; }
.stmt-legend h3 { margin-top: 0; color: var(--color-text); }
.stmt-legend ul { margin: 0; padding-left: 16px; list-style: disc; }
.stmt-legend li { margin: 2px 0; }
`;

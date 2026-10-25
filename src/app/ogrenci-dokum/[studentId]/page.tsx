import Link from "@/components/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { requireSessionContext } from "@/lib/auth/session";
import { getStudentPaymentAttendanceStatementTool } from "@/lib/services";
import { CONTRACT_PRINT_PALETTE as P } from "@/lib/contract-print-theme";
import { PAYMENT_STATUS_TEXT } from "@/lib/student-statement";
import { currentAcademicAnchorYear } from "@/lib/attendance-calendar";
import { formatDate, formatMoney } from "@/lib/utils";
import { BRAND } from "@/lib/brand";
import { DocumentPrintActions } from "@/components/document-print-actions";
import { PrintReportMeta } from "@/components/print-report-meta";
import { resolvePrintStamp } from "@/lib/contract-payment-plan-view";
import { planHasRows, type CalendarMonthPlan } from "@/lib/attendance-calendar-plan";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: `Ödeme ve yoklama dökümü — ${BRAND.name}` };
}

function planAmount(plan: CalendarMonthPlan) {
  const prior = plan.state === "no_installment_for_month" ? plan.coveredByPriorVersion : undefined;
  if (prior) {
    // 2026-10-25 — revizyonda mahsup edilen ay: tahsilat önceki sözleşme sürümünde.
    return {
      planned: formatMoney(prior.paidAmount),
      paid: formatMoney(prior.paidAmount),
      remaining: formatMoney(0),
      status: `${PAYMENT_STATUS_TEXT.paid ?? "Ödendi"} (önceki sürüm ${prior.contractNumbers.join(", ")})`,
    };
  }
  if (!planHasRows(plan)) {
    return { planned: "—", paid: "—", remaining: "—", status: plan.message ?? "Bu ay için aktif ödeme planı bulunmuyor." };
  }
  return {
    planned: formatMoney(plan.amount ?? 0),
    paid: formatMoney(plan.paidAmount ?? 0),
    remaining: formatMoney(plan.remaining ?? 0),
    status: PAYMENT_STATUS_TEXT[plan.status ?? ""] ?? plan.status ?? "—",
  };
}

export default async function StudentStatementPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { studentId } = await params;
  const sp = await searchParams;
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect(`/login?next=/ogrenci-dokum/${studentId}`);
  }
  if (session.role !== "SCHOOL_ADMIN" && session.role !== "SUPER_ADMIN") {
    redirect("/panel");
  }

  const term = sp.term === "yaz" ? "yaz" : "guz";
  const parsedYear = typeof sp.year === "string" ? Number(sp.year) : NaN;
  const anchorYear = Number.isFinite(parsedYear) ? parsedYear : currentAcademicAnchorYear(term);

  const result = await getStudentPaymentAttendanceStatementTool(session, {
    studentId,
    term,
    anchorYear,
    // 2026-10-09 — çok branşlı öğrencide döküm branş başınadır (Program sekmesindeki branş seçimi taşınır).
    ...(typeof sp.brans === "string" && sp.brans ? { enrollmentId: sp.brans } : {}),
  });

  if (!result.ok) {
    return (
      <div className="mx-auto max-w-lg px-6 py-20 text-center" style={{ color: P.text, background: P.surface }}>
        <p className="text-lg font-semibold">Döküm açılamadı</p>
        <p className="mt-2 text-sm">{result.error.message}</p>
        <Link href={`/panel/ogrenciler/${studentId}`} className="mt-6 inline-block text-sm font-medium underline">
          Öğrenci kaydına dön
        </Link>
      </div>
    );
  }

  const s = result.data;
  // Yönetici rolleri: ad personel/kullanıcı kaydından çözülür; öğretmen eşleşmesi gerekmez.
  const { viewer, printedAt } = await resolvePrintStamp({ tenantId: session.tenantId, userId: session.userId, teachers: [] });
  // Birleşik ilk tahsilat satırı iki ayda da görünür — toplamda bir kez sayılır.
  const countedPlanRows = new Set<string>();
  const planTotals = s.months.reduce(
    (acc, m) => {
      // Önceki sürümde tahsil edilen ay: yalnız bu aya düşen tahsilat payı (ay başına ayrı, çift sayım yok).
      const prior = m.plan.state === "no_installment_for_month" ? m.plan.coveredByPriorVersion : undefined;
      if (prior) return { planned: acc.planned + prior.paidAmount, paid: acc.paid + prior.paidAmount, remaining: acc.remaining };
      if (!planHasRows(m.plan)) return acc;
      const key = m.plan.paymentIds.join(",");
      if (countedPlanRows.has(key)) return acc;
      countedPlanRows.add(key);
      return {
        planned: acc.planned + (m.plan.amount ?? 0),
        paid: acc.paid + (m.plan.paidAmount ?? 0),
        remaining: acc.remaining + (m.plan.remaining ?? 0),
      };
    },
    { planned: 0, paid: 0, remaining: 0 }
  );

  return (
    <div
      className="statement-print min-h-screen px-6 py-8"
      style={{ background: P.surface, color: P.text, fontFamily: "Inter, Helvetica, Arial, sans-serif" }}
    >
      <style>{`
        @media print {
          nav, aside, header, .no-print { display: none !important; }
          body { background: ${P.surface} !important; color: ${P.text} !important; }
          a { color: ${P.text} !important; }
        }
        .statement-print h1, .statement-print h2 { color: ${P.text}; }
        .statement-print table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .statement-print th, .statement-print td { border: 1px solid ${P.border}; padding: 6px 8px; text-align: left; vertical-align: top; }
        .statement-print th { background: ${P.surfaceMuted}; }
        .statement-print .num { text-align: right; font-variant-numeric: tabular-nums; }
        @media print { thead { display: table-header-group; } tr { break-inside: avoid; } @page { size: A4 landscape; margin: 12mm; } }
      `}</style>
      <DocumentPrintActions backHref={`/panel/ogrenciler/${studentId}`} />

      <h1 className="text-2xl font-semibold">Ödeme ve Yoklama Dökümü</h1>
      <PrintReportMeta
        institution={s.institutionName}
        rows={[
          ["Öğrenci", s.studentName],
          ...(s.branchLabel ? [["Branş", s.branchLabel] as [string, string]] : []),
          ["Şube", s.branchName],
          ["Dönem", `${s.termLabel} · ${formatDate(s.termStart)} – ${formatDate(s.termEnd)}`],
          ...(s.contractNumber ? ([["Sözleşme", s.contractNumber]] as [string, string][]) : []),
        ]}
        viewer={viewer}
        printedAt={printedAt}
      />

      <h2 className="mt-8 text-lg font-semibold">Ödeme planı</h2>
      <table className="mt-3">
        <thead>
          <tr>
            <th>Ay</th>
            <th className="num">Planlanan</th>
            <th className="num">Ödenen</th>
            <th className="num">Kalan borç</th>
            <th>Durum</th>
            <th>Ödeme Türü</th>
            <th>Tahsilat tarihi</th>
            <th>Not</th>
            <th>Tahsil eden</th>
          </tr>
        </thead>
        <tbody>
          {s.months.map((m) => {
            const row = planAmount(m.plan);
            return (
              <tr key={`${m.year}-${m.month}`}>
                <td>{m.label}</td>
                <td className="num">{row.planned}</td>
                <td className="num">{row.paid}</td>
                <td className="num">{row.remaining}</td>
                <td>{row.status}</td>
                <td>{m.paymentMethodLabel}</td>
                <td>{m.collectedAt ? formatDate(m.collectedAt) : "—"}</td>
                <td>{m.collectionNote || "—"}</td>
                <td>{m.collectorName || "—"}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <th>Toplam</th>
            <th className="num">{formatMoney(planTotals.planned)}</th>
            <th className="num">{formatMoney(planTotals.paid)}</th>
            <th className="num">{formatMoney(planTotals.remaining)}</th>
            <th colSpan={5} />
          </tr>
        </tfoot>
      </table>

      <h2 className="mt-8 text-lg font-semibold">Gün bazlı yoklama</h2>
      {s.months.map((m) => (
        <section key={`att-${m.year}-${m.month}`} className="mt-4">
          <h3 className="text-sm font-semibold">{m.label}</h3>
          {m.lessons.length === 0 ? (
            <p className="mt-1 text-sm" style={{ color: P.textMuted }}>
              Bu ayda ders kaydı yok.
            </p>
          ) : (
            <table className="mt-2">
              <thead>
                <tr>
                  <th>Tarih</th>
                  <th>Saat</th>
                  <th>Ders</th>
                  <th>Öğretmen</th>
                  <th>Şube</th>
                  <th>Durum</th>
                </tr>
              </thead>
              <tbody>
                {m.lessons.map((l) => (
                  <tr key={`${l.startAt}-${l.instrument}`}>
                    <td>{formatDate(l.date)}</td>
                    <td>{l.time}</td>
                    <td>{l.instrument}</td>
                    <td>{l.teacherName || "—"}</td>
                    <td>{l.branchName || "—"}</td>
                    <td>
                      <span
                        aria-hidden="true"
                        style={{
                          display: "inline-block",
                          width: 8,
                          height: 8,
                          borderRadius: 999,
                          marginRight: 6,
                          background:
                            l.status === "attended"
                              ? "#15803d"
                              : l.status === "processed"
                                ? "#b91c1c"
                                : l.status === "makeup"
                                  ? "#ca8a04"
                                  : l.status === "cancelled"
                                    ? "#444"
                                    : "#94a3b8",
                        }}
                      />
                      {l.statusText}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ))}
    </div>
  );
}

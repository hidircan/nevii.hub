import { redirect, notFound } from "next/navigation";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext, readScopedData } from "@/lib/institution/context";
import { printSurfaceCss } from "@/lib/contract-print-theme";
import { formatDate, formatMoney } from "@/lib/utils";
import { DocumentPrintActions } from "@/components/document-print-actions";
import { resolvePrintStamp } from "@/lib/contract-payment-plan-view";
import { PrintReportMeta } from "@/components/print-report-meta";

export const dynamic = "force-dynamic";

const METHOD_LABEL: Record<string, string> = { cash: "Nakit", transfer: "Havale" };

/** Ödeme geçmişi — yalnız ödenmiş hakedişler. Bekleyen kayıt bu rapora girmez. */
export default async function TeacherPayoutHistoryPrintPage({
  params,
}: {
  params: Promise<{ teacherId: string }>;
}) {
  const { teacherId } = await params;
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect(`/login?next=/ogretmen-odeme-gecmisi-yazdir/${teacherId}`);
  }
  const { canAccessTeacherEarnings } = await import("@/lib/platform/teacher-earnings-access");
  if (!(await canAccessTeacherEarnings(session))) redirect("/panel");

  const kurum = await getInstitutionContext(session);
  const data = await readScopedData(kurum.scope);
  const teacher = data.teachers.find((t) => t.id === teacherId);
  if (!teacher) notFound();

  const paid = data.teacherPayouts
    .filter((p) => p.teacherId === teacherId && p.status === "paid")
    .sort((a, b) => b.periodStart.localeCompare(a.periodStart));
  const total = paid.reduce((s, p) => s + p.totalAmount, 0);
  const { viewer, printedAt } = await resolvePrintStamp({
    tenantId: session.tenantId,
    userId: session.userId,
    teachers: data.teachers,
  });

  return (
    <div className="min-h-screen bg-[#f4f2f8] px-4 py-8 print:bg-white print:p-0">
      <style>{`@media print { @page { size: A4; margin: 14mm; } thead { display: table-header-group; } tr { break-inside: avoid; } }${printSurfaceCss("doc-print-surface")}`}</style>
      <div className="mx-auto max-w-3xl">
        <DocumentPrintActions backHref={`/panel/ogretmenler/${teacher.id}/odemeler`} />
        <div className="doc-print-surface rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none sm:p-10">
          <h1>Öğretmen Ödeme Geçmişi</h1>
          <PrintReportMeta
            institution={data.settings.name}
            rows={[
              ["Öğretmen", teacher.name],
              ["Kapsam", "Ödenmiş hakedişler"],
            ]}
            viewer={viewer}
            printedAt={printedAt}
          />
          <table>
            <thead>
              <tr>
                <th>Dönem</th>
                <th className="num">Süre (dk)</th>
                <th className="num">Tutar</th>
                <th>Ödeme tarihi</th>
                <th>Yöntem</th>
              </tr>
            </thead>
            <tbody>
              {paid.length === 0 ? (
                <tr><td colSpan={5}>Ödenmiş hakediş kaydı yok.</td></tr>
              ) : (
                paid.map((p) => (
                  <tr key={p.id}>
                    <td>{formatDate(p.periodStart)} – {formatDate(p.periodEnd)}</td>
                    <td className="num">{p.totalMinutes}</td>
                    <td className="num">{formatMoney(p.totalAmount)}</td>
                    <td>{p.paidAt ? formatDate(p.paidAt) : "—"}</td>
                    <td>{p.method ? METHOD_LABEL[p.method] ?? p.method : "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr>
                <th>Toplam — {paid.length} ödeme</th>
                <th className="num">{paid.reduce((s, p) => s + p.totalMinutes, 0)}</th>
                <th className="num">{formatMoney(total)}</th>
                <th colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

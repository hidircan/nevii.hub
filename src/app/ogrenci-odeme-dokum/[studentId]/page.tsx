import { contractInstallmentProgressDescription, contractInstallmentProgressIndex } from "@/lib/attendance-calendar-plan";
import { collectedAmountOf } from "@/lib/payment-profile";
import { redirect } from "next/navigation";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext, readScopedData } from "@/lib/institution/context";
import { printSurfaceCss } from "@/lib/contract-print-theme";
import { formatDate, formatDateTime, formatMoney, statusLabel, paymentMethodLabelTr } from "@/lib/utils";
import { computeStudentPaymentSummary, sortPaymentsForProfile } from "@/lib/payment-profile";
import {
  buildContractPlanViewRows,
  isCollectedPayment,
  resolveActorLabels,
  resolvePrintStamp,
} from "@/lib/contract-payment-plan-view";
import { PrintReportMeta } from "@/components/print-report-meta";
import { listContractsForStudent } from "@/lib/contracts";
import { DocumentPrintActions } from "@/components/document-print-actions";

export const dynamic = "force-dynamic";

/**
 * P0 — öğrenci ödeme detay YAZDIRMA rotası. Sözleşme/KVKK ile AYNI ortak
 * baskı mekanizması (`printSurfaceCss` — üçüncü bir print sistemi YOK).
 *
 * TEK GERÇEK KAYNAK kuralı: toplamlar `computeStudentPaymentSummary`
 * (detay ekranındaki özet kartlarla AYNI fonksiyon); plan satırları
 * `buildContractPlanViewRows`; tahsil eden adı `resolveCollectorDisplayNames`
 * (e-posta DEĞİL ad-soyad). Ödenmemiş satırda tahsilat tarihi/yöntem/alan
 * kişi YOKTUR (`isCollectedPayment` kontrolü — sahte bilgi basılmaz).
 *
 * Yetki: detay ekranıyla AYNI (panel: SCHOOL_ADMIN/SUPER_ADMIN — öğretmen/
 * veli bu rotaya URL ile de giremez).
 */
export default async function OgrenciOdemeDokumPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;

  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect(`/login?next=/ogrenci-odeme-dokum/${studentId}`);
  }
  if (session.role !== "SCHOOL_ADMIN" && session.role !== "SUPER_ADMIN") {
    redirect("/panel");
  }

  const kurum = await getInstitutionContext(session);
  const data = await readScopedData(kurum.scope);
  const student = data.students.find((s) => s.id === studentId);
  if (!student) {
    return (
      <div className="mx-auto max-w-lg px-6 py-20 text-center">
        <p className="text-lg font-semibold">Öğrenci bulunamadı.</p>
      </div>
    );
  }

  const payments = sortPaymentsForProfile(data.payments.filter((p) => p.studentId === studentId));
  const contracts = await listContractsForStudent(session.tenantId, studentId);
  const summary = computeStudentPaymentSummary(payments, contracts);

  const receiverNames = await resolveActorLabels({
    tenantId: session.tenantId,
    userIds: payments.map((p) => p.receivedByUserId),
    teachers: data.teachers,
  });

  const branchName = data.settings.branches.find((b) => b.id === student.branchId)?.shortName ?? "—";
  const { viewer, printedAt } = await resolvePrintStamp({
    tenantId: session.tenantId,
    userId: session.userId,
    teachers: data.teachers,
  });
  const activePayments = payments.filter((p) => p.status !== "voided");
  const collectedOf = (p: (typeof payments)[number]) => collectedAmountOf(p);

  return (
    <div className="print-light-palette min-h-screen bg-[#f4f2f8] px-4 py-8 print:bg-white print:p-0 sm:px-6">
      <style>{`@media print {
  @page { size: A4; margin: 14mm; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
}${printSurfaceCss("doc-print-surface")}`}</style>
      <div className="mx-auto max-w-4xl">
        <DocumentPrintActions backHref={`/panel/odemeler/${student.id}`} />

        <div className="doc-print-surface rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none sm:p-10">
          <h1>Öğrenci Ödeme Dökümü</h1>
          <PrintReportMeta
            institution={data.settings.name}
            rows={[
              ["Öğrenci", student.name],
              ["Öğrenci no", student.displayId ?? "—"],
              ["Şube", branchName],
            ]}
            viewer={viewer}
            printedAt={printedAt}
          />

          <h2>Özet</h2>
          <table>
            <thead>
              <tr>
                <th className="num">Tahakkuk</th>
                <th className="num">Tahsil edilen</th>
                <th className="num">Kalan</th>
                <th className="num">Gecikmiş kalan</th>
                <th className="num">Açık kayıt</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="num">{formatMoney(summary.totalBilled)}</td>
                <td className="num">{formatMoney(summary.totalCollected)}</td>
                <td className="num">{formatMoney(summary.remaining)}</td>
                <td className="num">{formatMoney(summary.overdueRemaining)}</td>
                <td className="num">{summary.openCount}</td>
              </tr>
            </tbody>
          </table>

          {contracts.map((c) => {
            const rows = buildContractPlanViewRows({
              installments: c.contractDataSnapshot.installments,
              payments,
              contractId: c.id,
            });
            return (
              <div key={c.id}>
                <h2>
                  Sözleşme {c.contractNumber} — {c.programmeName}
                </h2>
                <table>
                  <thead>
                    <tr>
                      <th className="num">Sıra</th>
                      <th>Vade</th>
                      <th>Dönem</th>
                      <th>Ödeme türü</th>
                      <th className="num">Tutar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.sequence}>
                        <td className="num">{r.sequence}</td>
                        <td>{formatDate(r.dueDate)}</td>
                        <td>{r.periodLabel ?? "—"}</td>
                        <td>{r.paymentMethodLabel}</td>
                        <td className="num">{formatMoney(r.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th colSpan={4}>Sözleşme toplamı</th>
                      <th className="num">{formatMoney(c.totalContractAmount)}</th>
                    </tr>
                  </tfoot>
                </table>
              </div>
            );
          })}

          <h2>Ödeme hareketleri</h2>
          {payments.length === 0 ? (
            <p>Kayıtlı ödeme işlemi yok.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Açıklama</th>
                  <th>Vade</th>
                  <th className="num">Tutar</th>
                  <th className="num">Ödenen</th>
                  <th className="num">Kalan</th>
                  <th>Tahsilat tarihi</th>
                  <th>Yöntem</th>
                  <th>Tahsil eden</th>
                  <th>Durum</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => {
                  const collected = isCollectedPayment(p);
                  const paidPart = collectedOf(p);
                  const progress = contractInstallmentProgressIndex(p);
                  const contractRef = p.contractId
                    ? `${contracts.find((c) => c.id === p.contractId)?.contractNumber ?? "Sözleşme"}${progress != null ? ` · ${progress}. taksit` : ""}`
                    : null;
                  return (
                    <tr key={p.id}>
                      <td>
                        {contractInstallmentProgressDescription(p)}
                        {contractRef ? <span className="block text-xs">{contractRef}</span> : null}
                        {p.paymentNote ? <span className="block text-xs">Not: {p.paymentNote}</span> : null}
                        {p.adjustmentReason ? (
                          <span className="block text-xs">Kısmi tahsilat gerekçesi: {p.adjustmentReason}</span>
                        ) : null}
                        {p.createdAt ? <span className="block text-xs">Kayıt: {formatDateTime(p.createdAt)}</span> : null}
                      </td>
                      <td>{formatDate(p.dueDate)}</td>
                      <td className="num">{formatMoney(p.amount)}</td>
                      <td className="num">{formatMoney(paidPart)}</td>
                      <td className="num">{formatMoney(Math.max(0, p.amount - paidPart))}</td>
                      <td>{collected && p.paidAt ? formatDateTime(p.paidAt) : "—"}</td>
                      <td>{collected ? paymentMethodLabelTr(p.method) : "—"}</td>
                      <td>{collected && p.receivedByUserId ? receiverNames.get(p.receivedByUserId) ?? "—" : "—"}</td>
                      <td>{statusLabel(p.status)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <th colSpan={2}>Toplam (iptal edilenler hariç)</th>
                  <th className="num">{formatMoney(activePayments.reduce((s, p) => s + p.amount, 0))}</th>
                  <th className="num">{formatMoney(activePayments.reduce((s, p) => s + collectedOf(p), 0))}</th>
                  <th className="num">
                    {formatMoney(activePayments.reduce((s, p) => s + Math.max(0, p.amount - collectedOf(p)), 0))}
                  </th>
                  <th colSpan={4} />
                </tr>
              </tfoot>
            </table>
          )}
          <p className="mt-4 text-xs">
            İptal edilen ödeme kayıtları listede görünür, toplamlara girmez. Özet tablo ekrandaki ödeme özetiyle aynı hesaplamayı kullanır.
          </p>
        </div>
      </div>
    </div>
  );
}

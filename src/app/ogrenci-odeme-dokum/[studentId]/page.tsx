import { redirect } from "next/navigation";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext, readScopedData } from "@/lib/institution/context";
import { printSurfaceCss } from "@/lib/contract-print-theme";
import { formatDate, formatDateTime, formatMoney, statusLabel, paymentMethodLabelTr } from "@/lib/utils";
import { computeStudentPaymentSummary, sortPaymentsForProfile } from "@/lib/payment-profile";
import {
  buildContractPlanViewRows,
  isCollectedPayment,
  resolveCollectorDisplayNames,
} from "@/lib/contract-payment-plan-view";
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
  const summary = computeStudentPaymentSummary(payments);
  const contracts = await listContractsForStudent(session.tenantId, studentId);

  const receiverIds = Array.from(
    new Set(payments.map((p) => p.receivedByUserId).filter((id): id is string => Boolean(id)))
  );
  const receiverNames = await resolveCollectorDisplayNames({ userIds: receiverIds, teachers: data.teachers });

  const branchName = data.settings.branches.find((b) => b.id === student.branchId)?.shortName ?? "—";
  const printedAt = formatDate(new Date().toISOString().slice(0, 10));
  const viewer = session.userId;

  return (
    <div className="min-h-screen bg-[#f4f2f8] px-4 py-8 print:bg-white print:p-0 sm:px-6">
      <style>{`@media print {
  @page { size: A4; margin: 14mm; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
}${printSurfaceCss("doc-print-surface")}`}</style>
      <div className="mx-auto max-w-4xl">
        <DocumentPrintActions backHref={`/panel/odemeler/${student.id}`} />

        <div className="doc-print-surface rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none sm:p-10">
          <h1>Öğrenci Ödeme Dökümü</h1>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
            <div><dt className="inline font-semibold">Öğrenci: </dt><dd className="inline">{student.name}</dd></div>
            <div><dt className="inline font-semibold">Öğrenci no: </dt><dd className="inline">{student.displayId ?? "—"}</dd></div>
            <div><dt className="inline font-semibold">Kurum: </dt><dd className="inline">{data.settings.name}</dd></div>
            <div><dt className="inline font-semibold">Şube: </dt><dd className="inline">{branchName}</dd></div>
            <div><dt className="inline font-semibold">Rapor tarihi: </dt><dd className="inline">{printedAt}</dd></div>
            <div><dt className="inline font-semibold">Raporu alan: </dt><dd className="inline">{viewer}</dd></div>
          </dl>

          <h2>Özet</h2>
          <table>
            <tbody>
              <tr><td>Toplam sözleşme/tahakkuk tutarı</td><td>{formatMoney(summary.totalBilled)}</td></tr>
              <tr><td>Tahsil edilen toplam</td><td>{formatMoney(summary.totalCollected)}</td></tr>
              <tr><td>Kalan toplam</td><td>{formatMoney(summary.remaining)}</td></tr>
              <tr><td>Gecikmiş kalan</td><td>{formatMoney(summary.overdueRemaining)}</td></tr>
              <tr><td>Açık ödeme kaydı</td><td>{summary.openCount}</td></tr>
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
                  Sözleşme {c.contractNumber} — {c.programmeName} (toplam {formatMoney(c.totalContractAmount)})
                </h2>
                <table>
                  <thead>
                    <tr>
                      <th>Sıra</th>
                      <th>Vade</th>
                      <th>Dönem</th>
                      <th>Tutar</th>
                      <th>Ödeme türü</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.sequence}>
                        <td>{r.sequence}</td>
                        <td>{formatDate(r.dueDate)}</td>
                        <td>{r.periodLabel ?? "—"}</td>
                        <td>{formatMoney(r.amount)}</td>
                        <td>{r.paymentMethodLabel}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}

          <h2>Tüm ödeme işlemleri</h2>
          {payments.length === 0 ? (
            <p>Kayıtlı ödeme işlemi yok.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Açıklama</th>
                  <th>Vade</th>
                  <th>Tahsilat tarihi</th>
                  <th>Tutar</th>
                  <th>Yöntem</th>
                  <th>Durum</th>
                  <th>Tahsil eden</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => {
                  const collected = isCollectedPayment(p);
                  const partialDiff = p.paidAmount > 0 && p.paidAmount < p.amount ? p.amount - p.paidAmount : 0;
                  const contractRef = p.contractId
                    ? `${contracts.find((c) => c.id === p.contractId)?.contractNumber ?? "Sözleşme"}${p.installmentSequence != null ? ` · ${p.installmentSequence}. taksit` : ""}`
                    : "—";
                  return (
                    <tr key={p.id}>
                      <td>
                        {p.description}
                        {p.paymentNote ? <span className="block text-xs">Not: {p.paymentNote}</span> : null}
                        {p.adjustmentReason ? (
                          <span className="block text-xs">Kısmi tahsilat gerekçesi: {p.adjustmentReason}</span>
                        ) : null}
                        {partialDiff > 0 ? (
                          <span className="block text-xs">Kısmi fark: {formatMoney(partialDiff)}</span>
                        ) : null}
                        <span className="block text-xs">Plan/sözleşme: {contractRef}</span>
                        {p.createdAt ? (
                          <span className="block text-xs">Kayıt: {formatDateTime(p.createdAt)}</span>
                        ) : null}
                      </td>
                      <td>{formatDate(p.dueDate)}</td>
                      <td>{collected && p.paidAt ? formatDateTime(p.paidAt) : "—"}</td>
                      <td>{formatMoney(collected ? p.paidAmount || p.amount : p.amount)}</td>
                      <td>{collected ? paymentMethodLabelTr(p.method) : "—"}</td>
                      <td>{statusLabel(p.status)}</td>
                      <td>
                        {collected && p.receivedByUserId
                          ? (receiverNames.get(p.receivedByUserId)?.trim() || "Kayıtlı değil")
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <p className="mt-4 text-xs">
            Tutarlar `computeStudentPaymentSummary` ile hesaplanır (ekrandaki özet kartlarla aynı kaynak);
            tahmin veya örnek veri içermez. Void (iptal edilmiş) kayıtlar toplamlara girmez, listede görünür.
          </p>
        </div>
      </div>
    </div>
  );
}

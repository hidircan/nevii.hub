import { ChangeHistory } from "@/components/change-history";
import Link from "@/components/link";
import { notFound } from "next/navigation";
import { Badge, Card, EmptyState } from "@/components/ui";
import { SectionEditCard } from "@/components/section-edit-card";
import { StudentPaymentProfileEditor } from "@/components/student-payment-profile-editor";
import { StudentLessonPauseControl } from "@/components/student-lesson-pause-control";
import { listStudentContractsTool } from "@/lib/services";
import { isTerminalContractStatus } from "@/lib/contract-list-helpers";
import { splitStudentDebt, computeStudentPaymentSummary, sortPaymentsForProfile, debtSourceOf, DEBT_SOURCE_LABEL } from "@/lib/payment-profile";
import { computeStudentMonthlyAmount, isPercentDiscount } from "@/lib/student-payment-profile";
import { effectivePaymentDueRanges, formatPaymentDueRanges } from "@/lib/payment-due-ranges";
import { formatDate, formatMoney } from "@/lib/utils";
import { loadStudentPageContext } from "../_context";
import { effectiveEnrollments, enrollmentLabel } from "@/lib/student-enrollments";
import { Field, MiniStat } from "../_components/fields";

export const dynamic = "force-dynamic";

/** Ödemeler sekmesi — ödeme profili (düzenlenebilir) + tahsilat özeti + geçmiş. */
export default async function StudentPaymentsTab({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params;
  const { session, data, student, canManage } = await loadStudentPageContext(studentId);
  if (!student) notFound();

  const payments = sortPaymentsForProfile(data.payments.filter((p) => p.studentId === student.id));
  const contractsResult = await listStudentContractsTool(session, { studentId: student.id });
  const contracts = contractsResult.ok ? contractsResult.data.contracts : [];
  const paymentSummary = computeStudentPaymentSummary(payments, contracts);
  const debt = splitStudentDebt(
    payments,
    new Set(contracts.filter((c) => isTerminalContractStatus(c.status)).map((c) => c.id))
  );
  // 2026-10-04 — çoklu eğitim: açık borç eğitim bazında (sözleşmenin eğitimi; eğitimsiz sözleşme = birincil eğitim;
  // sözleşme dışı borç ayrı). Toplam her zaman öğrenci bazındaki açık borca eşittir.
  const educationList = effectiveEnrollments(student, data.teachers);
  const primaryEdu = educationList.find((e) => e.primary) ?? educationList[0];
  const educationDebt = (() => {
    const totals = new Map<string, number>();
    for (const p of debt.open) {
      const due = Math.max(p.amount - p.paidAmount, 0);
      if (due <= 0) continue;
      const contract = p.contractId ? contracts.find((c) => c.id === p.contractId) : undefined;
      const edu = contract ? educationList.find((e) => e.id === contract.enrollmentId) ?? primaryEdu : undefined;
      const label = edu ? enrollmentLabel(edu, data.teachers) : "Sözleşme dışı";
      totals.set(label, (totals.get(label) ?? 0) + due);
    }
    return Array.from(totals, ([label, total]) => ({ label, total }));
  })();
  const packages = data.packages ?? [];
  const studentPackage = packages.find((p) => p.id === student.packageId);
  const monthlyAmount = computeStudentMonthlyAmount(
    student,
    studentPackage,
    (student.lessonDurationMinutes as 30 | 40 | 50 | undefined) ?? 30
  );

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-3 flex items-center justify-between text-sm font-semibold text-[var(--color-text)]">
          Finans / Ödeme
          <Link
            href={`/panel/odemeler/${student.id}`}
            className="text-xs font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]"
          >
            Ödeme Detayında Aç →
          </Link>
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MiniStat
            label={paymentSummary.currentContractNumber ? `Sözleşme tahakkuku · ${paymentSummary.currentContractNumber}` : "Sözleşme tahakkuku — aktif sözleşme yok"}
            value={paymentSummary.currentContractBilled === null ? "—" : formatMoney(paymentSummary.currentContractBilled)}
          />
          <MiniStat label="Tahsil edilen (tüm kayıtlar)" value={formatMoney(paymentSummary.totalCollected)} tone="success" />
          <MiniStat label="Kalan" value={formatMoney(paymentSummary.remaining)} />
          <MiniStat
            label="Gecikmiş kalan"
            value={formatMoney(paymentSummary.overdueRemaining)}
            tone={paymentSummary.overdueRemaining > 0 ? "danger" : undefined}
          />
        </div>
      </section>

      <StudentLessonPauseControl
        studentId={student.id}
        canManage={canManage}
        paymentPauseStatus={student.paymentPauseStatus}
        paymentPausedAt={student.paymentPausedAt}
        paymentPauseReason={student.paymentPauseReason}
      />

      <section>
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Ödeme Profili</h2>
        <SectionEditCard
          canEdit={canManage}
          readOnly={
            <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Paket" value={studentPackage ? studentPackage.title : "Seçilmedi (serbest metin paket kullanılıyor)"} />
              <Field label="Ders süresi" value={student.lessonDurationMinutes ? `${student.lessonDurationMinutes} dk` : "Eklenmemiş"} />
              <Field
                label="Ödeme yöntemi"
                value={
                  student.paymentMethod === "credit_card"
                    ? "Kredi kartı"
                    : student.paymentMethod === "cash"
                      ? "Nakit"
                      : student.paymentMethod === "transfer"
                        ? "Havale/EFT"
                        : "Eklenmemiş"
                }
              />
              <Field label="Ödeme günü" value={formatPaymentDueRanges(effectivePaymentDueRanges(student))} />
              <Field
                label="İndirim"
                value={
                  student.discountType && student.discountValue
                    ? `${isPercentDiscount(student.discountType) ? `%${student.discountValue}` : formatMoney(student.discountValue)}`
                    : "Yok"
                }
              />
              <Field label="Özel tutar (override)" value={student.paymentAmount ? formatMoney(student.paymentAmount) : "Yok"} />
              <Field
                label="Beklenen net aylık tutar"
                value={
                  monthlyAmount.netAmount !== null
                    ? `${formatMoney(monthlyAmount.netAmount)}${monthlyAmount.overrideAmount !== null ? " (override)" : ""}`
                    : "Belirlenemedi"
                }
              />
            </dl>
          }
          edit={
            <StudentPaymentProfileEditor
              studentId={student.id}
              packages={packages}
              initialPackageId={student.packageId}
              initialDurationMinutes={student.lessonDurationMinutes}
              initialPaymentMethod={student.paymentMethod}
              initialPaymentDueRanges={effectivePaymentDueRanges(student)}
              initialDiscountType={
                student.discountType ? (isPercentDiscount(student.discountType) ? "percentage" : "fixed") : undefined
              }
              initialDiscountValue={student.discountValue}
              initialOverrideAmount={student.paymentAmount}
            />
          }
        />
      </section>

      {/* UAT 2026-09-25 — "Ödeme Geçmişi" aslında kalan tutarları gösteriyordu; artık açık bir Borç görünümü:
          canlı borç (isLiveObligation) + gerçekleşmiş hareketler + kapanmış sözleşme satırları (silinmez). */}
      <section aria-labelledby="borc-baslik">
        <h2 id="borc-baslik" className="mb-3 text-sm font-semibold text-[var(--color-text)]">Borç</h2>
        <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <MiniStat label="Güncel borç" value={formatMoney(debt.openTotal)} />
          <MiniStat
            label="Vadesi geçmiş"
            value={formatMoney(debt.overdueTotal)}
            tone={debt.overdueTotal > 0 ? "danger" : undefined}
          />
          <MiniStat label="Açık kayıt" value={String(debt.open.length)} />
        </div>
        {educationDebt.length > 1 ? (
          <p className="mb-1 text-xs text-[var(--color-text-muted)]">
            Eğitim bazında:{" "}
            {educationDebt.map((x, i) => (
              <span key={x.label}>
                {i > 0 ? " · " : ""}
                {x.label} {formatMoney(x.total)}
              </span>
            ))}{" "}
            (toplam {formatMoney(debt.openTotal)})
          </p>
        ) : null}
        {debt.bySource.length > 0 ? (
          <p className="mb-3 text-xs text-[var(--color-text-muted)]">
            Borcun kaynağı:{" "}
            {debt.bySource.map((x, i) => (
              <span key={x.key}>
                {i > 0 ? " · " : ""}
                {x.label} {formatMoney(x.openTotal)} ({x.count})
              </span>
            ))}
          </p>
        ) : null}

        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Açık borçlar</h3>
        {debt.open.length === 0 ? (
          <EmptyState title="Açık borç yok" description="Bu öğrencinin ödenmemiş geçerli bir borç kaydı yok." />
        ) : (
          <div className="space-y-2">
            {debt.open.map((p) => (
              <Card key={p.id} className="!p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <div>
                    <p className="font-medium text-[var(--color-text)]">{p.installmentPeriodLabel ?? p.description}</p>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                      {DEBT_SOURCE_LABEL[debtSourceOf(p)]}
                      {p.contractId ? ` · ${contracts.find((c) => c.id === p.contractId)?.contractNumber ?? "sözleşme"}` : ""}
                    </p>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      Vade: {formatDate(p.dueDate)} · Tutar {formatMoney(p.amount)}
                      {p.paidAmount > 0 ? ` · Ödenen ${formatMoney(p.paidAmount)}` : ""}
                    </p>
                    {p.lessonId ? (
                      <Link
                        href={`/panel/ogrenciler/${student.id}/program`}
                        className="text-xs font-medium text-[var(--color-primary)] hover:underline"
                      >
                        Kaynak ders →
                      </Link>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">Kalan {formatMoney(Math.max(p.amount - p.paidAmount, 0))}</span>
                    <Badge status={p.status} />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        <h3 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Ödeme hareketleri</h3>
        {debt.movements.length === 0 ? (
          <p className="text-xs text-[var(--color-text-muted)]">Henüz tahsilat yapılmamış.</p>
        ) : (
          <ul className="divide-y divide-[var(--color-border)] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] text-sm">
            {debt.movements.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span className="text-[var(--color-text)]">{p.installmentPeriodLabel ?? p.description}</span>
                <span className="text-xs text-[var(--color-text-muted)]">
                  {p.paidAt ? formatDate(p.paidAt) : "Tarih yok"} ·{" "}
                  <span className="font-medium text-[var(--color-success)]">{formatMoney(p.paidAmount)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}

        {debt.closedByContract.length > 0 ? (
          <details className="mt-4">
            <summary className="cursor-pointer text-xs font-semibold text-[var(--color-text-muted)]">
              İptal / yenilenmiş sözleşmenin tahsil edilmemiş taksitleri ({debt.closedByContract.length}) — borç sayılmaz
            </summary>
            <ul className="mt-2 space-y-1 text-xs text-[var(--color-text-muted)]">
              {debt.closedByContract.map((p) => (
                <li key={p.id}>
                  {p.installmentPeriodLabel ?? p.description} · vade {formatDate(p.dueDate)} · {formatMoney(p.amount - p.paidAmount)}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>

      {canManage ? (
        <ChangeHistory
          title="Ödeme değişiklik geçmişi"
          tenantId={session.tenantId}
          entityType="Payment"
          entityIds={payments.map((p) => p.id)}
          teachers={data.teachers}
        />
      ) : null}
    </div>
  );
}

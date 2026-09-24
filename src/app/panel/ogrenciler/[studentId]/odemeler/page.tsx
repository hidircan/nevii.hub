import { ChangeHistory } from "@/components/change-history";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, EmptyState } from "@/components/ui";
import { SectionEditCard } from "@/components/section-edit-card";
import { StudentPaymentProfileEditor } from "@/components/student-payment-profile-editor";
import { StudentLessonPauseControl } from "@/components/student-lesson-pause-control";
import { listStudentContractsTool } from "@/lib/services";
import { computeStudentPaymentSummary, sortPaymentsForProfile } from "@/lib/payment-profile";
import { computeStudentMonthlyAmount } from "@/lib/student-payment-profile";
import { effectivePaymentDueRanges, formatPaymentDueRanges } from "@/lib/payment-due-ranges";
import { formatDate, formatMoney } from "@/lib/utils";
import { loadStudentPageContext } from "../_context";
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
                    ? `${student.discountType === "percentage" ? `%${student.discountValue}` : formatMoney(student.discountValue)}`
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
                student.discountType === "percentage" || student.discountType === "fixed" ? student.discountType : undefined
              }
              initialDiscountValue={student.discountValue}
              initialOverrideAmount={student.paymentAmount}
            />
          }
        />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Ödeme Geçmişi</h2>
        {payments.length === 0 ? (
          <EmptyState title="Ödeme kaydı yok" />
        ) : (
          <div className="space-y-2">
            {payments.map((p) => (
              <Card key={p.id} className="!p-3">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <div>
                    <p className="font-medium text-[var(--color-text)]">{p.description}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">Vade: {formatDate(p.dueDate)}</p>
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
                    <span className="font-medium">{formatMoney(p.amount - p.paidAmount)}</span>
                    <Badge status={p.status} />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
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

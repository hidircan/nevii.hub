import { ChangeHistory } from "@/components/change-history";
import Link from "@/components/link";
import { notFound } from "next/navigation";
import { Badge, Card, EmptyState } from "@/components/ui";
import { SectionEditCard } from "@/components/section-edit-card";
import { StudentPaymentProfileEditor } from "@/components/student-payment-profile-editor";
import { StudentLessonPauseControl } from "@/components/student-lesson-pause-control";
import { listStudentContractsTool } from "@/lib/services";
import { isTerminalContractStatus } from "@/lib/contract-list-helpers";
import {
  splitStudentDebt,
  computeStudentPaymentSummary,
  sortPaymentsForProfile,
  debtSourceOf,
  DEBT_SOURCE_LABEL,
  computeBranchPaymentBreakdown,
} from "@/lib/payment-profile";
import { computeStudentMonthlyAmount, isPercentDiscount } from "@/lib/student-payment-profile";
import { effectivePaymentDueRanges, formatPaymentDueRanges } from "@/lib/payment-due-ranges";
import { formatDate, formatMoney } from "@/lib/utils";
import { loadStudentPageContext } from "../_context";
import {
  contractEnrollmentId,
  effectiveEnrollments,
  enrollmentDisplayName,
  enrollmentTerms,
  paymentEnrollmentId,
  UNASSIGNED_ENROLLMENT_LABEL,
} from "@/lib/student-enrollments";
import { AssignEnrollmentControl } from "@/components/assign-enrollment-control";
import { formatStudentTypes } from "@/lib/student-types";
import { paymentMethodLabelTr } from "@/lib/utils";
import { Field, MiniStat } from "../_components/fields";

export const dynamic = "force-dynamic";

/** Ödemeler sekmesi — ödeme profili (düzenlenebilir) + tahsilat özeti + geçmiş. */
export default async function StudentPaymentsTab({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<{ brans?: string; odeme?: string }>;
}) {
  const { studentId } = await params;
  const { brans, odeme } = await searchParams;
  const { session, data, student, canManage, kurum } = await loadStudentPageContext(studentId);
  if (!student) notFound();

  const allPayments = sortPaymentsForProfile(data.payments.filter((p) => p.studentId === student.id));
  const contractsResult = await listStudentContractsTool(session, { studentId: student.id });
  const allContracts = contractsResult.ok ? contractsResult.data.contracts : [];
  // 2026-10-09 — çok branşlı öğrenci: her satır TEK branşa düşer (açık bağ → sözleşmesi → dersi; tahmin yok);
  // belirlenemeyen eski satır "Branş belirtilmemiş" grubunda kalır ve "Branşa bağla" ile açıkça bağlanır.
  const branchList = effectiveEnrollments(student, data.teachers);
  const multiBranch = branchList.length > 1;
  const branchName = (id?: string) => {
    const e = id ? branchList.find((x) => x.id === id) : undefined;
    return e ? enrollmentDisplayName(e, branchList, data.teachers) : UNASSIGNED_ENROLLMENT_LABEL;
  };
  const branchOfPayment = (p: (typeof allPayments)[number]) =>
    paymentEnrollmentId(student, p, { contracts: allContracts, lessons: data.lessons }, data.teachers);
  // 2026-10-10 — branş seçiciyle (`?brans=`) daraltılmış görünüm: özet, borç ve hareketler yalnız seçili branşın satırlarıdır.
  // Seçim yok = tüm branşlar (genel bakış). Kulüp ücretleri branş değildir; yalnız "tüm branşlar" görünümünde yer alır.
  const selectedBranchId = multiBranch && brans && branchList.some((e) => e.id === brans) ? brans : undefined;
  const showUnassignedOnly = multiBranch && brans === "__unassigned__";
  const payments = selectedBranchId
    ? allPayments.filter((p) => p.source !== "club" && !p.clubMembershipId && branchOfPayment(p) === selectedBranchId)
    : showUnassignedOnly
      ? allPayments.filter((p) => p.source !== "club" && !p.clubMembershipId && !branchOfPayment(p))
      : allPayments;
  const contracts = selectedBranchId
    ? allContracts.filter((c) => contractEnrollmentId(student, c, data.teachers) === selectedBranchId)
    : showUnassignedOnly
      ? allContracts.filter((c) => !contractEnrollmentId(student, c, data.teachers))
      : allContracts;
  const paymentSummary = computeStudentPaymentSummary(payments, contracts);
  const debt = splitStudentDebt(payments, new Set(contracts.filter((c) => isTerminalContractStatus(c.status)).map((c) => c.id)));
  const branchBreakdown = multiBranch
    ? computeBranchPaymentBreakdown({
        payments: allPayments,
        contracts: allContracts,
        branches: branchList.map((e) => ({ id: e.id, label: branchName(e.id) })),
        paymentBranchOf: branchOfPayment,
        contractBranchOf: (c) => contractEnrollmentId(student, c, data.teachers),
        unassignedLabel: UNASSIGNED_ENROLLMENT_LABEL,
      })
    : [];
  const canAssign = canManage && kurum.scope.mode === "single";
  const branchOptions = branchList.map((e) => ({ id: e.id, label: branchName(e.id) }));
  const branchTag = (p: (typeof allPayments)[number]) =>
    multiBranch && p.source !== "club" && !p.clubMembershipId ? `${branchName(branchOfPayment(p))} · ` : "";
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
          {multiBranch ? (
            <MiniStat
              label="Güncel sözleşmeler tahakkuku (tüm branşlar)"
              value={formatMoney(branchBreakdown.reduce((sum, r) => sum + (r.currentContractBilled ?? 0), 0))}
            />
          ) : (
            <MiniStat
              label={paymentSummary.currentContractNumber ? `Sözleşme tahakkuku · ${paymentSummary.currentContractNumber}` : "Sözleşme tahakkuku — aktif sözleşme yok"}
              value={paymentSummary.currentContractBilled === null ? "—" : formatMoney(paymentSummary.currentContractBilled)}
            />
          )}
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

      {multiBranch ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Branş bazında finans</h2>
          <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">
                <tr>
                  <th className="px-3 py-2">Branş</th>
                  <th className="px-3 py-2">Güncel sözleşme</th>
                  <th className="px-3 py-2">Açık borç</th>
                  <th className="px-3 py-2">Gecikmiş</th>
                  <th className="px-3 py-2">Tahsil edilen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {branchBreakdown.map((r) => (
                  <tr key={r.key}>
                    <td className="px-3 py-2 font-medium text-[var(--color-text)]">{r.label}</td>
                    <td className="px-3 py-2 text-[var(--color-text-muted)]">
                      {r.currentContractNumber ? `${r.currentContractNumber} · ${formatMoney(r.currentContractBilled ?? 0)}` : "—"}
                    </td>
                    <td className="px-3 py-2">{formatMoney(r.openTotal)}</td>
                    <td className={`px-3 py-2 ${r.overdueTotal > 0 ? "font-medium text-rose-600" : ""}`}>{formatMoney(r.overdueTotal)}</td>
                    <td className="px-3 py-2 text-[var(--color-success)]">{formatMoney(r.collected)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
            Toplamlar yukarıdaki öğrenci toplamına eşittir (kulüp ücretleri hariç). Kayıt dışı kalan eski satırlar
            &quot;{UNASSIGNED_ENROLLMENT_LABEL}&quot; grubundadır.
          </p>
          <h3 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Branş ödeme koşulları</h3>
          <ul className="divide-y divide-[var(--color-border)] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] text-sm">
            {branchList.map((e) => {
              const t = enrollmentTerms(student, e, data.teachers);
              return (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <span className="font-medium text-[var(--color-text)]">
                    {branchName(e.id)}
                    {!e.active ? <span className="ml-2 text-xs font-normal text-[var(--color-text-muted)]">(sonlandı)</span> : null}
                  </span>
                  <span className="text-xs text-[var(--color-text-muted)]">
                    {formatStudentTypes(t.studentTypes)} · {t.packageName || "Paketsiz"} · Aylık {formatMoney(t.monthlyFee)} ·{" "}
                    {t.paymentMethod ? paymentMethodLabelTr(t.paymentMethod) : "Ödeme yöntemi yok"}
                    {t.paymentDueDay ? ` · ayın ${t.paymentDueDay}. günü` : ""}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
            Her branşın türü, paketi, ücreti ve ödeme koşulu Özet sekmesindeki &quot;Branş kayıtları&quot; kartından düzenlenir.
          </p>
        </section>
      ) : (
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
      )}

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

        {odeme && !payments.some((p) => p.id === odeme) ? (
          <p role="status" className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
            Bildirimdeki ödeme kaydı bu listede yok: silinmiş, başka bir branş filtresinde ya da artık bu öğrenciye ait değil.
            {brans ? " Branş filtresini \"Tüm branşlar\" yapıp tekrar bakın." : ""}
          </p>
        ) : null}
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Açık borçlar</h3>
        {debt.open.length === 0 ? (
          <EmptyState title="Açık borç yok" description="Bu öğrencinin ödenmemiş geçerli bir borç kaydı yok." />
        ) : (
          <div className="space-y-2">
            {debt.open.map((p) => (
              <Card key={p.id} id={`odeme-${p.id}`} className={`!p-3 scroll-mt-24${p.id === odeme ? " ring-2 ring-[var(--color-primary)]" : ""}`}>
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <div>
                    <p className="font-medium text-[var(--color-text)]">
                      {branchTag(p)}
                      {p.installmentPeriodLabel ?? p.description}
                    </p>
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
                    {canAssign && multiBranch && !p.contractId && p.source !== "club" && !branchOfPayment(p) ? (
                      <div className="mt-1">
                        <AssignEnrollmentControl studentId={student.id} paymentId={p.id} branches={branchOptions} />
                      </div>
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
              <li
                key={p.id}
                id={`odeme-${p.id}`}
                className={`flex scroll-mt-24 flex-wrap items-center justify-between gap-2 px-3 py-2${p.id === odeme ? " ring-2 ring-inset ring-[var(--color-primary)]" : ""}`}
              >
                <span className="text-[var(--color-text)]">
                  {branchTag(p)}
                  {p.installmentPeriodLabel ?? p.description}
                </span>
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
                <li key={p.id} id={`odeme-${p.id}`} className={p.id === odeme ? "font-semibold text-[var(--color-text)]" : undefined}>
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

import { ChangeHistory } from "@/components/change-history";
import Link from "@/components/link";
import { redirect } from "next/navigation";
import { readPaymentById } from "@/lib/store";
import { paymentTargetHref } from "@/lib/notification-href";
import { ArrowRight } from "lucide-react";
import { BackButton } from "@/components/back-button";
import { AddPaymentForm } from "@/components/add-payment-form";
import { Card, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { formatMoney } from "@/lib/utils";
import { listStudentContractsTool } from "@/lib/services";
import { computeStudentPaymentSummary, filterPaymentHistory, sortPaymentsForProfile, splitStudentDebt } from "@/lib/payment-profile";
import { coveredInstallmentCount } from "@/lib/attendance-calendar-plan";
import { isTerminalContractStatus } from "@/lib/contract-list-helpers";
import { remainingAmount, resolvePaymentDisplayStatus, todayYmdInstitution } from "@/lib/payments/status";
import { PaymentsMonthBoard } from "@/components/payments-month-board";
import type { MonthPaymentRow } from "@/lib/payment-month-view";
import { computeStudentMonthlyAmount, isPercentDiscount } from "@/lib/student-payment-profile";
import { AssistantPageContext } from "@/components/ai/assistant-page-context";
import { StudentPaymentHistoryTable } from "@/components/student-payment-history-table";
import { resolveActorLabels } from "@/lib/contract-payment-plan-view";
import { QuickTaskLink } from "@/components/quick-task-link";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext, readScopedStudentData } from "@/lib/institution/context";
import { effectiveEnrollments, enrollmentDisplayName, enrollmentTerms, makePaymentBranchLabeler, studentWithEnrollmentTerms } from "@/lib/student-enrollments";

export const dynamic = "force-dynamic";

export default async function StudentPaymentProfilePage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect(`/login?next=/panel/odemeler/${studentId}`);
  }
  const kurum = await getInstitutionContext(session);
  // DB egress (2026-10-10): ekran yalnız bu öğrencinin ödeme/ders satırlarını kullanır — tek öğrenci dilimi.
  const data = await readScopedStudentData(kurum.scope, studentId);
  const student = data.students.find((s) => s.id === studentId);
  const canWrite =
    kurum.scope.mode === "single" && (session.role === "SCHOOL_ADMIN" || session.role === "SUPER_ADMIN");

  if (!student) {
    // 2026-10-15 — eski bildirim bağlantıları ödeme kimliğiyle gelir (/panel/odemeler/<ödeme>): aynı kurumdaki
    // ödemenin öğrencisine, ilgili satıra yönlendir. Kurum dışı/silinmiş kayıtta aşağıdaki açıklama gösterilir.
    const payment = kurum.scope.mode === "single" ? await readPaymentById(studentId) : undefined;
    if (payment) redirect(paymentTargetHref(payment.studentId, payment.id));
    return (
      <div>
        <PageHeader title="Ödeme profili" description="Öğrenci bulunamadı." />
        <EmptyState
          title="Kayıt bulunamadı"
          description="Bu öğrenci veya ödeme kaydı mevcut kurumunuzda yok; silinmiş ya da kaldırılmış olabilir."
        />
        <BackButton
          fallbackHref="/panel/odemeler"
          label="Ödemelere dön"
          className="mt-4 text-amber-600 hover:text-amber-700"
        />
      </div>
    );
  }

  const payments = sortPaymentsForProfile(data.payments.filter((p) => p.studentId === studentId));
  const contractsResult = await listStudentContractsTool(session, { studentId: studentId });
  const contracts = contractsResult.ok ? contractsResult.data.contracts : [];
  const summary = computeStudentPaymentSummary(payments, contracts);
  const hasOpenPayment = summary.openCount > 0;
  // 2026-10-10 — çok branşlı öğrencide "beklenen aylık tutar" ilk branştan (öğrenci satırı aynası) değil HER aktif branşın
  // kendi paket/süre/indirim koşullarından hesaplanır; tek branşlıda eski tek tutar aynen durur.
  const branchViews = effectiveEnrollments(student, data.teachers);
  const multiBranch = branchViews.length > 1;
  const studentPackage = (data.packages ?? []).find((p) => p.id === student.packageId);
  const monthlyAmount = computeStudentMonthlyAmount(
    student,
    studentPackage,
    (student.lessonDurationMinutes as 30 | 40 | 50 | undefined) ?? 30
  );
  const branchMonthly = multiBranch
    ? branchViews
        .filter((e) => e.active)
        .map((e) => {
          const t = enrollmentTerms(student, e, data.teachers);
          const pkg = (data.packages ?? []).find((p) => p.id === t.packageId);
          const m = computeStudentMonthlyAmount(studentWithEnrollmentTerms(student, t), pkg, (t.lessonDurationMinutes as 30 | 40 | 50 | undefined) ?? 30);
          return { id: e.id, label: enrollmentDisplayName(e, branchViews, data.teachers), pkg, m, fee: t.monthlyFee };
        })
    : [];

  // "Tahsilatı alan" görüntü adı — Payment.receivedByUserId'den (kalıcı
  // kimlik) çözülür; yalnızca GÖRÜNTÜLEME içindir, Payment'a yazılmaz.
  // Aynı kullanıcı birden çok kayıtta tekrar edebileceği için tek seferde
  // (Set ile benzersizleştirip) çözülür. P0 revizyonu: e-posta DEĞİL ad
  // soyad gösterilir (öğretmen kaydından; yoksa zarif fallback) — kimlik
  // `receivedByUserId`de aynen korunur (audit bütünlüğü).
  const receiverIds = Array.from(
    new Set(payments.map((p) => p.receivedByUserId).filter((id): id is string => Boolean(id)))
  );
  const receiverNames = await resolveActorLabels({ tenantId: session.tenantId, userIds: receiverIds, teachers: data.teachers });
  // 2026-10-09 — çok branşlı öğrencide her hareket branşını söyler; yeni borç eklerken branş seçilir.
  const branchOf = makePaymentBranchLabeler({ students: [student], teachers: data.teachers, lessons: data.lessons, contracts });
  const historyPayments = filterPaymentHistory(payments).map((p) => ({
    ...p,
    receivedByName: p.receivedByUserId ? receiverNames.get(p.receivedByUserId) : undefined,
    branchLabel: branchOf(p),
  }));
  // 2026-10-20 — Ödemeler dış listesiyle AYNI durum çözücüsü: açık (canlı) borçlar burada da görünür; iptal/yenilenmiş
  // sözleşmenin ödenmemiş taksitleri ayrıca "borç değil" diye açıklanır (eskiden dışarıda "Bekliyor", içeride yoktu).
  const todayYmd = todayYmdInstitution();
  const terminalIds = new Set(contracts.filter((c) => isTerminalContractStatus(c.status)).map((c) => c.id));
  const debt = splitStudentDebt(payments, terminalIds);
  const openRows: MonthPaymentRow[] = debt.open
    .filter((p) => remainingAmount(p.amount, p.paidAmount) > 0)
    .map((p) => ({
      id: p.id,
      studentId: p.studentId,
      studentName: student.name,
      branchLabel: branchOf(p),
      description: p.description,
      expected: p.amount,
      collected: p.paidAmount,
      remaining: remainingAmount(p.amount, p.paidAmount),
      rowAmount: p.amount,
      rowPaidAmount: p.paidAmount,
      spansMonths: false,
      coveredInstallments: coveredInstallmentCount(p),
      dueDate: p.dueDate,
      status: resolvePaymentDisplayStatus(p, terminalIds, todayYmd),
      month: p.dueDate.slice(0, 7),
      method: p.method,
      paidAt: p.paidAt,
      paymentNote: p.paymentNote,
      source: p.source,
      lessonId: p.lessonId,
    }));
  const activeBranches = effectiveEnrollments(student, data.teachers).filter((e) => e.active);
  const branchOptions = activeBranches.map((e) => ({ id: e.id, label: enrollmentDisplayName(e, activeBranches, data.teachers) }));

  return (
    <div>
      <AssistantPageContext entity={{ kind: "student", id: student.id, label: student.name }} />
      <PageHeader
        title={student.name}
        description={
          student.parentPhone
            ? `Veli: ${student.parentName} · ${student.parentPhone}`
            : `Veli: ${student.parentName}`
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/ogrenci-odeme-dokum/${student.id}`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]"
            >
              Yazdır
            </Link>
            <QuickTaskLink
              relatedEntityType="student"
              relatedEntityId={student.id}
              relatedEntityLabel={student.name}
              title={`Ödeme takibi — ${student.name}`}
              label="Bu kayıt için görev oluştur"
              returnTo={`/panel/odemeler/${student.id}`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2 text-sm font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
            />
            <BackButton
              fallbackHref="/panel/odemeler"
              label="Tüm ödemeler"
              dynamicLabel
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2 hover:bg-[var(--color-surface-muted)]"
            />
          </div>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Geçerli tahakkuk" value={formatMoney(summary.totalBilled)} accent="primary" />
        <StatCard label="Toplam tahsil edilen" value={formatMoney(summary.totalCollected)} accent="success" />
        <StatCard label="Kalan borç" value={formatMoney(summary.remaining)} accent="warning" />
        <StatCard label="Gecikmiş kalan" value={formatMoney(summary.overdueRemaining)} accent="danger" />
        <StatCard label="Açık ödeme kaydı" value={summary.openCount} accent="info" />
        <StatCard label="Ödenmiş taksit sayısı" value={summary.paidInstallmentCount} accent="success" />
      </div>

      {multiBranch ? (
        <Card className="mb-6 !p-4">
          <p className="text-sm font-medium text-slate-900 dark:text-slate-50">Beklenen aylık tutar — branş bazında</p>
          <ul className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-300">
            {branchMonthly.map((b) => (
              <li key={b.id}>
                <span className="font-medium">{b.label}:</span> {formatMoney(b.m.netAmount ?? b.fee)}
                {b.pkg ? ` · Paket: ${b.pkg.title}` : " · Paket seçilmedi"}
                {b.m.discountAmount > 0 ? ` · İndirim: -${formatMoney(b.m.discountAmount)}` : ""}
                {b.m.overrideAmount !== null ? " · Yönetici override'ı uygulanıyor" : ""}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {!multiBranch && monthlyAmount.netAmount !== null ? (
        <Card className="mb-6 !p-4">
          <p className="text-sm font-medium text-slate-900 dark:text-slate-50">
            Beklenen aylık tutar: {formatMoney(monthlyAmount.netAmount)}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {studentPackage ? `Paket: ${studentPackage.title}` : "Paket seçilmedi"}
            {monthlyAmount.listPrice !== null ? ` · Liste fiyatı: ${formatMoney(monthlyAmount.listPrice)}` : ""}
            {monthlyAmount.discountAmount > 0
              ? ` · İndirim: -${formatMoney(monthlyAmount.discountAmount)}${
                  isPercentDiscount(monthlyAmount.discountType) ? ` (%${monthlyAmount.discountValue})` : ""
                }`
              : ""}
            {monthlyAmount.overrideAmount !== null ? " · Yönetici override'ı uygulanıyor" : ""}
          </p>
        </Card>
      ) : null}

      {hasOpenPayment ? (
        <Card className="mb-6 border-amber-200 bg-amber-50/60">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-amber-900">
              Bu öğrencinin açık veya gecikmiş ödemesi var. Tahsilat Operasyon Merkezi&apos;nde
              iletişim taslağını hazırlayıp onaylayabilirsiniz.
            </p>
            <Link
              href={`/panel/ai/tahsilat-agent?studentId=${student.id}&returnTo=${encodeURIComponent(`/panel/odemeler/${student.id}`)}`}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700"
            >
              Tahsilat takibini aç <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </Card>
      ) : null}

      <details className="mb-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <summary className="cursor-pointer text-sm font-medium text-[var(--color-text-muted)] dark:text-slate-300">
          Yeni ödeme kaydı ekle
        </summary>
        <AddPaymentForm
          fixedStudentId={student.id}
          fixedStudentBranches={branchOptions}
          defaultAmount={multiBranch ? undefined : (monthlyAmount.netAmount ?? student.monthlyFee)}
          gridClassName="mt-4 grid gap-3 sm:grid-cols-3"
        />
      </details>

      <h2 className="mb-3 text-lg font-semibold text-[var(--color-text)] dark:text-slate-50">Açık borçlar</h2>
      <div className="mb-6">
        <PaymentsMonthBoard
          monthLabel="Açık borçlar"
          empty={{ title: "Açık borç yok", hint: "Bu öğrencinin tahsil edilmeyi bekleyen canlı bir borç satırı bulunmuyor." }}
          rows={openRows}
          carryover={[]}
          paidInstallmentCounts={{ [student.id]: summary.paidInstallmentCount }}
          canWrite={canWrite}
          canDelete={canWrite}
        />
        {debt.closedByContract.length > 0 ? (
          <p className="mt-2 text-xs text-[var(--color-text-muted)]">
            {debt.closedByContract.length} taksit iptal edilen / yenilenen sözleşmeden kaldı (toplam{" "}
            {formatMoney(debt.closedByContract.reduce((t, p) => t + remainingAmount(p.amount, p.paidAmount), 0))}): kayıt korunur
            ama borç sayılmaz. Ödemeler ekranında da &quot;Sözleşme kapandı&quot; olarak görünür, aylık beklentiye girmez.
          </p>
        ) : null}
      </div>

      <h2 className="mb-3 text-lg font-semibold text-[var(--color-text)] dark:text-slate-50">Ödeme geçmişi</h2>
      {/*
        Yalnızca GERÇEKLEŞMİŞ ödeme hareketleri (ödendi/kısmi ödendi/iptal
        edildi) — "Bekliyor" ve "Gecikmiş" henüz gerçekleşmemiş, bekleyen
        durumlardır ve bu geçmiş listesinde gösterilmez. Genel tahsilat/
        raporlama (computeStudentPaymentSummary, üstteki özet kartlar,
        Ödemeler ekranındaki tam liste) bu filtreden ETKİLENMEZ — `payments`
        değişkeni burada değiştirilmiyor, yalnız görüntülenen alt küme.
      */}
      <StudentPaymentHistoryTable
        payments={historyPayments}
        canWrite={canWrite}
        studentName={student.name}
      />

      {canWrite ? (
        <div className="mt-6">
          <ChangeHistory
            title="Ödeme değişiklik geçmişi"
            tenantId={session.tenantId}
            entityType="Payment"
            entityIds={payments.map((p) => p.id)}
            teachers={data.teachers}
          />
        </div>
      ) : null}
    </div>
  );
}

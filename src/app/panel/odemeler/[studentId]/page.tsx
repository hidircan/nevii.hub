import { ChangeHistory } from "@/components/change-history";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { BackButton } from "@/components/back-button";
import { AddPaymentForm } from "@/components/add-payment-form";
import { Card, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { formatMoney } from "@/lib/utils";
import { listStudentContractsTool } from "@/lib/services";
import { computeStudentPaymentSummary, filterPaymentHistory, sortPaymentsForProfile } from "@/lib/payment-profile";
import { computeStudentMonthlyAmount } from "@/lib/student-payment-profile";
import { AssistantPageContext } from "@/components/ai/assistant-page-context";
import { StudentPaymentHistoryTable } from "@/components/student-payment-history-table";
import { resolveCollectorDisplayNames } from "@/lib/contract-payment-plan-view";
import { QuickTaskLink } from "@/components/quick-task-link";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext, readScopedData } from "@/lib/institution/context";

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
  const data = await readScopedData(kurum.scope);
  const student = data.students.find((s) => s.id === studentId);
  const canWrite =
    kurum.scope.mode === "single" && (session.role === "SCHOOL_ADMIN" || session.role === "SUPER_ADMIN");

  if (!student) {
    return (
      <div>
        <PageHeader title="Ödeme profili" description="Öğrenci bulunamadı." />
        <EmptyState
          title="Öğrenci bulunamadı"
          description="Bu öğrenci mevcut okulunuza kayıtlı değil veya kaldırılmış olabilir."
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
  const studentPackage = (data.packages ?? []).find((p) => p.id === student.packageId);
  const monthlyAmount = computeStudentMonthlyAmount(
    student,
    studentPackage,
    (student.lessonDurationMinutes as 30 | 40 | 50 | undefined) ?? 30
  );

  // "Tahsilatı alan" görüntü adı — Payment.receivedByUserId'den (kalıcı
  // kimlik) çözülür; yalnızca GÖRÜNTÜLEME içindir, Payment'a yazılmaz.
  // Aynı kullanıcı birden çok kayıtta tekrar edebileceği için tek seferde
  // (Set ile benzersizleştirip) çözülür. P0 revizyonu: e-posta DEĞİL ad
  // soyad gösterilir (öğretmen kaydından; yoksa zarif fallback) — kimlik
  // `receivedByUserId`de aynen korunur (audit bütünlüğü).
  const receiverIds = Array.from(
    new Set(payments.map((p) => p.receivedByUserId).filter((id): id is string => Boolean(id)))
  );
  const receiverNames = await resolveCollectorDisplayNames({ userIds: receiverIds, teachers: data.teachers });
  const historyPayments = filterPaymentHistory(payments).map((p) => ({
    ...p,
    receivedByName: p.receivedByUserId ? receiverNames.get(p.receivedByUserId) : undefined,
  }));

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
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2 hover:bg-[var(--color-surface-muted)]"
            />
          </div>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Geçerli tahakkuk" value={formatMoney(summary.totalBilled)} accent="primary" />
        <StatCard label="Toplam tahsil edilen" value={formatMoney(summary.totalCollected)} accent="success" />
        <StatCard label="Kalan borç" value={formatMoney(summary.remaining)} accent="warning" />
        <StatCard label="Gecikmiş kalan" value={formatMoney(summary.overdueRemaining)} accent="danger" />
        <StatCard label="Açık ödeme kaydı" value={summary.openCount} accent="info" />
      </div>

      {monthlyAmount.netAmount !== null ? (
        <Card className="mb-6 !p-4">
          <p className="text-sm font-medium text-slate-900 dark:text-slate-50">
            Beklenen aylık tutar: {formatMoney(monthlyAmount.netAmount)}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {studentPackage ? `Paket: ${studentPackage.title}` : "Paket seçilmedi"}
            {monthlyAmount.listPrice !== null ? ` · Liste fiyatı: ${formatMoney(monthlyAmount.listPrice)}` : ""}
            {monthlyAmount.discountAmount > 0
              ? ` · İndirim: -${formatMoney(monthlyAmount.discountAmount)}${
                  monthlyAmount.discountType === "percentage" ? ` (%${monthlyAmount.discountValue})` : ""
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
          defaultAmount={monthlyAmount.netAmount ?? student.monthlyFee}
          gridClassName="mt-4 grid gap-3 sm:grid-cols-3"
        />
      </details>

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

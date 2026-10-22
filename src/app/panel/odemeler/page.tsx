import Link from "@/components/link";
import { redirect } from "next/navigation";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { AddPaymentForm } from "@/components/add-payment-form";
import { PageHeader } from "@/components/ui";
import { cn, formatMoney } from "@/lib/utils";
import { PAYMENT_SCOPE_LABEL, parsePaymentScope, scopePayments, type PaymentScope } from "@/lib/payment-scope";
import { ScopeTabs } from "@/components/scope-tabs";
import { listContractEnrollmentLinksForScope, listTerminalContractIdsForScope } from "@/lib/contracts";
import { effectiveEnrollments, enrollmentDisplayName, makePaymentBranchLabeler } from "@/lib/student-enrollments";
import { PaymentsTable, type PaymentRow } from "@/components/payments-table";
import { PaymentsMonthBoard } from "@/components/payments-month-board";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext, readScopedPaymentsListData } from "@/lib/institution/context";
import { KurumScopeNote } from "@/components/kurum-scope-note";
import { AssistantPageContext } from "@/components/ai/assistant-page-context";
import { resolveActorLabels } from "@/lib/contract-payment-plan-view";
import { buildPaymentMonthView, parseMonthParam, shiftMonth } from "@/lib/payment-month-view";
import { paidInstallmentCountsByStudent } from "@/lib/payment-profile";
import { contractInstallmentProgressDescription, monthlyPlanPeriodLabel } from "@/lib/attendance-calendar-plan";
import { PAYMENT_STATUS_INFO, canonicalPaymentStatus, resolvePaymentDisplayStatus, todayYmdInstitution } from "@/lib/payments/status";

export const dynamic = "force-dynamic";

/**
 * 2026-10-20 — Ödemeler yeniden tasarım: AY odaklı (`?ay=2026-10`, varsayılan bu ay). Üstte seçili ayın özeti
 * (beklenen / tahsil edilen / kalan / gecikmiş / yaklaşan / oran), altta o aya düşen satırlar ve durum filtreleri.
 * Ay kuralı ve durum tek kaynaktan (payment-month-view.ts, payments/status.ts). `?gorunum=tum` eski ayrıntılı
 * tablo (tarih aralığı/tahsilatçı filtreleri) — o da aynı durum çözücüsünü kullanır.
 */
export default async function OdemelerPage({
  searchParams,
}: {
  searchParams: Promise<{ kapsam?: string; ay?: string; gorunum?: string }>;
}) {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/odemeler");
  }
  const kurum = await getInstitutionContext(session);
  const sp = await searchParams;
  // DB egress: ödemelerin yalnız liste kolonları + bağlı dersler (bkz. readPaymentsListData). Ay süzmesi bu dar dilim
  // üzerinde sunucuda yapılır; istemciye yalnız seçili ayın satırları gider.
  // ponytail: her ay geçişinde liste dilimi yeniden okunur; ödeme sayısı büyürse dönem ayı kolonu + SQL süzmesi.
  const data = await readScopedPaymentsListData(kurum.scope);
  const scope = parsePaymentScope(sp.kapsam);
  const todayYmd = todayYmdInstitution();
  const month = parseMonthParam(sp.ay, todayYmd.slice(0, 7));
  const allView = sp.gorunum === "tum";
  // İptal/yenilenmiş sözleşmenin ödenmemiş taksiti listede kalır ama borç/gecikme sayılmaz.
  const terminalContractIds = await listTerminalContractIdsForScope(kurum.scope);
  const { rows: payments, totals, counts } = scopePayments(
    [...data.payments].sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    data.students,
    scope,
    terminalContractIds
  );
  const scopeNoun: Record<PaymentScope, string> = { aktif: "Aktif", pasif: "Pasif veya ayrılmış", tum: "Aktif ve pasif tüm" };

  const receiverNames = await resolveActorLabels({
    tenantId: session.tenantId,
    userIds: payments.map((p) => p.receivedByUserId),
    teachers: data.teachers,
  });
  const studentName = new Map(data.students.map((s) => [s.id, s.name]));
  // 2026-10-09 — çok branşlı öğrencinin satırı branşını söyler (Keman borcu ≠ Piyano borcu).
  const branchOf = makePaymentBranchLabeler({
    students: data.students,
    teachers: data.teachers,
    lessons: data.lessons,
    contracts: await listContractEnrollmentLinksForScope(kurum.scope),
  });

  const view = buildPaymentMonthView(payments, {
    month,
    todayYmd,
    terminalContractIds,
    studentName: (id) => studentName.get(id) ?? "",
    branchLabel: branchOf,
    receivedByName: (p) => (p.receivedByUserId ? receiverNames.get(p.receivedByUserId) : undefined),
  });
  const monthLabel = monthlyPlanPeriodLabel(month);
  const canWrite = kurum.scope.mode === "single";
  const canDelete = canWrite && (session.role === "SCHOOL_ADMIN" || session.role === "SUPER_ADMIN");

  const href = (next: { ay?: string; kapsam?: PaymentScope; gorunum?: string }) => {
    const q = new URLSearchParams();
    const k = next.kapsam ?? scope;
    if (k !== "aktif") q.set("kapsam", k);
    const ay = next.ay ?? month;
    if (ay !== todayYmd.slice(0, 7)) q.set("ay", ay);
    const g = "gorunum" in next ? next.gorunum : allView ? "tum" : undefined;
    if (g) q.set("gorunum", g);
    const qs = q.toString();
    return qs ? `/panel/odemeler?${qs}` : "/panel/odemeler";
  };

  const allRows: PaymentRow[] | null = allView
    ? payments.map((p) => ({
        id: p.id,
        studentId: p.studentId,
        studentName: studentName.get(p.studentId) ?? "",
        description: contractInstallmentProgressDescription(p),
        branchLabel: branchOf(p),
        method: p.method,
        dueDate: p.dueDate,
        amount: p.amount,
        paidAmount: p.paidAmount,
        status: canonicalPaymentStatus(p, todayYmd),
        displayStatus: resolvePaymentDisplayStatus(p, terminalContractIds, todayYmd),
        lessonId: p.lessonId,
        lessonDate: p.lessonId ? data.lessons.find((l) => l.id === p.lessonId)?.startAt : undefined,
        paymentNote: p.paymentNote,
        paidAt: p.paidAt,
        createdAt: p.createdAt,
        source: p.source,
        receivedByName: p.receivedByUserId ? receiverNames.get(p.receivedByUserId) : undefined,
      }))
    : null;

  const s = view.summary;
  const isCurrentMonth = month === todayYmd.slice(0, 7);

  return (
    <div>
      <KurumScopeNote scope={kurum.scope} />
      <AssistantPageContext entity={{ kind: "page", label: "Ödemeler" }} />
      <PageHeader
        title="Ödemeler"
        actions={
          <Link
            href={`/panel/ai/tahsilat-agent?returnTo=${encodeURIComponent("/panel/odemeler")}`}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-primary)] px-3.5 py-2 text-sm font-medium text-[var(--color-text-inverted)] hover:bg-[var(--color-primary-hover)]"
          >
            Tahsilat takibini aç <ArrowRight className="h-4 w-4" />
          </Link>
        }
      />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <ScopeTabs
          label="Ödeme kapsamı"
          active={scope}
          items={(["aktif", "pasif", "tum"] as const).map((key) => ({
            key,
            label: PAYMENT_SCOPE_LABEL[key],
            count: counts[key],
            href: href({ kapsam: key }),
          }))}
        />
        <nav aria-label="Görünüm" className="inline-flex rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-1 text-xs font-medium">
          <Link href={href({ gorunum: undefined })} className={cn("rounded px-2.5 py-1", !allView ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm" : "text-[var(--color-text-muted)]")}>
            Aylık
          </Link>
          <Link href={href({ gorunum: "tum" })} className={cn("rounded px-2.5 py-1", allView ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm" : "text-[var(--color-text-muted)]")}>
            Tüm satırlar
          </Link>
        </nav>
      </div>

      {allView && allRows ? (
        <>
          <p className="mb-3 max-w-3xl text-xs text-[var(--color-text-muted)]">
            {scopeNoun[scope]} öğrenciler — {totals.rowCount} satır · açık alacak {formatMoney(totals.outstanding)} · gecikmiş{" "}
            {formatMoney(totals.overdueAmount)} ({totals.overdueCount} satır). İptal edilen satırlar ve iptal/yenilenmiş
            sözleşmenin taksitleri borç sayılmaz.
          </p>
          <PaymentsTable rows={allRows} canWrite={canWrite} canDelete={canDelete} />
        </>
      ) : (
        <>
          <section aria-label={`${monthLabel} özeti`} className="mb-4 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)]">
            <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] px-4 py-2.5">
              <Link href={href({ ay: shiftMonth(month, -1) })} aria-label="Önceki ay" className="rounded-md border border-[var(--color-border)] p-1 hover:bg-[var(--color-surface-muted)]">
                <ChevronLeft className="h-4 w-4" />
              </Link>
              <h2 className="min-w-[8.5rem] text-center text-base font-semibold text-[var(--color-text)]">{monthLabel}</h2>
              <Link href={href({ ay: shiftMonth(month, 1) })} aria-label="Sonraki ay" className="rounded-md border border-[var(--color-border)] p-1 hover:bg-[var(--color-surface-muted)]">
                <ChevronRight className="h-4 w-4" />
              </Link>
              {!isCurrentMonth ? (
                <Link href={href({ ay: todayYmd.slice(0, 7) })} className="text-xs font-medium text-[var(--color-primary)] hover:underline">
                  Bu aya dön
                </Link>
              ) : null}
              <span className="ml-auto text-xs text-[var(--color-text-muted)]">
                {s.studentCount} öğrenci · {view.rows.length} satır
                {view.excludedCount > 0 ? ` · ${view.excludedCount} satır borç sayılmadı (iptal / kapanan sözleşme)` : ""}
              </span>
            </div>
            <dl className="grid grid-cols-2 gap-px bg-[var(--color-border)] sm:grid-cols-5">
              <Metric className="col-span-2 sm:col-span-1" label="Bu ay beklenen" value={formatMoney(s.expected)} hint="Bu aya düşen taksit / plan / borç toplamı" />
              <Metric
                label="Tahsil edilen"
                value={formatMoney(s.collected)}
                tone="success"
                hint={s.collectionRate === null ? "Bu ay beklenen yok" : `Tahsilat oranı %${s.collectionRate}`}
                rate={s.collectionRate}
              />
              <Metric label="Kalan" value={formatMoney(s.remaining)} hint="Beklenen − tahsil edilen" />
              <Metric label="Gecikmiş" value={formatMoney(s.overdue)} tone="danger" hint={PAYMENT_STATUS_INFO.overdue.description} />
              <Metric label="Yaklaşan (7 gün)" value={formatMoney(s.upcoming)} tone="info" hint={PAYMENT_STATUS_INFO.upcoming.description} />
            </dl>
            {view.carryoverTotal > 0 ? (
              <p className="border-t border-[var(--color-border)] px-4 py-2 text-xs text-[var(--color-danger)]">
                Önceki aylardan devreden gecikmiş: <strong className="tabular-nums">{formatMoney(view.carryoverTotal)}</strong> ({view.carryover.length} satır) —
                aşağıdaki &quot;Önceki aylardan gecikmiş&quot; filtresiyle görün.
              </p>
            ) : null}
          </section>

          <PaymentsMonthBoard
            key={`${month}-${scope}`}
            monthLabel={monthLabel}
            rows={view.rows}
            carryover={view.carryover}
            paidInstallmentCounts={paidInstallmentCountsByStudent(payments)}
            canWrite={canWrite}
            canDelete={canDelete}
          />
        </>
      )}

      {canWrite ? (
        <details className="mt-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <summary className="cursor-pointer text-sm font-medium text-[var(--color-text-muted)]">Yeni ödeme kaydı ekle</summary>
          <AddPaymentForm
            students={data.students
              .filter((st) => st.active)
              .map((st) => {
                const list = effectiveEnrollments(st, data.teachers).filter((e) => e.active);
                return { id: st.id, name: st.name, branches: list.map((e) => ({ id: e.id, label: enrollmentDisplayName(e, list, data.teachers) })) };
              })}
            gridClassName="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          />
        </details>
      ) : (
        <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          &quot;Tüm kurumlar&quot; görünümündesiniz — ödeme eklemek veya tahsil etmek için üstteki kurum seçiciden tek bir kurum seçin.
        </p>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
  tone,
  rate,
  className,
}: {
  className?: string;
  label: string;
  value: string;
  hint: string;
  tone?: "success" | "danger" | "info";
  rate?: number | null;
}) {
  return (
    <div className={cn("bg-[var(--color-surface)] px-4 py-3", className)} title={hint}>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">{label}</dt>
      <dd
        className={cn(
          "mt-0.5 text-lg font-semibold tabular-nums text-[var(--color-text)]",
          tone === "success" && "text-[var(--color-success)]",
          tone === "danger" && "text-[var(--color-danger)]",
          tone === "info" && "text-[var(--color-info)]"
        )}
      >
        {value}
      </dd>
      {rate !== undefined && rate !== null ? (
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-muted)]" aria-hidden="true">
          <div className="h-full rounded-full bg-[var(--color-success)]" style={{ width: `${Math.min(100, rate)}%` }} />
        </div>
      ) : null}
      <p className="mt-1 truncate text-[11px] text-[var(--color-text-muted)]">{hint}</p>
    </div>
  );
}

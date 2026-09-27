import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { AddPaymentForm } from "@/components/add-payment-form";
import { PageHeader, StatCard } from "@/components/ui";
import { formatMoney } from "@/lib/utils";
import { PAYMENT_SCOPE_LABEL, parsePaymentScope, scopePayments, type PaymentScope } from "@/lib/payment-scope";
import { ScopeTabs } from "@/components/scope-tabs";
import { listTerminalContractIdsForScope } from "@/lib/contracts";
import { PaymentsTable, type PaymentRow } from "@/components/payments-table";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext, readScopedData } from "@/lib/institution/context";
import { KurumScopeNote } from "@/components/kurum-scope-note";
import { AssistantPageContext } from "@/components/ai/assistant-page-context";
import { resolveActorLabels } from "@/lib/contract-payment-plan-view";

export const dynamic = "force-dynamic";

export default async function OdemelerPage({ searchParams }: { searchParams: Promise<{ kapsam?: string }> }) {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/odemeler");
  }
  const kurum = await getInstitutionContext(session);
  const data = await readScopedData(kurum.scope);
  const scope = parsePaymentScope((await searchParams).kapsam);
  const allPayments = [...data.payments].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  // İptal/yenilenmiş sözleşmenin ödenmemiş taksiti listede kalır ama borç/gecikme sayılmaz.
  const terminalContractIds = await listTerminalContractIdsForScope(kurum.scope);
  // Kartlar, tablo ve tablo filtreleri AYNI kapsam listesinden beslenir (payment-scope.ts).
  const { rows: payments, totals, counts } = scopePayments(allPayments, data.students, scope, terminalContractIds);
  const scopeNoun: Record<PaymentScope, string> = { aktif: "Aktif", pasif: "Pasif veya ayrılmış", tum: "Aktif ve pasif tüm" };

  const receiverNames = await resolveActorLabels({
    tenantId: session.tenantId,
    userIds: payments.map((p) => p.receivedByUserId),
    teachers: data.teachers,
  });

  const rows: PaymentRow[] = payments.map((p) => ({
    id: p.id,
    studentId: p.studentId,
    studentName: data.students.find((s) => s.id === p.studentId)?.name ?? "",
    description: p.description,
    method: p.method,
    dueDate: p.dueDate,
    amount: p.amount,
    paidAmount: p.paidAmount,
    status: p.status,
    lessonId: p.lessonId,
    lessonDate: p.lessonId ? data.lessons.find((l) => l.id === p.lessonId)?.startAt : undefined,
    paymentNote: p.paymentNote,
    paidAt: p.paidAt,
    createdAt: p.createdAt,
    source: p.source,
    receivedByName: p.receivedByUserId ? receiverNames.get(p.receivedByUserId) : undefined,
  }));

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

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <ScopeTabs
          label="Ödeme kapsamı"
          active={scope}
          items={(["aktif", "pasif", "tum"] as const).map((key) => ({
            key,
            label: PAYMENT_SCOPE_LABEL[key],
            count: counts[key],
            href: key === "aktif" ? "/panel/odemeler" : `/panel/odemeler?kapsam=${key}`,
          }))}
        />
      </div>
      <p className="mb-4 max-w-3xl text-xs leading-relaxed text-[var(--color-text-muted)]">
        <strong className="font-semibold text-[var(--color-text)]">Kapsam:</strong> {scopeNoun[scope]} öğrenciler —{" "}
        {totals.studentCount} öğrenci, {totals.rowCount} ödeme satırı (öğrencinin bugünkü durumuna göre).
        {scope === "pasif"
          ? " Pasife alınan öğrencinin kayıtları silinmez; yalnız mevcut, belgelenmiş satırlar gösterilir — yeni borç üretilmez."
          : ""}{" "}
        Açık alacak = ödenmemiş kalan tutar; iptal edilen satırlar ve iptal/yenilenmiş sözleşmenin taksitleri hariç.
        Tahsil edilen = fiilen alınan tutar (kısmi ödemelerin alınan kısmı dahil); kalan bakiye açık alacakta.
      </p>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard
          label={scope === "pasif" ? "Geçmiş tahsilat" : "Tahsil edilen"}
          value={formatMoney(totals.collected)}
          hint="Kısmi ödemelerin alınan kısmı dahil, tüm dönemler"
          accent="success"
        />
        <StatCard
          label={scope === "aktif" ? "Beklenen tahsilat" : "Açık alacak"}
          value={formatMoney(totals.outstanding)}
          hint={scope === "pasif" ? "Belgelenmiş, tahsil edilmemiş kalan" : "Vadesi gelmiş ve gelecek, kalan tutar"}
          accent="warning"
        />
        <StatCard
          label="Geciken"
          value={formatMoney(totals.overdueAmount)}
          hint={`${totals.overdueCount} satır vadesi geçmiş`}
          accent="danger"
        />
      </div>

      {kurum.scope.mode === "single" ? (
        <details className="mb-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <summary className="cursor-pointer text-sm font-medium text-[var(--color-text-muted)] dark:text-slate-300">
            Yeni ödeme kaydı ekle
          </summary>
          <AddPaymentForm
            students={data.students.filter((s) => s.active).map((s) => ({ id: s.id, name: s.name }))}
            gridClassName="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          />
        </details>
      ) : (
        <p className="mb-6 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          &quot;Tüm kurumlar&quot; görünümündesiniz — yeni ödeme kaydı eklemek için üstteki kurum
          seçiciden tek bir kurum seçin.
        </p>
      )}

      <PaymentsTable rows={rows} canWrite={kurum.scope.mode === "single"} />
    </div>
  );
}

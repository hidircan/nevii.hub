import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { actionAddPayment } from "@/lib/actions";
import { Button, Input, Label, PageHeader, Select, StatCard } from "@/components/ui";
import { formatMoney, isOutstandingPaymentStatus } from "@/lib/utils";
import { PaymentsTable, type PaymentRow } from "@/components/payments-table";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext, readScopedData } from "@/lib/institution/context";
import { KurumScopeNote } from "@/components/kurum-scope-note";
import { AssistantPageContext } from "@/components/ai/assistant-page-context";

export const dynamic = "force-dynamic";

export default async function OdemelerPage() {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/odemeler");
  }
  const kurum = await getInstitutionContext(session);
  const data = await readScopedData(kurum.scope);
  const payments = [...data.payments].sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  const collected = payments.filter((p) => p.status === "paid").reduce((s, p) => s + p.paidAmount, 0);
  const outstanding = payments
    .filter((p) => isOutstandingPaymentStatus(p.status))
    .reduce((s, p) => s + (p.amount - p.paidAmount), 0);
  const overdue = payments.filter((p) => p.status === "overdue").length;

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
  }));

  return (
    <div>
      <KurumScopeNote scope={kurum.scope} />
      <AssistantPageContext entity={{ kind: "page", label: "Ödemeler" }} />
      <PageHeader
        title="Ödemeler"
        actions={
          <Link
            href="/panel/ai/tahsilat-agent"
            className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-amber-700"
          >
            Tahsilat takibini aç <ArrowRight className="h-4 w-4" />
          </Link>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Tahsil edilen" value={formatMoney(collected)} accent="success" />
        <StatCard label="Bekleyen" value={formatMoney(outstanding)} accent="warning" />
        <StatCard label="Gecikmiş adet" value={overdue} accent="danger" />
      </div>

      {kurum.scope.mode === "single" ? (
        <details className="mb-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <summary className="cursor-pointer text-sm font-medium text-[var(--color-text-muted)] dark:text-slate-300">
            Yeni ödeme kaydı ekle
          </summary>
          <form action={actionAddPayment} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label>Öğrenci</Label>
              <Select name="studentId" defaultValue={data.students.find((s) => s.active)?.id}>
                {data.students
                  .filter((s) => s.active)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </Select>
            </div>
            <div>
              <Label>Açıklama / dönem</Label>
              <Input name="description" required placeholder="Örn. Ağustos 2026 — Piyano" />
            </div>
            <div>
              <Label>Tutar (₺)</Label>
              <Input name="amount" type="number" min={1} defaultValue={3000} required />
            </div>
            <div>
              <Label>Vade tarihi</Label>
              <Input name="dueDate" type="date" required />
            </div>
            <div className="sm:col-span-2 lg:col-span-4">
              <Button type="submit">Ödeme kaydı ekle</Button>
            </div>
          </form>
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

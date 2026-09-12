import { redirect } from "next/navigation";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext } from "@/lib/institution/context";
import { KurumScopeNote } from "@/components/kurum-scope-note";
import { BackButton } from "@/components/back-button";
import { listStaffTool, listPayrollTool } from "@/lib/services";
import { PageHeader, Card, Badge, Input, Label, Select, Button } from "@/components/ui";
import { actionCreatePayrollRecord, actionUpdatePayrollStatus } from "@/lib/actions";
import { formatMoney } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  draft: "Taslak",
  pending_approval: "Onay bekliyor",
  approved: "Onaylandı",
  paid: "Ödendi",
  cancelled: "İptal",
};

type PayrollStatus = "draft" | "pending_approval" | "approved" | "paid" | "cancelled";
const NEXT_STATUS: Record<string, PayrollStatus | null> = {
  draft: "pending_approval",
  pending_approval: "approved",
  approved: "paid",
  paid: null,
  cancelled: null,
};

/**
 * İş 3B — Bordrolar. Öğretmenlerin ders bazlı hakedişinden (bkz.
 * /panel/hakedisler, TeacherPayout) TAMAMEN AYRI bir ekran — burada
 * yalnızca StaffMember (öğretmen dışı personel) bordroları listelenir.
 */
export default async function BordrolarPage() {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/personel/bordrolar");
  }
  if (session.role !== "SUPER_ADMIN") redirect("/panel"); // owner kararı: yalnız kurum sahibi

  const kurum = await getInstitutionContext(session);
  const staffResult = await listStaffTool(session, {});
  const staff = staffResult.ok ? staffResult.data.staff : [];
  const payrollResult = await listPayrollTool(session, {});
  const records = payrollResult.ok ? payrollResult.data.records : [];
  const staffName = (id: string) => staff.find((s) => s.id === id)?.name ?? id;
  const canWrite = kurum.scope.mode === "single";

  return (
    <div>
      <KurumScopeNote scope={kurum.scope} />
      <BackButton fallbackHref="/panel/personel" label="Personele dön" className="mb-3" />
      <PageHeader title="Bordrolar" description="Personel aylık bordro kayıtları — öğretmen hakedişinden ayrıdır." />

      <Card className="overflow-hidden !p-0">
        {records.length === 0 ? (
          <p className="p-5 text-sm text-[var(--color-text-muted)]">Henüz bordro kaydı yok.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
              <tr>
                <th className="px-4 py-3">Personel</th>
                <th className="px-4 py-3">Ay</th>
                <th className="px-4 py-3">Brüt</th>
                <th className="px-4 py-3">Net</th>
                <th className="px-4 py-3">Durum</th>
                <th className="px-4 py-3">Ödeme Tarihi</th>
                {canWrite ? <th className="px-4 py-3">İşlem</th> : null}
              </tr>
            </thead>
            <tbody>
              {records.map((r) => {
                const next = NEXT_STATUS[r.status];
                return (
                  <tr key={r.id} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="px-4 py-2 font-medium text-[var(--color-text)]">{staffName(r.staffId)}</td>
                    <td className="px-4 py-2 text-[var(--color-text-muted)]">{r.month}</td>
                    <td className="px-4 py-2 text-[var(--color-text-muted)]">{formatMoney(r.grossAmount)}</td>
                    <td className="px-4 py-2 font-medium text-[var(--color-text)]">{formatMoney(r.netAmount)}</td>
                    <td className="px-4 py-2">
                      <Badge status={r.status === "paid" ? "confirmed" : r.status === "cancelled" ? "archived" : "pending"}>
                        {STATUS_LABEL[r.status]}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-[var(--color-text-muted)]">{r.paymentDate ?? "—"}</td>
                    {canWrite ? (
                      <td className="px-4 py-2">
                        {next ? (
                          <form
                            action={async () => {
                              "use server";
                              await actionUpdatePayrollStatus({ payrollId: r.id, status: next });
                            }}
                          >
                            <button
                              type="submit"
                              className="rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2.5 py-1 text-xs font-semibold text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]"
                            >
                              {STATUS_LABEL[next]}&apos;a geçir
                            </button>
                          </form>
                        ) : (
                          <span className="text-xs text-[var(--color-text-muted)]">—</span>
                        )}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      {canWrite ? (
        <Card className="mt-6">
          <h2 className="mb-3 font-semibold text-[var(--color-text)]">Yeni bordro kaydı</h2>
          <form
            action={async (formData: FormData) => {
              "use server";
              await actionCreatePayrollRecord(formData);
            }}
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          >
            <div>
              <Label>Personel</Label>
              <Select name="staffId" required defaultValue="">
                <option value="" disabled>
                  Seçin
                </option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Ay (yyyy-aa)</Label>
              <Input name="month" required placeholder="2026-08" />
            </div>
            <div>
              <Label>Brüt ücret</Label>
              <Input name="grossAmount" type="number" required min={0} />
            </div>
            <div>
              <Label>Net ücret</Label>
              <Input name="netAmount" type="number" required min={0} />
            </div>
            <div>
              <Label>Ek ödeme</Label>
              <Input name="extraPayment" type="number" min={0} />
            </div>
            <div>
              <Label>Kesinti</Label>
              <Input name="deduction" type="number" min={0} />
            </div>
            <div>
              <Label>Ödeme yöntemi</Label>
              <Input name="paymentMethod" placeholder="Havale, Nakit…" />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <Label>Not</Label>
              <Input name="note" placeholder="Opsiyonel" />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <Button type="submit">Oluştur (taslak)</Button>
            </div>
          </form>
        </Card>
      ) : null}
    </div>
  );
}

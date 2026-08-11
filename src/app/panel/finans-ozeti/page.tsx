import { redirect } from "next/navigation";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext } from "@/lib/institution/context";
import { KurumScopeNote } from "@/components/kurum-scope-note";
import { BackButton } from "@/components/back-button";
import { getFinanceSummaryTool } from "@/lib/services";
import { PageHeader, Card, StatCard, Input, Label, Select, Button } from "@/components/ui";
import { actionCreateExpense } from "@/lib/actions";
import { formatMoney } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * İş 3D — Kurum sahibi mali dashboard'u. Yalnızca hassas erişimi olan
 * roller (bkz. requireStaffSensitiveAccess) — SUPER_ADMIN her zaman,
 * SCHOOL_ADMIN yalnızca kendi TEK tenant'ında (birleşik "tüm kurumlar"
 * görünümünde asla, bkz. canWrite).
 */
export default async function FinansOzetiPage() {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/finans-ozeti");
  }
  if (session.role !== "SCHOOL_ADMIN" && session.role !== "SUPER_ADMIN") redirect("/panel");

  const kurum = await getInstitutionContext(session);
  const canWrite = kurum.scope.mode === "single";
  const result = await getFinanceSummaryTool(session, {});

  if (!result.ok) {
    return (
      <div>
        <KurumScopeNote scope={kurum.scope} />
        <PageHeader title="Finans Özeti" />
        <Card>
          <p className="text-sm text-rose-600">{result.error.message}</p>
        </Card>
      </div>
    );
  }

  const s = result.data;

  return (
    <div>
      <KurumScopeNote scope={kurum.scope} />
      <BackButton fallbackHref="/panel" label="Panele dön" className="mb-3" />
      <PageHeader
        title="Finans Özeti"
        description={`${s.month} — kurum sahibi mali görünümü. Gelir = tahsil edilmiş öğrenci ödemeleri. Gider = ödenmiş bordro + ödenmiş öğretmen hakedişi + girilen diğer giderler.`}
      />

      {s.expenseDataIncomplete ? (
        <div className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Henüz kira/fatura/sarf malzemesi gibi giderler girilmemiş — aşağıdaki &quot;toplam gider&quot; ve
          &quot;net nakit&quot; rakamları bu nedenle EKSİK olabilir, gerçek durumu tam yansıtmayabilir.
        </div>
      ) : null}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Tahsil edilen gelir (bu ay)" value={formatMoney(s.studentPaymentsCollectedThisMonth)} accent="success" />
        <StatCard label="Bekleyen alacak (bu ay)" value={formatMoney(s.studentPaymentsPendingThisMonth)} accent="warning" />
        <StatCard label="Toplam gider (bu ay)" value={formatMoney(s.totalExpenseThisMonth)} accent="danger" />
        <StatCard
          label="Net nakit (bu ay)"
          value={formatMoney(s.netCashThisMonth)}
          accent={s.netCashThisMonth >= 0 ? "success" : "danger"}
          hint="Gelir − Gider"
        />
        <StatCard label="Personel maliyeti (bu ay, bordro)" value={formatMoney(s.payrollCostThisMonth)} />
        <StatCard label="Ödenen bordro" value={formatMoney(s.payrollPaidThisMonth)} accent="success" />
        <StatCard label="Bekleyen bordro" value={formatMoney(s.payrollPendingThisMonth)} accent="warning" />
        <StatCard label="Öğretmen hakedişleri toplamı (bu ay)" value={formatMoney(s.teacherPayoutTotalThisMonth)} />
      </div>

      {s.costByBranch.length > 0 ? (
        <Card className="mb-6">
          <h2 className="mb-3 font-semibold text-[var(--color-text)]">Şube bazlı personel maliyeti (bordro)</h2>
          <div className="space-y-1.5 text-sm">
            {s.costByBranch.map((b) => (
              <div key={b.branchId} className="flex items-center justify-between">
                <span className="text-[var(--color-text-muted)]">{b.branchName}</span>
                <span className="font-medium text-[var(--color-text)]">{formatMoney(b.amount)}</span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <Card className="mb-6">
        <h2 className="mb-3 font-semibold text-[var(--color-text)]">Son 6 ay gelir/gider trendi</h2>
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
            <tr>
              <th className="py-1.5">Ay</th>
              <th className="py-1.5">Gelir</th>
              <th className="py-1.5">Gider</th>
              <th className="py-1.5">Net</th>
            </tr>
          </thead>
          <tbody>
            {s.trend.map((t) => (
              <tr key={t.month} className="border-t border-[var(--color-border)]">
                <td className="py-1.5 text-[var(--color-text-muted)]">{t.month}</td>
                <td className="py-1.5 text-emerald-700">{formatMoney(t.income)}</td>
                <td className="py-1.5 text-rose-700">{formatMoney(t.expense)}</td>
                <td className={`py-1.5 font-medium ${t.income - t.expense >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                  {formatMoney(t.income - t.expense)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {s.upcomingPayrollWarnings.length > 0 ? (
        <Card className="mb-6">
          <h2 className="mb-3 font-semibold text-[var(--color-text)]">Bekleyen bordro uyarıları</h2>
          <div className="space-y-1 text-sm">
            {s.upcomingPayrollWarnings.map((w, i) => (
              <p key={i} className="text-amber-800">
                {w.staffName} — {w.month} ({w.status === "pending_approval" ? "onay bekliyor" : "onaylandı, ödeme bekliyor"})
              </p>
            ))}
          </div>
        </Card>
      ) : null}

      {canWrite ? (
        <Card>
          <h2 className="mb-3 font-semibold text-[var(--color-text)]">Yeni gider ekle</h2>
          <p className="mb-3 text-xs text-[var(--color-text-muted)]">
            Yalnızca kira/fatura/sarf malzemesi/diğer — bordro ve öğretmen hakedişi burada eklenmez, kendi
            ekranlarından (Bordrolar / Öğretmen Hakedişleri) yönetilir.
          </p>
          <form
            action={async (formData: FormData) => {
              "use server";
              await actionCreateExpense(formData);
            }}
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          >
            <div>
              <Label>Kategori</Label>
              <Select name="category" defaultValue="other">
                <option value="rent">Kira</option>
                <option value="utilities">Fatura</option>
                <option value="supplies">Sarf malzemesi</option>
                <option value="other">Diğer</option>
              </Select>
            </div>
            <div>
              <Label>Tutar</Label>
              <Input name="amount" type="number" min={1} required />
            </div>
            <div>
              <Label>Tarih</Label>
              <Input name="date" type="date" required />
            </div>
            <div>
              <Label>Not</Label>
              <Input name="note" placeholder="Opsiyonel" />
            </div>
            <div className="sm:col-span-2 lg:col-span-4">
              <Button type="submit">Gider ekle</Button>
            </div>
          </form>
        </Card>
      ) : null}
    </div>
  );
}

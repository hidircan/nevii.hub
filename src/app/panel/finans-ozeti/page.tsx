import { redirect } from "next/navigation";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext, readScopedData } from "@/lib/institution/context";
import { KurumScopeNote } from "@/components/kurum-scope-note";
import { BackButton } from "@/components/back-button";
import { getFinanceSummaryTool, listRecurringExpenseRulesTool } from "@/lib/services";
import { Badge, PageHeader, Card, StatCard, Input, Label, Select, Button } from "@/components/ui";
import {
  actionCreateExpense,
  actionMarkExpensePaid,
  actionCreateRecurringExpenseRule,
  actionSetRecurringExpenseRuleActive,
  actionTickRecurringExpenseRules,
  actionUpsertBudget,
} from "@/lib/actions";
import { formatMoney, formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const CATEGORY_LABEL: Record<string, string> = {
  rent: "Kira",
  utilities: "Fatura",
  supplies: "Sarf malzemesi",
  other: "Diğer",
};
const FREQUENCY_LABEL: Record<string, string> = { monthly: "Aylık", quarterly: "3 aylık", yearly: "Yıllık" };

/**
 * İş 3D — Kurum sahibi mali dashboard'u. Yalnızca hassas erişimi olan
 * roller (bkz. requireStaffSensitiveAccess) — SUPER_ADMIN her zaman,
 * SCHOOL_ADMIN yalnızca kendi TEK tenant'ında (birleşik "tüm kurumlar"
 * görünümünde asla, bkz. canWrite). Faz 10 — kategori kırılımı, vadesi
 * yaklaşan/geciken giderler, şube bazlı gider zenginleştirmesi, tekrarlayan
 * gider kuralları ve bütçe-gerçekleşen karşılaştırması eklendi.
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
  const [result, data, rulesResult] = await Promise.all([
    getFinanceSummaryTool(session, {}),
    readScopedData(kurum.scope),
    listRecurringExpenseRulesTool(session, {}),
  ]);

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
  const branches = data.settings.branches.map((b) => ({ id: b.id, shortName: b.shortName }));
  const rules = rulesResult.ok ? rulesResult.data.rules : [];

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

      {s.expenseByCategory.length > 0 ? (
        <Card className="mb-6">
          <h2 className="mb-3 font-semibold text-[var(--color-text)]">Kategori bazlı gider (bu ay)</h2>
          <div className="space-y-1.5 text-sm">
            {s.expenseByCategory.map((c) => (
              <div key={c.category} className="flex items-center justify-between">
                <span className="text-[var(--color-text-muted)]">{CATEGORY_LABEL[c.category] ?? c.category}</span>
                <span className="font-medium text-[var(--color-text)]">{formatMoney(c.amount)}</span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {s.costByBranch.length > 0 ? (
        <Card className="mb-6">
          <h2 className="mb-3 font-semibold text-[var(--color-text)]">Şube bazlı maliyet (bordro + gider, bu ay)</h2>
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

      {s.budgetComparison.length > 0 ? (
        <Card className="mb-6">
          <h2 className="mb-3 font-semibold text-[var(--color-text)]">Bütçe vs gerçekleşen (bu ay)</h2>
          <div className="space-y-2 text-sm">
            {s.budgetComparison.map((b, i) => {
              const over = b.actualAmount > b.targetAmount;
              return (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-[var(--color-text-muted)]">
                    {CATEGORY_LABEL[b.category] ?? b.category}
                    {b.branchName ? ` · ${b.branchName}` : ""}
                  </span>
                  <span className={`font-medium ${over ? "text-rose-700" : "text-emerald-700"}`}>
                    {formatMoney(b.actualAmount)} / {formatMoney(b.targetAmount)}
                  </span>
                </div>
              );
            })}
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

      {s.upcomingExpenseWarnings.length > 0 ? (
        <Card className="mb-6">
          <h2 className="mb-3 font-semibold text-[var(--color-text)]">Yaklaşan / gecikmiş gider ödemeleri</h2>
          <div className="space-y-2 text-sm">
            {s.upcomingExpenseWarnings.map((w) => (
              <div key={w.expenseId} className="flex items-center justify-between gap-2">
                <span className="text-[var(--color-text-muted)]">
                  {CATEGORY_LABEL[w.category] ?? w.category} — {formatMoney(w.amount)} — vade {formatDate(w.dueDate)}
                </span>
                <div className="flex items-center gap-2">
                  <Badge status={w.status === "overdue" ? "cancelled" : "pending"}>
                    {w.status === "overdue" ? "Gecikmiş" : "Bekliyor"}
                  </Badge>
                  {canWrite ? (
                    <form
                      action={async () => {
                        "use server";
                        await actionMarkExpensePaid({ expenseId: w.expenseId });
                      }}
                    >
                      <button
                        type="submit"
                        className="rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                      >
                        Ödendi işaretle
                      </button>
                    </form>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {canWrite ? (
        <Card className="mb-6">
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
              <Label>Alt kategori</Label>
              <Input name="subcategory" placeholder="Opsiyonel" />
            </div>
            <div>
              <Label>Tedarikçi</Label>
              <Input name="supplier" placeholder="Opsiyonel" />
            </div>
            <div>
              <Label>Şube</Label>
              <Select name="branchId" defaultValue="">
                <option value="">—</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.shortName}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Son ödeme tarihi</Label>
              <Input name="dueDate" type="date" placeholder="Opsiyonel" />
            </div>
            <div>
              <Label>Ödeme durumu</Label>
              <Select name="paymentStatus" defaultValue="paid">
                <option value="paid">Ödendi</option>
                <option value="pending">Bekliyor</option>
              </Select>
            </div>
            <div>
              <Label>Vergi tutarı</Label>
              <Input name="taxAmount" type="number" min={0} placeholder="Opsiyonel" />
            </div>
            <div>
              <Label>Ödeme yöntemi</Label>
              <Input name="paymentMethod" placeholder="Opsiyonel" />
            </div>
            <div className="sm:col-span-2 lg:col-span-2">
              <Label>Not</Label>
              <Input name="note" placeholder="Opsiyonel" />
            </div>
            <div className="sm:col-span-2 lg:col-span-4">
              <Button type="submit">Gider ekle</Button>
            </div>
          </form>
        </Card>
      ) : null}

      {canWrite ? (
        <Card className="mb-6">
          <h2 className="mb-3 font-semibold text-[var(--color-text)]">Tekrarlayan giderler</h2>
          {rules.length === 0 ? (
            <p className="mb-3 text-sm text-[var(--color-text-muted)]">Henüz tekrarlayan gider kuralı yok.</p>
          ) : (
            <table className="mb-4 w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
                <tr>
                  <th className="py-1.5">Kategori</th>
                  <th className="py-1.5">Tutar</th>
                  <th className="py-1.5">Sıklık</th>
                  <th className="py-1.5">Sonraki üretim</th>
                  <th className="py-1.5">Durum</th>
                  <th className="py-1.5">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id} className="border-t border-[var(--color-border)]">
                    <td className="py-1.5 text-[var(--color-text-muted)]">{CATEGORY_LABEL[r.category] ?? r.category}</td>
                    <td className="py-1.5 font-medium text-[var(--color-text)]">{formatMoney(r.amount)}</td>
                    <td className="py-1.5 text-[var(--color-text-muted)]">{FREQUENCY_LABEL[r.frequency]}</td>
                    <td className="py-1.5 text-[var(--color-text-muted)]">{formatDate(r.nextRunDate)}</td>
                    <td className="py-1.5">
                      <Badge status={r.active ? "confirmed" : "archived"}>{r.active ? "Aktif" : "Pasif"}</Badge>
                    </td>
                    <td className="py-1.5">
                      <form
                        action={async () => {
                          "use server";
                          await actionSetRecurringExpenseRuleActive({ ruleId: r.id, active: !r.active });
                        }}
                      >
                        <button
                          type="submit"
                          className="rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2.5 py-1 text-xs font-semibold text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]"
                        >
                          {r.active ? "Pasife al" : "Aktifleştir"}
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {rules.some((r) => r.active) ? (
            <form
              action={async () => {
                "use server";
                await actionTickRecurringExpenseRules();
              }}
              className="mb-4"
            >
              <button
                type="submit"
                className="rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3.5 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]"
              >
                Vadesi gelmiş kuralları şimdi çalıştır
              </button>
            </form>
          ) : null}

          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            Yeni tekrarlayan gider kuralı
          </p>
          <form
            action={async (formData: FormData) => {
              "use server";
              await actionCreateRecurringExpenseRule(formData);
            }}
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          >
            <div>
              <Label>Kategori</Label>
              <Select name="category" defaultValue="rent">
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
              <Label>Sıklık</Label>
              <Select name="frequency" defaultValue="monthly">
                <option value="monthly">Aylık</option>
                <option value="quarterly">3 aylık</option>
                <option value="yearly">Yıllık</option>
              </Select>
            </div>
            <div>
              <Label>İlk üretim tarihi</Label>
              <Input name="nextRunDate" type="date" required />
            </div>
            <div>
              <Label>Tedarikçi</Label>
              <Input name="supplier" placeholder="Opsiyonel" />
            </div>
            <div>
              <Label>Şube</Label>
              <Select name="branchId" defaultValue="">
                <option value="">—</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.shortName}
                  </option>
                ))}
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label>Not</Label>
              <Input name="note" placeholder="Opsiyonel" />
            </div>
            <div className="sm:col-span-2 lg:col-span-4">
              <Button type="submit">Kural oluştur</Button>
            </div>
          </form>
        </Card>
      ) : null}

      {canWrite ? (
        <Card>
          <h2 className="mb-3 font-semibold text-[var(--color-text)]">Bütçe hedefi belirle (bu ay: {s.month})</h2>
          <form
            action={async (formData: FormData) => {
              "use server";
              await actionUpsertBudget(formData);
            }}
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          >
            <input type="hidden" name="period" value={s.month} />
            <div>
              <Label>Kategori</Label>
              <Select name="category" defaultValue="rent">
                <option value="rent">Kira</option>
                <option value="utilities">Fatura</option>
                <option value="supplies">Sarf malzemesi</option>
                <option value="other">Diğer</option>
              </Select>
            </div>
            <div>
              <Label>Şube (opsiyonel — boş = tüm kurum)</Label>
              <Select name="branchId" defaultValue="">
                <option value="">—</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.shortName}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Hedef tutar</Label>
              <Input name="targetAmount" type="number" min={1} required />
            </div>
            <div className="sm:col-span-2 lg:col-span-4">
              <Button type="submit">Bütçe kaydet</Button>
            </div>
          </form>
        </Card>
      ) : null}
    </div>
  );
}

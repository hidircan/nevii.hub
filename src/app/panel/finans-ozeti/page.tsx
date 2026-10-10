import { redirect } from "next/navigation";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext, readScopedReferenceData } from "@/lib/institution/context";
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
import { IncomeExpenseChart, AverageFeeChart } from "@/components/finance-trend-charts";

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
export default async function FinansOzetiPage({ searchParams }: { searchParams: Promise<{ sube?: string; ay?: string }> }) {
  const { sube, ay } = await searchParams;
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/finans-ozeti");
  }
  // 2026-09-12 rol sözleşmesi: yalnız kurum sahibi (bkz. auth/platform-access.ts).
  if (session.role !== "SUPER_ADMIN") redirect("/panel");

  const kurum = await getInstitutionContext(session);
  const canWrite = kurum.scope.mode === "single";
  // Geçersiz `ay` sessizce bugüne düşer (sayfa hata ekranına düşmez).
  const monthParam = ay && /^\d{4}-(0[1-9]|1[0-2])$/.test(ay) ? ay : undefined;
  const [result, data, rulesResult] = await Promise.all([
    getFinanceSummaryTool(session, { ...(sube ? { branchId: sube } : {}), ...(monthParam ? { month: monthParam } : {}) }),
    readScopedReferenceData(kurum.scope),
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

      {/* 10. tur iş #6 — ay + şube seçimi (GET; seçimler birbirini korur). */}
      <Card className="mb-6 !py-3">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="block">
            <Label>Ay</Label>
            <Input type="month" name="ay" defaultValue={s.month} max="2100-12" />
          </label>
          <label className="block">
            <Label>Şube</Label>
            <Select name="sube" defaultValue={s.averageMonthlyFee.branchId ?? ""}>
              <option value="">Tüm şubeler</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.shortName}
                </option>
              ))}
            </Select>
          </label>
          <Button type="submit" variant="secondary">
            Uygula
          </Button>
          <p className="w-full text-xs text-[var(--color-text-muted)]">
            Geçmiş aylar sözleşme tarih aralıklarıyla hesaplanır — bugünkü aktif/pasif durum geçmişi yeniden yorumlamaz.
          </p>
        </form>
      </Card>

      {s.expenseDataIncomplete ? (
        <div className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Henüz kira/fatura/sarf malzemesi gibi giderler girilmemiş — aşağıdaki &quot;toplam gider&quot; ve
          &quot;net nakit&quot; rakamları bu nedenle EKSİK olabilir, gerçek durumu tam yansıtmayabilir.
        </div>
      ) : null}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={`Tahsil edilen gelir (${s.month})`} value={formatMoney(s.studentPaymentsCollectedThisMonth)} accent="success" />
        <StatCard label={`Bekleyen alacak (${s.month})`} value={formatMoney(s.studentPaymentsPendingThisMonth)} accent="warning" />
        <StatCard label={`Toplam gider (${s.month})`} value={formatMoney(s.totalExpenseThisMonth)} accent="danger" />
        <StatCard
          label={`Net nakit (${s.month})`}
          value={formatMoney(s.netCashThisMonth)}
          accent={s.netCashThisMonth >= 0 ? "success" : "danger"}
          hint="Gelir − Gider"
        />
        <StatCard label={`Personel maliyeti (${s.month}, bordro)`} value={formatMoney(s.payrollCostThisMonth)} />
        <StatCard label="Ödenen bordro" value={formatMoney(s.payrollPaidThisMonth)} accent="success" />
        <StatCard label="Bekleyen bordro" value={formatMoney(s.payrollPendingThisMonth)} accent="warning" />
        <StatCard label={`Öğretmen hakedişleri toplamı (${s.month})`} value={formatMoney(s.teacherPayoutTotalThisMonth)} />
      </div>

      {(() => {
        const avg = s.averageMonthlyFee;
        const collected = s.averageCollected;
        const branchName = branches.find((b) => b.id === avg.branchId)?.shortName ?? "Tüm şubeler";
        return (
          <Card className="mb-6">
            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <p className="text-sm text-[var(--color-text-muted)]">Öğrenci başına ortalama aylık ücret</p>
                <p className="mt-1 text-2xl font-semibold text-[var(--color-text)]">
                  {avg.average === null ? "—" : formatMoney(avg.average)}
                </p>
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                  {avg.average === null
                    ? `${s.month} · ${branchName}: bu ayı kapsayan geçerli sözleşmeli öğrenci yok.`
                    : `${s.month} · ${branchName} · ${avg.studentCount} sözleşmeli öğrenci, aylık ücret toplamı ${formatMoney(avg.totalMonthly)}.`}
                </p>
              </div>
              <div>
                <p className="text-sm text-[var(--color-text-muted)]">Öğrenci başına ortalama tahsilat (aynı öğrenciler)</p>
                <p className="mt-1 text-2xl font-semibold text-emerald-700">
                  {collected.average === null ? "—" : formatMoney(collected.average)}
                </p>
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                  {collected.average === null
                    ? "Tahsilat yok."
                    : `Fiilen tahsil edilen toplam ${formatMoney(collected.collectedTotal)} / ${collected.studentCount} öğrenci. Kısmi ödemeler dahil, iptal (voided) hariç.`}
                </p>
              </div>
            </div>
            {/* 10. tur iş #6 — pay/payda tanımı ekranda (kapalı başlar). */}
            <details className="mt-3 rounded-lg bg-[var(--color-surface-muted)] px-3 py-2 text-xs text-[var(--color-text-muted)]">
              <summary className="cursor-pointer font-medium text-[var(--color-text)]">
                Bu iki ortalama nasıl hesaplanır?
              </summary>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>
                  <strong>Ortalama ücret (tahakkuk):</strong> pay = seçili ayı kapsayan geçerli sözleşmelerin{" "}
                  <em>aylık ücreti</em> toplamı (indirimli sözleşme tutarı; toplam bedel/taksit değil); payda = bu
                  sözleşmelere sahip tekil öğrenci sayısı. Taslak, iptal ve yenilenmiş sözleşmeler hariç; silinmiş
                  öğrenci kayıtları hariç.
                </li>
                <li>
                  <strong>Ortalama tahsilat (nakit):</strong> pay = AYNI öğrencilerin o ay vadesi gelen ödemelerinden
                  fiilen tahsil edilen tutar; payda aynı öğrenci sayısı. Ücret − tahsilat farkı, o ayın tahsilat
                  performansını gösterir.
                </li>
                <li>
                  <strong>Aktif/pasif kapsamı:</strong> sözleşmesi geçerli ve ayı kapsayan pasif öğrenciler DAHİL —
                  geçmiş aylar bugünkü aktiflik durumuyla yeniden yorumlanmaz (sözleşme tarih aralığı esastır).
                </li>
                <li>
                  <strong>Sınırlama:</strong> iade kaydı modeli yoktur — iade, ödemenin iptal/düzeltmesiyle izlenir.
                </li>
              </ul>
            </details>
          </Card>
        );
      })()}

      {s.expenseByCategory.length > 0 ? (
        <Card className="mb-6">
          <h2 className="mb-3 font-semibold text-[var(--color-text)]">Kategori bazlı gider ({s.month})</h2>
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
          <h2 className="mb-3 font-semibold text-[var(--color-text)]">Şube bazlı maliyet (bordro + gider, {s.month})</h2>
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
          <h2 className="mb-3 font-semibold text-[var(--color-text)]">Bütçe vs gerçekleşen ({s.month})</h2>
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
        <IncomeExpenseChart trend={s.trend} />
        <table className="mt-3 w-full text-left text-sm">
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

      {/* 10. tur iş #6 — öğrenci başına ortalama trendi (ücret + tahsilat). */}
      <Card className="mb-6">
        <h2 className="mb-3 font-semibold text-[var(--color-text)]">Öğrenci başına ortalama — 6 aylık eğilim</h2>
        <AverageFeeChart points={s.averageFeeTrend} />
        <table className="mt-3 w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
            <tr>
              <th className="py-1.5">Ay</th>
              <th className="py-1.5">Ortalama ücret</th>
              <th className="py-1.5">Ortalama tahsilat</th>
              <th className="py-1.5">Öğrenci</th>
            </tr>
          </thead>
          <tbody>
            {s.averageFeeTrend.map((p) => (
              <tr key={p.month} className="border-t border-[var(--color-border)]">
                <td className="py-1.5 text-[var(--color-text-muted)]">{p.month}</td>
                <td className="py-1.5">{p.average === null ? "—" : formatMoney(p.average)}</td>
                <td className="py-1.5 text-emerald-700">{p.collectedAverage === null ? "—" : formatMoney(p.collectedAverage)}</td>
                <td className="py-1.5 text-[var(--color-text-muted)]">{p.studentCount}</td>
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

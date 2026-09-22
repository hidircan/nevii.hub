import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext, readScopedData } from "@/lib/institution/context";
import { getStaffPerformanceTool, listStaffTool } from "@/lib/services";
import { KurumScopeNote } from "@/components/kurum-scope-note";
import { BackButton } from "@/components/back-button";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { formatMoney } from "@/lib/utils";
import type { StaffPerformanceMetrics } from "@/lib/staff-performance";

export const dynamic = "force-dynamic";

function pct(rate: number | null): string {
  if (rate === null) return "—";
  return `%${Math.round(rate * 1000) / 10}`;
}

function delta(current: number, previous: number): { text: string; tone: "up" | "down" | "flat" } {
  const d = current - previous;
  if (d === 0) return { text: "Önceki ayla aynı", tone: "flat" };
  const sign = d > 0 ? "+" : "";
  return { text: `Önceki aya göre ${sign}${d}`, tone: d > 0 ? "up" : "down" };
}

function deltaMoney(current: number, previous: number): { text: string; tone: "up" | "down" | "flat" } {
  const d = current - previous;
  if (d === 0) return { text: "Önceki ayla aynı", tone: "flat" };
  const sign = d > 0 ? "+" : "−";
  return { text: `Önceki aya göre ${sign}${formatMoney(Math.abs(d))}`, tone: d > 0 ? "up" : "down" };
}

function toneClass(tone: "up" | "down" | "flat"): string {
  if (tone === "up") return "text-emerald-700 dark:text-emerald-400";
  if (tone === "down") return "text-rose-700 dark:text-rose-400";
  return "text-[var(--color-text-muted)]";
}

function MetricCard({
  label,
  value,
  hint,
  compare,
}: {
  label: string;
  value: string;
  hint?: string;
  compare?: { text: string; tone: "up" | "down" | "flat" };
}) {
  return (
    <Card>
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-[var(--color-text)]">{value}</p>
      {compare ? <p className={`mt-1 text-xs ${toneClass(compare.tone)}`}>{compare.text}</p> : null}
      {hint ? <p className="mt-2 text-xs text-[var(--color-text-muted)]">{hint}</p> : null}
    </Card>
  );
}

function monthTitle(yearMonth: string): string {
  const [y, m] = yearMonth.split("-").map(Number);
  const names = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
  return `${names[(m ?? 1) - 1] ?? yearMonth} ${y}`;
}

function branchLabel(branchId: string | null, branches: { id: string; shortName: string }[]): string {
  if (!branchId) return "Şubesiz / belirtilmemiş";
  return branches.find((b) => b.id === branchId)?.shortName ?? branchId;
}

export default async function StaffPerformancePage({
  params,
  searchParams,
}: {
  params: Promise<{ staffId: string }>;
  searchParams: Promise<{ yearMonth?: string }>;
}) {
  const { staffId } = await params;
  const { yearMonth: yearMonthParam } = await searchParams;

  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect(`/login?next=/panel/personel/${staffId}/performans`);
  }
  if (session.role !== "SUPER_ADMIN") redirect("/panel");

  const kurum = await getInstitutionContext(session);
  const [staffResult, data, result] = await Promise.all([
    listStaffTool(session, {}),
    readScopedData(kurum.scope),
    getStaffPerformanceTool(session, { staffId, yearMonth: yearMonthParam }),
  ]);

  const staff = staffResult.ok ? staffResult.data.staff.find((s) => s.id === staffId) : undefined;
  if (!staff) redirect("/panel/personel");

  const branches = data.settings.branches.map((b) => ({ id: b.id, shortName: b.shortName }));

  return (
    <div>
      <KurumScopeNote scope={kurum.scope} />
      <BackButton fallbackHref={`/panel/personel/${staff.id}`} label="Personel detayına dön" className="mb-3" />
      <PageHeader
        title={`${staff.name} — Performans`}
        description="Zam ve prim değerlendirmesi için görev, tahsilat ve dönem karşılaştırması. Sayılar gerçek kayıtlardan hesaplanır."
      />

      {!result.ok ? (
        <EmptyState title="Rapor yüklenemedi" description={result.error.message} />
      ) : (
        <StaffPerformanceBody
          current={result.data.current}
          previous={result.data.previous}
          linkageNote={result.data.linkageNote}
          branches={branches}
          staffId={staff.id}
        />
      )}
    </div>
  );
}

function StaffPerformanceBody({
  current,
  previous,
  linkageNote,
  branches,
  staffId,
}: {
  current: StaffPerformanceMetrics;
  previous: StaffPerformanceMetrics;
  linkageNote: string | null;
  branches: { id: string; shortName: string }[];
  staffId: string;
}) {
  const prevYm = previous.period.yearMonth;
  const curYm = current.period.yearMonth;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--color-text)]">{monthTitle(curYm)}</p>
          <p className="text-xs text-[var(--color-text-muted)]">
            Karşılaştırma: {monthTitle(prevYm)} · {current.period.startYmd} — {current.period.endYmd}
          </p>
        </div>
        <div className="flex gap-2 text-xs">
          <Link
            href={`/panel/personel/${staffId}/performans?yearMonth=${prevYm}`}
            className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]"
          >
            ← {monthTitle(prevYm)}
          </Link>
        </div>
      </div>

      {linkageNote ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          {linkageNote}
        </p>
      ) : null}

      <section>
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Görevler</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Tamamlanan"
            value={String(current.tasksCompleted)}
            compare={delta(current.tasksCompleted, previous.tasksCompleted)}
            hint={`Atanan aday: ${current.tasksAssigned}`}
          />
          <MetricCard
            label="Tamamlanma oranı"
            value={pct(current.taskCompletionRate)}
            compare={
              current.taskCompletionRate !== null && previous.taskCompletionRate !== null
                ? delta(Math.round(current.taskCompletionRate * 100), Math.round(previous.taskCompletionRate * 100))
                : undefined
            }
            hint="Tamamlanan / dönem adayı görev"
          />
          <MetricCard
            label="Zamanında"
            value={String(current.tasksOnTime)}
            compare={delta(current.tasksOnTime, previous.tasksOnTime)}
            hint={`Erken: ${current.tasksEarly} · Geç: ${current.tasksLate}`}
          />
          <MetricCard
            label="Zamanında oranı"
            value={pct(current.onTimeRate)}
            hint="Son tarihi olan tamamlananlar içinde"
          />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Tahsilat</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <MetricCard
            label="Tahsilat adedi"
            value={String(current.paymentsCollectedCount)}
            compare={delta(current.paymentsCollectedCount, previous.paymentsCollectedCount)}
            hint="Bu personelin portal kullanıcısı ile işaretlenen ödemeler"
          />
          <MetricCard
            label="Tahsilat tutarı"
            value={formatMoney(current.paymentsCollectedAmount)}
            compare={deltaMoney(current.paymentsCollectedAmount, previous.paymentsCollectedAmount)}
          />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Yeni öğrenci kaydı</h2>
        <Card>
          <p className="text-2xl font-semibold tabular-nums text-[var(--color-text)]">
            {current.newStudentRegistrations.count}
          </p>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            Önceki ay: {previous.newStudentRegistrations.count}
          </p>
          <p className="mt-2 text-xs text-[var(--color-text-muted)]">{current.newStudentRegistrations.label}</p>
        </Card>
      </section>

      {current.branchBreakdown.length > 0 ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Şube kırılımı (bu ay)</h2>
          <Card className="overflow-x-auto !p-0">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
                <tr>
                  <th className="px-4 py-3">Şube</th>
                  <th className="px-4 py-3">Tamamlanan görev</th>
                  <th className="px-4 py-3">Tahsilat adedi</th>
                  <th className="px-4 py-3">Tahsilat tutarı</th>
                </tr>
              </thead>
              <tbody>
                {current.branchBreakdown.map((row) => (
                  <tr key={row.branchId ?? "none"} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="px-4 py-3 font-medium">{branchLabel(row.branchId, branches)}</td>
                    <td className="px-4 py-3 tabular-nums">{row.tasksCompleted}</td>
                    <td className="px-4 py-3 tabular-nums">{row.paymentsCollectedCount}</td>
                    <td className="px-4 py-3 tabular-nums">{formatMoney(row.paymentsCollectedAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>
      ) : null}

      <p className="text-xs text-[var(--color-text-muted)]">
        Tanımlar: dönem adayı görev = son tarihi bu ayda olan (veya son tarihi yoksa bu ay oluşturulan) ve bu
        personele atanan görev. Zamanında = tamamlanma günü ≤ son tarih. Erken = tamamlanma günü &lt; son tarih.
        Tahsilat = paidAt bu ayda ve receivedByUserId = personelin portal kullanıcısı.
      </p>
    </div>
  );
}

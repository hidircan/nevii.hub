import { PageHeader, Card, StatCard } from "@/components/ui";
import { getAiDashboard, checkProviderHealth, getProviderHealthMap } from "@/lib/ai/metrics";
import { requireSessionContext } from "@/lib/auth/session";
import { describeActiveProvider } from "@/lib/ai/provider-factory";
import { redirect } from "next/navigation";
import Link from "@/components/link";
import { Activity, Cpu, Gauge, CheckCircle2 } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AiDashboardPage() {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/ai");
  }

  const [dashboard, healthNow] = await Promise.all([
    getAiDashboard(session.tenantId),
    checkProviderHealth(),
  ]);
  const healthMap = await getProviderHealthMap();
  const active = describeActiveProvider();

  return (
    <div>
      <PageHeader
        title="AI Dashboard"
        actions={
          <Link
            href="/panel/ai/logs"
            className="rounded-xl bg-amber-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-amber-700"
          >
            AI Logları
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Sohbetler"
          value={dashboard.totalConversations}
          accent="primary"
          icon={<Activity className="h-5 w-5" />}
        />
        <StatCard
          label="Tool çağrıları"
          value={dashboard.totalToolCalls}
          accent="info"
          icon={<Cpu className="h-5 w-5" />}
        />
        <StatCard
          label="Ort. süre"
          value={`${dashboard.averageResponseTimeMs} ms`}
          accent="warning"
          icon={<Gauge className="h-5 w-5" />}
        />
        <StatCard
          label="Başarı oranı"
          value={`%${dashboard.successRate}`}
          hint={`${dashboard.successCount} ok · ${dashboard.errorCount} hata`}
          accent="success"
          icon={<CheckCircle2 className="h-5 w-5" />}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="font-semibold text-[var(--color-text)] dark:text-slate-50">Provider kullanımı</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {Object.entries(dashboard.providerUsage).length === 0 ? (
              <li className="text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">Henüz kayıt yok — bir sohbet deneyin.</li>
            ) : (
              Object.entries(dashboard.providerUsage).map(([name, count]) => (
                <li key={name} className="flex justify-between rounded-lg bg-[var(--color-surface-muted)] px-3 py-2">
                  <span>{name}</span>
                  <span className="font-medium">{count}</span>
                </li>
              ))
            )}
          </ul>
          <p className="mt-3 text-xs text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
            Aktif: <strong>{active.name}</strong> · model {active.model}
          </p>
        </Card>

        <Card>
          <h2 className="font-semibold text-[var(--color-text)] dark:text-slate-50">Provider sağlığı</h2>
          <div className="mt-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3 text-sm">
            <p className="font-medium">
              {healthNow.name}{" "}
              <span
                className={
                  healthNow.status === "healthy"
                    ? "text-emerald-600"
                    : healthNow.status === "down"
                      ? "text-rose-600"
                      : "text-amber-600"
                }
              >
                · {healthNow.status}
              </span>
            </p>
            <p className="mt-1 text-xs text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
              {healthNow.message} · {healthNow.latencyMs ?? "—"} ms ·{" "}
              {new Date(healthNow.lastCheckedAt).toLocaleString("tr-TR")}
            </p>
          </div>
          <ul className="mt-3 space-y-1 text-xs text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
            {Object.values(healthMap).map((h) => (
              <li key={h.name + h.lastCheckedAt}>
                {h.name}: {h.status}
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <h2 className="font-semibold text-[var(--color-text)] dark:text-slate-50">Tool dağılımı</h2>
          <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto text-sm">
            {Object.entries(dashboard.toolUsage).length === 0 ? (
              <li className="text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">Tool çağrısı yok</li>
            ) : (
              Object.entries(dashboard.toolUsage)
                .sort((a, b) => b[1] - a[1])
                .map(([name, count]) => (
                  <li key={name} className="flex justify-between px-1 py-1">
                    <span className="font-mono text-xs">{name}</span>
                    <span>{count}</span>
                  </li>
                ))
            )}
          </ul>
        </Card>

        <Card>
          <h2 className="font-semibold text-[var(--color-text)] dark:text-slate-50">Faturalama (hazır)</h2>
          <p className="mt-2 text-3xl font-semibold text-[var(--color-text)] dark:text-slate-50">
            {dashboard.billableUnits}
          </p>
          <p className="text-sm text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">billable units (plan + tool + narrate)</p>
          <p className="mt-2 text-sm text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
            Token toplamı: <strong>{dashboard.totalTokens || "—"}</strong>
          </p>
          <p className="mt-3 text-xs text-[var(--color-text-muted)]">
            billingReady={String(dashboard.billingReady)} — fiyat tablosu sonraki milestone.
          </p>
        </Card>
      </div>
    </div>
  );
}

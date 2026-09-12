import Link from "next/link";
import { PageHeader, StatCard, Card, EmptyState } from "@/components/ui";
import { requireHyperAdminPage } from "@/lib/platform/session";
import { getPlatformDashboard } from "@/lib/platform/service";
import { PLATFORM_BRAND } from "@/lib/platform/brand";

export const dynamic = "force-dynamic";

export default async function PlatformDashboardPage() {
  const session = await requireHyperAdminPage("/platform");
  const result = await getPlatformDashboard(session);
  if (!result.ok) {
    return <EmptyState title="Özet yüklenemedi" description={result.error.message} />;
  }
  const data = result.data;

  return (
    <div>
      <PageHeader
        title={`${PLATFORM_BRAND.name} özeti`}
        description="Tüm kurumlar, paketler, özellikler ve sistem sağlığı."
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Toplam kurum" value={data.totals.tenants} />
        <StatCard label="Aktif" value={data.totals.active} accent="success" />
        <StatCard label="Pasif" value={data.totals.inactive} accent="warning" />
      </div>

      <div className="mb-8 grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="text-sm font-semibold text-[var(--color-text)]">Kurum ara / incele</h2>
          <form action="/platform/kurumlar" method="get" className="mt-3 flex gap-2">
            <input
              name="q"
              placeholder="Kurum adı veya id"
              aria-label="Kurum ara"
              className="w-full rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-white"
            >
              Ara
            </button>
          </form>
          <ul className="mt-4 space-y-2">
            {data.recentTenants.map((t) => (
              <li key={t.tenantId}>
                <Link
                  href={`/platform/kurumlar/${t.tenantId}`}
                  className="text-sm font-medium text-[var(--color-primary)] hover:underline"
                >
                  {t.name}
                </Link>
                <span className="ml-2 text-xs text-[var(--color-text-muted)]">
                  {t.planKey} · {t.active ? "aktif" : "pasif"}
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h2 className="text-sm font-semibold text-[var(--color-text)]">Plan dağılımı</h2>
          <ul className="mt-3 space-y-1 text-sm text-[var(--color-text-muted)]">
            {Object.entries(data.planDistribution).map(([plan, count]) => (
              <li key={plan}>
                {plan}: {count}
              </li>
            ))}
            {Object.keys(data.planDistribution).length === 0 ? <li>Henüz kurum yok</li> : null}
          </ul>
        </Card>
      </div>

      <div className="mb-8 grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="text-sm font-semibold text-[var(--color-text)]">Özellik dağılımı</h2>
          <ul className="mt-3 max-h-64 space-y-1 overflow-auto text-sm text-[var(--color-text-muted)]">
            {Object.entries(data.featureDistribution).map(([flag, bucket]) => (
              <li key={flag}>
                {flag}: {bucket.on} açık / {bucket.off} kapalı
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h2 className="text-sm font-semibold text-[var(--color-text)]">Sorunlu entegrasyonlar</h2>
          <ul className="mt-3 space-y-1 text-sm text-[var(--color-text-muted)]">
            {data.problemIntegrations.length === 0 ? <li>Kritik hata yok</li> : null}
            {data.problemIntegrations.map((i) => (
              <li key={i.provider}>
                {i.label}: {i.status}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="text-sm font-semibold text-[var(--color-text)]">Son ayar değişiklikleri</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {data.recentAudit.length === 0 ? (
              <li className="text-[var(--color-text-muted)]">Kayıt yok</li>
            ) : (
              data.recentAudit.map((e) => (
                <li key={e.id} className="text-[var(--color-text-muted)]">
                  {e.createdAt} · {e.action}
                  {e.targetTenantId ? ` · ${e.targetTenantId}` : ""}
                </li>
              ))
            )}
          </ul>
        </Card>
        <Card>
          <h2 className="text-sm font-semibold text-[var(--color-text)]">Sistem sağlığı</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {data.health.map((c) => (
              <li key={c.id} className="text-[var(--color-text-muted)]">
                {c.label}: {c.status} — {c.detail}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

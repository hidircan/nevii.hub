import Link from "next/link";
import { PageHeader, StatCard, Card, EmptyState } from "@/components/ui";
import { StatusBadge, toneForHealthStatus } from "@/components/platform/status-badge";
import { requireHyperAdminPage } from "@/lib/platform/session";
import { getPlatformDashboard } from "@/lib/platform/service";
import { planLabel } from "@/lib/platform/entitlements";

export const dynamic = "force-dynamic";

function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="text-sm font-semibold text-[var(--color-text)]">{children}</h2>
      {hint ? <p className="text-xs text-[var(--color-text-muted)]">{hint}</p> : null}
    </div>
  );
}

function NavCard({ href, title, description }: { href: string; title: string; description: string }) {
  return (
    <Link
      href={href}
      className="block rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 hover:border-[var(--color-border-strong)]"
    >
      <p className="text-sm font-semibold text-[var(--color-primary)]">{title}</p>
      <p className="mt-1 text-xs text-[var(--color-text-muted)]">{description}</p>
    </Link>
  );
}

/**
 * NeviiOS Control Room (2026-09-28): izleme → kurumlar → yayın/operasyon →
 * güvenlik bilgi mimarisi. Tüm sayılar gerçek özet verisidir; canlı
 * telemetri, hayalî deployment durumu veya çalışmayan komut paneli yok —
 * yayın/operasyon kartları ilgili sayfalara gider.
 */
export default async function PlatformDashboardPage() {
  const session = await requireHyperAdminPage("/platform");
  const result = await getPlatformDashboard(session);
  if (!result.ok) {
    return <EmptyState title="Özet yüklenemedi" description={result.error.message} />;
  }
  const data = result.data;
  const errors = data.health.filter((c) => toneForHealthStatus(c.status) === "danger").length;
  const warnings = data.health.filter((c) => toneForHealthStatus(c.status) === "warning").length;

  return (
    <div className="space-y-8">
      <PageHeader
        title="NeviiOS Control Center"
        description={`${data.totals.tenants} kurum · ${data.totals.active} aktif · ${errors} kritik · ${warnings} uyarı`}
      />

      <section aria-labelledby="cr-durum">
        <div id="cr-durum">
          <SectionTitle hint="Gerçek altyapı kartları — değerler gizlenmez, anahtarlar gösterilmez">
            Sistem durumu
          </SectionTitle>
        </div>
        {data.health.length === 0 ? (
          <EmptyState title="Sağlık verisi yok" description="Altyapı kartları henüz üretilmedi." />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {data.health.map((c) => (
              <li
                key={c.id}
                className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-[var(--color-text)]">{c.label}</p>
                  <StatusBadge tone={toneForHealthStatus(c.status)}>{c.status}</StatusBadge>
                </div>
                <p className="mt-2 text-xs text-[var(--color-text-muted)]">{c.detail}</p>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3">
          {data.problemIntegrations.length === 0 ? (
            <p className="text-xs text-[var(--color-text-muted)]">
              <StatusBadge tone="ok">sorunsuz</StatusBadge> Kritik entegrasyon hatası yok.
            </p>
          ) : (
            <ul className="space-y-1 text-sm">
              {data.problemIntegrations.map((i) => (
                <li key={i.provider} className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone={toneForHealthStatus(i.status)}>{i.status}</StatusBadge>
                  <span className="text-[var(--color-text-muted)]">{i.label}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section aria-labelledby="cr-kurumlar">
        <div id="cr-kurumlar">
          <SectionTitle hint="İşlemler her zaman açık hedef tenant ile yapılır">Kurumlar</SectionTitle>
        </div>
        <div className="mb-4 grid gap-4 sm:grid-cols-3">
          <StatCard label="Toplam kurum" value={data.totals.tenants} />
          <StatCard label="Aktif" value={data.totals.active} accent="success" />
          <StatCard label="Pasif" value={data.totals.inactive} accent="warning" />
        </div>
        <Card>
          <h3 className="text-sm font-semibold text-[var(--color-text)]">Kurum ara / incele</h3>
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
          {data.recentTenants.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--color-text-muted)]">Henüz kurum yok.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {data.recentTenants.map((t) => (
                <li key={t.tenantId} className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/platform/kurumlar/${t.tenantId}`}
                    className="text-sm font-medium text-[var(--color-primary)] hover:underline"
                  >
                    {t.name}
                  </Link>
                  <span className="text-xs text-[var(--color-text-muted)]">{planLabel(t.planKey)}</span>
                  <StatusBadge tone={t.active ? "ok" : "warning"}>{t.active ? "aktif" : "pasif"}</StatusBadge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      <section aria-labelledby="cr-yayin">
        <div id="cr-yayin">
          <SectionTitle hint="Durumlar ilgili sayfalardaki gerçek kayıtlardan okunur">Yayın ve operasyon</SectionTitle>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <NavCard href="/platform/release-merkezi" title="Release merkezi" description="Sürüm kararları ve yayın akışı." />
          <NavCard href="/platform/deploymentlar" title="Deploymentlar" description="Dağıtım kayıtları ve durumları." />
          <NavCard href="/platform/operasyon" title="Operasyon" description="Günlük operasyon araçları ve bakım." />
          <NavCard href="/platform/sistem-sagligi" title="Sistem sağlığı" description="Altyapı kartlarının tamamı." />
        </div>
      </section>

      <section aria-labelledby="cr-paket">
        <div id="cr-paket">
          <SectionTitle hint="Ticari hak dağılımı — bayrak değil, paket görünümü">Paket ve modüller</SectionTitle>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <h3 className="text-sm font-semibold text-[var(--color-text)]">Plan dağılımı</h3>
            {Object.keys(data.planDistribution).length === 0 ? (
              <p className="mt-3 text-sm text-[var(--color-text-muted)]">Henüz kurum yok.</p>
            ) : (
              <ul className="mt-3 space-y-1 text-sm text-[var(--color-text-muted)]">
                {Object.entries(data.planDistribution).map(([plan, count]) => (
                  <li key={plan}>
                    {planLabel(plan)}: {count}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <h3 className="text-sm font-semibold text-[var(--color-text)]">Özellik dağılımı</h3>
            <ul className="mt-3 max-h-64 space-y-1 overflow-auto text-sm text-[var(--color-text-muted)]">
              {Object.entries(data.featureDistribution).map(([flag, bucket]) => (
                <li key={flag}>
                  {flag}: {bucket.on} açık / {bucket.off} kapalı
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </section>

      <section aria-labelledby="cr-guvenlik">
        <div id="cr-guvenlik">
          <SectionTitle hint="Son 8 kayıt — tamamı denetim zaman çizelgesinde">Güvenlik ve denetim</SectionTitle>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <NavCard href="/platform/denetim" title="Denetim" description="Tüm platform denetim olayları." />
          <NavCard href="/platform/kullanicilar" title="Platform kullanıcıları" description="HYPER_ADMIN hesap yönetimi." />
          <NavCard href="/platform/roller" title="Roller" description="Rol dizini ve yetki sınırları." />
        </div>
        <Card>
          <h3 className="text-sm font-semibold text-[var(--color-text)]">Son ayar değişiklikleri</h3>
          {data.recentAudit.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--color-text-muted)]">Kayıt yok.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {data.recentAudit.map((e) => (
                <li key={e.id} className="text-[var(--color-text-muted)]">
                  {e.createdAt} · {e.action}
                  {e.targetTenantId ? ` · ${e.targetTenantId}` : ""}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </div>
  );
}

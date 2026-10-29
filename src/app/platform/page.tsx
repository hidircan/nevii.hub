import Link from "@/components/link";
import { PageHeader, StatCard, Card, EmptyState } from "@/components/ui";
import { StatusBadge, toneForHealthStatus } from "@/components/platform/status-badge";
import { requireHyperAdminPage } from "@/lib/platform/session";
import { getPlatformDashboard } from "@/lib/platform/service";
import { planLabel } from "@/lib/platform/entitlements";
import { getPlanNameMap } from "@/lib/platform/commercial-catalog";
import { FEATURE_BY_KEY } from "@/lib/platform/features";
import { auditActionLabel } from "@/lib/platform/audit-labels";
import { DashboardRefresh } from "@/components/platform/dashboard-refresh";

export const dynamic = "force-dynamic";

const SUB_STATUS_TR: Record<string, string> = {
  past_due: "Ödeme gecikmiş",
  suspended: "Erişim kısıtlı",
};

const PAY_EVENT_TR: Record<string, { label: string; tone: "ok" | "warning" | "danger" | "neutral" }> = {
  processed: { label: "işlendi", tone: "ok" },
  received: { label: "alındı", tone: "neutral" },
  failed: { label: "başarısız", tone: "danger" },
  ignored: { label: "yoksayıldı", tone: "warning" },
};

const fmtDate = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
};

function QuickAction({ href, title, description }: { href: string; title: string; description: string }) {
  return (
    <Link
      href={href}
      className="block rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 hover:border-[var(--color-border-strong)]"
    >
      <p className="text-sm font-semibold text-[var(--color-primary)]">{title}</p>
      <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{description}</p>
    </Link>
  );
}

/**
 * NeviiOS Özet: göstergeler → bekleyen işler → hızlı işlemler →
 * son hareketler → sistem durumu. Tüm sayılar gerçek kayıtlardan;
 * tahsilat toplamı gibi tarama gerektiren para göstergeleri YOK
 * (yanıltıcı tahmini engellemek için).
 */
export default async function PlatformDashboardPage() {
  const session = await requireHyperAdminPage("/platform");
  const result = await getPlatformDashboard(session);
  if (!result.ok) {
    return <EmptyState title="Özet yüklenemedi" description={result.error.message} />;
  }
  const data = result.data;
  const planNames = await getPlanNameMap();
  const nameOf = (key: string) => planNames.get(key) ?? planLabel(key);
  const pendingTotal = data.billing.pendingTrialsTotal + data.billing.pendingPurchasesTotal + data.billing.pendingQuotesTotal;
  const queueEmpty =
    pendingTotal === 0 && data.billing.troubledSubsTotal === 0 && data.billing.trialsEndingTotal === 0;
  const updatedAt = new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <PageHeader title="Özet" description="Kurumlar, satış ve sistem durumu — bugünün görünümü." />
        <DashboardRefresh at={updatedAt} />
      </div>

      <section aria-label="Göstergeler" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Kurumlar" value={`${data.totals.tenants} toplam · ${data.totals.active} aktif`} />
        <StatCard label="Aktif abonelik" value={data.billing.activeSubs} accent="success" />
        <StatCard
          label="Ödeme sorunu"
          value={data.billing.troubledSubsTotal}
          accent={data.billing.troubledSubsTotal > 0 ? "danger" : undefined}
        />
        <StatCard
          label="Bekleyen başvuru"
          value={pendingTotal}
          accent={pendingTotal > 0 ? "warning" : undefined}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-[var(--color-text)]">Bekleyen işler</h2>
            <Link href="/platform/basvurular" className="text-xs text-[var(--color-primary)] hover:underline">
              Başvurular ve davetler
            </Link>
          </div>
          {queueEmpty ? (
            <p className="mt-3 text-sm text-[var(--color-text-muted)]">
              Bekleyen iş yok. Yeni deneme ve satın alma başvuruları burada listelenir.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-[var(--color-border)] text-sm">
              {data.billing.pendingTrials.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 py-2">
                  <StatusBadge tone="warning">deneme başvurusu</StatusBadge>
                  <span className="font-medium text-[var(--color-text)]">{r.institutionName}</span>
                  <span className="text-xs text-[var(--color-text-muted)]">
                    {r.ownerName} · {fmtDate(r.createdAt)}
                  </span>
                </li>
              ))}
              {data.billing.pendingPurchases.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 py-2">
                  <StatusBadge tone="warning">satın alma başvurusu</StatusBadge>
                  <span className="font-medium text-[var(--color-text)]">{r.institutionName}</span>
                  <span className="text-xs text-[var(--color-text-muted)]">
                    {nameOf(r.planKey)} · {r.interval === "yearly" ? "yıllık" : "aylık"} · {fmtDate(r.createdAt)}
                  </span>
                </li>
              ))}
              {data.billing.pendingQuotes.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 py-2">
                  <StatusBadge tone="warning">teklif isteği</StatusBadge>
                  <span className="font-medium text-[var(--color-text)]">{r.institutionName}</span>
                  <span className="text-xs text-[var(--color-text-muted)]">
                    {r.ownerName} · {fmtDate(r.createdAt)}
                  </span>
                </li>
              ))}
              {data.billing.troubledSubs.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-2 py-2">
                  <StatusBadge tone="danger">{SUB_STATUS_TR[s.status] ?? s.status}</StatusBadge>
                  <Link
                    href={`/platform/kurumlar/${s.tenantId}`}
                    className="font-medium text-[var(--color-primary)] hover:underline"
                  >
                    {s.tenant}
                  </Link>
                  <span className="text-xs text-[var(--color-text-muted)]">{nameOf(s.planKey)}</span>
                </li>
              ))}
              {data.billing.trialsEnding.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-2 py-2">
                  <StatusBadge tone="neutral">deneme bitiyor</StatusBadge>
                  <Link
                    href={`/platform/kurumlar/${s.tenantId}`}
                    className="font-medium text-[var(--color-primary)] hover:underline"
                  >
                    {s.tenant}
                  </Link>
                  <span className="text-xs text-[var(--color-text-muted)]">bitiş: {fmtDate(s.trialEndsAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <nav aria-label="Hızlı işlemler" className="space-y-2">
          <h2 className="text-sm font-semibold text-[var(--color-text)]">Hızlı işlemler</h2>
          <QuickAction href="/platform/kurumlar/yeni" title="Yeni kurum" description="Kurumu ve sahibini oluştur." />
          <QuickAction href="/platform/paketler/yeni" title="Yeni paket" description="Taslak kataloga paket ekle." />
          <QuickAction href="/platform/basvurular" title="Başvuruları incele" description="Onay veya davet gönder." />
          <QuickAction href="/platform/odeme-saglayicilari" title="Ödeme sağlayıcıları" description="PayTR / iyzico durumu." />
          <QuickAction href="/platform/denetim" title="Denetim kaydı" description="Son değişikliklerin izi." />
        </nav>
      </div>

      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-[var(--color-text)]">
            Son ödeme hareketleri
            {data.billing.failedPaymentsTotal > 0 ? (
              <span className="ml-2 font-normal text-[var(--color-danger)]">{data.billing.failedPaymentsTotal} başarısız bildirim</span>
            ) : null}
          </h2>
          <Link href="/platform/fatura" className="text-xs text-[var(--color-primary)] hover:underline">
            Kurum abonelikleri
          </Link>
        </div>
        {data.billing.paymentEvents.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--color-text-muted)]">
            Henüz ödeme bildirimi yok. Sağlayıcıdan gelen her bildirim anında buraya düşer.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-[var(--color-border)] text-sm">
            {data.billing.paymentEvents.map((w) => {
              const t = PAY_EVENT_TR[w.status] ?? { label: w.status, tone: "neutral" as const };
              return (
                <li key={w.id} className="flex flex-wrap items-center gap-2 py-2">
                  <StatusBadge tone={t.tone}>{t.label}</StatusBadge>
                  <span className="font-medium text-[var(--color-text)]">
                    {w.provider === "mock" ? "Test ödemesi" : w.provider === "manual" ? "Banka transferi" : w.provider === "paytr" ? "PayTR" : w.provider === "iyzico" ? "iyzico" : w.provider}
                  </span>
                  {w.tenant ? <span className="text-[var(--color-text-muted)]">{w.tenant}</span> : null}
                  <span className="text-xs text-[var(--color-text-muted)]">{fmtDate(w.createdAt)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-[var(--color-text)]">Son hareketler</h3>
            <Link href="/platform/denetim" className="text-xs text-[var(--color-primary)] hover:underline">
              Tümü
            </Link>
          </div>
          {data.recentAudit.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--color-text-muted)]">Kayıt yok.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {data.recentAudit.map((e) => (
                <li key={e.id} className="text-[var(--color-text-muted)]" title={e.action}>
                  <span className="text-[var(--color-text)]">{auditActionLabel(e.action)}</span>
                  {e.targetTenantId ? ` · ${data.tenantNames[e.targetTenantId] ?? e.targetTenantId}` : ""}
                  <span className="block text-xs">{e.createdAt}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <h3 className="text-sm font-semibold text-[var(--color-text)]">Kurum ara</h3>
          <form action="/platform/kurumlar" method="get" className="mt-3 flex gap-2">
            <input
              name="q"
              placeholder="Kurum adı"
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
          <h3 className="mt-4 text-sm font-semibold text-[var(--color-text)]">Paket dağılımı</h3>
          {Object.keys(data.planDistribution).length === 0 ? (
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">Henüz kurum yok.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm text-[var(--color-text-muted)]">
              {Object.entries(data.planDistribution).map(([plan, count]) => (
                <li key={plan}>
                  {nameOf(plan)}: {count}
                </li>
              ))}
            </ul>
          )}
          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-[var(--color-text-muted)] hover:underline">
              Modül dağılımı (gelişmiş)
            </summary>
            <ul className="mt-2 max-h-48 space-y-1 overflow-auto text-sm text-[var(--color-text-muted)]">
              {Object.entries(data.featureDistribution).map(([flag, bucket]) => (
                <li key={flag}>
                  {FEATURE_BY_KEY.get(flag as Parameters<typeof FEATURE_BY_KEY.get>[0])?.label ?? flag}: {bucket.on} açık /{" "}
                  {bucket.off} kapalı
                </li>
              ))}
            </ul>
          </details>
        </Card>
      </div>

      <section aria-label="Sistem durumu">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-[var(--color-text)]">Sistem durumu</h2>
          <Link href="/platform/sistem-sagligi" className="text-xs text-[var(--color-primary)] hover:underline">
            Tüm kartlar
          </Link>
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
      </section>
    </div>
  );
}

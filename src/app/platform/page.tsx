import { cookies } from "next/headers";
import Link from "@/components/link";
import { PageHeader, StatCard, Card, EmptyState } from "@/components/ui";
import { StatusBadge } from "@/components/platform/status-badge";
import { requireHyperAdminPage } from "@/lib/platform/session";
import { getPlatformDashboard } from "@/lib/platform/service";
import { planLabel } from "@/lib/platform/entitlements";
import { getPlanNameMap } from "@/lib/platform/commercial-catalog";
import { FEATURE_BY_KEY } from "@/lib/platform/features";
import { auditActionLabel } from "@/lib/platform/audit-labels";
import { DashboardRefresh } from "@/components/platform/dashboard-refresh";
import { DashboardViewEditor } from "@/components/platform/dashboard-view-editor";
import { DASHBOARD_SECTIONS, DASHBOARD_VIEW_COOKIE } from "@/lib/platform/dashboard-view";

export const dynamic = "force-dynamic";

const SUB_STATUS_TR: Record<string, string> = {
  past_due: "Ödeme gecikmiş",
  suspended: "Erişim kısıtlı",
};

const DOC_STATUS_TR: Record<string, string> = {
  document_failed: "Belge hatası",
  manual_pending: "Elle düzenleme bekliyor",
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
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};

function QuickAction({ href, title, description }: { href: string; title: string; description: string }) {
  return (
    <Link
      href={href}
      className="block rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 hover:border-[var(--color-border-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
    >
      <p className="text-sm font-semibold text-[var(--color-primary)]">{title}</p>
      <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{description}</p>
    </Link>
  );
}

/**
 * NeviiOS Özet: göstergeler → hızlı işlemler → bekleyen işler →
 * ödeme/hareketler → arama/dağılım → sistem durumu. Tüm sayılar gerçek
 * kayıtlardan; tahsilat toplamı gibi tarama gerektiren para
 * göstergeleri YOK (yanıltıcı tahmini engellemek için).
 *
 * "Kullanıma açık kurum" (kurum yaşam döngüsü: yayında) ile "ücretli
 * abonelik" (abonelik kaydı: aktif) FARKLIDIR: eski/kontrollü (managed)
 * kurumların abonelik kaydı olmayabilir; denemedekiler ücretliye
 * sayılmaz. Kartlardaki kısa açıklama kapsamı belirtir.
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
  const jar = await cookies();
  const allowed: Set<string> = new Set(DASHBOARD_SECTIONS.map((s) => s.id));
  const hidden = new Set(
    (jar.get(DASHBOARD_VIEW_COOKIE)?.value ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => allowed.has(s))
  );
  const show = (id: string) => !hidden.has(id);

  const pendingTotal =
    data.billing.pendingTrialsTotal +
    data.billing.pendingPurchasesTotal +
    data.billing.pendingQuotesTotal +
    data.billing.awaitingOrdersTotal;
  const queueEmpty =
    pendingTotal === 0 &&
    data.billing.troubledSubsTotal === 0 &&
    data.billing.trialsEndingTotal === 0 &&
    data.billing.docTroubleTotal === 0 &&
    data.billing.failedPaymentsTotal === 0;
  const healthOk = data.health.filter((c) => c.status === "ok").length;
  const healthWarn = data.health.filter((c) => c.status === "warn").length;
  const healthErr = data.health.filter((c) => c.status === "error").length;
  const updatedAt = new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <PageHeader title="Özet" description="Kurumlar, satış ve sistem durumu — bugünün görünümü." />
        <DashboardRefresh at={updatedAt} />
      </div>

      <DashboardViewEditor hidden={[...hidden]} />

      {show("gostergeler") ? (
        <section aria-label="Göstergeler" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            compact
            label="Kullanıma açık kurumlar"
            value={`${data.totals.active} / ${data.totals.tenants}`}
            hint="Yaşam döngüsü yayında olanlar / tüm kurumlar"
            href="/platform/kurumlar?lifecycle=active"
          />
          <StatCard
            compact
            label="Ücretli abonelikler"
            value={data.billing.activeSubs}
            hint={`${data.billing.trialingSubs} deneme sürüyor · kayıt durumu aktif olanlar`}
            accent="success"
            href="/platform/fatura?durum=active"
          />
          <StatCard
            compact
            label="Ödeme sorunu"
            value={data.billing.troubledSubsTotal}
            hint="Gecikmiş veya kısıtlı abonelik"
            accent={data.billing.troubledSubsTotal > 0 ? "danger" : undefined}
            href="/platform/fatura?durum=sorunlu"
          />
          <StatCard
            compact
            label="Bekleyen başvuru"
            value={pendingTotal}
            hint="Başvuru + teklif + ödenmemiş taslak"
            accent={pendingTotal > 0 ? "warning" : undefined}
            href="/platform/basvurular"
          />
        </section>
      ) : null}

      {show("hizli") ? (
        <nav aria-label="Hızlı işlemler" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <QuickAction href="/platform/kurumlar/yeni" title="Yeni kurum" description="Kurumu ve sahibini oluştur." />
          <QuickAction href="/platform/paketler/yeni" title="Yeni paket" description="Taslak kataloga paket ekle." />
          <QuickAction href="/platform/basvurular" title="Başvuruları incele" description="Onay veya davet gönder." />
          <QuickAction href="/platform/odeme-saglayicilari" title="Ödeme sağlayıcıları" description="PayTR / iyzico durumu." />
          <QuickAction href="/platform/denetim" title="Denetim kaydı" description="Son değişikliklerin izi." />
        </nav>
      ) : null}

      {show("bekleyen") ? (
        <Card>
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
              {data.billing.pendingPurchases.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 py-2">
                  <StatusBadge tone="warning">satın alma başvurusu</StatusBadge>
                  <Link
                    href={`/platform/basvurular/satin-alma/${r.id}`}
                    className="font-medium text-[var(--color-primary)] hover:underline"
                  >
                    {r.institutionName}
                  </Link>
                  <span className="text-xs text-[var(--color-text-muted)]">
                    {nameOf(r.planKey)} · {r.interval === "yearly" ? "yıllık" : "aylık"} · {fmtDate(r.createdAt)}
                  </span>
                </li>
              ))}
              {data.billing.pendingTrials.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 py-2">
                  <StatusBadge tone="warning">deneme başvurusu</StatusBadge>
                  <Link
                    href={`/platform/basvurular/deneme/${r.id}`}
                    className="font-medium text-[var(--color-primary)] hover:underline"
                  >
                    {r.institutionName}
                  </Link>
                  <span className="text-xs text-[var(--color-text-muted)]">
                    {r.ownerName} · {fmtDate(r.createdAt)}
                  </span>
                </li>
              ))}
              {data.billing.pendingQuotes.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 py-2">
                  <StatusBadge tone="warning">teklif isteği</StatusBadge>
                  <Link
                    href={`/platform/basvurular/teklif/${r.id}`}
                    className="font-medium text-[var(--color-primary)] hover:underline"
                  >
                    {r.institutionName}
                  </Link>
                  <span className="text-xs text-[var(--color-text-muted)]">
                    {r.ownerName} · {fmtDate(r.createdAt)}
                  </span>
                </li>
              ))}
              {data.billing.awaitingOrders.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 py-2">
                  <StatusBadge tone="warning">ödenmemiş taslak</StatusBadge>
                  <Link
                    href={`/platform/basvurular/taslak/${r.id}`}
                    className="font-medium text-[var(--color-primary)] hover:underline"
                  >
                    {r.institutionName}
                  </Link>
                  <span className="text-xs text-[var(--color-text-muted)]">
                    {nameOf(r.planKey)} · {r.interval === "yearly" ? "yıllık" : "aylık"} · {fmtDate(r.createdAt)}
                  </span>
                </li>
              ))}
              {data.billing.docTrouble.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-2 py-2">
                  <StatusBadge tone="danger">{DOC_STATUS_TR[d.status] ?? d.status}</StatusBadge>
                  <Link
                    href={`/platform/fatura/e-belgeler?tenant=${encodeURIComponent(d.tenantId)}`}
                    className="font-medium text-[var(--color-primary)] hover:underline"
                  >
                    {d.tenant}
                  </Link>
                  <span className="text-xs text-[var(--color-text-muted)]">belge: {fmtDate(d.createdAt)}</span>
                </li>
              ))}
              {data.billing.failedPaymentsTotal > 0 ? (
                <li className="flex flex-wrap items-center gap-2 py-2">
                  <StatusBadge tone="danger">başarısız bildirim</StatusBadge>
                  <Link href="/platform/fatura#bildirimler" className="font-medium text-[var(--color-primary)] hover:underline">
                    {data.billing.failedPaymentsTotal} işlenemeyen ödeme bildirimi
                  </Link>
                </li>
              ) : null}
            </ul>
          )}
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {show("odemeler") ? (
          <Card>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold text-[var(--color-text)]">Son ödeme hareketleri</h2>
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
                      {w.tenant && w.tenantId ? (
                        <Link href={`/platform/kurumlar/${w.tenantId}`} className="text-[var(--color-primary)] hover:underline">
                          {w.tenant}
                        </Link>
                      ) : w.tenant ? (
                        <span className="text-[var(--color-text-muted)]">{w.tenant}</span>
                      ) : null}
                      <span className="text-xs text-[var(--color-text-muted)]">{fmtDate(w.createdAt)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        ) : null}

        {show("hareketler") ? (
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
                    <span className="block text-xs">{fmtDate(e.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ) : null}
      </div>

      {show("arama") ? (
        <div className="grid gap-4 lg:grid-cols-2">
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
          </Card>
          <Card>
            <h3 className="text-sm font-semibold text-[var(--color-text)]">Paket dağılımı</h3>
            {Object.keys(data.planDistribution).length === 0 ? (
              <p className="mt-2 text-sm text-[var(--color-text-muted)]">Henüz kurum yok.</p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm text-[var(--color-text-muted)]">
                {Object.entries(data.planDistribution).map(([plan, count]) => (
                  <li key={plan}>
                    <Link href={`/platform/kurumlar?plan=${encodeURIComponent(plan)}`} className="hover:underline">
                      {nameOf(plan)}
                    </Link>
                    : {count}
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
      ) : null}

      {show("durum") ? (
        <section aria-label="Sistem durumu">
          <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5">
            <p className="text-sm text-[var(--color-text)]">
              <span className="font-semibold">Sistem durumu:</span>{" "}
              {data.health.length === 0 ? (
                <span className="text-[var(--color-text-muted)]">ölçüm yok</span>
              ) : (
                <>
                  <span className="text-[var(--color-success)]">{healthOk} hazır</span>
                  {healthWarn > 0 ? <> · <span className="text-[var(--color-warning)]">{healthWarn} uyarı</span></> : null}
                  {healthErr > 0 ? <> · <span className="text-[var(--color-danger)]">{healthErr} hata</span></> : null}
                  <span className="text-xs text-[var(--color-text-muted)]"> (bu ortamın açılış kontrolleri)</span>
                </>
              )}
            </p>
            <Link href="/platform/sistem-sagligi" className="text-xs text-[var(--color-primary)] hover:underline">
              Tüm kartlar
            </Link>
          </div>
        </section>
      ) : null}
    </div>
  );
}

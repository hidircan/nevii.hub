import { PageHeader, EmptyState } from "@/components/ui";
import { requireHyperAdminPage } from "@/lib/platform/session";
import { getPlatformAuditLog } from "@/lib/platform/service";
import { listPlatformTenants } from "@/lib/platform/store";
import { AuditTimeline } from "@/components/platform/audit-timeline";
import { AUDIT_ENTITY_OPTIONS } from "@/lib/platform/audit-labels";

export const dynamic = "force-dynamic";

const inputCls =
  "rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm";

const ACTION_GROUPS = [
  { label: "Tüm işlemler", prefix: "" },
  { label: "Paket ve katalog", prefix: "platform.catalog" },
  { label: "Katalog yayını", prefix: "platform.policy" },
  { label: "Kurumlar", prefix: "platform.tenant" },
  { label: "Kullanıcılar", prefix: "platform.user" },
  { label: "Roller", prefix: "platform.role" },
  { label: "Ayarlar", prefix: "platform.setting" },
  { label: "Entegrasyonlar", prefix: "platform.integration" },
  { label: "Site", prefix: "site." },
  { label: "Giriş ve güvenlik", prefix: "auth." },
];

const OUTCOMES = [
  { label: "Tüm sonuçlar", value: "" },
  { label: "Başarılı", value: "success" },
  { label: "Engellendi", value: "denied" },
  { label: "Hata", value: "error" },
];

const PAGE_SIZES = [10, 25, 50, 100];

type SP = { tenantId?: string; action?: string; actor?: string; outcome?: string; entity?: string; after?: string; before?: string; page?: string; size?: string };

export default async function PlatformAuditPage({ searchParams }: { searchParams: Promise<SP> }) {
  const session = await requireHyperAdminPage("/platform/denetim");
  const sp = await searchParams;
  const [result, tenants] = await Promise.all([
    getPlatformAuditLog(session, sp.tenantId || undefined, {
      action: sp.action || undefined,
      actorUserId: sp.actor || undefined,
      outcome: sp.outcome || undefined,
      entityType: sp.entity || undefined,
      after: sp.after || undefined,
      before: sp.before || undefined,
      page: Number(sp.page) || 1,
      pageSize: Number(sp.size) || 25,
    }),
    listPlatformTenants().catch(() => []),
  ]);
  if (!result.ok) {
    return <EmptyState title="Denetim kaydı yüklenemedi" description={result.error.message} />;
  }
  const { events, total, page, pages, pageSize } = result.data;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (v && k !== "page") params.set(k, v);
  const pageHref = (p: number) => `/platform/denetim?${new URLSearchParams({ ...Object.fromEntries(params), page: String(p) }).toString()}`;
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <div>
      <PageHeader
        title="Denetim zaman çizelgesi"
        description="Kim, ne zaman, hangi kurumda ne yaptı. Gizli değerler gösterilmez."
      />
      <form method="get" className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <select name="tenantId" defaultValue={sp.tenantId ?? ""} aria-label="Kurum" className={inputCls}>
          <option value="">Tüm kurumlar + platform geneli</option>
          {tenants.map((t) => (
            <option key={t.tenantId} value={t.tenantId}>
              {t.name}
            </option>
          ))}
        </select>
        <select name="action" defaultValue={sp.action ?? ""} aria-label="İşlem grubu" className={inputCls}>
          {ACTION_GROUPS.map((g) => (
            <option key={g.label} value={g.prefix}>
              {g.label}
            </option>
          ))}
        </select>
        <select name="outcome" defaultValue={sp.outcome ?? ""} aria-label="Sonuç" className={inputCls}>
          {OUTCOMES.map((o) => (
            <option key={o.label} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select name="entity" defaultValue={sp.entity ?? ""} aria-label="Kayıt türü" className={inputCls}>
          <option value="">Tüm kayıt türleri</option>
          {AUDIT_ENTITY_OPTIONS.map((o) => (
            <option key={o.code} value={o.code}>
              {o.label}
            </option>
          ))}
        </select>
        <input name="actor" defaultValue={sp.actor ?? ""} placeholder="Sorumlu kullanıcı (kullanıcı no)" aria-label="Sorumlu" title="Kullanıcı kayıt numarasının bir bölümüyle arayın" className={inputCls} />
        <input name="after" type="date" defaultValue={sp.after ?? ""} aria-label="Başlangıç tarihi" className={inputCls} />
        <input name="before" type="date" defaultValue={sp.before ?? ""} aria-label="Bitiş tarihi" className={inputCls} />
        <select name="size" defaultValue={sp.size ?? "25"} aria-label="Sayfa başına kayıt" className={inputCls}>
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>
              Sayfa başına {n}
            </option>
          ))}
        </select>
        <span className="flex gap-2 sm:col-span-2 lg:col-span-4">
          <button type="submit" className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white">
            Filtrele
          </button>
          <a href="/platform/denetim" className="rounded-[var(--radius-md)] border border-[var(--color-border-strong)] px-4 py-2 text-sm">
            Temizle
          </a>
        </span>
      </form>
      <p className="mb-2 text-xs text-[var(--color-text-muted)]">
        {from}–{to} / {total} kayıt · {page}/{pages} sayfa
      </p>
      <AuditTimeline
        events={events}
        tenantNames={Object.fromEntries(tenants.map((t) => [t.tenantId, t.name]))}
      />
      {pages > 1 ? (
        <nav aria-label="Sayfalar" className="mt-4 flex items-center justify-between text-sm">
          {page > 1 ? (
            <a href={pageHref(page - 1)} className="rounded-[var(--radius-md)] border border-[var(--color-border-strong)] px-3 py-1.5 hover:bg-[var(--color-surface-muted)]">
              ‹ Önceki
            </a>
          ) : (
            <span />
          )}
          <span className="text-xs text-[var(--color-text-muted)]">
            {page} / {pages}
          </span>
          {page < pages ? (
            <a href={pageHref(page + 1)} className="rounded-[var(--radius-md)] border border-[var(--color-border-strong)] px-3 py-1.5 hover:bg-[var(--color-surface-muted)]">
              Sonraki ›
            </a>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}

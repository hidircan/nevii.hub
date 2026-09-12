import { EmptyState, PageHeader } from "@/components/ui";
import { requireHyperAdminPage } from "@/lib/platform/session";
import { listLiveOperations } from "@/lib/platform/live-ops";
import { LiveOpsManager } from "@/components/platform/live-ops-manager";
import { ROLE_LABELS_TR } from "@/lib/auth/role-labels";

export const dynamic = "force-dynamic";

const sel = "rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm";

type SP = { q?: string; tenantId?: string; role?: string; only?: string };

export default async function LiveSessionsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const session = await requireHyperAdminPage("/platform/operasyon/aktif-oturumlar");
  const sp = await searchParams;
  const result = await listLiveOperations(session, Object.fromEntries(Object.entries(sp).filter(([, v]) => v)));
  if (!result.ok) return <EmptyState title="Canlı operasyon yüklenemedi" description={result.error.message} />;
  const d = result.data;
  return (
    <div>
      <PageHeader
        title="Canlı operasyon"
        description={`Aktif oturumlar ve kullanıcı yaşam döngüsü. Şu an ${d.totals.onlineUsers} kullanıcı, ${d.totals.openSessions} açık oturum. ${d.presenceNote}`}
      />
      <form method="get" className="mb-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Ad veya e-posta ara" aria-label="Kullanıcı ara" className={`${sel} w-56`} />
        <select name="tenantId" defaultValue={sp.tenantId ?? ""} aria-label="Kurum" className={sel}>
          <option value="">Tüm kurumlar</option>
          {d.tenants.map((t) => (
            <option key={t.tenantId} value={t.tenantId}>
              {t.name}
            </option>
          ))}
        </select>
        <select name="role" defaultValue={sp.role ?? ""} aria-label="Rol" className={sel}>
          <option value="">Tüm roller</option>
          {Object.entries(ROLE_LABELS_TR).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select name="only" defaultValue={sp.only ?? "all"} aria-label="Görünüm" className={sel}>
          <option value="all">Tüm kullanıcılar</option>
          <option value="online">Yalnız açık oturumu olanlar</option>
        </select>
        <button type="submit" className={sel}>
          Uygula
        </button>
      </form>
      <LiveOpsManager users={d.users} invitations={d.invitations} writable={d.writable} />
    </div>
  );
}

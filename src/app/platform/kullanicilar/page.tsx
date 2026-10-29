import { EmptyState, PageHeader } from "@/components/ui";
import { requireHyperAdminPage } from "@/lib/platform/session";
import { listPlatformUsers } from "@/lib/platform/user-lifecycle";
import { PlatformUsersManager } from "@/components/platform/platform-users-manager";
import { ROLE_LABELS_TR } from "@/lib/auth/role-labels";

export const dynamic = "force-dynamic";

const sel =
  "rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm";

type SP = { q?: string; tenantId?: string; role?: string; status?: string; invite?: string; branchId?: string };

export default async function PlatformUsersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const session = await requireHyperAdminPage("/platform/kullanicilar");
  const sp = await searchParams;
  const filter = Object.fromEntries(Object.entries(sp).filter(([, v]) => v));
  const result = await listPlatformUsers(session, filter);
  if (!result.ok) return <EmptyState title="Kullanıcılar yüklenemedi" description={result.error.message} />;
  return (
    <div>
      <PageHeader title="Kullanıcılar" description="Tüm kurumların kullanıcıları ve davetleri. Filtreler ve arama sunucuda uygulanır." />
      <form method="get" className="mb-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Ad veya e-posta ara" aria-label="Kullanıcı ara" className={`${sel} w-56`} />
        <select name="tenantId" defaultValue={sp.tenantId ?? ""} aria-label="Kurum" className={sel}>
          <option value="">Tüm kurumlar</option>
          {result.data.tenants.map((t) => (
            <option key={t.tenantId} value={t.tenantId}>{t.name}</option>
          ))}
        </select>
        <select name="role" defaultValue={sp.role ?? ""} aria-label="Rol" className={sel}>
          <option value="">Tüm roller</option>
          {Object.entries(ROLE_LABELS_TR).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select name="status" defaultValue={sp.status ?? "active"} aria-label="Durum" className={sel}>
          <option value="active">Aktif</option>
          <option value="deactivated">Pasif</option>
          <option value="deleted">Silinmiş</option>
          <option value="all">Tümü</option>
        </select>
        <select name="invite" defaultValue={sp.invite ?? "pending"} aria-label="Davet durumu" className={sel}>
          <option value="pending">Bekleyen davetler</option>
          <option value="expired">Süresi dolan</option>
          <option value="revoked">İptal edilen</option>
          <option value="used">Kabul edilen</option>
          <option value="all">Tüm davetler</option>
          <option value="none">Davetleri gizle</option>
        </select>
        <input name="branchId" defaultValue={sp.branchId ?? ""} placeholder="Şube kodu" aria-label="Şube" className={`${sel} w-32`} />
        <button type="submit" className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-white">Filtrele</button>
      </form>
      <PlatformUsersManager
        users={result.data.users}
        invitations={result.data.invitations}
        tenants={result.data.tenants}
        writable={result.data.writable}
      />
    </div>
  );
}

import { Card, PageHeader } from "@/components/ui";
import { requireHyperAdminPage } from "@/lib/platform/session";
import { getRoleDirectory } from "@/lib/platform/role-directory";
import { RoleDirectory } from "@/components/platform/role-directory";
import {
  PERM_RESOURCES,
  PERM_RESOURCE_KEYS,
  PLATFORM_ONLY_RESOURCES,
  SCREEN_REGISTRY,
  SYSTEM_ROLE_GRANTS,
  SYSTEM_ROLE_KEYS,
  SYSTEM_ROLE_META,
} from "@/lib/platform/permission-matrix";

export const dynamic = "force-dynamic";

const SCOPE_SHORT = { platform: "P", tenant: "K", branch: "Ş", assigned: "A", own: "Ö" } as const;

/** Sistem rolleri salt-okur: HYPER_ADMIN temel izinleri UI'dan düşürülemez; özel roller kurum sekmesinde. */
export default async function RolesMatrixPage({ searchParams }: { searchParams: Promise<{ tenantId?: string }> }) {
  const session = await requireHyperAdminPage("/platform/roller");
  const { tenantId } = await searchParams;
  const directory = await getRoleDirectory(session, { tenantId: tenantId ?? null });
  return (
    <div className="space-y-4">
      <PageHeader
        title="Roller ve izinler"
        description="Her rolün hangi ekranlara erişip ne yapabileceği. Sistem rollerinin izinleri değiştirilemez; kurum seçince rol atama açılır."
      />
      {directory.ok ? (
        <RoleDirectory data={directory.data} />
      ) : (
        <p role="alert" className="text-sm text-[var(--color-danger)]">{directory.error.message}</p>
      )}
      <h2 className="pt-2 text-sm font-semibold">Sistem rol matrisi (değiştirilemez, yalnız görüntülenir)</h2>
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[1100px] text-left text-xs">
          <thead>
            <tr className="border-b" style={{ borderColor: "var(--color-border)" }}>
              <th className="sticky left-0 bg-[var(--color-surface)] px-3 py-2">Kaynak</th>
              {SYSTEM_ROLE_KEYS.map((r) => (
                <th key={r} className="px-2 py-2" title={SYSTEM_ROLE_META[r].note}>
                  {SYSTEM_ROLE_META[r].label}
                  <span className="block font-normal text-[var(--color-text-muted)]">{SYSTEM_ROLE_META[r].loginRole}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERM_RESOURCE_KEYS.map((res) => (
              <tr key={res} className="border-b align-top" style={{ borderColor: "var(--color-border)" }}>
                <td className="sticky left-0 bg-[var(--color-surface)] px-3 py-1.5 font-medium">
                  {PERM_RESOURCES[res]}
                  {PLATFORM_ONLY_RESOURCES.includes(res) ? <span className="ml-1 text-[10px] text-[var(--color-text-muted)]">platform</span> : null}
                </td>
                {SYSTEM_ROLE_KEYS.map((role) => {
                  const grants = SYSTEM_ROLE_GRANTS[role].filter((g) => g.resource === res);
                  return (
                    <td key={role} className="px-2 py-1.5 text-[var(--color-text-muted)]">
                      {grants.length === 0
                        ? "—"
                        : role === "HYPER_ADMIN"
                          ? "tümü (P)"
                          : `${grants.map((g) => g.action).join(", ")} (${SCOPE_SHORT[grants[0]!.scope]})`}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card className="overflow-x-auto">
        <h2 className="text-sm font-semibold">Ekran / modül registry</h2>
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
          Ekran yetkisi serbest route yazılarak verilmez; menü görünürlüğü ve sunucu kontrolü aynı kayıttan gelir.
        </p>
        <table className="mt-2 w-full text-left text-xs">
          <thead>
            <tr className="text-[var(--color-text-muted)]">
              <th className="py-1">Ekran</th>
              <th>Yol</th>
              <th>Gerekli izin</th>
              <th>Modül</th>
            </tr>
          </thead>
          <tbody>
            {SCREEN_REGISTRY.map((s) => (
              <tr key={s.id} className="border-t" style={{ borderColor: "var(--color-border)" }}>
                <td className="py-1">{s.label}</td>
                <td><code>{s.path}</code></td>
                <td>{PERM_RESOURCES[s.requires.resource]} · {s.requires.action} · {s.requires.scope}</td>
                <td>{s.feature ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

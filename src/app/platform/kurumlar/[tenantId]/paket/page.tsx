import { Card, EmptyState } from "@/components/ui";
import { requireHyperAdminPage } from "@/lib/platform/session";
import { getTenantSubscription } from "@/lib/platform/service";
import { LIMIT_LABELS } from "@/lib/platform/entitlements";
import { LIMIT_KINDS } from "@/lib/platform/types";
import { PlanSelector } from "@/components/platform/tenant-admin-controls";
import { TenantSettingsSection } from "../settings-section";

export const dynamic = "force-dynamic";

const SOURCE_LABEL = { plan: "Paket", addon: "Eklenti", override: "Platform override", none: "—" } as const;

export default async function TenantPackagePage({ params }: { params: Promise<{ tenantId: string }> }) {
  const session = await requireHyperAdminPage("/platform/kurumlar");
  const { tenantId } = await params;
  const result = await getTenantSubscription(session, tenantId);
  if (!result.ok) return <EmptyState title="Paket bilgisi yüklenemedi" description={result.error.message} />;
  const { tenant, plans, limits, usage, entitlements } = result.data;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="text-sm font-semibold">Paket</h2>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            Paket = ticari hak ve limit. Modül aç/kapa (feature flag) ve kullanıcı izni (rol) ayrı katmanlardır.
          </p>
          <div className="mt-3">
            <PlanSelector tenantId={tenantId} current={tenant.planKey} plans={plans} />
          </div>
        </Card>
        <Card>
          <h2 className="text-sm font-semibold">Limit kullanımı</h2>
          <table className="mt-2 w-full text-sm">
            <tbody>
              {LIMIT_KINDS.map((k) => (
                <tr key={k} className="border-b" style={{ borderColor: "var(--color-border)" }}>
                  <td className="py-1.5">{LIMIT_LABELS[k]}</td>
                  <td className="py-1.5 text-right">
                    {usage[k] ?? "—"} / {limits[k] ?? "∞"}
                    {limits[k] !== null && usage[k] !== null && usage[k]! >= limits[k]! ? (
                      <span className="ml-2 text-xs text-[var(--color-danger)]">limit dolu — yeni kayıt engellenir, veri silinmez</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
      <Card>
        <h2 className="text-sm font-semibold">Entitlement (ticari hak)</h2>
        <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {entitlements.map((e) => (
            <li key={e.key} className="flex justify-between gap-2 rounded px-2 py-1" style={{ background: "var(--color-surface-muted)" }}>
              <span>{e.label}</span>
              <span className={e.entitled ? "text-[var(--color-success)]" : "text-[var(--color-text-muted)]"}>
                {e.entitled ? SOURCE_LABEL[e.source] : "yok"}
                {e.entitled && !e.enabled ? " · kapalı" : ""}
              </span>
            </li>
          ))}
        </ul>
      </Card>
      <TenantSettingsSection tenantId={tenantId} categories={["subscription"]} />
    </div>
  );
}

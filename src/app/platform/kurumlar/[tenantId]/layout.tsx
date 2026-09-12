import { TenantTabs } from "@/components/platform/tenant-tabs";
import { requireHyperAdminPage } from "@/lib/platform/session";
import { getPlatformTenant } from "@/lib/platform/store";
import { EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function TenantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenantId: string }>;
}) {
  await requireHyperAdminPage("/platform/kurumlar");
  const { tenantId } = await params;
  const tenant = await getPlatformTenant(tenantId);
  if (!tenant) {
    return <EmptyState title="Kurum bulunamadı" description={tenantId} />;
  }
  return (
    <div>
      <div className="mb-2">
        <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Hedef kurum</p>
        <h1 className="text-2xl font-semibold text-[var(--color-text)]">{tenant.name}</h1>
        <p className="text-xs text-[var(--color-text-muted)]">
          tenantId: {tenant.tenantId} · plan: {tenant.planKey} · {tenant.active ? "aktif" : "pasif"}
        </p>
      </div>
      <TenantTabs tenantId={tenantId} />
      {children}
    </div>
  );
}

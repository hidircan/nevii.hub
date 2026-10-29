import { EmptyState } from "@/components/ui";
import { requireHyperAdminPage } from "@/lib/platform/session";
import { getPlatformAuditLog } from "@/lib/platform/service";
import { getPlatformTenant } from "@/lib/platform/store";
import { AuditTimeline } from "@/components/platform/audit-timeline";

export const dynamic = "force-dynamic";

export default async function TenantAuditPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const session = await requireHyperAdminPage("/platform/kurumlar");
  const { tenantId } = await params;
  const [result, tenant] = await Promise.all([getPlatformAuditLog(session, tenantId), getPlatformTenant(tenantId)]);
  if (!result.ok) return <EmptyState title="Denetim kaydı yüklenemedi" description={result.error.message} />;
  return <AuditTimeline events={result.data.events} tenantNames={tenant ? { [tenantId]: tenant.name } : {}} />;
}

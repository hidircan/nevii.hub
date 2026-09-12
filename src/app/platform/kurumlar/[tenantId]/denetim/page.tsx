import { EmptyState } from "@/components/ui";
import { requireHyperAdminPage } from "@/lib/platform/session";
import { getPlatformAuditLog } from "@/lib/platform/service";
import { AuditTimeline } from "@/components/platform/audit-timeline";

export const dynamic = "force-dynamic";

export default async function TenantAuditPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const session = await requireHyperAdminPage("/platform/kurumlar");
  const { tenantId } = await params;
  const result = await getPlatformAuditLog(session, tenantId);
  if (!result.ok) return <EmptyState title="Denetim kaydı yüklenemedi" description={result.error.message} />;
  return <AuditTimeline events={result.data.events} />;
}

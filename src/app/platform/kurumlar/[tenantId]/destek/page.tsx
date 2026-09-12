import { EmptyState } from "@/components/ui";
import { requireHyperAdminPage } from "@/lib/platform/session";
import { listTenantSupportSessions } from "@/lib/platform/support-access";
import { SupportAccessPanel } from "@/components/platform/support-access-panel";

export const dynamic = "force-dynamic";

export default async function TenantSupportPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const session = await requireHyperAdminPage("/platform/kurumlar");
  const { tenantId } = await params;
  const result = await listTenantSupportSessions(session, tenantId);
  if (!result.ok) return <EmptyState title="Destek oturumları yüklenemedi" description={result.error.message} />;
  return <SupportAccessPanel tenantId={tenantId} sessions={result.data.sessions} />;
}

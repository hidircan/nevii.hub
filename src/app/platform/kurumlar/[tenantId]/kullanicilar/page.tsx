import { EmptyState } from "@/components/ui";
import { requireHyperAdminPage } from "@/lib/platform/session";
import { getTenantMembers } from "@/lib/platform/users-admin";
import { MembersManager } from "@/components/platform/members-manager";

export const dynamic = "force-dynamic";

export default async function TenantUsersPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const session = await requireHyperAdminPage("/platform/kurumlar");
  const { tenantId } = await params;
  const result = await getTenantMembers(session, tenantId);
  if (!result.ok) {
    return <EmptyState title="Kullanıcılar yüklenemedi" description={result.error.message} />;
  }
  return (
    <MembersManager
      tenantId={tenantId}
      members={result.data.members}
      branches={result.data.branches}
      writable={result.data.writable}
    />
  );
}

import { EmptyState, PageHeader } from "@/components/ui";
import { requireHyperAdminPage } from "@/lib/platform/session";
import { listCustomRoles } from "@/lib/platform/custom-roles";
import { getTenantMembers } from "@/lib/platform/users-admin";
import { CustomRolesManager } from "@/components/platform/custom-roles-manager";

export const dynamic = "force-dynamic";

export default async function TenantCustomRolesPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const session = await requireHyperAdminPage("/platform/kurumlar");
  const { tenantId } = await params;
  const [roles, members] = await Promise.all([listCustomRoles(session, tenantId), getTenantMembers(session, tenantId)]);
  if (!roles.ok || !members.ok) return <EmptyState title="Roller yüklenemedi" description={!roles.ok ? roles.error.message : ""} />;
  return (
    <div>
      <PageHeader title="Kurum özel rolleri" description="Sistem rollerine ek, yalnız bu kurumda geçerli izin setleri. Sistem rol matrisi: Platform → Roller ve izinler." />
      <CustomRolesManager
        tenantId={tenantId}
        roles={roles.data.roles as never}
        members={members.data.members.filter((m) => m.role !== "HYPER_ADMIN").map((m) => ({ id: m.id, email: m.email, role: m.role }))}
      />
    </div>
  );
}

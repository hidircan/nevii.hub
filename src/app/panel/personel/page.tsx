import { redirect } from "next/navigation";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext, readScopedData } from "@/lib/institution/context";
import { KurumScopeNote } from "@/components/kurum-scope-note";
import { listStaffTool } from "@/lib/services";
import { PageHeader } from "@/components/ui";
import { StaffManager } from "@/components/staff-manager";

export const dynamic = "force-dynamic";

/**
 * Personel Modülü — öğretmen dışı personel (idari/muhasebe/resepsiyon vb.)
 * için yönetici ekranı. Yalnızca SCHOOL_ADMIN/SUPER_ADMIN erişebilir
 * (listStaffTool RBAC'ı zaten aynı kısıtı uygular; burada erken redirect
 * ile diğer roller ekranı hiç görmez).
 */
export default async function PersonelPage() {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/personel");
  }
  if (session.role !== "SCHOOL_ADMIN" && session.role !== "SUPER_ADMIN") {
    redirect("/panel");
  }

  const kurum = await getInstitutionContext(session);
  const data = await readScopedData(kurum.scope);
  const result = await listStaffTool(session, {});
  const staff = result.ok ? result.data.staff : [];

  return (
    <div>
      <KurumScopeNote scope={kurum.scope} />
      <PageHeader
        title="Personel"
        description="Öğretmen dışı personel kayıtları — idari, muhasebe, resepsiyon vb."
      />
      <StaffManager
        staff={staff}
        branches={data.settings.branches.map((b) => ({ id: b.id, shortName: b.shortName }))}
        canWrite={kurum.scope.mode === "single"}
      />
    </div>
  );
}

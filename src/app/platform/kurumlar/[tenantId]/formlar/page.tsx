import { PageHeader } from "@/components/ui";
import { requireHyperAdminPage } from "@/lib/platform/session";
import { getStudentFormConfig } from "@/lib/platform/access";
import { StudentFormEditor } from "@/components/platform/student-form-editor";

export const dynamic = "force-dynamic";

export default async function TenantFormsPage({ params }: { params: Promise<{ tenantId: string }> }) {
  await requireHyperAdminPage("/platform/kurumlar");
  const { tenantId } = await params;
  const config = await getStudentFormConfig(tenantId);
  return (
    <div>
      <PageHeader
        title="Yeni Öğrenci Kaydı formu"
        description="Görünürlük, zorunluluk, sıra, varsayılan, yardım metni, koşullu görünürlük ve rol bazlı düzenleme. Kurallar yalnız arayüzde değil createStudentTool'da uygulanır."
      />
      <StudentFormEditor endpoint={`/api/v1/platform/tenants/${tenantId}/settings`} initial={config} />
    </div>
  );
}

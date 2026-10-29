import { PageHeader, EmptyState } from "@/components/ui";
import { requireRecruitmentPage } from "@/lib/recruitment/page-context";
import { listTemplatesTool } from "@/lib/recruitment/tools";
import { runWithTenantAsync } from "@/lib/tenant-context";
import { TemplateManager } from "@/components/recruitment/template-manager";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const { ctx, allMode } = await requireRecruitmentPage("/panel/ik/sablonlar");
  if (allMode) return <EmptyState title="Tek bir kurum seçin" />;
  const res = await runWithTenantAsync(ctx.tenantId, () => listTemplatesTool(ctx));
  if (!res.ok) return <EmptyState title="Şablonlar yüklenemedi" description={res.error.message} />;
  return (
    <>
      <PageHeader
        title="Aday e-posta şablonları"
        description="Başvuru alındı, görüşme daveti, olumlu/olumsuz dönüş ve teklif e-postalarınızı kurumunuzun diliyle düzenleyin. Yer tutucular her adayın bilgisiyle doldurulur."
      />
      <TemplateManager templates={res.data.templates} />
    </>
  );
}

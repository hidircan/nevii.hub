import { PageHeader, EmptyState } from "@/components/ui";
import { requireRecruitmentPage } from "@/lib/recruitment/page-context";
import { loadEditorLookups } from "@/lib/recruitment/editor-data";
import { JobEditor } from "@/components/recruitment/job-editor";

export const dynamic = "force-dynamic";

export default async function NewJobPage() {
  const { ctx, allMode } = await requireRecruitmentPage("/panel/ik/ilanlar/yeni");
  if (allMode) return <EmptyState title="Tek bir kurum seçin" />;
  const { branches, instruments } = await loadEditorLookups(ctx.tenantId);
  return (
    <>
      <PageHeader title="Yeni iş ilanı" description="Yayınladığınızda ilan kariyer sayfanızda görünür ve başvuru almaya başlar." />
      <JobEditor branches={branches} instruments={instruments} />
    </>
  );
}

import { notFound } from "next/navigation";
import { PageHeader, EmptyState } from "@/components/ui";
import { requireRecruitmentPage } from "@/lib/recruitment/page-context";
import { loadEditorLookups } from "@/lib/recruitment/editor-data";
import { getJobTool } from "@/lib/recruitment/tools";
import { runWithTenantAsync } from "@/lib/tenant-context";
import { JobEditor } from "@/components/recruitment/job-editor";

export const dynamic = "force-dynamic";

export default async function EditJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, allMode } = await requireRecruitmentPage(`/panel/ik/ilanlar/${id}`);
  if (allMode) return <EmptyState title="Tek bir kurum seçin" />;
  const res = await runWithTenantAsync(ctx.tenantId, () => getJobTool(ctx, { id }));
  if (!res.ok) notFound();
  const { branches, instruments } = await loadEditorLookups(ctx.tenantId);
  return (
    <>
      <PageHeader title={`İlanı düzenle`} description={res.data.job.title} />
      <JobEditor job={res.data.job} branches={branches} instruments={instruments} />
    </>
  );
}

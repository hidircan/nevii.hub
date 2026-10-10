import { PageHeader, EmptyState } from "@/components/ui";
import { requireRecruitmentPage } from "@/lib/recruitment/page-context";
import { listApplicationsTool } from "@/lib/recruitment/tools";
import { parseApplicationFilter } from "@/lib/recruitment/filters";
import { runWithTenantAsync } from "@/lib/tenant-context";
import { KanbanBoard } from "@/components/recruitment/kanban-board";
import Link from "@/components/link";

export const dynamic = "force-dynamic";

export default async function IkBoardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx, allMode } = await requireRecruitmentPage("/panel/ik/pano");
  if (allMode) return <EmptyState title="Tek bir kurum seçin" />;
  const filter = parseApplicationFilter(await searchParams);
  const list = await runWithTenantAsync(ctx.tenantId, () => listApplicationsTool(ctx, filter));
  if (!list.ok) return <EmptyState title="Pano yüklenemedi" description={list.error.message} />;
  const titles = Object.fromEntries(list.data.jobs.map((j) => [j.id, j.title]));
  return (
    <>
      <PageHeader
        title="Süreç panosu"
        description="Adayları aşamalar arasında sürükleyerek ilerletin. Her taşıma aday zaman çizelgesine kaydedilir."
        actions={
          <div className="flex flex-wrap gap-1.5">
            <Link href="/panel/ik/pano" className={`rounded-full border px-3 py-1 text-sm ${!filter.category ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)]" : "border-[var(--color-border-strong)]"}`}>Tümü</Link>
            <Link href="/panel/ik/pano?tur=teacher" className={`rounded-full border px-3 py-1 text-sm ${filter.category === "teacher" ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)]" : "border-[var(--color-border-strong)]"}`}>Öğretmen</Link>
            <Link href="/panel/ik/pano?tur=staff" className={`rounded-full border px-3 py-1 text-sm ${filter.category === "staff" ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)]" : "border-[var(--color-border-strong)]"}`}>Personel</Link>
          </div>
        }
      />
      <KanbanBoard applications={list.data.applications} jobTitles={titles} />
    </>
  );
}

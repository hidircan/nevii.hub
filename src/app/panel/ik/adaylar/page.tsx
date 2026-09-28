import { PageHeader, EmptyState } from "@/components/ui";
import { requireRecruitmentPage } from "@/lib/recruitment/page-context";
import { listApplicationsTool, listTemplatesTool } from "@/lib/recruitment/tools";
import { applicationFilterToSearchParams, parseApplicationFilter } from "@/lib/recruitment/filters";
import { runWithTenantAsync } from "@/lib/tenant-context";
import { PoolFilters } from "@/components/recruitment/pool-filters";
import { PoolTable } from "@/components/recruitment/pool-table";

export const dynamic = "force-dynamic";

export default async function CandidatePoolPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx, allMode } = await requireRecruitmentPage("/panel/ik/adaylar");
  if (allMode) return <EmptyState title="Tek bir kurum seçin" description="Aday havuzu kurum bazında çalışır." />;
  const filter = parseApplicationFilter(await searchParams);
  const [list, tpls] = await runWithTenantAsync(ctx.tenantId, () => Promise.all([listApplicationsTool(ctx, filter), listTemplatesTool(ctx)]));
  if (!list.ok) return <EmptyState title="Aday havuzu yüklenemedi" description={list.error.message} />;
  const d = list.data;
  const filterQuery = applicationFilterToSearchParams(filter).toString();

  return (
    <>
      <PageHeader
        title="Aday havuzu"
        description={`Toplam ${d.total} aday. Öğretmen/personel, enstrüman, deneyim ve aşamaya göre filtreleyin; seçtiklerinize toplu e-posta gönderin, yazdırın veya Excel'e aktarın.`}
      />
      <PoolFilters initial={filter} jobs={d.jobs} instruments={d.allInstruments} tags={d.allTags} cities={d.allCities} />
      {d.applications.length === 0 ? (
        <EmptyState
          title={d.total === 0 ? "Henüz başvuru yok" : "Filtreye uyan aday yok"}
          description={d.total === 0 ? "Bir ilan yayınlayın ve kariyer bağlantınızı paylaşın; başvurular burada listelenir." : "Filtreleri gevşetmeyi deneyin."}
        />
      ) : (
        <PoolTable applications={d.applications} jobs={d.jobs} templates={tpls.ok ? tpls.data.templates : []} filterQuery={filterQuery} />
      )}
    </>
  );
}

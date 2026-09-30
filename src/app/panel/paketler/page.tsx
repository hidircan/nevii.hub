import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext, readScopedReferenceData } from "@/lib/institution/context";
import { KurumScopeNote } from "@/components/kurum-scope-note";
import { AssistantPageContext } from "@/components/ai/assistant-page-context";
import { PageHeader } from "@/components/ui";
import { PackageManager } from "@/components/package-manager";
import { canRunCriticalActions } from "@/lib/critical-action-password";
import { DiscountCampaignManager } from "@/components/discount-campaign-manager";
import { PackageCampaignTabs, type PackageCampaignTab } from "@/components/package-campaign-tabs";
import { CampaignReportView } from "@/components/campaign-report-view";
import { buildCampaignReport } from "@/lib/discount-campaigns";
import type { DiscountCampaign, Package } from "@/lib/types";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

/**
 * Paketler & Kampanyalar — sekmeli yönetim + detaylı kampanya raporu.
 * Filtreleme ve sayfalama SUNUCUDA yapılır (istemciye yalnız sayfa gider).
 * Görüntüleme SCHOOL_ADMIN/SUPER_ADMIN; yazma yalnız SUPER_ADMIN (tool katmanında zorunlu).
 */
export default async function PackagesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/paketler");
  }
  if (session.role !== "SCHOOL_ADMIN" && session.role !== "SUPER_ADMIN") {
    redirect("/panel");
  }

  const params = await searchParams;
  const one = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? "") : (v ?? ""));
  const tabRaw = one(params.tab);
  const tab: PackageCampaignTab = tabRaw === "kampanyalar" || tabRaw === "rapor" ? tabRaw : "paketler";
  const q = one(params.q).trim().toLocaleLowerCase("tr");
  const sube = one(params.sube).trim();
  const durum = one(params.durum).trim() || "all";
  const donem = one(params.donem).trim() || "all";
  const page = Math.max(1, Number(one(params.sayfa)) || 1);

  const kurum = await getInstitutionContext(session);
  const data = await readScopedReferenceData(kurum.scope);
  const branches = data.settings.branches.map((b) => ({ id: b.id, name: b.name }));
  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? id;
  const activePackages = (data.packages ?? []).filter((p) => p.status === "active");
  const samplePrice = activePackages[0]?.price30Min;
  const canWrite = kurum.scope.mode === "single";
  const isSuperAdmin = session.role === "SUPER_ADMIN";

  const packageMatches = (p: Package): boolean => {
    if (q && !`${p.title} ${p.displayId ?? ""}`.toLocaleLowerCase("tr").includes(q)) return false;
    if (sube && p.applicableBranchIds?.length && !p.applicableBranchIds.includes(sube)) return false;
    if (durum === "active" && p.status !== "active") return false;
    if (durum === "archived" && p.status !== "archived") return false;
    if (donem === "genel" && p.termLabel) return false;
    if ((donem === "guz" || donem === "yaz") && p.termLabel !== donem) return false;
    return true;
  };
  const campaignMatches = (c: DiscountCampaign): boolean => {
    if (q && !`${c.name} ${c.displayId ?? ""}`.toLocaleLowerCase("tr").includes(q)) return false;
    if (sube) {
      const multi = (c.applicableBranchIds ?? []).filter(Boolean);
      const scoped = c.branchId || multi.length > 0;
      if (scoped && c.branchId !== sube && !multi.includes(sube)) return false;
    }
    // Silinmiş kampanya yalnız "Silinmiş" filtresinde listelenir (rapor/geçmiş aynen okunur).
    if (durum === "deleted") return Boolean(c.deletedAt);
    if (c.deletedAt) return false;
    if (durum === "active" && !c.active) return false;
    if (durum === "archived" && c.active) return false;
    return true;
  };

  const filteredPackages = (data.packages ?? []).filter(packageMatches);
  const filteredCampaigns = (data.discountCampaigns ?? []).filter(campaignMatches);
  const listCount = tab === "kampanyalar" ? filteredCampaigns.length : filteredPackages.length;
  const totalPages = Math.max(1, Math.ceil(listCount / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedPackages = filteredPackages.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const pagedCampaigns = filteredCampaigns.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const report =
    tab === "rapor"
      ? buildCampaignReport(data.students, data.discountCampaigns ?? [], data.packages, branchName, {
          campaignId: one(params.rkampanya) || undefined,
          branchId: one(params.rsube) || undefined,
          fromDate: one(params.rfrom) || undefined,
          toDate: one(params.rto) || undefined,
        })
      : [];

  return (
    <div>
      <KurumScopeNote scope={kurum.scope} />
      <AssistantPageContext entity={{ kind: "page", label: "Paketler" }} />
      <PageHeader
        title="Paketler & Kampanyalar"
        description="Öğrenci kaydında seçilebilecek ders paketlerini ve indirim kampanyalarını yönetin — 30/40/50 dk fiyatlandırma, çakışma kuralları ve yararlanıcı raporu."
        actions={
          canWrite && isSuperAdmin && tab === "paketler" ? (
            <Link
              href="/panel/paketler/yeni"
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-primary)] px-3.5 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)]"
            >
              <Plus className="h-4 w-4" /> Yeni Paket
            </Link>
          ) : null
        }
      />
      <PackageCampaignTabs
        tab={tab}
        branches={branches}
        totalCount={listCount}
        page={safePage}
        pageSize={PAGE_SIZE}
        totalPages={totalPages}
        showTermFilter={tab === "paketler"}
      >
        {tab === "paketler" ? (
          <PackageManager
            packages={pagedPackages}
            students={data.students}
            canWrite={canWrite}
            canDeletePackages={canWrite && canRunCriticalActions(session.role)}
            branches={branches}
            isSuperAdmin={isSuperAdmin}
          />
        ) : tab === "kampanyalar" ? (
          <DiscountCampaignManager
            campaigns={pagedCampaigns}
            branches={branches}
            canWrite={canWrite}
            isSuperAdmin={isSuperAdmin}
            samplePrice={samplePrice}
          />
        ) : (
          <CampaignReportView
            entries={report}
            campaigns={(data.discountCampaigns ?? []).map((c) => ({
              id: c.id,
              name: c.deletedAt ? `${c.name} (silindi)` : c.name,
              displayId: c.displayId,
            }))}
            branches={branches}
          />
        )}
      </PackageCampaignTabs>
    </div>
  );
}

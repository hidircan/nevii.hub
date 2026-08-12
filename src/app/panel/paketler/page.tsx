import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext, readScopedData } from "@/lib/institution/context";
import { KurumScopeNote } from "@/components/kurum-scope-note";
import { AssistantPageContext } from "@/components/ai/assistant-page-context";
import { PageHeader } from "@/components/ui";
import { PackageManager } from "@/components/package-manager";
import { DiscountCampaignManager } from "@/components/discount-campaign-manager";

export const dynamic = "force-dynamic";

/**
 * Paket listesi — oluşturma `/panel/paketler/yeni`.
 */
export default async function PackagesPage() {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/paketler");
  }
  if (session.role !== "SCHOOL_ADMIN" && session.role !== "SUPER_ADMIN") {
    redirect("/panel");
  }

  const kurum = await getInstitutionContext(session);
  const data = await readScopedData(kurum.scope);
  const activePackages = (data.packages ?? []).filter((p) => p.status === "active");
  const samplePrice = activePackages[0]?.price30Min;
  const canWrite = kurum.scope.mode === "single";

  return (
    <div>
      <KurumScopeNote scope={kurum.scope} />
      <AssistantPageContext entity={{ kind: "page", label: "Paketler" }} />
      <PageHeader
        title="Paketler"
        description="Öğrenci kaydında seçilebilecek ders paketlerini yönetin — 30/40/50 dk süreye göre fiyatlandırma."
        actions={
          canWrite ? (
            <Link
              href="/panel/paketler/yeni"
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-primary)] px-3.5 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)]"
            >
              <Plus className="h-4 w-4" /> Yeni Paket
            </Link>
          ) : null
        }
      />
      <PackageManager packages={data.packages ?? []} students={data.students} canWrite={canWrite} />
      <div className="mt-6">
        <DiscountCampaignManager
          campaigns={data.discountCampaigns ?? []}
          canWrite={canWrite}
          samplePrice={samplePrice}
        />
      </div>
    </div>
  );
}

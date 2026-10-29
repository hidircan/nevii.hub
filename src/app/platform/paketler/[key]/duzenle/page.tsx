import { notFound } from "next/navigation";
import { EmptyState } from "@/components/ui";
import { requireHyperAdminPage } from "@/lib/platform/session";
import { getCatalogOverview } from "@/lib/platform/commercial-catalog";
import { PackageEditor } from "@/components/platform/package-editor";

export const dynamic = "force-dynamic";

/**
 * Paket düzenleme ekranı — listedeki gizli formun yerini alır.
 * Düzenlenen her zaman TASLAKTIR (yoksa ilk kayıtta açılır); yayınlanan
 * katalog bu ekrandan değişmez, mevcut abonelikler snapshot ile korunur.
 */
export default async function PackageEditPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const session = await requireHyperAdminPage(`/platform/paketler/${key}/duzenle`);
  const res = await getCatalogOverview(session);
  if (!res.ok) return <EmptyState title="Katalog yüklenemedi" description={res.error.message} />;
  const working = res.data.draft ?? res.data.published;
  const plan = working.plans.find((p) => p.key === key);
  if (!plan) notFound();
  return (
    <PackageEditor
      initial={{
        mode: "edit",
        plan,
        modules: working.modules,
        publishedVersion: res.data.publishedVersion,
        draftVersion: res.data.draftVersion,
        usageCount: res.data.usage[key] ?? 0,
        renameAllowed: !plan.builtin && (res.data.usage[key] ?? 0) === 0,
      }}
    />
  );
}

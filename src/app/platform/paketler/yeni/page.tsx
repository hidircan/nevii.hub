import { EmptyState } from "@/components/ui";
import { requireHyperAdminPage } from "@/lib/platform/session";
import { getCatalogOverview } from "@/lib/platform/commercial-catalog";
import { PackageEditor } from "@/components/platform/package-editor";

export const dynamic = "force-dynamic";

/** Yeni paket ekranı — düzenleme ekranıyla aynı bileşen, boş form. */
export default async function PackageNewPage() {
  const session = await requireHyperAdminPage("/platform/paketler/yeni");
  const res = await getCatalogOverview(session);
  if (!res.ok) return <EmptyState title="Katalog yüklenemedi" description={res.error.message} />;
  const working = res.data.draft ?? res.data.published;
  return (
    <PackageEditor
      initial={{
        mode: "new",
        plan: {
          key: "",
          label: "",
          description: "",
          status: "active",
          builtin: false,
          legacy: false,
          limits: { students: 100, users: 3, branches: 1 },
          includedModules: [],
          pricing: "list",
          basePriceMonthlyMinor: 0,
          basePriceYearlyMinor: 0,
          pricePublished: false,
        },
        modules: working.modules,
        publishedVersion: res.data.publishedVersion,
        draftVersion: res.data.draftVersion,
        usageCount: 0,
        renameAllowed: true,
      }}
    />
  );
}

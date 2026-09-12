import { redirect } from "next/navigation";
import { PageHeader, EmptyState } from "@/components/ui";
import { requireSessionContext } from "@/lib/auth/session";
import { getOwnInstitutionFeatures } from "@/lib/platform/service";
import { FeatureToggles } from "@/components/platform/feature-toggles";

export const dynamic = "force-dynamic";

export default async function PanelKurumOzelliklerPage() {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/ayarlar/ozellikler");
  }
  if (session.role === "HYPER_ADMIN") redirect("/platform");
  if (session.role !== "SUPER_ADMIN" && session.role !== "SCHOOL_ADMIN") redirect("/panel");

  const result = await getOwnInstitutionFeatures(session);
  if (!result.ok) {
    return <EmptyState title="Özellikler yüklenemedi" description={result.error.message} />;
  }
  const role = session.role;

  return (
    <div>
      <PageHeader
        title="Kurum özellikleri"
        description="Modül aç/kapa. Kapalı modül API mutasyonları da reddedilir. Kurum müdürü kritik bayrakları değiştiremez."
      />
      <FeatureToggles
        features={result.data.features}
        endpoint="/api/v1/institution/features"
        targetLabel={result.data.tenant?.name ?? session.tenantId}
        actorRole={role}
      />
    </div>
  );
}

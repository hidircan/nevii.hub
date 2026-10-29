import { PageHeader, EmptyState } from "@/components/ui";
import { requireRecruitmentPage } from "@/lib/recruitment/page-context";
import { getSettingsTool } from "@/lib/recruitment/tools";
import { getInstitutionInfo } from "@/lib/recruitment/institution";
import { defaultKvkkText } from "@/lib/recruitment/constants";
import { runWithTenantAsync } from "@/lib/tenant-context";
import { SettingsForm } from "@/components/recruitment/settings-form";
import { CopyLink } from "@/components/recruitment/copy-link";

export const dynamic = "force-dynamic";

export default async function IkSettingsPage() {
  const { ctx, allMode } = await requireRecruitmentPage("/panel/ik/ayarlar");
  if (allMode) return <EmptyState title="Tek bir kurum seçin" />;
  const [res, inst] = await Promise.all([runWithTenantAsync(ctx.tenantId, () => getSettingsTool(ctx)), getInstitutionInfo(ctx.tenantId)]);
  if (!res.ok) return <EmptyState title="Ayarlar yüklenemedi" description={res.error.message} />;
  return (
    <>
      <PageHeader title="İK ayarları" description="Kariyer sayfası, KVKK metni, bildirimler ve değerlendirme kriterleri." />
      <div className="mb-6 max-w-2xl"><CopyLink path={`/kariyer/${res.data.careerSlug}`} label="Kariyer sayfası" /></div>
      <SettingsForm settings={res.data.settings} defaultKvkk={defaultKvkkText(inst.name)} />
    </>
  );
}

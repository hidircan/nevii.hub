import { PageHeader, EmptyState } from "@/components/ui";
import { requireHyperAdminPage } from "@/lib/platform/session";
import { getSiteSocialMeta } from "@/lib/platform/site-social";
import { SiteSocialManager } from "@/components/platform/site-social-manager";
import { getSiteMobileAppsMeta } from "@/lib/platform/site-mobile-apps";
import { SiteMobileAppsManager } from "@/components/platform/site-mobile-apps-manager";
import { getSiteContentMeta } from "@/lib/platform/site-content-overrides";
import { SiteContentManager } from "@/components/platform/site-content-manager";
import { getSiteContent, SITE_LOCALES } from "@/lib/site-locales";

export const dynamic = "force-dynamic";

export default async function SiteSettingsPage() {
  const session = await requireHyperAdminPage("/platform/site-ayarlari");
  const [social, apps, content] = await Promise.all([
    getSiteSocialMeta(session),
    getSiteMobileAppsMeta(session),
    getSiteContentMeta(session),
  ]);
  if (!social.ok) return <EmptyState title="Site ayarları yüklenemedi" description={social.error.message} />;
  if (!apps.ok) return <EmptyState title="Site ayarları yüklenemedi" description={apps.error.message} />;
  if (!content.ok) return <EmptyState title="Site ayarları yüklenemedi" description={content.error.message} />;
  const defaults = Object.fromEntries(
    SITE_LOCALES.map((l) => {
      const c = getSiteContent(l.code);
      const flat: Record<string, string> = {};
      for (const f of content.data.fields) {
        const [a, b] = f.path.split(".");
        const v = b === undefined ? (c as unknown as Record<string, unknown>)[a!] : ((c as unknown as Record<string, Record<string, unknown>>)[a!]?.[b!]);
        if (typeof v === "string") flat[f.path] = v;
      }
      return [l.code, flat];
    })
  ) as Record<(typeof SITE_LOCALES)[number]["code"], Record<string, string>>;
  return (
    <div className="space-y-4">
      <PageHeader
        title="Site ayarları"
        description="Herkese açık sitede görünen metinler ve bağlantılar — yalnız platform sahibi değiştirebilir."
      />
      <SiteContentManager overrides={content.data.overrides} fields={content.data.fields} defaults={defaults} />
      <SiteSocialManager
        initial={social.data.links}
        networks={[...social.data.networks]}
        labels={social.data.labels}
      />
      <SiteMobileAppsManager initial={apps.data.links} resolved={apps.data.resolved} />
    </div>
  );
}

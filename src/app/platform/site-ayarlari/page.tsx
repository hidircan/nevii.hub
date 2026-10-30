import { PageHeader, EmptyState } from "@/components/ui";
import { requireHyperAdminPage } from "@/lib/platform/session";
import { getSiteSocialMeta } from "@/lib/platform/site-social";
import { SiteSocialManager } from "@/components/platform/site-social-manager";
import { getSiteMobileAppsMeta } from "@/lib/platform/site-mobile-apps";
import { SiteMobileAppsManager } from "@/components/platform/site-mobile-apps-manager";
import { getSiteContentMeta, SITE_CONTENT_KEY } from "@/lib/platform/site-content-overrides";
import { SiteContentManager } from "@/components/platform/site-content-manager";
import { ALWAYS_VISIBLE, getSitePageMeta, SITE_LINK_FIELDS, SITE_LIST_DEFS, SITE_PAGE_KEY, SITE_SECTIONS } from "@/lib/platform/site-page";
import { SiteLinksPanel, SiteListsPanel, SiteScopeNote, SiteSectionsPanel, SiteSettingsTabs } from "@/components/platform/site-page-manager";
import { PolicyVersionsPanel } from "@/components/platform/policy-versions-panel";
import { listPolicyVersions } from "@/lib/platform/store-ext";
import { PLATFORM_SCOPE_ID } from "@/lib/platform/policy-version-log";
import { getSiteContent, SITE_DEFAULT_LINKS, SITE_LOCALES } from "@/lib/site-locales";

export const dynamic = "force-dynamic";

function environmentLabel(): string {
  const env = process.env.VERCEL_ENV;
  if (env === "production") return "Canlı (neviihub.com)";
  if (env === "preview") return "Önizleme (Preview)";
  return `Yerel geliştirme (${process.env.STORE_MODE ?? "json"})`;
}

export default async function SiteSettingsPage() {
  const session = await requireHyperAdminPage("/platform/site-ayarlari");
  const [social, apps, content, page, pageVersions, contentVersions] = await Promise.all([
    getSiteSocialMeta(session),
    getSiteMobileAppsMeta(session),
    getSiteContentMeta(session),
    getSitePageMeta(session),
    listPolicyVersions(PLATFORM_SCOPE_ID, SITE_PAGE_KEY),
    listPolicyVersions(PLATFORM_SCOPE_ID, SITE_CONTENT_KEY),
  ]);
  if (!social.ok) return <EmptyState title="Site ayarları yüklenemedi" description={social.error.message} />;
  if (!apps.ok) return <EmptyState title="Site ayarları yüklenemedi" description={apps.error.message} />;
  if (!content.ok) return <EmptyState title="Site ayarları yüklenemedi" description={content.error.message} />;
  if (!page.ok) return <EmptyState title="Site ayarları yüklenemedi" description={page.error.message} />;
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
  const { settings } = page.data;
  const { email, phone, address } = getSiteContent("tr").contactInfo;
  return (
    <div className="space-y-4">
      <PageHeader
        title="Site ayarları"
        description="Herkese açık ana sayfanın içeriği ve düzeni — yalnız platform sahibi değiştirebilir."
      />
      <SiteScopeNote environment={environmentLabel()} />
      <SiteSettingsTabs
        tabs={[
          { id: "sections", label: "Bölümler", node: <SiteSectionsPanel initial={settings} sections={[...SITE_SECTIONS]} alwaysVisible={ALWAYS_VISIBLE} /> },
          { id: "texts", label: "Metinler ve SEO", node: <SiteContentManager overrides={content.data.overrides} fields={content.data.fields} defaults={defaults} /> },
          { id: "lists", label: "Listeler", node: <SiteListsPanel defs={SITE_LIST_DEFS} initial={settings.lists} defaults={page.data.defaults} /> },
          { id: "links", label: "Bağlantılar ve iletişim", node: <SiteLinksPanel initial={settings} fields={SITE_LINK_FIELDS} defaults={SITE_DEFAULT_LINKS} defaultContact={{ email, phone, address }} /> },
          {
            id: "channels",
            label: "Sosyal medya ve mağazalar",
            node: (
              <div className="space-y-4">
                <SiteSocialManager initial={social.data.links} networks={[...social.data.networks]} labels={social.data.labels} />
                <SiteMobileAppsManager initial={apps.data.links} resolved={apps.data.resolved} />
              </div>
            ),
          },
          { id: "versions", label: "Sürümler", node: <PolicyVersionsPanel scope="platform" versions={[...pageVersions, ...contentVersions].slice(0, 40)} draftKeys={[]} currentValues={{}} /> },
        ]}
      />
    </div>
  );
}

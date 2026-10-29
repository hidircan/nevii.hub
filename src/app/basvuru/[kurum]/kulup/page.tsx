import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { resolveCareerTenant, getInstitutionInfo } from "@/lib/recruitment/institution";
import { listPublicClubs } from "@/lib/club-applications";
import { CareerLogo } from "@/components/recruitment/career-logo";
import { ClubApplicationPortal } from "@/components/club-application-form";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ kurum: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const tenant = await resolveCareerTenant((await params).kurum);
  return tenant
    ? { title: `Grup dersi başvurusu — ${tenant.name}`, description: `${tenant.name} grup dersleri (kulüpler) için online başvuru.` }
    : { title: "Grup dersi başvurusu" };
}

const DEFAULT_KVKK = (name: string) =>
  `Veri sorumlusu ${name}'dir. Bu formda paylaştığınız ad, doğum tarihi/yaş, iletişim ve eğitim geçmişi bilgileri yalnızca başvurunuzu değerlendirmek ve sizinle iletişime geçmek amacıyla, açık rızanıza dayanarak işlenir; üçüncü kişilerle paylaşılmaz. Başvurunuz sonuçlandıktan sonra makul süre saklanır. 6698 sayılı KVKK kapsamındaki haklarınız için kurumla iletişime geçebilirsiniz.`;

/**
 * 2026-10-07 — Herkese açık, kuruma özel GRUP DERSİ başvuru portalı (oturum gerekmez; panel kabuğundan bağımsız).
 * Marka: kurum adı/logo/telefonu `getInstitutionInfo`, renk/font uygulamanın tema altyapısından (kod sabiti yok).
 * Liste yalnız bu kurumun başvuruya açık kulüpleri — öğretmen/üye/yönetim notu verisi istemciye hiç gönderilmez.
 */
export default async function ClubApplicationPage({ params, searchParams }: Props) {
  const tenant = await resolveCareerTenant((await params).kurum);
  if (!tenant) notFound();
  const sp = await searchParams;
  const preselect = typeof sp.kulup === "string" ? sp.kulup.slice(0, 80) : undefined;
  const source = typeof sp.kaynak === "string" ? sp.kaynak.slice(0, 80) : undefined;
  const [institution, clubs, kvkkText, brandColor] = await Promise.all([
    getInstitutionInfo(tenant.tenantId),
    listPublicClubs(tenant.tenantId),
    (async () => {
      try {
        const { getCurrentConsentTextVersion } = await import("@/lib/kvkk-consent");
        return (await getCurrentConsentTextVersion(tenant.tenantId, "kvkk_general"))?.bodyText;
      } catch {
        return undefined;
      }
    })(),
    // Kurumun NeviiOS'ta KENDİ ayarladığı birincil marka rengi (platform varsayılanıysa uygulama teması kalır).
    (async () => {
      try {
        const { resolveSetting } = await import("@/lib/platform/resolve");
        const r = await resolveSetting({ tenantId: tenant.tenantId }, "institution.colorPrimary");
        const v = typeof r?.effectiveValue === "string" ? r.effectiveValue.trim() : "";
        return r && (r.sourceScope === "tenant" || r.sourceScope === "branch") && /^#[0-9a-fA-F]{6}$/.test(v) ? v : undefined;
      } catch {
        return undefined;
      }
    })(),
  ]);
  const logo =
    institution.logoUrl && (institution.logoUrl.startsWith("data:image/") || institution.logoUrl.startsWith("https://"))
      ? institution.logoUrl
      : undefined;

  return (
    <div
      className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]"
      style={brandColor ? ({ "--color-primary": brandColor } as React.CSSProperties) : undefined}
    >
      <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)]/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4 sm:px-6">
          <CareerLogo logoUrl={logo} name={institution.name} />
          <span className="min-w-0">
            <span className="block truncate text-base font-semibold">{institution.name}</span>
            <span className="block text-xs text-[var(--color-text-muted)]">Grup dersi başvurusu</span>
          </span>
          {institution.phone ? (
            <a href={`tel:${institution.phone.replace(/\s/g, "")}`} className="ml-auto hidden text-sm font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)] sm:block">
              {institution.phone}
            </a>
          ) : null}
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-6 max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-primary)]">Grup dersleri</p>
          <h1 className="mt-2 text-3xl font-bold leading-tight sm:text-4xl">Birlikte çalmak, birlikte öğrenmek.</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-[var(--color-text-muted)]">
            Size uygun grubu seçin, bilgilerinizi bırakın; kurumumuz sizinle iletişime geçsin.
          </p>
        </div>
        <ClubApplicationPortal
          slug={tenant.slug}
          institutionName={institution.name}
          institutionPhone={institution.phone}
          clubs={clubs}
          preselectClubId={preselect}
          kvkkText={kvkkText?.trim() || DEFAULT_KVKK(institution.name)}
          source={source}
        />
      </main>
      <footer className="border-t border-[var(--color-border)] py-6 text-center text-xs text-[var(--color-text-muted)]">
        {institution.name} · Kişisel verileriniz KVKK kapsamında korunur · Nevii Hub ile hazırlanmıştır
      </footer>
    </div>
  );
}

import Link from "@/components/link";
import { MarketingShell, PageHero } from "@/components/site/marketing-shell";
import { LEGAL_PAGES } from "@/lib/marketing/legal-links";
import { pageMetadata } from "@/lib/marketing/seo";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata("/hukuk", "Sözleşmeler ve Yasal Metinler", "NeviiHub abonelik sözleşmesi, KVKK aydınlatma metni, gizlilik, iptal ve iade koşulları ile diğer yasal metinler.");

export default function LegalIndexPage() {
  const all = [...LEGAL_PAGES.map((l) => ({ href: `/hukuk/${l.slug}`, title: l.title })), { href: "/gizlilik", title: "Gizlilik Politikası" }, { href: "/kullanim-kosullari", title: "Kullanım Koşulları" }, { href: "/hesap-silme-talebi", title: "Hesap Silme Talebi" }];
  return (
    <MarketingShell>
      <PageHero eyebrow="Yasal" title="Sözleşmeler ve yasal metinler" lead="Hizmetimizin koşullarını, verilerinizin nasıl işlendiğini ve haklarınızı açıkça anlatıyoruz." />
      <ul className="mx-auto grid max-w-4xl gap-3 px-6 py-14 sm:grid-cols-2">
        {all.map((l) => (
          <li key={l.href}><Link href={l.href} className="nh-lift block rounded-2xl border border-slate-200 p-5 font-semibold text-slate-900 hover:border-amber-300">{l.title}</Link></li>
        ))}
      </ul>
    </MarketingShell>
  );
}

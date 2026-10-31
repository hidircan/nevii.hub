import Link from "@/components/link";
import { JsonLd, LeadBand, MarketingShell, PageHero } from "@/components/site/marketing-shell";
import { FEATURE_GROUPS, FEATURES } from "@/lib/marketing/features";
import { breadcrumb, pageMetadata } from "@/lib/marketing/seo";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata(
  "/ozellikler",
  "Tüm Özellikler: Eğitim Kurumu Yönetim Yazılımı",
  "Ders programı, yoklama, telafi, online başvuru, sözleşme, tahsilat, finans özeti, hakediş, bordro, raporlar ve yapay zekâ: NeviiHub'ın tüm modülleri."
);

export default function FeaturesPage() {
  return (
    <MarketingShell>
      <JsonLd data={breadcrumb([{ name: "Ana sayfa", path: "/" }, { name: "Özellikler", path: "/ozellikler" }])} />
      <PageHero eyebrow="Özellikler" title="Bir eğitim kurumunun ihtiyaç duyduğu her şey, tek platformda" lead="Programdan tahsilata, başvurudan raporlamaya kadar bütün işleriniz aynı veriyle çalışır. Her modülün ayrıntısını inceleyin." />
      <div className="mx-auto max-w-6xl space-y-12 px-6 py-16">
        {FEATURE_GROUPS.map((group) => (
          <section key={group} className="nh-view-up">
            <h2 className="text-2xl font-semibold tracking-tight">{group}</h2>
            <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.filter((f) => f.group === group).map((f) => (
                <li key={f.slug}>
                  <Link href={`/ozellikler/${f.slug}`} className="nh-lift flex h-full flex-col rounded-2xl border border-slate-200 p-6 shadow-sm hover:border-amber-300">
                    <span className="text-xs font-semibold text-amber-700">{f.screen}</span>
                    <span className="mt-1.5 text-lg font-semibold text-slate-900">{f.title}</span>
                    <span className="mt-2 text-sm leading-relaxed text-slate-600">{f.summary}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <LeadBand title="Hangi modül size lazım, birlikte bakalım" source="ozellikler" />
    </MarketingShell>
  );
}

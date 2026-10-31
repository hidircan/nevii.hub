import Link from "@/components/link";
import { JsonLd, LeadBand, MarketingShell, PageHero } from "@/components/site/marketing-shell";
import { SECTORS } from "@/lib/marketing/sectors";
import { breadcrumb, pageMetadata } from "@/lib/marketing/seo";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata(
  "/sektorler",
  "Sektörlere Göre Çözümler: Kurs ve Okul Yönetim Yazılımı",
  "Müzik okulu, dans, yoga ve pilates, dil kursu, etüt merkezi, spor akademisi, sanat atölyesi ve kodlama kursları için yönetim yazılımı."
);

export default function SectorsPage() {
  return (
    <MarketingShell>
      <JsonLd data={breadcrumb([{ name: "Ana sayfa", path: "/" }, { name: "Sektörler", path: "/sektorler" }])} />
      <PageHero eyebrow="Sektörler" title="Hangi alanda eğitim verirseniz verin" lead="Ders verdiğiniz her yerde program, yoklama, telafi, tahsilat ve hakediş vardır. NeviiHub bu işleri sektörünüzün işleyişine göre düzenler." />
      <ul className="mx-auto grid max-w-6xl gap-4 px-6 py-16 sm:grid-cols-2 lg:grid-cols-3">
        {SECTORS.map((s) => (
          <li key={s.slug} className="nh-view-up">
            <Link href={`/sektorler/${s.slug}`} className="nh-lift flex h-full flex-col rounded-2xl border border-slate-200 p-6 shadow-sm hover:border-amber-300">
              <span className="text-lg font-semibold text-slate-900">{s.name}</span>
              <span className="mt-1 text-sm text-slate-500">{s.short}</span>
              <span className="mt-3 text-sm leading-relaxed text-slate-600">{s.summary}</span>
            </Link>
          </li>
        ))}
      </ul>
      <LeadBand title="Sektörünüz listede yok mu? Yine de konuşalım" source="sektorler" />
    </MarketingShell>
  );
}

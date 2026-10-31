import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { MarketingShell, PageHero } from "@/components/site/marketing-shell";
import { PrintButton } from "@/components/site/print-button";
import { LEGAL_PAGES } from "@/lib/marketing/legal-links";
import { pageMetadata } from "@/lib/marketing/seo";
import { getEffectiveDocs } from "@/lib/saas-billing/legal-doc-store";
import { cachePublic } from "@/lib/platform/public-cache";

export const dynamic = "force-dynamic";

const readDocs = cachePublic(getEffectiveDocs, "legal-docs");

type Props = { params: Promise<{ slug: string }> };

async function load(slug: string) {
  const page = LEGAL_PAGES.find((l) => l.slug === slug);
  if (!page) return null;
  const doc = (await readDocs()).find((d) => d.id === page.docId);
  return doc?.bodyText ? { page, doc } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const r = await load((await params).slug);
  // Yayımlanmamış metin arama sonuçlarına girmez.
  return r ? pageMetadata(`/hukuk/${r.page.slug}`, r.doc.title, r.doc.about.slice(0, 155), { noindex: r.doc.draft }) : {};
}

export default async function LegalDocPage({ params }: Props) {
  const r = await load((await params).slug);
  if (!r) notFound();
  return (
    <MarketingShell>
      <PageHero eyebrow="Yasal metin" title={r.doc.title} lead={r.doc.about} crumbs={[{ href: "/hukuk", label: "Yasal metinler" }]}>
        <div className="mt-6"><PrintButton title={r.doc.title} text={r.doc.bodyText ?? ""} /></div>
      </PageHero>
      <article className="mx-auto max-w-3xl px-6 py-12">
        <p className="mb-6 text-sm text-slate-500">
          {r.doc.draft ? "Bu metin hazırlık sürümüdür; yürürlükteki sürüm satın alma adımında sunulur." : `Yürürlükteki sürüm: ${r.doc.version}`}
        </p>
        <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-slate-800">{r.doc.bodyText}</div>
      </article>
    </MarketingShell>
  );
}

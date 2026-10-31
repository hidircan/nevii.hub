import type { CSSProperties, ReactNode } from "react";
import { resolveSitePage } from "@/lib/platform/site-page";
import { SiteFooter, SiteHeader } from "./sections";
import { PointerGlow } from "./pointer-glow";
import { CallMeForm } from "./call-me-form";
import Link from "@/components/link";

/** Veri bloğu; içerik kodda olsa da `<` kaçırılır. */
export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}

/** Özellik, sektör, blog ve hukuk sayfalarının ortak iskeleti: ana sayfayla aynı üst menü ve altbilgi. */
export async function MarketingShell({ children }: { children: ReactNode }) {
  const { c } = await resolveSitePage("tr");
  return (
    <div className="nh-site min-h-screen bg-white text-slate-900" style={{ "--text-primary": "#0f172a" } as CSSProperties}>
      <PointerGlow />
      <SiteHeader c={c} />
      <main id="icerik">{children}</main>
      <SiteFooter c={c} />
    </div>
  );
}

export function PageHero({ eyebrow, title, lead, crumbs, children }: { eyebrow: string; title: string; lead: string; crumbs?: { href: string; label: string }[]; children?: ReactNode }) {
  return (
    <section className="relative mt-3 overflow-hidden bg-[#5c3d00] px-6 py-14 text-white sm:py-20" style={{ "--text-primary": "#ffffff" } as CSSProperties}>
      <div aria-hidden className="nh-drift pointer-events-none absolute -right-1/4 -top-1/4 h-[130%] w-[80%] rounded-full opacity-50 blur-3xl" style={{ background: "radial-gradient(closest-side, #a56a00, transparent)" }} />
      <div className="relative mx-auto max-w-4xl">
        {crumbs ? (
          <nav aria-label="Konum" className="mb-5 flex flex-wrap gap-2 text-sm text-white/70">
            {crumbs.map((c) => (
              <span key={c.href} className="flex gap-2">
                <Link href={c.href} className="hover:text-white hover:underline">{c.label}</Link>
                <span aria-hidden>/</span>
              </span>
            ))}
          </nav>
        ) : null}
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-300">{eyebrow}</p>
        <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">{title}</h1>
        <p className="mt-5 max-w-3xl text-lg leading-relaxed text-white/80">{lead}</p>
        {children}
      </div>
    </section>
  );
}

/** Her ayrıntı sayfasının sonu: dene, demo iste veya numaranı bırak. */
export function LeadBand({ title, source }: { title: string; source: string }) {
  return (
    <section className="bg-[#fbf8f2] px-6 py-16">
      <div className="mx-auto grid max-w-5xl items-center gap-8 lg:grid-cols-2">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
          <p className="mt-3 text-base leading-relaxed text-slate-600">
            30 gün ücretsiz deneyin veya numaranızı bırakın, kurumunuza nasıl uyarlanacağını birlikte konuşalım. İlk hafta kurulumda yanınızdayız.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/deneme" className="rounded-xl bg-amber-600 px-5 py-3 text-sm font-semibold text-white hover:bg-amber-700">30 gün ücretsiz dene</Link>
            <Link href="/#fiyatlandirma" className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50">Paketleri incele</Link>
          </div>
        </div>
        <div className="rounded-3xl bg-white p-6 shadow-lg shadow-amber-900/10 ring-1 ring-amber-900/10">
          <CallMeForm source={source} />
        </div>
      </div>
    </section>
  );
}

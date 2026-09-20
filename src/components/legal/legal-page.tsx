import Link from "next/link";
import type { ReactNode } from "react";
import { getSiteConfig, orgDisplayName } from "@/lib/site-config";

/**
 * Public hukuki sayfa iskeleti — oturum GEREKTİRMEZ, arama motorlarına ve
 * uygulama mağazası incelemesine açıktır. Kurum bilgileri TEK kaynaktan
 * (`site-config.ts`); doğrulanmamış bilgi yazılmaz.
 */
export function LegalPage({
  title,
  updatedNote,
  children,
}: {
  title: string;
  updatedNote?: string;
  children: ReactNode;
}) {
  const cfg = getSiteConfig();
  return (
    <div className="min-h-screen bg-[var(--color-bg)] px-4 py-10">
      <div className="mx-auto w-full max-w-3xl">
        <Link
          href="/"
          className="mb-4 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)]"
        >
          <span aria-hidden>←</span> Ana sayfaya dön
        </Link>
        <article className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-md)] sm:p-10">
          <h1 className="text-2xl font-bold text-[var(--color-text)]">{title}</h1>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            {cfg.appName} · {orgDisplayName(cfg)}
            {cfg.effectiveDate ? ` · Yürürlük: ${cfg.effectiveDate}` : ""}
            {updatedNote ? ` · ${updatedNote}` : ""}
          </p>
          <div className="mt-6 space-y-5 text-[15px] leading-relaxed text-[var(--color-text)]">{children}</div>
          <nav aria-label="Hukuki sayfalar" className="mt-10 flex flex-wrap gap-x-6 gap-y-2 border-t border-[var(--color-border)] pt-6 text-sm">
            <Link className="text-[var(--color-primary)] hover:underline" href="/gizlilik">
              Gizlilik Politikası
            </Link>
            <Link className="text-[var(--color-primary)] hover:underline" href="/kullanim-kosullari">
              Kullanım Koşulları
            </Link>
            <Link className="text-[var(--color-primary)] hover:underline" href="/hesap-silme-talebi">
              Hesap Silme Talebi
            </Link>
          </nav>
        </article>
      </div>
    </div>
  );
}

export function LegalSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-[var(--color-text)]">{heading}</h2>
      <div className="mt-2 space-y-2 text-[var(--color-text)]">{children}</div>
    </section>
  );
}

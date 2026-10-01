import Link from "@/components/link";
import type { ReactNode } from "react";
import { CareerLogo } from "./career-logo";

/** Herkese açık kariyer sayfası kabuğu — panel kabuğundan bağımsız, kurum markalı. */
export function CareerShell({
  slug,
  institutionName,
  logoUrl,
  website,
  children,
}: {
  slug: string;
  institutionName: string;
  logoUrl?: string;
  website?: string;
  children: ReactNode;
}) {
  const showLogo = !!logoUrl && (logoUrl.startsWith("data:image/") || logoUrl.startsWith("https://") || logoUrl.startsWith("/"));
  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
      <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)]/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href={`/kariyer/${slug}`} className="flex min-w-0 items-center gap-3">
            <CareerLogo logoUrl={showLogo ? logoUrl : undefined} name={institutionName} />
            <span className="min-w-0">
              <span className="block truncate text-base font-semibold">{institutionName}</span>
              <span className="block text-xs text-[var(--color-text-muted)]">Kariyer</span>
            </span>
          </Link>
          {website ? (
            <a
              href={/^https?:\/\//.test(website) ? website : `https://${website}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] sm:block"
            >
              Web sitemiz ↗
            </a>
          ) : null}
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">{children}</main>
      <footer className="border-t border-[var(--color-border)] py-6 text-center text-xs text-[var(--color-text-muted)]">
        {institutionName} · Başvurular KVKK kapsamında korunur · Nevii Hub ile hazırlanmıştır
      </footer>
    </div>
  );
}

export function Prose({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return (
    <div className="space-y-3 text-[15px] leading-relaxed text-[color:var(--text-secondary)]">
      {blocks.map((b, i) => {
        const lines = b.split("\n");
        const isList = lines.every((l) => /^\s*[-•*]\s+/.test(l));
        if (isList) {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {lines.map((l, j) => (
                <li key={j}>{l.replace(/^\s*[-•*]\s+/, "")}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="whitespace-pre-line">
            {b}
          </p>
        );
      })}
    </div>
  );
}

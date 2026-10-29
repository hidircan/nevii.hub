import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import Link from "@/components/link";

/**
 * Rapor portalı (2026-10-14) — panel kabuğu olmayan, telefona göre sade başlık. Kurum adı metin olarak gösterilir
 * (logo okunmaz: ~79 KB/görüntüleme egress, bkz. skill performance-db-egress kural 7).
 */
export function ReportShell({
  institution,
  title,
  subtitle,
  backHref,
  children,
}: {
  institution: string;
  title: string;
  subtitle?: string;
  backHref?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-[var(--color-bg)]">
      <header className="sticky top-0 z-20 border-b border-[var(--color-border)] bg-[var(--color-surface)]/95 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center gap-2 px-4 py-3">
          {backHref ? (
            <Link
              href={backHref}
              aria-label="Geri"
              className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden />
            </Link>
          ) : null}
          <div className="min-w-0">
            <p className="truncate text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-muted)]">{institution}</p>
            <h1 className="truncate text-base font-semibold text-[var(--color-text)]">{title}</h1>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-md space-y-5 px-4 pb-8 pt-4">
        {subtitle ? <p className="text-sm text-[var(--color-text-muted)]">{subtitle}</p> : null}
        {children}
      </main>
    </div>
  );
}

export function ReportListItem({ href, title, meta, badge }: { href: string; title: string; meta: string; badge?: string }) {
  return (
    <li>
      <Link
        href={href}
        className="flex min-h-14 items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 transition hover:border-[var(--color-border-strong)]"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-[var(--color-text)]">{title}</span>
          <span className="block truncate text-xs text-[var(--color-text-muted)]">{meta}</span>
        </span>
        {badge ? (
          <span className="shrink-0 rounded-full bg-[var(--color-surface-muted)] px-2.5 py-1 text-xs font-medium text-[var(--color-text-muted)]">
            {badge}
          </span>
        ) : null}
      </Link>
    </li>
  );
}

export function ReportSectionTitle({ children, count }: { children: ReactNode; count?: number }) {
  return (
    <h2 className="flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
      {children}
      {typeof count === "number" ? (
        <span className="rounded-full bg-[var(--color-surface-muted)] px-2 py-0.5 text-[11px] tabular-nums">{count}</span>
      ) : null}
    </h2>
  );
}

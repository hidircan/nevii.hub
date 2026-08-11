import { cn, statusColor, statusLabel } from "@/lib/utils";
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

export function Badge({ status, children }: { status?: string; children?: ReactNode }) {
  return (
    <span
      className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", status && statusColor(status))}
      style={!status ? { background: "var(--color-surface-muted)", color: "var(--color-text-muted)" } : undefined}
    >
      {children ?? (status ? statusLabel(status) : null)}
    </span>
  );
}

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-sm)]",
        className
      )}
    >
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  accent = "primary",
  icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: "primary" | "success" | "warning" | "danger" | "info";
  icon?: ReactNode;
}) {
  const accents: Record<string, string> = {
    primary: "text-[var(--color-primary)]",
    success: "text-[var(--color-success)]",
    warning: "text-[var(--color-warning)]",
    danger: "text-[var(--color-danger)]",
    info: "text-[var(--color-info)]",
  };
  return (
    <Card className="relative overflow-hidden">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-[var(--color-text-muted)]">{label}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-[var(--color-text)]">{value}</p>
          {hint ? <p className="mt-1 text-xs text-[var(--color-text-muted)]">{hint}</p> : null}
        </div>
        {icon ? (
          <div className={cn("rounded-[var(--radius-md)] bg-[var(--color-surface-muted)] p-2", accents[accent])}>
            {icon}
          </div>
        ) : null}
      </div>
    </Card>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-3xl font-bold tracking-[-0.03em] text-[color:var(--text-primary)] sm:text-4xl">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm text-[color:var(--text-secondary)]">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Button({
  children,
  variant = "primary",
  className,
  type = "button",
  disabled,
  formAction,
  onClick,
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success";
  className?: string;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  formAction?: (formData: FormData) => void | Promise<void>;
  onClick?: () => void;
}) {
  const variants = {
    primary: "bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)]",
    secondary:
      "bg-[var(--color-surface)] text-[var(--color-text)] border border-[var(--color-border-strong)] hover:bg-[var(--color-surface-muted)]",
    ghost: "bg-transparent text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]",
    danger: "bg-[var(--color-danger)] text-white hover:opacity-90",
    success: "bg-[var(--color-success)] text-white hover:opacity-90",
  };
  return (
    <button
      type={type}
      disabled={disabled}
      formAction={formAction}
      onClick={onClick}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] px-3.5 py-2 text-sm font-medium transition disabled:opacity-50",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus-ring)]",
        variants[variant],
        className
      )}
    >
      {children}
    </button>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border-strong)] bg-[var(--color-surface-muted)] px-6 py-12 text-center">
      <p className="font-medium text-[var(--color-text)]">{title}</p>
      {description ? <p className="mt-1 text-sm text-[var(--color-text-muted)]">{description}</p> : null}
    </div>
  );
}

export function LoadingState({ label = "Yükleniyor…" }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-10 text-sm text-[var(--color-text-muted)]"
    >
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      {label}
    </div>
  );
}

export function ErrorState({
  title = "Bir şeyler ters gitti",
  description,
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="rounded-[var(--radius-lg)] border border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)] px-6 py-8 text-center"
    >
      <p className="font-medium text-[var(--color-danger)]">{title}</p>
      {description ? <p className="mt-1 text-sm text-[var(--color-text-muted)]">{description}</p> : null}
      {onRetry ? (
        <Button variant="secondary" className="mt-3" onClick={onRetry}>
          Tekrar dene
        </Button>
      ) : null}
    </div>
  );
}

export function FilterBar({ children, resultCount }: { children: ReactNode; resultCount?: number }) {
  return (
    <div className="mb-4 flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="flex flex-1 flex-wrap items-center gap-2">{children}</div>
      {resultCount !== undefined ? (
        <p className="whitespace-nowrap text-xs font-medium text-[var(--color-text-muted)]">
          {resultCount} sonuç
        </p>
      ) : null}
    </div>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "w-full rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-muted)] focus:ring-2 focus:ring-[var(--color-focus-ring)]/30",
        props.className
      )}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "w-full rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:ring-2 focus:ring-[var(--color-focus-ring)]/30",
        props.className
      )}
    />
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">{children}</label>;
}

/**
 * Ortak, tekrar kullanılabilir sayfalama bileşeni — sunucu bileşeni
 * sayfalarında (searchParams tabanlı) client JS gerektirmeden çalışır:
 * her buton gerçek bir `<Link>`, aktif sayfa `?page=N` ile URL'de tutulur.
 * `hrefForPage` çağıran tarafın diğer query parametrelerini (arama/filtre)
 * korumasını sağlar.
 */
export function Pagination({
  page,
  totalPages,
  hrefForPage,
}: {
  page: number;
  totalPages: number;
  hrefForPage: (page: number) => string;
}) {
  if (totalPages <= 1) return null;
  const prevDisabled = page <= 1;
  const nextDisabled = page >= totalPages;
  return (
    <nav
      aria-label="Sayfalama"
      className="mt-4 flex flex-wrap items-center justify-center gap-3 sm:justify-between"
    >
      {prevDisabled ? (
        <span className="inline-flex items-center gap-1 rounded-[var(--radius-md)] px-3 py-2 text-sm font-medium text-[var(--color-text-muted)] opacity-40">
          <ChevronLeft className="h-4 w-4" /> Önceki
        </span>
      ) : (
        <Link
          href={hrefForPage(page - 1)}
          aria-label="Önceki sayfa"
          className="inline-flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm font-medium text-[var(--color-text)] transition hover:bg-[var(--color-surface-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus-ring)]"
        >
          <ChevronLeft className="h-4 w-4" /> Önceki
        </Link>
      )}
      <p className="text-sm font-medium text-[var(--color-text-muted)]" aria-live="polite">
        Sayfa {page} / {totalPages}
      </p>
      {nextDisabled ? (
        <span className="inline-flex items-center gap-1 rounded-[var(--radius-md)] px-3 py-2 text-sm font-medium text-[var(--color-text-muted)] opacity-40">
          Sonraki <ChevronRight className="h-4 w-4" />
        </span>
      ) : (
        <Link
          href={hrefForPage(page + 1)}
          aria-label="Sonraki sayfa"
          className="inline-flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm font-medium text-[var(--color-text)] transition hover:bg-[var(--color-surface-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus-ring)]"
        >
          Sonraki <ChevronRight className="h-4 w-4" />
        </Link>
      )}
    </nav>
  );
}

/** Bir sayfa değerini geçerli, 1..totalPages aralığına kırpar. */
export function clampPage(raw: string | undefined, totalPages: number): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return 1;
  return Math.min(n, Math.max(totalPages, 1));
}

"use client";

/**
 * Shared "AI ile özetle / öner / analiz üret / yorumla" button + result
 * card, for the read-only, no-approval capabilities. One small client
 * component reused across Yoklama / Telafi / Tahsilat / Öğretmenler /
 * Öğrenciler instead of duplicating the button+card+loading+error markup
 * per screen.
 */
import { Sparkles } from "lucide-react";
import { useAiInsight, type InsightCapabilityId } from "@/hooks/useAiInsight";

export function AiInsightTrigger({
  capabilityId,
  label,
  payload,
  compact = false,
  iconOnly = false,
}: {
  capabilityId: InsightCapabilityId;
  label: string;
  payload: Record<string, unknown>;
  /** Daha küçük secondary/ghost görünüm (toolbar vb.). */
  compact?: boolean;
  /** Yalnız ikon + aria-label (liste satırları). */
  iconOnly?: boolean;
}) {
  const { text, isLoading, error, generate } = useAiInsight(capabilityId);

  return (
    <div className={compact || iconOnly ? "inline-flex flex-col items-end" : undefined}>
      <button
        type="button"
        onClick={() => void generate(payload)}
        disabled={isLoading}
        title={label}
        aria-label={label}
        className={
          iconOnly
            ? "inline-flex h-10 min-h-10 w-10 min-w-10 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)] transition hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-primary)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]"
            : compact
              ? "inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-text-muted)] transition hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)] disabled:opacity-50"
              : "inline-flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-sm font-medium text-[var(--color-text)] transition hover:border-[var(--color-primary)] disabled:opacity-50"
        }
      >
        <Sparkles className={iconOnly || compact ? "h-4 w-4" : "h-4 w-4"} />
        {iconOnly ? null : isLoading ? "AI hazırlıyor..." : label}
        {iconOnly && isLoading ? <span className="sr-only">Yükleniyor</span> : null}
      </button>

      {error ? <p className="mt-1 max-w-xs text-xs font-medium text-[var(--color-danger)]">{error}</p> : null}

      {text ? (
        <div className="mt-2 w-full max-w-md rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            AI özeti
          </p>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-text)]">{text}</p>
        </div>
      ) : null}
    </div>
  );
}

import { STAGE_LABELS, STAGE_TONES } from "@/lib/recruitment/constants";
import type { ApplicationStage } from "@/lib/recruitment/types";
import { Star } from "lucide-react";

export function StageBadge({ stage }: { stage: ApplicationStage }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STAGE_TONES[stage]}`}>{STAGE_LABELS[stage]}</span>;
}

export function Rating({ value }: { value: number | null }) {
  if (value === null || value === undefined) return <span className="text-xs text-[var(--color-text-muted)]">—</span>;
  return (
    <span className="inline-flex items-center gap-1 text-sm font-medium">
      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /> {value.toFixed(1)}
    </span>
  );
}

export function Chip({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "primary" }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${
        tone === "primary" ? "bg-[var(--color-primary-soft)] text-[var(--color-primary-soft-text)]" : "bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]"
      }`}
    >
      {children}
    </span>
  );
}

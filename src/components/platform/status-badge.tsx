import { cn } from "@/lib/utils";

export type StatusTone = "ok" | "warning" | "danger" | "neutral";

/**
 * Control room durum etiketi: metin + renk her zaman birlikte (renk tek
 * başına anlam taşımaz). Sahte "canlı" nabız animasyonu yok.
 */
export function StatusBadge({ tone, children }: { tone: StatusTone; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
        tone === "ok" && "bg-[var(--color-success-soft)] text-[var(--color-success)]",
        tone === "warning" && "bg-[var(--color-warning-soft)] text-[var(--color-warning)]",
        tone === "danger" && "bg-[var(--color-danger-soft)] text-[var(--color-danger)]",
        tone === "neutral" && "bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]"
      )}
    >
      <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

/** Altyapı durum metnini tona çevirir (bilinmeyen değer → neutral, fail-safe). */
export function toneForHealthStatus(status: string): StatusTone {
  const s = status.toLocaleLowerCase("tr");
  if (/(^|\W)(ok|healthy|ready|configured|active)(\W|$)/.test(s) || s.includes("sağlıklı") || s.includes("hazır")) return "ok";
  if (s.includes("error") || s.includes("hata") || s.includes("kritik") || s.includes("down") || s.includes("fail")) return "danger";
  if (
    s.includes("warn") ||
    s.includes("uyarı") ||
    s.includes("not_configured") ||
    s.includes("yapılandırılmadı") ||
    s.includes("eksik") ||
    s.includes("pasif")
  )
    return "warning";
  return "neutral";
}

import { cn } from "@/lib/utils";
import { PAYMENT_STATUS_INFO, type PaymentDisplayStatus } from "@/lib/payments/status";

/** Tek sözlükten (payments/status.ts) etiket + açıklama; liste ve detay aynı rengi/anlamı kullanır. */
const TONE: Record<(typeof PAYMENT_STATUS_INFO)[PaymentDisplayStatus]["tone"], string> = {
  success: "bg-[var(--color-success-soft)] text-[var(--color-success)]",
  warning: "bg-[var(--color-warning-soft)] text-[var(--color-warning)]",
  danger: "bg-[var(--color-danger-soft)] text-[var(--color-danger)]",
  info: "bg-[var(--color-info-soft)] text-[var(--color-info)]",
  muted: "bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]",
};

export function PaymentStatusBadge({ status, className }: { status: PaymentDisplayStatus; className?: string }) {
  const info = PAYMENT_STATUS_INFO[status];
  return (
    <span
      title={info.description}
      className={cn("inline-flex cursor-help items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold", TONE[info.tone], className)}
    >
      {info.label}
    </span>
  );
}

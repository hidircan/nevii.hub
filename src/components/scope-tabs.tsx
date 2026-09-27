import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * 9. tur — "hangi kayıtlar sayılıyor?" seçici (Ödemeler, Hakedişler). URL'ye
 * bağlı link grubu: yenilemede, geri/ileri'de ve paylaşılan bağlantıda korunur.
 * Seçim bir filtre DEĞİL kapsamdır; kartlar, tablo ve filtreler aynı kapsamı kullanır.
 */
export function ScopeTabs({
  label,
  items,
  active,
}: {
  label: string;
  items: { key: string; label: string; count?: number; href: string }[];
  active: string;
}) {
  return (
    <nav aria-label={label} className="inline-flex flex-wrap gap-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-1">
      {items.map((item) => {
        const selected = item.key === active;
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={selected ? "page" : undefined}
            scroll={false}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] px-3 py-1.5 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-focus-ring)]",
              selected
                ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-[var(--shadow-sm)]"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            )}
          >
            {item.label}
            {item.count !== undefined ? (
              <span
                className={cn(
                  "rounded-full px-1.5 text-[11px] tabular-nums",
                  selected ? "bg-[var(--color-primary-soft)] text-[var(--color-primary-soft-text)]" : "bg-[var(--color-surface)]"
                )}
              >
                {item.count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

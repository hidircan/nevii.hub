"use client";

/**
 * 2026-10-10 — ÖĞRENCİ DETAYI: BRANŞ SEÇİCİ.
 *
 * Çok branşlı öğrencide Bilgiler / Ödemeler / Sözleşmeler / Program ekranları aynı seçici ile tek bir branşa
 * daraltılır (`?brans=<branş kimliği>`); seçim sekme geçişlerinde korunur. "Tüm branşlar" genel bakıştır ve belirsiz
 * işlemleri (tek bir branşa uygulanması gereken yazma) yaptırmaz — o ekranlar branş seçtirir. Seçim yalnızca URL'dedir
 * (eski/bayat bir seçim kimliği sunucuda doğrulanır; tanınmayan kimlik "tüm branşlar" sayılır).
 */
import Link from "@/components/link";
import { usePathname, useSearchParams } from "next/navigation";

export type BranchSwitcherItem = { id: string; label: string; active: boolean };

export function StudentBranchSwitcher({
  items,
  unassignedCount = 0,
}: {
  items: BranchSwitcherItem[];
  /** Branşı belirtilmemiş kayıt sayısı (sözleşme/ödeme) — ayrı bir sekme olarak gösterilir. */
  unassignedCount?: number;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  if (items.length < 2) return null;
  const current = params.get("brans") ?? "";
  const known = current === "__unassigned__" || items.some((i) => i.id === current);
  const selected = known ? current : "";

  function href(brans: string): string {
    const next = new URLSearchParams(params.toString());
    if (brans) next.set("brans", brans);
    else next.delete("brans");
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  const base = "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium transition";
  const on = "border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-primary)]";
  const off = "border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)]";

  return (
    <nav aria-label="Branş seçici" className="mb-3 flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Branş</span>
      <Link href={href("")} aria-current={selected === "" ? "true" : undefined} className={`${base} ${selected === "" ? on : off}`}>
        Tüm branşlar
      </Link>
      {items.map((i) => (
        <Link key={i.id} href={href(i.id)} aria-current={selected === i.id ? "true" : undefined} className={`${base} ${selected === i.id ? on : off}`}>
          {i.label}
          {i.active ? null : <span className="text-[10px] opacity-70">(sonlandı)</span>}
        </Link>
      ))}
      {unassignedCount > 0 ? (
        <Link href={href("__unassigned__")} aria-current={selected === "__unassigned__" ? "true" : undefined} className={`${base} ${selected === "__unassigned__" ? on : off}`}>
          Branşı belirtilmemiş ({unassignedCount})
        </Link>
      ) : null}
    </nav>
  );
}

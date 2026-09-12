/**
 * P1 (2026-09-11) — menü sıra birleştirme: SAF MODÜL (server + client).
 *
 * Kurallar:
 * - Kayıtlı sıra SADECE mevcut öğeleri dizer; kayıtta olmayan (yeni
 *   eklenen) öğeler SONA eklenir — kaybolmaz.
 * - Kayıttaki ölü href'ler (kapatılan modül) sessizce düşer.
 * - Sıra ASLA erişim sağlamaz: rol filtresi render'da ayrı uygulanır
 *   (sidebar `isVisibleForRole`).
 */
export function mergeNavOrder(stored: string[] | undefined, hrefs: string[]): string[] {
  if (!stored || stored.length === 0) return [...hrefs];
  const live = new Set(hrefs);
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const href of stored) {
    if (live.has(href) && !seen.has(href)) {
      ordered.push(href);
      seen.add(href);
    }
  }
  for (const href of hrefs) {
    if (!seen.has(href)) ordered.push(href);
  }
  return ordered;
}

import { getActiveLocale } from "../i18n/locale-store";
import { relativeDayLabel } from "./date";

/** Bir tarih alanına göre öğeleri "Bugün / Dün / 24 Ağu, Pazartesi" gruplarına ayırır (en yeni önce). */
export function groupByDay<T>(items: T[], getDate: (item: T) => string | undefined): Array<{ label: string; items: T[] }> {
  const sorted = [...items].sort((a, b) => {
    const da = getDate(a);
    const db = getDate(b);
    return (db ? new Date(db).getTime() : 0) - (da ? new Date(da).getTime() : 0);
  });

  const groups: Array<{ label: string; items: T[] }> = [];
  for (const item of sorted) {
    const raw = getDate(item);
    const label = raw ? relativeDayLabel(new Date(raw)) : getActiveLocale() === "en" ? "Undated" : "Tarihsiz";
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}

/**
 * Hakediş detay ders-listesi filtreleri (saf, istemci-tarafı).
 * Ders verisi zaten yüklü olduğu için sunucuya gidilmez; dashboard local state'ten beslenir.
 */
export type PayoutLineFilterStatus = "all" | "clean" | "duration-exception" | "missing-fee-rule" | "missing-student" | "missing-branch" | "revised";

export type PayoutLineFilterCriteria = {
  /** Serbest metin: öğrenci adı + şube + enstrüman (küçük harf, trim'li eşleşme). */
  query?: string;
  /** Tek gün ("yyyy-MM-dd", dersin gün anahtarıyla eşleşir). */
  day?: string;
  /** Durum filtresi; "revised" elle düzeltilmiş satırlar. */
  status?: PayoutLineFilterStatus;
  /** Yalnız istisna rozetli satırlar (duration-exception). */
  exceptionsOnly?: boolean;
};

export type FilterablePayoutLine = {
  lessonId: string;
  lessonDate: string;
  studentName?: string;
  branchName?: string;
  instrument: string;
  issue?: string;
  original?: unknown;
};

/** "yyyy-MM-dd" gün anahtarı — toDayKey'in hafif istemci karşılığı (ISO girdiler için). */
function dayKeyOf(iso: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(iso);
  return match?.[1] ?? iso.slice(0, 10);
}

export function filterPayoutLines<T extends FilterablePayoutLine>(
  lines: T[],
  _sources: Record<string, { state: string; demo: boolean }>,
  criteria: PayoutLineFilterCriteria
): T[] {
  const q = (criteria.query ?? "").trim().toLocaleLowerCase("tr");
  const status = criteria.status ?? "all";
  return lines.filter((l) => {
    if (criteria.exceptionsOnly && l.issue !== "duration-exception") return false;
    if (status === "clean" && (l.issue !== undefined || l.original !== undefined)) return false;
    if (status === "revised" && l.original === undefined) return false;
    if (status !== "all" && status !== "clean" && status !== "revised" && l.issue !== status) return false;
    if (criteria.day && dayKeyOf(l.lessonDate) !== criteria.day) return false;
    if (q) {
      const hay = `${l.studentName ?? ""} ${l.branchName ?? ""} ${l.instrument}`.toLocaleLowerCase("tr");
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/**
 * Hakediş detay ders-listesi filtre/sıralama (saf, istemci-tarafı).
 *
 * Ders verisi zaten yüklü olduğu için sunucuya gidilmez; dashboard local
 * state'ten beslenir. Filtre → sıralama TÜM sonuç kümesine uygulanır,
 * sayfalama en son adımda kesilir (bkz. `usePagination`).
 *
 * Köken: a8e6f1af'teki `filterPayoutLines` tasarımı (query/gün/durum/
 * istisnalılar) genişletildi — tek-gün filtresi tarih aralığına (`from`/`to`)
 * yükseldi, şube/branş/yoklama/ders-türü/dahil-hariç ve sıralama eklendi.
 * `exceptionsOnly` artık yalnız süre istisnası değil, TÜM kanonik satır
 * sorunlarını (`TeacherEarningsLineIssue`) kapsar.
 *
 * Bu dosya istemci-güvenli olmalı: `teacher-payout.ts` (sunucu/DB
 * bağımlılıkları) import EDİLMEZ; gün anahtarı kuralı aşağıda aynen
 * taşınmıştır (`toDayKey` ile birebir — bkz. test).
 */

/** Durum filtresi; "revised" elle düzeltilmiş satırlar, "clean" sorunsuzlar. */
export type PayoutLineFilterStatus =
  | "all"
  | "clean"
  | "duration-exception"
  | "missing-fee-rule"
  | "missing-student"
  | "missing-branch"
  | "revised";

/** Dahil/hariç filtresi — donmuş kayıtta sonradan hariç tutulan satırlar. */
export type PayoutLineExcludeState = "all" | "included" | "excluded";

export type PayoutLineSortKey = "date-asc" | "date-desc" | "student" | "duration" | "amount";

export type PayoutLineFilterCriteria = {
  /** Serbest metin: öğrenci adı + şube + enstrüman (küçük harf, trim'li eşleşme). */
  query?: string;
  /** Tarih aralığı (kapsayıcı gün anahtarları, "yyyy-MM-dd"). */
  from?: string;
  to?: string;
  /** Haftanın günü (0=Pazar … 6=Cumartesi, İstanbul takvim günü). */
  weekday?: number;
  /** Şube adı (tam eşleşme; seçenekler yüklenen veriden üretilir). */
  branch?: string;
  /** Branş/enstrüman (tam eşleşme; seçenekler yüklenen veriden üretilir). */
  instrument?: string;
  /** Yoklama etiketi (tam eşleşme; seçenekler yüklenen veriden üretilir). */
  attendance?: string;
  /** Ders türü (`regular`/`makeup`/`trial`/`group`; seçenekler veriden üretilir). */
  lessonType?: string;
  /** Durum filtresi. */
  status?: PayoutLineFilterStatus;
  /** Yalnız kanonik satır sorunu olanlar (`issue` dolu olanlar). */
  exceptionsOnly?: boolean;
  /** Dahil/hariç durumu. */
  excludeState?: PayoutLineExcludeState;
};

export type FilterablePayoutLine = {
  lessonId: string;
  lessonDate: string;
  studentName?: string;
  branchName?: string;
  instrument: string;
  durationMinutes: number;
  amount: number;
  issue?: string;
  original?: unknown;
};

export type FilterablePayoutLineSource = {
  state?: string;
  demo?: boolean;
  excluded?: boolean;
  attendanceLabel?: string;
  lessonType?: string;
};

const PLAIN_DAY = /^\d{4}-\d{2}-\d{2}$/;
const UTC_MIDNIGHT = /^\d{4}-\d{2}-\d{2}T00:00(:00(\.0+)?)?(Z|[+-]00:?00)$/;
const HAS_OFFSET = /(Z|[+-]\d{2}:?\d{2})$/;

/**
 * ISO tarih/saat girdisinden gün anahtarı (yyyy-MM-dd) — Europe/Istanbul
 * takvimi. Sunucudaki `toDayKey` (src/lib/teacher-payout.ts) ile BİREBİR
 * aynı kural; istemcide tarayıcı saat diliminden bağımsız çalışır:
 * - "yyyy-MM-dd" ve UTC gece yarısı → yazılı gün (tarih semantiği).
 * - Ofsetli/Z'li an → İstanbul takvim günü.
 * - Ofsetsiz duvar saati → yazılı gün (sunucu `format(parseISO())` ile aynı
 *   sonuç: aynı dilimde çözümlenip biçimlenen duvar saati günü değişmez).
 */
export function payoutLineDayKey(iso: string): string {
  if (PLAIN_DAY.test(iso)) return iso;
  if (UTC_MIDNIGHT.test(iso)) return iso.slice(0, 10);
  if (HAS_OFFSET.test(iso)) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Istanbul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(iso));
    const y = parts.find((p) => p.type === "year")?.value ?? "1970";
    const m = parts.find((p) => p.type === "month")?.value ?? "01";
    const d = parts.find((p) => p.type === "day")?.value ?? "01";
    return `${y}-${m}-${d}`;
  }
  return iso.slice(0, 10);
}

/** Dersin İstanbul takvim gününe göre haftanın günü (0=Pazar … 6=Cumartesi). */
export function payoutLineWeekday(iso: string): number {
  const [y, m, d] = payoutLineDayKey(iso).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function filterPayoutLines<T extends FilterablePayoutLine>(
  lines: T[],
  sources: Record<string, FilterablePayoutLineSource | undefined>,
  criteria: PayoutLineFilterCriteria
): T[] {
  const q = (criteria.query ?? "").trim().toLocaleLowerCase("tr");
  const status = criteria.status ?? "all";
  const excludeState = criteria.excludeState ?? "all";
  const branch = (criteria.branch ?? "").trim();
  const instrument = (criteria.instrument ?? "").trim();
  const attendance = (criteria.attendance ?? "").trim();
  const lessonType = (criteria.lessonType ?? "").trim();
  return lines.filter((l) => {
    const src = sources[l.lessonId];
    if (criteria.exceptionsOnly && l.issue === undefined) return false;
    if (status === "clean" && (l.issue !== undefined || l.original !== undefined)) return false;
    if (status === "revised" && l.original === undefined) return false;
    if (status !== "all" && status !== "clean" && status !== "revised" && l.issue !== status) return false;
    if (excludeState === "included" && src?.excluded) return false;
    if (excludeState === "excluded" && !src?.excluded) return false;
    const day = payoutLineDayKey(l.lessonDate);
    if (criteria.from && day < criteria.from) return false;
    if (criteria.to && day > criteria.to) return false;
    if (criteria.weekday !== undefined && payoutLineWeekday(l.lessonDate) !== criteria.weekday) return false;
    if (branch && (l.branchName ?? "") !== branch) return false;
    if (instrument && l.instrument !== instrument) return false;
    if (attendance && (src?.attendanceLabel ?? "") !== attendance) return false;
    if (lessonType && (src?.lessonType ?? "") !== lessonType) return false;
    if (q) {
      const hay = `${l.studentName ?? ""} ${l.branchName ?? ""} ${l.instrument}`.toLocaleLowerCase("tr");
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/**
 * Kararlı sıralama — eşit birincil anahtarda tarih, en sonda benzersiz ders
 * ID'si bağlar; liste yenilendiğinde satır sırası değişmez. `date-asc`,
 * yazılı dökümle (`teacher-earnings-statement.ts`) aynı kanonik sıradır.
 */
export function sortPayoutLines<T extends FilterablePayoutLine>(lines: T[], sort: PayoutLineSortKey): T[] {
  const byId = (a: T, b: T) => a.lessonId.localeCompare(b.lessonId);
  const byDateId = (a: T, b: T) => a.lessonDate.localeCompare(b.lessonDate) || byId(a, b);
  const copy = [...lines];
  switch (sort) {
    case "date-asc":
      copy.sort((a, b) => byDateId(a, b));
      break;
    case "date-desc":
      copy.sort((a, b) => b.lessonDate.localeCompare(a.lessonDate) || byId(a, b));
      break;
    case "student":
      copy.sort((a, b) => (a.studentName ?? "").localeCompare(b.studentName ?? "", "tr") || byDateId(a, b));
      break;
    case "duration":
      copy.sort((a, b) => a.durationMinutes - b.durationMinutes || byDateId(a, b));
      break;
    case "amount":
      copy.sort((a, b) => a.amount - b.amount || byDateId(a, b));
      break;
  }
  return copy;
}

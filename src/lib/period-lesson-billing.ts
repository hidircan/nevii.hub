/**
 * P0-1 (2026-09-02 ürün kuralı DÜZELTMESİ) — ders başı ücret yöneticinin
 * girdiği/seçtiği bir alan DEĞİLDİR. Yönetici hâlâ yalnız AYLIK ücret +
 * haftalık ders sıklığı girer; sistem `derivePerLessonAmount` ile ders başı
 * karşılığını SESSİZCE türetir (referans ders adedi = haftalık × 4, sabit —
 * gerçek takvime bakmaz), ama bu YALNIZ GÖSTERİM içindir. Dönem tahsilatı
 * (2026-09-09 düzeltmesi, bkz. `computePeriodAmount`) doğrudan AYLIK
 * ÜCRETTEN, tek yuvarlamayla oranlanır: referans kadar ders içeren TAM ay
 * HER ZAMAN tam aylık ücrettir; kısa dönemler orantılı olarak az tahsil eder;
 * referanstan fazla ders içeren aylar (ör. 5 Salı) yine TAM aylık ücrettir
 * (2026-09-17 sahip kararı: ücret en fazla haftalık × 4 ders üzerinden). Bu dosyadaki her fonksiyon SAF'tır:
 * I/O yok, store/DB yazmaz, aynı girişe her zaman aynı çıkışı verir. Kayıt
 * önizlemesi, ödeme simülasyonu, sözleşme ödeme tablosu ve gerçek tahsilat
 * planı — dördü de BU dosyadan `computePeriodBillingLines`'ı çağırmalı
 * (ayrı, birbirinden bağımsız kopya hesap mantığı YOK).
 *
 * Takvim günü karşılaştırmaları HER ZAMAN Europe/Istanbul saat dilimiyle
 * yapılır (`toZonedYmd`) — çıplak UTC gün veya sunucu yerel saati YOK.
 */

import { toZonedYmd, DEFAULT_APP_TIMEZONE } from "./timezone";

/**
 * P0 (2026-09-05) — İLK TAHSİLATIN BAŞLANGIÇ GÜNÜ.
 *
 * Kayıt tarihi (`enrollmentStartDate`) ile derslerin fiilen başladığı gün
 * (`lessonStartDate`) FARKLI kavramlardır: öğrenci 5 Eylül'de kaydolup 20
 * Eylül'de derse başlayabilir. İlk tahsilat, ders başlangıcından ÖNCEKİ
 * günlerde geçen ders günlerini ASLA saymamalıdır.
 *
 * TEK KAYNAK: hem sunucu (createStudentTool) hem istemci önizlemesi
 * (new-student-form) hem sözleşme öneri hesabı bu fonksiyondan geçer —
 * ayrı/paralel bir "hangi tarihten başlayacağız" mantığı YAZILMAZ.
 * `lessonStartDate` yoksa kayıt tarihine düşülür (eski kayıtlar için
 * davranış AYNEN korunur).
 */
export function resolveLessonStartDay(input: {
  lessonStartDate?: string | null;
  enrollmentStartDate?: string | null;
  fallbackToday: string;
}): string {
  const lesson = (input.lessonStartDate ?? "").slice(0, 10);
  if (lesson) return lesson;
  const enrollment = (input.enrollmentStartDate ?? "").slice(0, 10);
  return enrollment || input.fallbackToday;
}

/** Referans aylık ders adedi — HER ZAMAN haftalık sıklık × 4, gerçek takvime bakmaz (sabit). */
export function referenceMonthlyLessonCount(weeklyLessonCount: number): number {
  return Math.max(1, Math.round(weeklyLessonCount)) * 4;
}

/**
 * Ders başı sistem karşılığı — yöneticiden ASLA doğrudan alınmaz, aylık
 * ücret ve haftalık sıklıktan türetilir: aylık ücret ÷ (haftalık × 4).
 * Tam sayı TL'ye yuvarlanır (kuruş/float aritmetiği yok). Bu, dönem
 * tahsilatı hesaplarken kullanılacak TEK ders-başı tutarıdır — bir client
 * bu değeri doğrudan göndermeye çalışsa bile (ör. sahte `perLessonNetFee`)
 * sunucu ASLA güvenmez, her zaman burada yeniden hesaplar.
 */
export function derivePerLessonAmount(monthlyFee: number, weeklyLessonCount: number): number {
  if (!Number.isFinite(monthlyFee) || monthlyFee < 0) return 0;
  const referenceCount = referenceMonthlyLessonCount(weeklyLessonCount);
  return Math.round(monthlyFee / referenceCount);
}

/**
 * P0-1 (2026-09-09 KÖK NEDEN DÜZELTMESİ) — bir dönemin tutarı.
 *
 * ÖNCEDEN: `billableLessonCount × derivePerLessonAmount(...)`. Bu ÇİFT
 * YUVARLAMA idi — önce aylık ücret ders başına bölünüp tam sayıya
 * yuvarlanıyor, sonra o yuvarlanmış değer ders sayısıyla yeniden
 * çarpılıyordu. Yuvarlama artığı ders sayısı kadar BÜYÜYOR ve TAM aylara
 * sızıyordu: 5.950 TL / haftada 2 ders → 5.950/8 = 743,75 → 744 → 8×744 =
 * **5.952 TL**. Aynı sapma haftalık 1/2/3/4 dersin HEPSİNDE +2 TL'dir.
 *
 * ARTIK: tutar doğrudan onaylı AYLIK ÜCRETTEN, TEK bir yuvarlama ile
 * oranlanır. `billableLessonCount === referans` olduğunda sonuç matematiksel
 * olarak TAM `monthlyFee`'dir — yani "normal aylık taksit her zaman
 * sözleşmedeki aylık ücrettir" değişmezi aritmetiğin kendisinden gelir, ek
 * bir düzeltme/telafi adımından DEĞİL. Kısmi dönemler orantılıdır ve tek
 * yuvarlama içerir (en fazla 0,5 TL, ve o dönemin KENDİ orantısından gelir —
 * diğer aylara YAYILMAZ).
 *
 * `perLessonNetFee` artık yalnız GÖSTERİM değeridir (velinin/personelin
 * "ders başı ne kadar" sorusunun cevabı); hiçbir toplam ondan türetilmez.
 */
export function computePeriodAmount(
  monthlyFee: number,
  weeklyLessonCount: number,
  billableLessonCount: number
): number {
  if (!Number.isFinite(monthlyFee) || monthlyFee < 0) return 0;
  if (billableLessonCount <= 0) return 0;
  const referenceCount = referenceMonthlyLessonCount(weeklyLessonCount);
  // Sahip kararı (2026-09-17): bir ayda ücretlendirilen ders sayısı EN FAZLA
  // referanstır (haftada 1 ders → 4). Takvim 5 ders çıkarsa da ücret 4 ders
  // üzerinden (= tam aylık ücret) hesaplanır; aylık ücret hiç aşılmaz.
  const chargedLessonCount = Math.min(billableLessonCount, referenceCount);
  // Sahip kararı (2026-09-16): küsurat AŞAĞI yuvarlanır — 4.950 × 3/4 = 3.712,5 → 3.712
  // (Math.round yukarı yuvarlayıp 3.713 yazıyordu). `-Math.round(-x)` yarımı aşağı alır.
  return -Math.round(-(monthlyFee * chargedLessonCount) / referenceCount);
}

export type BillableLessonType = "regular" | "makeup" | "trial" | "group";
export type BillableLessonStatus = "scheduled" | "in_progress" | "completed" | "cancelled" | "no_show";

/** Ücretlendirilebilir hesap motorunun ihtiyaç duyduğu minimal ders alanları. */
export interface BillableLessonCandidate {
  id: string;
  studentId: string;
  /** ISO 8601 zaman damgası. */
  startAt: string;
  type: BillableLessonType;
  status: BillableLessonStatus;
  /** ÖNCELİK 4 — kurumun kapalı günü olarak işaretlenmiş ders. */
  opsClosedFlag?: boolean;
  /** Yeni — açık ücretsiz/ikram ders bayrağı (schema'da henüz YOK, bkz. rapor §A.7). */
  isFreeLesson?: boolean;
}

/** `MakeupRequest`'in hesap motoru için gereken minimal alanları. */
export interface MakeupLinkCandidate {
  sourceLessonId: string;
  status: string;
}

/** Öğrencinin dondurulmuş olduğu takvim-günü aralığı (Europe/Istanbul, ikisi de dahil). */
export interface FrozenRange {
  start: string; // yyyy-MM-dd
  end: string; // yyyy-MM-dd
}

export interface BillableLessonContext {
  /** `resolveExcludedMakeupSourceLessonIds` ile üretilir — telafiye giden kaynak dersler. */
  excludedSourceLessonIds: ReadonlySet<string>;
  frozenRanges: FrozenRange[];
}

function lessonCalendarDay(lesson: Pick<BillableLessonCandidate, "startAt">): string {
  return toZonedYmd(new Date(lesson.startAt), DEFAULT_APP_TIMEZONE);
}

function isWithinFrozenRange(day: string, ranges: FrozenRange[]): boolean {
  return ranges.some((r) => day >= r.start && day <= r.end);
}

/**
 * Bir `MakeupRequest` listesinden, telafiye giden (henüz iptal/expired
 * olmamış) KAYNAK derslerin id kümesini çıkarır — `lesson-ops.ts`'teki
 * `existingMk` filtresiyle (status !== "cancelled" && status !== "expired")
 * BİREBİR aynı kural, yeni bir kavram icat edilmedi.
 */
export function resolveExcludedMakeupSourceLessonIds(
  makeupRequests: MakeupLinkCandidate[]
): Set<string> {
  const excluded = new Set<string>();
  for (const m of makeupRequests) {
    if (m.status === "cancelled" || m.status === "expired") continue;
    excluded.add(m.sourceLessonId);
  }
  return excluded;
}

/**
 * Tek bir dersin ücretlendirilebilir olup olmadığı — TEK kaynak fonksiyon.
 * Kurallar (P0-1 spec §C):
 * - deneme dersi: ücretsiz
 * - iptal edilmiş ders: ücretsiz
 * - kurumun kapalı günü: ücretsiz
 * - açık ücretsiz/ikram bayrağı: ücretsiz
 * - telafiye giden KAYNAK ders: ücretsiz (yerini telafi dersi alır, çift
 *   sayım olmaz — telafi dersinin kendisi `type:"makeup"` olarak zaten
 *   normal şekilde sayılır)
 * - dondurma aralığına düşen ders: ücretsiz
 * - normal planlı ders / geldi / gelmedi / mazeretli: ücretli (bunların
 *   hiçbiri bu fonksiyona ayrı bir statü olarak girmez — ops-flag'ler
 *   yoklama/telafi operasyonudur, faturalandırmayı ETKİLEMEZ; yalnız temel
 *   `status`/`type`/bayraklar faturalandırmayı belirler)
 */
export function isBillableLesson(
  lesson: BillableLessonCandidate,
  context: BillableLessonContext
): boolean {
  if (lesson.type === "trial") return false;
  if (lesson.status === "cancelled") return false;
  if (lesson.opsClosedFlag) return false;
  if (lesson.isFreeLesson) return false;
  if (context.excludedSourceLessonIds.has(lesson.id)) return false;
  if (isWithinFrozenRange(lessonCalendarDay(lesson), context.frozenRanges)) return false;
  return true;
}

/** Bir öğrencinin, verilen (dahil) takvim-günü aralığındaki ücretlendirilebilir ders sayısı. */
export function countBillableLessonsInRange(
  lessons: BillableLessonCandidate[],
  studentId: string,
  rangeStartDay: string,
  rangeEndDay: string,
  context: BillableLessonContext
): number {
  return lessons.filter((l) => {
    if (l.studentId !== studentId) return false;
    const day = lessonCalendarDay(l);
    if (day < rangeStartDay || day > rangeEndDay) return false;
    return isBillableLesson(l, context);
  }).length;
}

export type PeriodKind = "start" | "full" | "end" | "single";

export interface PeriodBoundary {
  periodStart: string; // yyyy-MM-dd
  periodEnd: string; // yyyy-MM-dd
  kind: PeriodKind;
}

function daysInMonth(year: number, month1to12: number): number {
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Bir kayıt/sözleşme aralığını (enrollmentStart/End, ikisi de dahil) takvim
 * aylarına böler — ilk ve son ay kısmi (gerçek başlangıç/bitiş tarihine
 * kenetlenir), aradakiler tam ay. Aynı takvim ayına düşerse TEK "single"
 * dönem döner. Saf, I/O yok.
 */
export function splitEnrollmentIntoMonthlyPeriods(
  enrollmentStartDayRaw: string,
  enrollmentEndDayRaw: string
): PeriodBoundary[] {
  // Regresyon (2026-09-05) — kök neden: bu fonksiyonun tipi "yyyy-MM-dd"
  // vaat eder ama hiçbir çağıran (contract-panel.tsx `toIsoDateOrNull` →
  // `Date.toISOString()`) buna GERÇEKTEN uymuyordu — tam bir ISO datetime
  // ("2026-09-17T00:00:00.000Z") gönderiliyordu. `enrollmentStartDay`/
  // `enrollmentEndDay` İLK ve SON dönemin `periodStart`/`periodEnd`'ine
  // OLDUĞU GİBİ yazılıyordu (aşağıda), bu da `formatPeriodLabel`'in
  // `ymdParts` ile "T00:00:00.000Z" son ekini `Number()`'a verip NaN
  // üretmesine yol açıyordu ("İlk Tahsilat" ve son dönem satırlarında
  // "NaN–30 Eylül 2026" gibi). Kaynakta (burada, TEK noktada) "yyyy-MM-dd"e
  // normalize edilir — hem ISO datetime hem zaten-düz tarih için güvenli.
  const enrollmentStartDay = enrollmentStartDayRaw.slice(0, 10);
  const enrollmentEndDay = enrollmentEndDayRaw.slice(0, 10);
  if (enrollmentEndDay < enrollmentStartDay) {
    throw new Error("enrollmentEndDay, enrollmentStartDay'den önce olamaz");
  }
  const startYear = Number(enrollmentStartDay.slice(0, 4));
  const startMonth = Number(enrollmentStartDay.slice(5, 7));
  const endYear = Number(enrollmentEndDay.slice(0, 4));
  const endMonth = Number(enrollmentEndDay.slice(5, 7));

  const periods: PeriodBoundary[] = [];
  let cursorYear = startYear;
  let cursorMonth = startMonth;

  while (cursorYear < endYear || (cursorYear === endYear && cursorMonth <= endMonth)) {
    const isFirst = cursorYear === startYear && cursorMonth === startMonth;
    const isLast = cursorYear === endYear && cursorMonth === endMonth;

    const monthStart = `${cursorYear}-${pad2(cursorMonth)}-01`;
    const monthEnd = `${cursorYear}-${pad2(cursorMonth)}-${pad2(daysInMonth(cursorYear, cursorMonth))}`;

    const periodStart = isFirst ? enrollmentStartDay : monthStart;
    const periodEnd = isLast ? enrollmentEndDay : monthEnd;

    let kind: PeriodKind;
    if (isFirst && isLast) kind = "single";
    else if (isFirst) kind = "start";
    else if (isLast) kind = "end";
    else kind = "full";

    periods.push({ periodStart, periodEnd, kind });

    cursorMonth += 1;
    if (cursorMonth > 12) {
      cursorMonth = 1;
      cursorYear += 1;
    }
  }
  return periods;
}

export interface PeriodBillingLine {
  periodStart: string;
  periodEnd: string;
  kind: PeriodKind;
  billableLessonCount: number;
  perLessonNetFee: number;
  /** billableLessonCount × perLessonNetFee — tam sayı TL, kuruş/float aritmetiği YOK. */
  autoCalculatedAmount: number;
  /**
   * true ise `billableLessonCount` GERÇEK ders kayıtlarından değil,
   * haftalık sıklık × takvim günü PROJEKSİYONUNDAN geldi (henüz ders
   * programı oluşturulmamış — bkz. `estimatePeriodBillingLines`). Sözleşme/
   * gerçek tahsilat planı bu bayrağı ASLA true görmemeli; yalnız kayıt
   * önizlemesi/ödeme simülasyonu için.
   */
  estimated: boolean;
}

/** İki motorun (gerçek sayım + projeksiyon) ORTAK girdi doğrulaması — tek yerde. */
function assertMonthlyFeeBasis(input: { monthlyFee: number; weeklyLessonCount: number }): void {
  if (!Number.isInteger(input.monthlyFee) || input.monthlyFee < 0) {
    throw new Error("monthlyFee tam sayı ve negatif olmayan bir TL tutarı olmalı");
  }
  if (!Number.isInteger(input.weeklyLessonCount) || input.weeklyLessonCount <= 0) {
    throw new Error("weeklyLessonCount pozitif tam sayı olmalı");
  }
}

export interface ComputePeriodBillingLinesInput {
  enrollmentStartDay: string; // yyyy-MM-dd
  enrollmentEndDay: string; // yyyy-MM-dd
  /**
   * Tam sayı TL — SÖZLEŞMEDE ONAYLANAN aylık ücret. Tüm dönem tutarlarının
   * TEK doğruluk kaynağıdır (bkz. `computePeriodAmount`). Ders başı tutar
   * bundan TÜRETİLİR; tersi DEĞİL — çağıranın önceden yuvarlanmış bir ders
   * başı tutar göndermesi (eski `perLessonNetFee` girdisi) 5.950→5.952
   * çift-yuvarlama hatasının kaynağıydı, o yüzden artık kabul EDİLMİYOR.
   */
  monthlyFee: number;
  /** Referans ders adedinin (haftalık × 4) tabanı — oranlama bunun üzerinden yapılır. */
  weeklyLessonCount: number;
  lessons: BillableLessonCandidate[];
  studentId: string;
  makeupRequests: MakeupLinkCandidate[];
  frozenRanges?: FrozenRange[];
}

/**
 * TEK, paylaşılan hesap motoru — kayıt önizlemesi, ödeme simülasyonu,
 * sözleşme ödeme tablosu ve gerçek tahsilat planının HEPSİ bu fonksiyonu
 * çağırmalı. Saf: aynı girdi → aynı çıktı, store/DB'ye dokunmaz.
 */
export function computePeriodBillingLines(
  input: ComputePeriodBillingLinesInput
): PeriodBillingLine[] {
  assertMonthlyFeeBasis(input);
  const excludedSourceLessonIds = resolveExcludedMakeupSourceLessonIds(input.makeupRequests);
  const frozenRanges = input.frozenRanges ?? [];
  const periods = splitEnrollmentIntoMonthlyPeriods(input.enrollmentStartDay, input.enrollmentEndDay);

  return periods.map((p) => {
    const billableLessonCount = countBillableLessonsInRange(
      input.lessons,
      input.studentId,
      p.periodStart,
      p.periodEnd,
      { excludedSourceLessonIds, frozenRanges }
    );
    return {
      periodStart: p.periodStart,
      periodEnd: p.periodEnd,
      kind: p.kind,
      billableLessonCount,
      perLessonNetFee: derivePerLessonAmount(input.monthlyFee, input.weeklyLessonCount),
      autoCalculatedAmount: computePeriodAmount(input.monthlyFee, input.weeklyLessonCount, billableLessonCount),
      estimated: false,
    };
  });
}

function inclusiveDayCount(startDay: string, endDay: string): number {
  const start = new Date(`${startDay}T00:00:00Z`).getTime();
  const end = new Date(`${endDay}T00:00:00Z`).getTime();
  return Math.round((end - start) / 86_400_000) + 1;
}

/**
 * P0-C (2026-09-02) — kullanıcı TAM OLARAK hangi haftalık günlerde ders
 * alınacağını seçtiyse (`lessonDays`, `Date.getUTCDay()` ile AYNI 0=Pazar..
 * 6=Cumartesi kodlaması — kodda zaten yaygın `dayOfWeek` konvansiyonu,
 * bkz. `AvailabilityWindow`), dönem içinde bu günlerin KAÇ KEZ geçtiğini
 * TAM OLARAK sayar — `estimateBillableLessonCount`in oransal
 * PROJEKSİYONUNDAN daha isabetlidir. Yalnızca İSTEMCİ ÖNİZLEMESİNİ
 * (new-student-form.tsx `recomputePreview`) daha isabetli göstermek için;
 * sunucudaki resmi `autoSuggestedAmount`/audit edilmiş
 * `estimateBillableLessonCount` formülünü DEĞİŞTİRMEZ/yerine geçmez —
 * o formülün P0-1'de bilinçli olarak sabitlenen davranışı korunur.
 */
export function countExactWeekdayLessons(periodStartDay: string, periodEndDay: string, weekdays: number[]): number {
  if (weekdays.length === 0 || periodEndDay < periodStartDay) return 0;
  const set = new Set(weekdays);
  let count = 0;
  const cursor = new Date(`${periodStartDay}T00:00:00Z`);
  const end = new Date(`${periodEndDay}T00:00:00Z`);
  while (cursor <= end) {
    if (set.has(cursor.getUTCDay())) count++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

/**
 * Henüz GERÇEK bir ders programı (LessonSeries/Lesson) yokken — tipik olarak
 * kayıt anında — bir dönemdeki ücretlendirilebilir ders sayısının
 * PROJEKSİYONU: haftalık ders sıklığı × dönem gün sayısı / 7, en yakın tam
 * sayıya yuvarlanır. Hangi haftanın günlerinde ders olacağı henüz
 * belirlenmediği için bu KESİN bir sayı DEĞİLDİR — yalnızca öngörü.
 */
export function estimateBillableLessonCount(
  periodStartDay: string,
  periodEndDay: string,
  weeklyLessonCount: number
): number {
  if (!Number.isInteger(weeklyLessonCount) || weeklyLessonCount <= 0) return 0;
  const days = inclusiveDayCount(periodStartDay, periodEndDay);
  // P0-1 (2026-09-02) — `derivePerLessonAmount`in referans ders adedine
  // (haftalık×4) ORANTILI: TAM bir takvim ayı süren ilk dönem, her zaman
  // TAM referans adedini (ve dolayısıyla TAM aylık ücreti) üretir — eski
  // "haftalık×gün/7" formülü 30/31 günlük aylarda haftada 2 ders için
  // referanstan (8) FARKLI (9) bir sayı üretiyordu, bu tutarsızdı.
  const [y, m] = periodStartDay.slice(0, 7).split("-").map(Number) as [number, number];
  const daysInThatMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const reference = referenceMonthlyLessonCount(weeklyLessonCount);
  return Math.max(0, Math.round((reference * days) / daysInThatMonth));
}

export interface EstimatePeriodBillingLinesInput {
  enrollmentStartDay: string;
  enrollmentEndDay: string;
  /** Bkz. `ComputePeriodBillingLinesInput.monthlyFee` — aynı tek doğruluk kaynağı. */
  monthlyFee: number;
  weeklyLessonCount: number;
}

/** `computePeriodBillingLines`'ın projeksiyon karşılığı — bkz. `estimateBillableLessonCount`. */
export function estimatePeriodBillingLines(input: EstimatePeriodBillingLinesInput): PeriodBillingLine[] {
  assertMonthlyFeeBasis(input);
  const periods = splitEnrollmentIntoMonthlyPeriods(input.enrollmentStartDay, input.enrollmentEndDay);
  return periods.map((p) => {
    const billableLessonCount = estimateBillableLessonCount(p.periodStart, p.periodEnd, input.weeklyLessonCount);
    return {
      periodStart: p.periodStart,
      periodEnd: p.periodEnd,
      kind: p.kind,
      billableLessonCount,
      perLessonNetFee: derivePerLessonAmount(input.monthlyFee, input.weeklyLessonCount),
      autoCalculatedAmount: computePeriodAmount(input.monthlyFee, input.weeklyLessonCount, billableLessonCount),
      estimated: true,
    };
  });
}

export type ComputePeriodBillingPreviewInput = ComputePeriodBillingLinesInput;

/**
 * Kayıt önizlemesi ve ödeme simülasyonu için TEK giriş noktası: öğrencinin
 * GERÇEK ders kaydı varsa (`lessons` doluysa) `computePeriodBillingLines`
 * ile KESİN sayar; hiç gerçek ders yoksa (yeni kayıt, program henüz
 * oluşturulmadı) `estimatePeriodBillingLines` ile PROJEKSİYON üretir —
 * ikisi de aynı `PeriodBillingLine[]` biçimini döner, `estimated` bayrağıyla
 * ayrılır. Sözleşme tablosu/gerçek tahsilat planı BUNU DEĞİL, doğrudan
 * `computePeriodBillingLines`'ı kullanmalı (asla tahmine dayalı tutar
 * üretmemeli).
 */
export function computePeriodBillingPreview(input: ComputePeriodBillingPreviewInput): PeriodBillingLine[] {
  const hasRealLessons = input.lessons.some((l) => l.studentId === input.studentId);
  if (hasRealLessons) return computePeriodBillingLines(input);
  return estimatePeriodBillingLines({
    enrollmentStartDay: input.enrollmentStartDay,
    enrollmentEndDay: input.enrollmentEndDay,
    monthlyFee: input.monthlyFee,
    weeklyLessonCount: input.weeklyLessonCount,
  });
}

const PERIOD_LABELS: Record<PeriodKind, string> = {
  start: "Başlangıç dönemi",
  full: "Tam dönem",
  end: "Bitiş dönemi",
  single: "Tek kısa dönem",
};

export function periodKindLabel(kind: PeriodKind): string {
  return PERIOD_LABELS[kind];
}

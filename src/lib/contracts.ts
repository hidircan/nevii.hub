/**
 * FEATURE A — versiyonlu öğrenci kayıt sözleşmesi + ödeme planı.
 *
 * Gerçek PDF render/yazdırma/ıslak-imza-tarama-yükleme burada YOKTUR — her
 * sözleşme versiyonu tam olarak bir `DocumentInstance` (kind=
 * "student_enrollment_contract") ile 1:1 eşleşir ve o iş MEVCUT
 * `src/lib/documents/index.ts` fonksiyonlarına (createDocumentInstance,
 * markDocumentPrinted, uploadSignedDocumentFile) devredilir. Bu modül
 * yalnızca: sözleşmeye özgü versiyon zinciri, para/taksit hesabı (integer,
 * float KARŞILAŞTIRMASI YOK) ve `StudentContract` satırının CRUD'unu tutar.
 *
 * Taksitler AYRI bir tablo DEĞİL — mevcut `Payment` satırlarına
 * `contractId`/`installmentSequence` ile bağlanır (bkz. prisma/schema.prisma
 * Payment yorumu) — bu sayede mevcut tahsilat/makbuz/hatırlatma/gecikme
 * motorları taksitler için OTOMATİK, değişiklik gerekmeden çalışır.
 * Bilinçli olarak `upsertMonthlyPlanPayment`'ı YENİDEN KULLANMAZ: o,
 * öğrencinin AÇIK UÇLU süregelen aylık faturalama motorudur — burdaki
 * taksitler ise BELİRLİ bir sözleşmenin SABİT SAYIDA taksitidir.
 *
 * STORE_MODE paritesi: documents/index.ts ile AYNI desen — isDbMode ?
 * Prisma : JSON dosyası (data/student-contracts.json).
 */

import path from "path";
import { isDbMode, resolveDataDir } from "./config";
import { paymentMethodLabelTr, uid } from "./utils";
import { resolveFirstCollectionMergeThreshold, shouldMergeFirstCollection } from "./types";
import {
  findMissingRequiredContractPlaceholders,
  selectEligibleActiveTemplateForContract,
} from "./contract-template-schema";
import { formatDateTr } from "./timezone";
import { logger } from "./logger";
import type {
  CollectionsSettings,
  ContractAnnexSnapshot,
  ContractDataSnapshot,
  ContractInstallmentSnapshot,
  ContractInstallmentView,
  ContractStatus,
  ContractType,
  Payment,
  SocialMediaScope,
  StudentContract,
} from "./types";

const FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "student-contracts.json");
export const STUDENT_CONTRACTS_FILE = FILE;

type Stored = StudentContract & { tenantId: string };

async function loadAll(): Promise<Stored[]> {
  try {
    const fs = await import("fs/promises");
    return JSON.parse(await fs.readFile(FILE, "utf8")) as Stored[];
  } catch {
    return [];
  }
}

async function saveAll(rows: Stored[]) {
  const fs = await import("fs/promises");
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(rows, null, 2));
}

function toPublic(r: Stored): StudentContract {
  const { tenantId: _t, ...pub } = r;
  void _t;
  return pub;
}

// ---------------------------------------------------------------------------
// Para / taksit hesabı — TAMAMEN INTEGER (TL), asla float karşılaştırması yok.
// ---------------------------------------------------------------------------

/**
 * 2026-2027 sözleşme kaynağı — sabit seçenek listesinden (ör. ders süresi
 * 30/40/50 dk) BİRİNİN işaretlendiği, diğerlerinin boş kaldığı düz metin
 * checkbox satırı üretir. Renderer `{{#each}}/{{#if}}` DESTEKLEMEDİĞİNDEN
 * (bkz. documents/index.ts) gerçek bir dinamik seçim listesi tek bir düz
 * metin alanına indirgenir. `selected` seçeneklerden HİÇBİRİYLE
 * eşleşmiyorsa (ör. eski/serbest veri) hiçbiri işaretlenmez ve gerçek değer
 * satırın sonuna açıkça eklenir — sessizce yanlış bir seçenek işaretlenmez.
 */
export function formatCheckboxOptionsText(options: number[], selected: number | undefined, unitLabel: string): string {
  const line = options.map((o) => `${o === selected ? "☑" : "☐"} ${o} ${unitLabel}`).join("    ");
  if (selected !== undefined && !options.includes(selected)) {
    return `${line}    (kayıtlı değer: ${selected} ${unitLabel})`;
  }
  return line;
}

/** durationMonths ay sonrasının aynı gün-of-month'u — ay sonu taşması ayın son gününe kenetlenir. */
function addMonthsClamped(isoDate: string, months: number): string {
  const d = new Date(isoDate);
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const lastDayOfTargetMonth = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDayOfTargetMonth));
  return target.toISOString();
}

export type ContractEndDatePreference = "month_end" | "date_based";

/**
 * Sözleşme bitişi (2026-09-15, sahip kararı): başlangıç ayı sözleşmenin 1.
 * ayıdır ve son taksit N. aydadır (10 aylık Eylül sözleşmesi → son taksit
 * Haziran). Müşteri bitişi seçer:
 *  - "month_end" (varsayılan): N. ayın takvim sonu — 10 Eylül + 10 → 30 Haziran.
 *  - "date_based": başlangıçtan itibaren TAM N ay — 10 Eylül + 10 → 9 Temmuz.
 *    Taksit sayısı yine N'dir: N. aydan taşan günler son taksite eklenir
 *    (bkz. `foldBillingLinesIntoContractMonths`), Temmuz'a ayrı taksit açılmaz.
 * Eski "başlangıç + N ay, aynı gün" (10 Temmuz) hem bir gün fazlaydı hem
 * fazladan bir Temmuz taksiti üretiyordu. TEK kaynak — contract-panel.tsx
 * aynısını yansıtır. yyyy-MM-dd girer, yyyy-MM-dd döner — saat dilimi kayması yok.
 */
export function computeContractEndDate(
  startDay: string,
  durationMonths: number,
  preference: ContractEndDatePreference = "month_end"
): string {
  const start = new Date(`${startDay}T00:00:00Z`);
  const y = start.getUTCFullYear();
  const m = start.getUTCMonth();
  if (preference === "date_based") {
    // N ay sonrasının aynı günü (ay sonuna kenetlenir) − 1 gün.
    const lastDay = new Date(Date.UTC(y, m + durationMonths + 1, 0)).getUTCDate();
    return new Date(Date.UTC(y, m + durationMonths, Math.min(start.getUTCDate(), lastDay) - 1)).toISOString().slice(0, 10);
  }
  return new Date(Date.UTC(y, m + durationMonths, 0)).toISOString().slice(0, 10);
}

/**
 * "date_based" bitişte sözleşme N. ayı birkaç gün aşar (10 Eylül → 9 Temmuz).
 * Taksit sayısı N'yi aşmasın diye N. aydan sonraki dönemler N. ayın satırına
 * eklenir: son satır "1 Haziran 2027 – 9 Temmuz 2027" olur. "month_end"
 * bitişte hiçbir dönem N. ayı aşmadığından liste aynen döner.
 */
export function foldBillingLinesIntoContractMonths(
  lines: import("./period-lesson-billing").PeriodBillingLine[],
  startDay: string,
  durationMonths: number
): import("./period-lesson-billing").PeriodBillingLine[] {
  const lastMonthEnd = computeContractEndDate(startDay, durationMonths, "month_end");
  const inside = lines.filter((l) => l.periodStart <= lastMonthEnd);
  const tail = lines.filter((l) => l.periodStart > lastMonthEnd);
  if (tail.length === 0 || inside.length === 0) return lines;
  const last = inside[inside.length - 1]!;
  inside[inside.length - 1] = {
    ...last,
    kind: inside.length === 1 ? "single" : "end",
    periodEnd: tail[tail.length - 1]!.periodEnd,
    billableLessonCount: last.billableLessonCount + tail.reduce((s, l) => s + l.billableLessonCount, 0),
    autoCalculatedAmount: last.autoCalculatedAmount + tail.reduce((s, l) => s + l.autoCalculatedAmount, 0),
  };
  return inside;
}

/** Aynı ay içinde `day`'e (ayın son gününe kenetlenerek) kaydırır — hedef ay `isoDate`'in ayıdır. */
function setDayOfMonthClamped(isoDate: string, day: number): string {
  const d = new Date(isoDate);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString();
}

// ---------------------------------------------------------------------------
// Faz 2 — ödeme politikası: kredi kartı ayın 1–5'i, havale/EFT/nakit en geç
// 15'i (Nilüfer Acar kurumu 2026–2027 politikası, PROJECT.md/şablon §4).
// Kurum ayarları (School.collectionsSettings) YALNIZCA yeni sözleşmeleri
// etkiler — eski sözleşmelerin contractDataSnapshot'ı asla değişmez.
// ---------------------------------------------------------------------------

const DEFAULT_CARD_WINDOW_END_DAY = 5;
const DEFAULT_BANK_CASH_DUE_DAY = 15;

export type ContractPaymentDueRule = {
  windowStartDay: number;
  windowEndDay: number;
  ruleText: string;
  isCard: boolean;
};

/** `paymentMethod === "credit_card"` ise kart penceresi, aksi halde (transfer/cash/tanımsız) havale/nakit kuralı. */
export function resolveContractPaymentDueRule(
  paymentMethod: string | undefined,
  policy?: Pick<CollectionsSettings, "contractCardWindowEndDay" | "contractBankCashDueDay">
): ContractPaymentDueRule {
  if (paymentMethod === "credit_card") {
    const endDay = policy?.contractCardWindowEndDay ?? DEFAULT_CARD_WINDOW_END_DAY;
    return {
      windowStartDay: 1,
      windowEndDay: endDay,
      isCard: true,
      ruleText:
        endDay === DEFAULT_CARD_WINDOW_END_DAY
          ? "Kredi kartı ödemeleri her ayın 1–5’i arasında yapılmalıdır."
          : `Kredi kartı ödemeleri her ayın 1–${endDay}’i arasında yapılmalıdır.`,
    };
  }
  // Sahibi onaylı NİHAİ karar (2026-08-29): pencere 1-15 DAHİL — "6'sından 15'ine"
  // veya "en geç 15'ine kadar" YORUMLARI DEĞİL. windowStartDay hep 1'dir (aşağıdaki
  // pencere-içi kontrolü zaten 1 ile dueDay arasını kapsayıcı sayar — davranış
  // DEĞİŞMEDİ, yalnızca metin sahibi onaylı tam ifadeye hizalandı).
  const dueDay = policy?.contractBankCashDueDay ?? DEFAULT_BANK_CASH_DUE_DAY;
  return {
    windowStartDay: 1,
    windowEndDay: dueDay,
    isCard: false,
    ruleText:
      dueDay === DEFAULT_BANK_CASH_DUE_DAY
        ? "Havale/EFT/nakit ödemeleri her ayın 1–15’i arasında yapılmalıdır."
        : `Havale/EFT/nakit ödemeleri her ayın 1–${dueDay}’i arasında yapılmalıdır.`,
  };
}

/**
 * `remaining` tutarını `count` eşit(e en yakın) taksite böler — kalan kuruş/TL
 * farkı İLK taksitlere +1 olarak dağıtılır, böylece toplam HER ZAMAN tam
 * `remaining`'e eşittir (float yuvarlama hatası YOK, tamamı integer).
 */
export function buildInstallmentSchedule(input: {
  totalContractAmount: number;
  depositAmount?: number;
  installmentCount: number;
  firstDueDate: string;
  paymentMethod?: string;
  paymentPolicy?: Pick<CollectionsSettings, "contractCardWindowEndDay" | "contractBankCashDueDay">;
}): ContractInstallmentSnapshot[] {
  const remaining = input.totalContractAmount - (input.depositAmount ?? 0);
  const count = input.installmentCount;
  const base = Math.floor(remaining / count);
  const remainder = remaining % count;
  const rule = resolveContractPaymentDueRule(input.paymentMethod, input.paymentPolicy);
  const rows: ContractInstallmentSnapshot[] = [];
  for (let i = 0; i < count; i++) {
    const amount = base + (i < remainder ? 1 : 0);
    // İlk taksit personelin girdiği tarihtir (istisna gerekçesiyle pencere dışı olabilir,
    // bkz. createContract). Sonraki taksitler her zaman kurum kuralının gününe (kart:
    // pencere sonu, havale/nakit: son gün) normalize edilir — sessizce geçersiz bir
    // vade OLUŞMAZ.
    const dueDate =
      i === 0 ? input.firstDueDate : setDayOfMonthClamped(addMonthsClamped(input.firstDueDate, i), rule.windowEndDay);
    rows.push({
      sequence: i + 1,
      dueDate,
      amount,
      paymentMethod: input.paymentMethod,
    });
  }
  const sum = rows.reduce((s, r) => s + r.amount, 0);
  if (sum !== remaining) {
    // Savunma amaçlı — integer aritmetiği bu dalı asla tetiklememeli.
    throw new Error("Taksit planı toplamı sözleşme tutarına eşit değil (iç hesap hatası).");
  }
  return rows;
}

/**
 * P0-1D (hazırlık — bkz. per-lesson-billing-and-attendance-risk-scope.md
 * §A.5) — `buildInstallmentSchedule`'ın per-lesson karşılığı: SABİT SAYIDA
 * eşit taksit YERİNE, `period-lesson-billing.ts`'in ürettiği her takvim-ayı
 * döneminin KENDİ (ders sayısına göre değişen) tutarını bir taksit satırı
 * olarak kullanır. İlk dönem manuel düzeltilmişse (bkz.
 * `first-payment-adjustment.ts`) o satırda otomatik DEĞİL net tutar
 * kullanılır. **Henüz `createContract`/`addContractInstallments`'a
 * BAĞLANMADI** — bu bilinçli bir kapsam sınırı, aşağıdaki fonksiyonun kendi
 * yorumuna bkz.
 */
const TR_MONTHS = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

function ymdParts(day: string): { y: number; m: number; d: number } {
  const [y, m, d] = day.split("-").map(Number);
  return { y, m, d };
}

/** "2026-09-17" → "17 Eylül 2026". */
function formatDayTr(day: string): string {
  const { y, m, d } = ymdParts(day);
  return `${d} ${TR_MONTHS[m - 1]} ${y}`;
}

/** Bir `PeriodBillingLine` için okunabilir dönem etiketi — tam bir takvim ayını kapsıyorsa "Ekim 2026", kısmi ise "17–30 Eylül 2026". */
function formatPeriodLabel(line: Pick<import("./period-lesson-billing").PeriodBillingLine, "periodStart" | "periodEnd">): string {
  const start = ymdParts(line.periodStart);
  const end = ymdParts(line.periodEnd);
  const sameMonth = start.m === end.m && start.y === end.y;
  const lastDayOfMonth = new Date(Date.UTC(start.y, start.m, 0)).getUTCDate();
  // `kind` (start/full/end/single) yerine GERÇEK gün sınırına bakılır — bir
  // "end" dönemi, `enrollmentEndDate` tam o ayın son gününe denk gelirse
  // pratikte TAM bir ay kapsar ve öyle gösterilmelidir (kind etiketi bunu
  // ayırt etmez, yalnız kayıt aralığındaki KONUMU söyler).
  if (sameMonth && start.d === 1 && end.d === lastDayOfMonth) {
    return `${TR_MONTHS[start.m - 1]} ${start.y}`;
  }
  if (sameMonth) {
    return `${start.d}–${end.d} ${TR_MONTHS[start.m - 1]} ${start.y}`;
  }
  return `${formatDayTr(line.periodStart)} – ${formatDayTr(line.periodEnd)}`;
}

/**
 * P0 (2026-09-03) — sabit sayıda eşit taksit YERİNE, `period-lesson-billing.ts`'in
 * ürettiği her takvim-ayı döneminin KENDİ (ders sayısına göre değişen) tutarını
 * bir taksit satırı olarak kullanır. "3 ders eşiği" kuralı burada uygulanır:
 * kayıt ayında (`billingLines[0]`) kalan ders sayısı `mergeThresholdLessons`'a
 * eşit veya azsa, ilk iki dönem TEK bir "first_collection_combined" satırında
 * birleştirilir (kayıt ayı tutarı + takip eden TAM ayın tam ücreti); fazlaysa
 * ilk dönem kendi başına "first_collection" satırı olarak kalır. İlk dönem
 * manuel düzeltilmişse (bkz. `first-payment-adjustment.ts`) o satırda otomatik
 * DEĞİL net tutar kullanılır — birleştirilmiş satırda da yalnız kayıt ayı
 * bileşenini geçersiz kılar, takip eden ayın tam ücretini ETKİLEMEZ.
 */
/**
 * P0 (2026-09-04) — sözleşmenin SON döneminde eksik kalan derslerin nasıl
 * ücretlendirileceği tercihi. `remaining_lessons` (varsayılan/mevcut
 * davranış — hiçbir şey DEĞİŞMEZ) son dönemi de diğer tüm ara dönemler gibi
 * o dönemdeki GERÇEK ders sayısına göre bırakır. `regular_fee` son dönem
 * satırını normal (tam) dönem ücretine sabitler — kısmi kalan ders sayısına
 * bakmaz. `manual` personelin/velinin girdiği net tutarı kullanır.
 */
export type LastPeriodPricingMode = "remaining_lessons" | "regular_fee" | "manual";

export type LastPeriodPricing = {
  mode: LastPeriodPricingMode;
  /** `mode==="regular_fee"` iken kullanılacak tam dönem ücreti (öğrencinin `monthlyFee`'si — per-lesson türetmenin dayandığı referans tutar, YENİDEN hesaplanmaz). */
  regularFeeAmount?: number;
  /** `mode==="manual"` iken zorunlu, personel/veli tarafından girilen net tutar. */
  manualAmount?: number;
};

/**
 * Üretilen satırların SON `period_fee` satırına (varsa) `lastPeriodPricing`
 * tercihini uygular — birleştirilmiş ilk satır (`first_collection_combined`)
 * AYNI ZAMANDA son satırsa (çok kısa/1-2 dönemlik sözleşme, nadir bir kenar
 * durum) kasıtlı olarak DOKUNULMAZ: o satır zaten `firstPeriodManualNetAmount`
 * ile yönetiliyor, iki bağımsız override AYNI satırda çakışmasın diye.
 */
function applyLastPeriodPricing(
  rows: ContractInstallmentSnapshot[],
  pricing: LastPeriodPricing | undefined
): ContractInstallmentSnapshot[] {
  if (!pricing || pricing.mode === "remaining_lessons") return rows;
  const lastIndex = rows.length - 1;
  const lastRow = rows[lastIndex];
  if (!lastRow || lastRow.kind !== "period_fee") return rows;
  if (pricing.mode === "regular_fee") {
    if (pricing.regularFeeAmount === undefined) return rows;
    if (pricing.regularFeeAmount === lastRow.amount) return rows;
    rows[lastIndex] = { ...lastRow, amount: pricing.regularFeeAmount, computationSource: "auto" };
    return rows;
  }
  // "manual"
  if (pricing.manualAmount === undefined) return rows;
  rows[lastIndex] = { ...lastRow, amount: pricing.manualAmount, computationSource: "manual" };
  return rows;
}

/**
 * Sahip kararı (2026-09-16) — sözleşme önizleme tablosunda elle düzenlenen
 * taksit tutarlarını plana uygular (sıra no → tutar). Toplam sözleşme tutarı,
 * PDF ve gerçek Payment satırları HEP bu listeden üretilir; ekranda görülen
 * tutar ile kaydedilen tutar asla ayrışmaz.
 */
export function applyInstallmentAmountOverrides(
  rows: ContractInstallmentSnapshot[],
  overrides?: { sequence: number; amount: number }[]
): ContractInstallmentSnapshot[] {
  if (!overrides || overrides.length === 0) return rows;
  const bySequence = new Map(overrides.map((o) => [o.sequence, o.amount]));
  return rows.map((row) => {
    const amount = bySequence.get(row.sequence);
    if (amount === undefined || amount === row.amount) return row;
    return { ...row, amount, computationSource: "manual" as const };
  });
}

/**
 * 2026-10-04 — REVİZYON MAHSUBU. Revize edilen sürümün taksitlerinde FİİLEN tahsil edilmiş para
 * (`collectedAmountOf` toplamı) yeni sürümün Payment satırlarına sıra sırasıyla mahsup edilir:
 * ödenmiş ilk aylar yeniden borç yazılmaz, eski tahsilat satırları değişmeden (yenilenmiş sözleşme
 * altında) tahsilat toplamında kalır. Sözleşme belgesi/snapshot TAM planı gösterir; yalnız ödenecek
 * kalan (Payment.amount) azalır ve satıra mahsup notu düşer. Mahsup sonrası 0 kalan satır yazılmaz.
 * Kalan kredi (yeni plan, tahsil edilenden azsa) `leftover` olarak döner — iade otomatik YAPILMAZ.
 */
export function allocatePriorCollections(
  rows: ContractInstallmentSnapshot[],
  priorCollected: number,
  previousContractNumber: string
): { rows: ContractInstallmentSnapshot[]; applied: number; leftover: number } {
  let remaining = Math.max(0, Math.trunc(priorCollected));
  const out: ContractInstallmentSnapshot[] = [];
  for (const row of [...rows].sort((a, b) => a.sequence - b.sequence)) {
    const take = Math.min(row.amount, remaining);
    remaining -= take;
    if (take === 0) {
      out.push(row);
      continue;
    }
    const note = `${previousContractNumber} sürümünde tahsil edilen ${new Intl.NumberFormat("tr-TR").format(take)} TL mahsup edildi`;
    out.push({ ...row, amount: row.amount - take, note: row.note ? `${row.note} · ${note}` : note });
  }
  const applied = Math.max(0, Math.trunc(priorCollected)) - remaining;
  return { rows: out, applied, leftover: remaining };
}

/** Revize edilen sürümün taksit satırlarında fiilen tahsil edilmiş toplam (iptal satırı hariç). */
export async function computePriorContractCollected(tenantId: string, contractId: string): Promise<number> {
  const rows = await listInstallmentsForContract(tenantId, contractId);
  return rows.reduce((sum, r) => {
    if (r.status === "voided") return sum;
    if (r.status === "paid") return sum + (r.paidAmount > 0 ? r.paidAmount : r.amount);
    return sum + Math.max(0, r.paidAmount);
  }, 0);
}

/**
 * 2026-09-19 — önizleme tablosunda elle değiştirilen VADE tarihleri (sıra no → yyyy-MM-dd).
 * Tutar override'ıyla aynı yol: önizleme, sözleşme snapshot'ı ve gerçek Payment satırları
 * HEP bu listeden üretilir; öğrenci detayı ve finans ekranları Payment.dueDate'i okur.
 * Geçersiz tarih sessizce yutulmaz — hata fırlatılır (çağıran Türkçe mesaj gösterir).
 */
export function applyInstallmentDueDateOverrides(
  rows: ContractInstallmentSnapshot[],
  overrides?: { sequence: number; dueDate: string }[]
): ContractInstallmentSnapshot[] {
  if (!overrides || overrides.length === 0) return rows;
  const bySequence = new Map(overrides.map((o) => [o.sequence, o.dueDate.slice(0, 10)]));
  return rows.map((row) => {
    const ymd = bySequence.get(row.sequence);
    if (!ymd || ymd === row.dueDate.slice(0, 10)) return row;
    const [y, m, d] = ymd.split("-").map(Number);
    const date = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== ymd) {
      throw new Error(`${row.sequence}. taksitin vade tarihi geçersiz (${ymd}). Takvimden geçerli bir gün seçin.`);
    }
    return { ...row, dueDate: date.toISOString(), dueDateSource: "manual" as const };
  });
}

export function buildPerLessonInstallmentSchedule(input: {
  billingLines: import("./period-lesson-billing").PeriodBillingLine[];
  /** İlk dönem otomatik tutardan manuel olarak farklı girildiyse. */
  firstPeriodManualNetAmount?: number;
  /** "3 ders eşiği" — bkz. `resolveFirstCollectionMergeThreshold` (types.ts). */
  /** Sahip kararı (2026-09-16) — kayıt ekranındaki AÇIK seçim (Payment.firstCollectionIncludesNextMonth); ders sayısından TÜRETİLMEZ. */
  mergeFirstTwoPeriods: boolean;
  firstDueDate: string;
  paymentMethod?: string;
  paymentPolicy?: Pick<CollectionsSettings, "contractCardWindowEndDay" | "contractBankCashDueDay">;
  /** P0 (2026-09-04) — son dönem ücretlendirme tercihi (bkz. `LastPeriodPricing`); undefined ise davranış TAMAMEN ESKİSİ GİBİDİR. */
  lastPeriodPricing?: LastPeriodPricing;
}): ContractInstallmentSnapshot[] {
  if (input.billingLines.length === 0) return [];
  const rule = resolveContractPaymentDueRule(input.paymentMethod, input.paymentPolicy);
  const [firstLine, secondLine, ...restLines] = input.billingLines;
  const firstMonthAutoAmount = firstLine!.autoCalculatedAmount;
  const shouldMerge = input.mergeFirstTwoPeriods && !!secondLine;

  const rows: ContractInstallmentSnapshot[] = [];
  if (shouldMerge) {
    // `firstPeriodManualNetAmount` — merge durumunda — ilk satırın (Eylül+Ekim
    // BİRLEŞİK) TAMAMI için fiilen tahsil edilen tutardır (veli/kayıt
    // görevlisinin GERÇEKTEN aldığı TEK tutar), yalnız Eylül bileşeni için
    // DEĞİL. `breakdown` yine de her zaman OTOMATİK hesaplanan bileşenleri
    // gösterir (P0-5D — "sistem otomatik hesaplama yaptıysa kullanıcıya
    // hesaplamanın nasıl oluştuğunu görünür biçimde göster") — manuel tutar
    // yalnız `amount`'ı değiştirir, şeffaflığı gizlemez.
    const autoCombinedAmount = firstMonthAutoAmount + secondLine!.autoCalculatedAmount;
    const combinedAmount = input.firstPeriodManualNetAmount ?? autoCombinedAmount;
    const isCombinedManual = input.firstPeriodManualNetAmount !== undefined && combinedAmount !== autoCombinedAmount;
    rows.push({
      sequence: 1,
      dueDate: input.firstDueDate,
      amount: combinedAmount,
      paymentMethod: input.paymentMethod,
      kind: "first_collection_combined",
      periodLabel: `${formatPeriodLabel(firstLine!)} + ${formatPeriodLabel(secondLine!)}`,
      breakdown: [
        { periodLabel: formatPeriodLabel(firstLine!), amount: firstMonthAutoAmount },
        { periodLabel: formatPeriodLabel(secondLine!), amount: secondLine!.autoCalculatedAmount },
      ],
      computationSource: isCombinedManual ? "manual" : "auto",
    });
    // Taksit numarası = sözleşme ayı (2026-09-15): birleşik ilk tahsilat 1. VE
    // 2. ayı kapsar, bu yüzden sonraki satır 3'ten başlar (10 Eylül kayıt,
    // Eylül+Ekim ilk tahsilatta → Kasım 3. taksit, Haziran 10. taksit).
    let seq = 3;
    for (const line of restLines) {
      rows.push({
        sequence: seq,
        dueDate: setDayOfMonthClamped(line.periodStart, rule.windowEndDay),
        amount: line.autoCalculatedAmount,
        paymentMethod: input.paymentMethod,
        kind: "period_fee",
        periodLabel: formatPeriodLabel(line),
        computationSource: "auto",
      });
      seq += 1;
    }
    return applyLastPeriodPricing(rows, input.lastPeriodPricing);
  }

  // Birleşme YOKSA `firstPeriodManualNetAmount` yalnızca ilk (kayıt ayı)
  // satırının kendi tutarını geçersiz kılar (AYNI, önceki davranış).
  const firstMonthAmount = input.firstPeriodManualNetAmount ?? firstMonthAutoAmount;
  const isFirstMonthManual = input.firstPeriodManualNetAmount !== undefined && firstMonthAmount !== firstMonthAutoAmount;
  const nonMergedRows = input.billingLines.map((line, i) => {
    const isFirst = i === 0;
    const amount = isFirst ? firstMonthAmount : line.autoCalculatedAmount;
    // İlk taksit personelin girdiği tarihtir (createContract ile AYNI kural);
    // sonraki her dönem kendi ayının kurum ödeme-penceresi gününe normalize edilir.
    const dueDate = isFirst ? input.firstDueDate : setDayOfMonthClamped(line.periodStart, rule.windowEndDay);
    return {
      sequence: i + 1,
      dueDate,
      amount,
      paymentMethod: input.paymentMethod,
      kind: isFirst ? "first_collection" : "period_fee",
      periodLabel: formatPeriodLabel(line),
      computationSource: isFirst && isFirstMonthManual ? "manual" : "auto",
    } satisfies ContractInstallmentSnapshot;
  });
  return applyLastPeriodPricing(nonMergedRows, input.lastPeriodPricing);
}

/**
 * İş kuralı (Faz 1A/1B): 1-2 aylık kayıtlar "tanışma/trial" paketidir, formal
 * kayıt sözleşmesi PDF'i ZORUNLU DEĞİLDİR — yalnızca kayıt/ödeme planı
 * kaydedilir. 3-12 ay her zaman formal sözleşme (PDF + yazdır + ıslak imza +
 * imzalı tarama) gerektirir. Yenileme/uzatmalar da AYNI kurala tabidir: yeni
 * eklenen süre 1-2 ay ise trial uzatma, 3-12 ay ise yeni formal sözleşme.
 */
export function isFormalContractDuration(durationMonths: number): boolean {
  return durationMonths >= 3;
}

// ---------------------------------------------------------------------------
// Faz 6 — başlık/dosya adı: "Öğrenci Kayıt Sözleşmesi — {ad} / {akademik yıl}
// Eğitim Dönemi · {süre} Aylık Kayıt · Sürüm {versiyon}" (Türkçe eğitim yılı
// Eylül'de başlar; Ocak–Ağustos kayıtları önceki Eylül'ün dönemine aittir).
// ---------------------------------------------------------------------------

function turkishAcademicYear(isoDate: string): string {
  const d = new Date(isoDate);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1; // 1-12
  const startYear = m >= 9 ? y : y - 1;
  return `${startYear}-${startYear + 1}`;
}

const TR_CHAR_MAP: Record<string, string> = {
  ç: "c", Ç: "c", ğ: "g", Ğ: "g", ı: "i", I: "i", İ: "i",
  ö: "o", Ö: "o", ş: "s", Ş: "s", ü: "u", Ü: "u",
};

/** Dosya adı için güvenli slug — kontrol karakteri/yol ayırıcı asla üretmez. */
function slugify(name: string): string {
  const ascii = name
    .split("")
    .map((ch) => TR_CHAR_MAP[ch] ?? ch)
    .join("")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  return ascii.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "ogrenci";
}

export function contractTitleFields(input: {
  contractType: ContractType;
  studentName: string;
  enrollmentStartDate: string;
  durationMonths: number;
  versionNumber: number;
}): { titleMain: string; titleSub: string; academicYear: string; studentSlug: string; fileName: string } {
  const academicYear = turkishAcademicYear(input.enrollmentStartDate);
  const studentSlug = slugify(input.studentName);
  const isRenewal = input.contractType !== "initial";
  const titleMain = `${isRenewal ? "Sözleşme Yenileme" : "Öğrenci Kayıt Sözleşmesi"} — ${input.studentName}`;
  const titleSub = `${academicYear} Eğitim Dönemi · ${input.durationMonths} Aylık ${isRenewal ? "Yenileme" : "Kayıt"} · Sürüm ${input.versionNumber}`;
  const fileName = `ogrenci-kayit-sozlesmesi-${studentSlug}-${academicYear}-v${input.versionNumber}.pdf`;
  return { titleMain, titleSub, academicYear, studentSlug, fileName };
}

/**
 * Nilüfer Acar politikası §4 — "Önceki dönemden kalan ödemeler tamamen
 * kapatılmadan kayıt yenileme işlemi tamamlanamaz." Bir önceki sözleşmenin
 * taksitlerinden "paid"/"voided"/"waived" DIŞINDA kalan (pending/overdue/
 * partial) tutarların toplamıdır — geçmiş taksitlerin tarihi/tutarı asla
 * değiştirilmez, yalnızca OKUNUR.
 */
export async function computeOutstandingContractBalance(
  tenantId: string,
  contractId: string
): Promise<{ outstandingAmount: number; unpaidInstallmentCount: number }> {
  const installments = await listInstallmentsForContract(tenantId, contractId);
  let outstandingAmount = 0;
  let unpaidInstallmentCount = 0;
  for (const inst of installments) {
    if (inst.status === "paid" || inst.status === "voided" || inst.status === "waived") continue;
    const remaining = inst.amount - inst.paidAmount;
    if (remaining > 0) {
      outstandingAmount += remaining;
      unpaidInstallmentCount += 1;
    }
  }
  return { outstandingAmount, unpaidInstallmentCount };
}

/** Yenileme, önceki dönemden kalan borç kapatılmadan tamamlanamaz (yetkili override hariç). */
export class RenewalDebtBlockedError extends Error {
  readonly category = "RENEWAL_DEBT_BLOCKED" as const;
  readonly outstandingAmount: number;
  readonly unpaidInstallmentCount: number;
  constructor(outstandingAmount: number, unpaidInstallmentCount: number) {
    super("Önceki dönemden kalan ödemeler tamamen kapatılmadan kayıt yenileme işlemi tamamlanamaz.");
    this.outstandingAmount = outstandingAmount;
    this.unpaidInstallmentCount = unpaidInstallmentCount;
  }
}

/**
 * Faz 5/Faz 6 (ENROLLMENT_PAYMENT_RENEWAL_VALIDATION_FIX) — formal sözleşme
 * PDF'i için AKTİF şablonun gerekli tüm alanları içerdiğini doğrular. Tek
 * kaynak `src/lib/contract-template-schema.ts`'dir (editör/önizleme/PDF
 * renderer AYNI kaydı kullanır — doğrulayıcı ile renderer birbirinden
 * kopması artık YAPISAL OLARAK imkansız). Eski/özel bir şablon bu alanları
 * içermiyorsa (ör. bu düzeltmeden ÖNCE oluşturulmuş, güncellenmemiş bir
 * tenant şablonu — GERÇEK bir içerik eksikliğidir, personelin öğrenci
 * verisini eksik girmesiyle KARIŞTIRILMAMALIDIR) ÜRETİM ENGELLENİR — asla
 * metadata-only/yanıltıcı bir PDF sessizce üretilmez. Hukuki metin burada
 * YENİDEN YAZILMAZ, yalnızca gerekli alanların VARLIĞI kontrol edilir.
 */
export class ContractTemplateIncompleteError extends Error {
  readonly category = "TEMPLATE_INCOMPLETE" as const;
  readonly missingKeys: string[];
  constructor(missing: { key: string; label: string }[]) {
    const list = missing.map((m) => `${m.label} ({{${m.key}}})`).join(", ");
    super(
      `Şablon Hatası: Aktif kayıt sözleşmesi şablonu eksik alanlar içeriyor (${list}) ve formal sözleşme üretimi için yetersiz. ` +
        `Bu, öğrenci/veli bilgilerinin eksik girilmesiyle İLGİLİ DEĞİLDİR — kurumun aktif sözleşme şablonu güncel değil. ` +
        `Metadata-only/eksik bir PDF üretilmesi engellendi — lütfen "Sözleşme Şablonları" bölümünden şablonu güncelleyin veya kurumsal kaynaktan uyumlu bir taslak oluşturup etkinleştirin.`
    );
    this.missingKeys = missing.map((m) => m.key);
  }
}

export function validateContractTemplateBody(bodyHtml: string): void {
  const missing = findMissingRequiredContractPlaceholders(bodyHtml);
  if (missing.length > 0) {
    throw new ContractTemplateIncompleteError(missing);
  }
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export type CreateContractInput = {
  tenantId: string;
  studentId: string;
  contractType: ContractType;
  previousContractId?: string;
  programmeName: string;
  lessonScheduleText?: string;
  enrollmentStartDate: string;
  enrollmentEndDate: string;
  durationMonths: number;
  monthlyAmount: number;
  installmentCount: number;
  firstDueDate: string;
  depositAmount?: number;
  paymentMethod?: string;
  signatoryFullName: string;
  signatoryNationalId?: string;
  signatoryAddress?: string;
  signatoryRelationship?: string;
  isMinor: boolean;
  photoVideoConsent?: { granted: boolean; representativeName: string; relationship: string; scopes?: SocialMediaScope[] };
  /** Fotoğraf/Video Açık Rıza Formu personele SUNULDU mu (izin verilsin/verilmesin) — form kısmı boş bırakıldıysa undefined. */
  photoVideoConsentFormPresented?: boolean;
  /** "KVKK Aydınlatma Metni ayrıca teslim edilmiş/bilgilendirme yapılmıştır" işareti — açık rıza DEĞİL, yalnızca teslimat kaydı. */
  kvkkNoticeDelivered?: boolean;
  studentName: string;
  parentName?: string;
  branchName?: string;
  /** 2026-2027 kaynağı Madde 1 — kurumun tüm şubeleri arasından öğrencinin şubesini işaretleyen hazır metin (bkz. contracts.ts formatCheckboxOptionsText benzeri, tools.ts'te önceden biçimlendirilir). */
  branchOptionsText?: string;
  /** 2026-2027 kaynağı Madde 3/4 — Student.lessonDurationMinutes/weeklyLessonCount (30/40/50 dk, haftada 1/2 ders). */
  lessonDurationMinutes?: number;
  weeklyLessonCount?: number;
  /** Kurumun güncel KDV uygulaması (School.collectionsSettings.contractVatInclusive) — undefined ise "Dahil" varsayılır. */
  vatInclusive?: boolean;
  /** Öğrencinin kendi T.C. kimlik no / doğum tarihi / telefon / e-postası (Madde 1 — imzalayandan (veli) AYRI, öğrenciye ait alanlar). */
  studentNationalId?: string;
  studentBirthDateText?: string;
  studentPhone?: string;
  studentEmail?: string;
  institutionName: string;
  institutionAddress: string;
  /** P0-E (2026-09-02) — oluşturma anında aktif kurum logosu; `contractDataSnapshot.logoUrl`'a donuk (immutable) olarak yazılır. */
  logoUrl?: string;
  createdBy: string;
  /** Yenileme/değişiklikte önceki sözleşmenin bitişiyle YENİ başlangıç arasında boşluk/örtüşme varsa açık onay. */
  allowOverlap?: boolean;
  overlapReason?: string;
  /** Faz 2 — kurumun güncel ödeme politikası ayarları (undefined ise varsayılan: kart 1–5, havale/nakit 15). */
  paymentPolicy?: Pick<CollectionsSettings, "contractCardWindowEndDay" | "contractBankCashDueDay">;
  /** İlk taksit tarihi ödeme penceresi dışındaysa (kayıt ayın normal penceresinden sonra yapıldıysa) zorunlu personel gerekçesi. */
  firstPaymentExceptionReason?: string;
  /** Yetkili personelin, önceki dönem borcu kapanmadan yenilemeyi bilinçli olarak tamamlaması — gerekçe zorunlu, çağıran (tools.ts) ayrıca audit'ler. */
  renewalDebtOverrideReason?: string;
  /**
   * Owner policy (2026-08-29): "İlk ödeme her zaman kayıt esnasında alınacaktır. İlk ödeme
   * alınmadan kayıt tamamlanmayacaktır." Zorunlu (initial/renewal) — amendment hariç, çünkü bir
   * değişiklik zaten var olan bir taahhüdü düzenler, yeni bir tahsilat anı yaratmaz. Sağlanırsa
   * 1. taksit `Payment` satırı doğrudan "paid" olarak oluşturulur (bkz. addContractInstallments).
   */
  firstPaymentCollected?: {
    method: string;
    amount: number;
    /** Varsayılan/zorunlu: `enrollmentStartDate` ile aynı gün. Farklıysa `firstPaymentExceptionReason` zorunludur (istisnai/gecikmeli kayıt, yetkili personel gerekçesi). */
    collectedAt: string;
    reference?: string;
    note?: string;
  };
  /**
   * P0 (2026-09-03) — verilirse taksit planı `buildInstallmentSchedule`'ın
   * SABİT SAYIDA eşit taksit modeli YERİNE `buildPerLessonInstallmentSchedule`
   * ile — her dönemin GERÇEK ders sayısına göre DEĞİŞEN tutarıyla — üretilir
   * (bkz. period-lesson-billing.ts computePeriodBillingPreview; çağıran
   * — tools.ts createStudentContractTool — öğrencinin per-lesson fiyatlama
   * kullandığını `Student.derivedPerLessonAmount` doluluğundan anlar).
   * undefined ise davranış TAMAMEN ESKİSİ GİBİDİR (mevcut fixed-fee
   * sözleşmeler/testler ETKİLENMEZ).
   */
  perLessonBillingLines?: import("./period-lesson-billing").PeriodBillingLine[];
  /** Sahip kararı (2026-09-16) — kayıt anındaki "takip eden ayı da ekle" seçimi (Payment.firstCollectionIncludesNextMonth). */
  mergeFirstCollectionWithNextMonth?: boolean;
  /** Önizleme tablosunda elle düzenlenen taksit tutarları (sıra no → tutar). */
  installmentAmountOverrides?: { sequence: number; amount: number }[];
  /** 2026-09-19 — önizlemede elle değiştirilen vade tarihleri (sıra no → yyyy-MM-dd). */
  installmentDueDateOverrides?: { sequence: number; dueDate: string }[];
  /** P0 (2026-09-04) — yalnız `perLessonBillingLines` ile birlikte anlamlı; bkz. `LastPeriodPricing`. */
  lastPeriodPricing?: LastPeriodPricing;
};

export type CreateContractResult = {
  contract: StudentContract;
  installments: ContractInstallmentView[];
  /** Yalnız revizyonda: önceki sürümde tahsil edilen, yeni plana mahsup edilen ve artan (iade edilmeyen) tutar. */
  amendmentCredit?: { collected: number; applied: number; leftover: number };
};

export const FIRST_PAYMENT_REQUIRED_MESSAGE =
  "İlk ödeme kayıt sırasında tahsil edilmeden kayıt tamamlanamaz.";

const INSTALLMENT_KIND_LABELS_TR: Record<string, string> = {
  deposit: "Kaparo",
  first_collection: "İlk tahsilat",
  first_collection_combined: "İlk tahsilat (birleştirilmiş)",
  period_fee: "Dönem ücreti",
};

/**
 * Sözleşme taksit tablosunun "HİZMET BEDELİ" hücresi — TEK kaynak.
 * Ders-başı planda gerçek tür/dönem ("İlk tahsilat — 17–30 Eylül 2026").
 * Tür/dönem bilgisi olmayan (sabit taksitli) satırda eskiden yalnız "EĞİTİM"
 * basılıyordu; artık taksitin ayı açıkça yazılır ("Eğitim ücreti — Ekim 2026").
 * Boş satır (taksit yok) boş kalır — sahte içerik üretilmez.
 */
export function describeInstallmentForContract(
  row: Pick<ContractInstallmentSnapshot, "kind" | "periodLabel" | "dueDate"> | undefined,
  mergedInto?: Pick<ContractInstallmentSnapshot, "breakdown">
): string {
  if (mergedInto) return `1. taksite dahil — ${mergedInto.breakdown?.[1]?.periodLabel ?? ""}`.trim();
  if (!row) return "";
  if (row.kind && row.periodLabel) return `${INSTALLMENT_KIND_LABELS_TR[row.kind]} — ${row.periodLabel}`;
  const month = new Intl.DateTimeFormat("tr-TR", { month: "long", year: "numeric", timeZone: "Europe/Istanbul" }).format(
    new Date(row.dueDate)
  );
  return `Eğitim ücreti — ${month.charAt(0).toLocaleUpperCase("tr") + month.slice(1)}`;
}

const CONTRACT_TYPE_LABELS: Record<ContractType, string> = {
  initial: "İlk Kayıt",
  renewal: "Yenileme",
  amendment: "Değişiklik",
};

export async function createContract(input: CreateContractInput): Promise<CreateContractResult> {
  if (input.durationMonths < 1 || input.durationMonths > 12) {
    throw new Error("Süre 1-12 ay arasında olmalıdır.");
  }
  if (input.installmentCount < 1 || input.installmentCount > 12) {
    throw new Error("Taksit sayısı 1-12 arasında olmalıdır.");
  }
  // 2026-09-30 — 0 geçerli: %100 indirimli/burslu öğrencinin sözleşmesi (tahsil edilecek taksit yok).
  if (input.monthlyAmount < 0) {
    throw new Error("Aylık ücret negatif olamaz.");
  }
  if (input.depositAmount !== undefined && input.depositAmount < 0) {
    throw new Error("Kaparo/depozito negatif olamaz.");
  }
  if (new Date(input.enrollmentEndDate).getTime() <= new Date(input.enrollmentStartDate).getTime()) {
    throw new Error("Bitiş tarihi başlangıç tarihinden sonra olmalıdır.");
  }

  let previous: StudentContract | undefined;
  if (input.contractType !== "initial") {
    if (!input.previousContractId) {
      throw new Error("Yenileme/değişiklik için önceki sözleşme referansı zorunludur.");
    }
    const found = await getContract(input.tenantId, input.previousContractId);
    if (!found || found.studentId !== input.studentId) {
      throw new Error("Önceki sözleşme bulunamadı veya bu öğrenciye ait değil.");
    }
    if (found.status === "cancelled" || found.status === "superseded") {
      throw new Error("İptal edilmiş veya zaten yenilenmiş bir sözleşme tekrar yenilenemez.");
    }
    previous = found;
    const startsAfterPrevious =
      new Date(input.enrollmentStartDate).getTime() >= new Date(previous.enrollmentEndDate).getTime();
    if (!startsAfterPrevious && !input.allowOverlap) {
      throw new Error(
        "Yeni sözleşme, önceki sözleşmenin bitiş tarihinden önce başlıyor. Bu kasıtlıysa allowOverlap=true ve bir gerekçe belirtin."
      );
    }
    if (!startsAfterPrevious && input.allowOverlap && !input.overlapReason?.trim()) {
      throw new Error("Örtüşen tarih için gerekçe (overlapReason) zorunludur.");
    }
    // 2026-10-04 — revizyon (amendment) AYNI dönemin yeni sürümüdür: önceki sürümün ödenmemiş taksitleri
    // yeni planla yer değiştirir (tahsil edilen mahsup edilir), bu yüzden "yenileme borç bloğu" uygulanmaz.
    const { outstandingAmount, unpaidInstallmentCount } =
      input.contractType === "amendment"
        ? { outstandingAmount: 0, unpaidInstallmentCount: 0 }
        : await computeOutstandingContractBalance(input.tenantId, previous.id);
    if (outstandingAmount > 0) {
      if (!input.renewalDebtOverrideReason?.trim()) {
        throw new RenewalDebtBlockedError(outstandingAmount, unpaidInstallmentCount);
      }
    }
  }

  const paymentDueRule = resolveContractPaymentDueRule(input.paymentMethod, input.paymentPolicy);
  // P0 (2026-09-05) — kök neden düzeltmesi: kurumun düzenli aylık ödeme
  // penceresi (kredi kartı 1-5, nakit/EFT 1-15) yalnız SONRAKİ dönem
  // taksitlerinin vade günü içindir — Madde 4'ün kendisi de bunu ayrı ayrı
  // tanımlar. İlk tahsilat (kayıt anında, ödeme yöntemi ne olursa olsun)
  // GERÇEKTEN alındığı günde serbestçe kaydedilir; burada eskiden
  // `firstDueDate` bu pencereye zorlanıp uymayınca personelden "istisna
  // gerekçesi" isteniyordu — bu, normal bir kayıt anını yapay bir istisnaya
  // çeviriyordu. Sonraki taksitlerin vadesi hâlâ `rule.windowEndDay`
  // kullanılarak (aşağıda) doğru hesaplanır; burada değişen YALNIZCA ilk
  // taksitin kendi tarihine yapay bir kısıtlama uygulanmaması.

  // Owner policy (2026-08-30) — İlk ödeme her zaman KAYIT ESNASINDA alınır ve normaldir,
  // istisna değildir (bkz. createStudentTool). Kapsam: FORMAL (>=3 ay) initial/renewal
  // sözleşmeler — amendment (yeni tahsilat anı yaratmaz) bu zorunluluğun dışındadır.
  //
  // "initial" sözleşme için burada YENİ bir ödeme TALEP EDİLMEZ/YARATILMAZ — kayıt
  // (createStudentTool) sırasında zaten oluşturulmuş `registration_first_payment` Payment
  // satırı BULUNUP bu sözleşmeye BAĞLANIR (bkz. addContractInstallments reuseFirstPaymentId).
  // Kayıt tarihi ile enrollmentStartDate (ders/eğitim başlangıcı) farklı olabilir; bu asla
  // istisna/gerekçe gerektirmez (P0 fix — eski `collectedDay !== registrationDay` kontrolü
  // KALDIRILDI, çünkü enrollmentStartDate karşılaştırması bu amaç için YANLIŞTI).
  //
  // "renewal" için ise BU sözleşme döngüsünün kendi yeni tahsilat anıdır — kayıt anındaki
  // ödemeden BAĞIMSIZ, gerçekten yeni bir Payment satırı yaratılır (eski davranış korunur).
  const requiresFirstPaymentAtRegistration = input.contractType !== "amendment" && isFormalContractDuration(input.durationMonths);
  let registrationFirstPayment: Payment | null = null;
  if (requiresFirstPaymentAtRegistration && input.contractType === "initial") {
    const { getRegistrationFirstPayment } = await import("./store");
    registrationFirstPayment = await getRegistrationFirstPayment(input.studentId);
  }

  // P0 (2026-09-03) — `perLessonBillingLines` verilmişse (öğrenci per-lesson
  // fiyatlandırma kullanıyor, bkz. CreateContractInput yorumu) taksit planı
  // SABİT SAYIDA eşit satır YERİNE her dönemin GERÇEK ders sayısına göre
  // değişen tutarıyla, "3 ders eşiği" birleştirme kuralı dahil üretilir.
  // Gerçek tahsil edilen ilk ödeme tutarı DOĞRUDAN motora verilir — eski
  // eşitlik kontrolü (aşağıdaki `else` dalı) burada GEREKSİZDİR: motor zaten
  // fiili tutarı satıra yazar, "eşleşmiyor" diye reddetmez.
  const firstPaymentActualAmount = registrationFirstPayment?.amount ?? input.firstPaymentCollected?.amount;
  const builtInstallments = input.perLessonBillingLines
    ? buildPerLessonInstallmentSchedule({
        billingLines: input.perLessonBillingLines,
        firstPeriodManualNetAmount: firstPaymentActualAmount,
        mergeFirstTwoPeriods: input.mergeFirstCollectionWithNextMonth ?? false,
        firstDueDate: input.firstDueDate,
        paymentMethod: input.paymentMethod,
        paymentPolicy: input.paymentPolicy,
        lastPeriodPricing: input.lastPeriodPricing,
      })
    : buildInstallmentSchedule({
        totalContractAmount: input.durationMonths * input.monthlyAmount,
        depositAmount: input.depositAmount,
        installmentCount: input.installmentCount,
        firstDueDate: input.firstDueDate,
        paymentMethod: input.paymentMethod,
        paymentPolicy: input.paymentPolicy,
      });
  // Sahip kararı (2026-09-16) — önizlemede elle düzenlenen tutarlar burada uygulanır;
  // toplam, sözleşme PDF'i ve gerçek Payment satırları HEP aynı listeden üretilir.
  const installments = applyInstallmentDueDateOverrides(
    applyInstallmentAmountOverrides(builtInstallments, input.installmentAmountOverrides),
    input.installmentDueDateOverrides
  );
  const totalContractAmount = installments.reduce((s, r) => s + r.amount, 0) + (input.depositAmount ?? 0);
  // 2026-09-30 — %100 burslu (toplam 0 TL) sözleşmede tahsilat anı yoktur: ilk tahsilat
  // istenmez, 0 TL'lik "ödendi"/"bekliyor" Payment satırı YAZILMAZ (sahte ödeme/borç yok).
  // Kayıtta alınmış gerçek bir ilk tahsilat varsa eski davranış (1. taksite bağlanır) korunur.
  const fullyWaived = totalContractAmount === 0 && !registrationFirstPayment;
  if (requiresFirstPaymentAtRegistration && !fullyWaived) {
    if (input.contractType === "initial") {
      // 2026-09-19 — sistemde önceden kayıtlı, kayıtta ilk tahsilatı alınmamış öğrenci
      // için İLK sözleşme: ilk tahsilat sözleşme ekranında girilir (yenilemedeki gibi).
      if (!registrationFirstPayment) {
        if (!input.firstPaymentCollected) {
          throw new Error(
            "Bu öğrencinin kayıtta alınmış bir ilk tahsilatı yok. Sözleşme formundaki \"İlk tahsilat\" bölümüne tahsil edilen tutarı, tarihi ve yöntemi girin."
          );
        }
        if (input.firstPaymentCollected.amount <= 0) {
          throw new Error("Tahsil edilen ilk ödeme tutarı sıfırdan büyük olmalıdır.");
        }
      }
    } else {
      if (!input.firstPaymentCollected) {
        throw new Error(FIRST_PAYMENT_REQUIRED_MESSAGE);
      }
      if (input.firstPaymentCollected.amount <= 0) {
        throw new Error("Tahsil edilen ilk ödeme tutarı sıfırdan büyük olmalıdır.");
      }
    }
  }

  if (!input.perLessonBillingLines) {
    if (registrationFirstPayment) {
      const firstInstallmentAmount = installments[0]?.amount ?? 0;
      if (registrationFirstPayment.amount !== firstInstallmentAmount) {
        throw new Error(
          `Kayıtta tahsil edilen ilk ödeme (${new Intl.NumberFormat("tr-TR").format(registrationFirstPayment.amount)} TL) bu sözleşmenin 1. taksitiyle (${new Intl.NumberFormat("tr-TR").format(firstInstallmentAmount)} TL) aynı değil. Sözleşmedeki aylık ücret veya taksit sayısı kayıttakinden farklı olabilir: bu alanları kayıttaki değerlere eşitleyin ya da "Öğrenci Kaydını Düzenle" ile ilk ödemeyi düzeltin.`
        );
      }
    } else if (requiresFirstPaymentAtRegistration && input.firstPaymentCollected && !fullyWaived) {
      const firstInstallmentAmount = installments[0]?.amount ?? 0;
      if (input.firstPaymentCollected.amount !== firstInstallmentAmount) {
        throw new Error(
          `Girilen ilk ödeme (${new Intl.NumberFormat("tr-TR").format(input.firstPaymentCollected.amount)} TL) bu sözleşmenin 1. taksitiyle (${new Intl.NumberFormat("tr-TR").format(firstInstallmentAmount)} TL) aynı değil. Tahsil edilen tutarı veya aylık ücret/taksit sayısını düzeltin.`
        );
      }
    }
  }

  // 2026-10-04 — sunucu tarafı mükerrer sürüm kontrolü: aynı veriden ikinci sürüm üretilmez (istemci farkı atlansa da).
  if (input.contractType === "amendment" && previous) {
    const { isIdenticalRevision } = await import("./contract-revision");
    const snap = previous.contractDataSnapshot;
    const consent = (c: CreateContractInput["photoVideoConsent"] | undefined) =>
      c == null ? ("unset" as const) : c.granted ? ("granted" as const) : ("denied" as const);
    const planOf = (rows: Pick<ContractInstallmentSnapshot, "sequence" | "amount" | "dueDate">[]) =>
      rows.map((r) => ({ sequence: r.sequence, amount: r.amount, dueDate: r.dueDate }));
    const identical = isIdenticalRevision(
      {
        programmeName: previous.programmeName,
        monthlyAmount: previous.monthlyAmount,
        durationMonths: previous.durationMonths,
        installmentCount: previous.installmentCount,
        enrollmentStartDate: previous.enrollmentStartDate,
        enrollmentEndDate: previous.enrollmentEndDate,
        paymentMethod: previous.paymentMethod,
        depositAmount: previous.depositAmount,
        lessonScheduleText: snap?.lessonScheduleText,
        signatoryFullName: previous.signatoryFullName,
        signatoryNationalId: previous.signatoryNationalId,
        signatoryAddress: previous.signatoryAddress,
        signatoryRelationship: previous.signatoryRelationship,
        photoVideoConsent: consent(snap?.photoVideoConsent),
        photoScopes: snap?.photoVideoConsent?.scopes ?? [],
        kvkkNoticeDelivered: snap?.kvkkNoticeDelivered,
        plan: planOf(snap?.installments ?? []),
      },
      {
        programmeName: input.programmeName,
        monthlyAmount: input.monthlyAmount,
        durationMonths: input.durationMonths,
        installmentCount: input.installmentCount,
        enrollmentStartDate: input.enrollmentStartDate,
        enrollmentEndDate: input.enrollmentEndDate,
        paymentMethod: input.paymentMethod,
        depositAmount: input.depositAmount,
        lessonScheduleText: input.lessonScheduleText,
        signatoryFullName: input.signatoryFullName,
        signatoryNationalId: input.signatoryNationalId,
        signatoryAddress: input.signatoryAddress,
        signatoryRelationship: input.signatoryRelationship,
        photoVideoConsent: consent(input.photoVideoConsent),
        photoScopes: input.photoVideoConsent?.scopes ?? [],
        kvkkNoticeDelivered: input.kvkkNoticeDelivered,
        plan: planOf(installments),
      }
    );
    if (identical) {
      throw new Error(
        `Bu revizyon önceki sürümle (${previous.contractNumber} · v${previous.versionNumber}) birebir aynı: hiçbir alan veya ödeme planı satırı değişmedi. Yeni sürüm oluşturulmadı; değiştirmek istediğiniz alanı düzenleyip tekrar kaydedin.`
      );
    }
  }

  const isFormal = isFormalContractDuration(input.durationMonths);
  const nowTr = formatDateTr(new Date());
  /**
   * Sürüm, sözleşme TÜRÜNDEN bağımsız olarak öğrenci bazında artar.
   * İptal sonrası yeni bir "initial" eskiden yine versionNumber=1 alıyordu;
   * liste `versionNumber desc` ile sıralanınca iptal edilmiş kayıtla
   * berabere kalıyor ve "güncel" rozeti yanlış satıra yapışıyordu.
   */
  const existingForStudent = await listContractsForStudent(input.tenantId, input.studentId);
  const maxVersion = existingForStudent.reduce((max, c) => Math.max(max, c.versionNumber), 0);
  const versionNumber = Math.max(maxVersion + 1, previous ? previous.versionNumber + 1 : 1);

  let doc: { id: string; reference: string } | undefined;
  let templateVersionUsed: number | undefined;
  let annexes: ContractAnnexSnapshot[] = [];

  if (isFormal) {
    const { ensureDefaultTemplates, listTemplates, createDocumentInstance } = await import("./documents");
    await ensureDefaultTemplates(input.tenantId);
    const templates = await listTemplates(input.tenantId);
    // P0 selection fix (2026-08-30) — `selectEligibleActiveTemplateForContract` tek giriş
    // noktasıdır: `active===true` filtrelemesini KENDİSİ garanti eder (çağırana güvenmez) VE
    // zorunlu alan doğrulamasını (diagnostics) AYNI adımda yapar. Uygun aktif+eksiksiz şablon
    // yoksa DRAFT/arşivlenmiş bir şablona veya salt metadata gövdesine asla sessizce düşmez —
    // yazılı, tipli bir hata fırlatır. Tanılama UI'ı (getContractTemplateDiagnostics) AYNI alt
    // fonksiyonu (selectActiveTemplateOfKind) kullanır — ikisi asla farklı bir şablon seçmez.
    const selection = selectEligibleActiveTemplateForContract(templates, "student_enrollment_contract");
    if (!selection.ok) {
      if (selection.reason === "diagnostics_failed" && selection.missingRequired) {
        throw new ContractTemplateIncompleteError(selection.missingRequired);
      }
      throw new Error(selection.message);
    }
    const template = selection.template;
    templateVersionUsed = template.version;

    const titleFields = contractTitleFields({
      contractType: input.contractType,
      studentName: input.studentName,
      enrollmentStartDate: input.enrollmentStartDate,
      durationMonths: input.durationMonths,
      versionNumber,
    });

    const fieldValues: Record<string, string> = {
    versionNumber: String(versionNumber),
    titleMain: titleFields.titleMain,
    titleSub: titleFields.titleSub,
    paymentDueRuleText: paymentDueRule.ruleText,
    contractTypeLabel: CONTRACT_TYPE_LABELS[input.contractType],
    previousContractNumber: previous?.contractNumber ?? "",
    templateVersion: String(template.version),
    generatedAtText: nowTr,
    institutionName: input.institutionName,
    institutionAddress: input.institutionAddress,
    studentName: input.studentName,
    programmeName: input.programmeName,
    lessonScheduleText: input.lessonScheduleText ?? "",
    unitFeeAmountText: new Intl.NumberFormat("tr-TR").format(input.monthlyAmount),
    enrollmentStartDateText: formatDateTr(input.enrollmentStartDate),
    enrollmentEndDateText: formatDateTr(input.enrollmentEndDate),
    totalContractAmountText: new Intl.NumberFormat("tr-TR").format(totalContractAmount),
    depositAmountText: input.depositAmount ? new Intl.NumberFormat("tr-TR").format(input.depositAmount) : "",
    signatoryFullName: input.signatoryFullName,
    signatoryNationalId: input.signatoryNationalId ?? "",
    signatoryAddress: input.signatoryAddress ?? "",
    consentGrantedMark: input.photoVideoConsent?.granted ? "☑" : "☐",
    consentDeniedMark: input.photoVideoConsent && !input.photoVideoConsent.granted ? "☑" : "☐",
    branchOptionsText: input.branchOptionsText ?? "",
    studentNationalIdText: input.studentNationalId ?? "",
    studentBirthDateText: input.studentBirthDateText ?? "",
    studentPhoneText: input.studentPhone ?? "",
    studentEmailText: input.studentEmail ?? "",
    lessonDurationOptionText: formatCheckboxOptionsText([30, 40, 50], input.lessonDurationMinutes, "dakika"),
    weeklyFrequencyOptionText: formatCheckboxOptionsText([1, 2], input.weeklyLessonCount, "ders"),
    commitmentDurationOptionText: formatCheckboxOptionsText(
      [3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      input.durationMonths,
      "Ay"
    ),
    vatStatusText: input.vatInclusive === false ? "Hariç" : "Dahil",
    kvkkNoticeDeliveredCheckboxText: input.kvkkNoticeDelivered ? "☑ Evet    ☐ Hayır" : "☐ Evet    ☑ Hayır",
    photoVideoConsentFormCheckboxText: input.photoVideoConsentFormPresented ? "☑ Evet    ☐ Hayır" : "☐ Evet    ☑ Hayır",
    renewalNoticeText:
      input.contractType !== "initial" && previous
        ? `Bu sözleşme, ${previous.contractNumber} numaralı ve ${formatDateTr(previous.enrollmentEndDate)} tarihinde sona eren önceki kayıt sözleşmesinin ${CONTRACT_TYPE_LABELS[input.contractType].toLowerCase()}idir. Önceki sözleşmenin tüm madde hükümleri bu sözleşme için de geçerlidir; yalnızca program süresi, aylık ücret, taksit planı ve/veya ödeme yöntemi güncellenmiştir. Önceki sözleşme iptal edilmemiş olup kurum arşivinde değişmeden saklanmaktadır.`
        : "",
  };
    for (let i = 1; i <= 12; i++) {
      // Slot = taksit sıra numarası (sözleşme ayı). Birleşik ilk tahsilatta
      // 2. slot ayrı satır değildir — 1. taksite dahil olduğu açıkça yazılır.
      const row = installments.find((r) => r.sequence === i);
      const mergedInto =
        !row && i === 2 && installments[0]?.kind === "first_collection_combined" ? installments[0] : undefined;
      fieldValues[`taksit${i}Tarih`] = row ? formatDateTr(row.dueDate) : mergedInto ? formatDateTr(mergedInto.dueDate) : "";
      fieldValues[`taksit${i}Tutar`] = row ? new Intl.NumberFormat("tr-TR").format(row.amount) : mergedInto ? "—" : "";
      // P0 (2026-09-03, genişletildi 2026-09-05) — her taksitin tür/dönem
      // açıklaması, ör. "İlk tahsilat (birleştirilmiş) — 17–30 Eylül 2026 +
      // Ekim 2026". Per-lesson sözleşmelerde gerçek tür/dönem gösterilir;
      // legacy (sabit ücret, `kind` yok) sözleşmelerde şablonun ESKİ sabit
      // metniyle (aşağıya bkz. STUDENT_ENROLLMENT_CONTRACT_BODY MADDE 4)
      // BİREBİR aynı "EĞİTİM" değerine düşülür — mevcut sözleşmelerin PDF
      // çıktısı DEĞİŞMEZ, yalnız per-lesson sözleşmeler artık ilk tahsilatı
      // dönem ücretinden AYRI, kendi gerçek etiketiyle gösterir.
      fieldValues[`taksit${i}Aciklama`] = describeInstallmentForContract(row, mergedInto);
      // P0 revizyonu — "Ödeme Türü" sütunu: 1. satırda GERÇEK ilk tahsilatın
      // yöntemi (kayıt anı ödemesi initial'da reuse edilir, renewal'da bu
      // formda alınır; ikisi de yoksa — amendment — "—"). Sonraki satırların
      // tahsilatı üretim anında henüz yoktur: uydurma yöntem YAZILMAZ, "—".
      // Canlı yöntem bilgisi yönetici dökümünde aynı helper ile çözülür
      // (bkz. contract-payment-plan-view.ts — tek kaynak).
      fieldValues[`taksit${i}Yontem`] =
        !row ? "" : i === 1 ? paymentMethodLabelTr(registrationFirstPayment?.method ?? input.firstPaymentCollected?.method) : "—";
    }

    doc = await createDocumentInstance({
      tenantId: input.tenantId,
      templateId: template.id,
      kind: "student_enrollment_contract",
      fieldValues,
      studentId: input.studentId,
      createdBy: input.createdBy,
      installmentCount: input.installmentCount,
    });

    // P0 (2026-09-05) — TEK BİRLEŞİK ÇIKTI: KVKK ve Fotoğraf/Video ek
    // bölümleri sözleşmeyle AYNI anda, o an aktif olan şablonlardan
    // dondurulur (bkz. src/lib/contract-annexes.ts). Ayrı bir belge/kayıt
    // ÜRETİLMEZ — bu yalnızca çıktı anlık görüntüsüdür; bağımsız KVKK/
    // fotoğraf-video DocumentInstance akışı (yeniden basım) DEĞİŞMEDEN durur.
    const { buildContractAnnexes } = await import("./contract-annexes");
    annexes = buildContractAnnexes({
      templates,
      contractNumber: doc.reference,
      institutionName: input.institutionName,
      institutionAddress: input.institutionAddress,
      studentName: input.studentName,
      parentName: input.photoVideoConsent?.representativeName || input.parentName || input.signatoryFullName,
      dateText: nowTr,
      photoVideoConsent: input.photoVideoConsent,
    });
  }

  const snapshot: ContractDataSnapshot = {
    studentName: input.studentName,
    programmeName: input.programmeName,
    // K — ders gün/saati artık makine-okunur biçimde de dondurulur (ders
    // programı üretimi bunu okur); metin çıktısı DEĞİŞMEDİ.
    lessonScheduleText: input.lessonScheduleText,
    enrollmentStartDate: input.enrollmentStartDate,
    enrollmentEndDate: input.enrollmentEndDate,
    durationMonths: input.durationMonths,
    monthlyAmount: input.monthlyAmount,
    installmentCount: input.installmentCount,
    totalContractAmount,
    depositAmount: input.depositAmount,
    paymentMethod: input.paymentMethod,
    signatoryFullName: input.signatoryFullName,
    signatoryNationalId: input.signatoryNationalId,
    signatoryAddress: input.signatoryAddress,
    signatoryRelationship: input.signatoryRelationship,
    isMinor: input.isMinor,
    installments,
    photoVideoConsent: input.photoVideoConsent,
    paymentDueRuleText: paymentDueRule.ruleText,
    paymentDueWindowStartDay: paymentDueRule.windowStartDay,
    paymentDueWindowEndDay: paymentDueRule.windowEndDay,
    firstPaymentExceptionReason: input.firstPaymentExceptionReason,
    kvkkNoticeDelivered: input.kvkkNoticeDelivered,
    photoVideoConsentFormPresented: input.photoVideoConsentFormPresented,
    logoUrl: input.logoUrl,
    annexes,
  };

  const now = new Date().toISOString();
  const contractId = uid("contract");
  const { buildDocumentReference } = await import("./document-reference");
  const contractNumber = doc ? doc.reference : buildDocumentReference("trial_enrollment_record", contractId);
  const row: Stored = {
    id: contractId,
    tenantId: input.tenantId,
    studentId: input.studentId,
    contractNumber,
    versionNumber,
    contractType: input.contractType,
    previousContractId: previous?.id,
    documentInstanceId: doc?.id,
    templateVersion: templateVersionUsed,
    status: isFormal ? "generated" : "recorded",
    contractDataSnapshot: snapshot,
    programmeName: input.programmeName,
    enrollmentStartDate: input.enrollmentStartDate,
    enrollmentEndDate: input.enrollmentEndDate,
    durationMonths: input.durationMonths,
    monthlyAmount: input.monthlyAmount,
    installmentCount: input.installmentCount,
    totalContractAmount,
    depositAmount: input.depositAmount,
    paymentMethod: input.paymentMethod,
    signatoryFullName: input.signatoryFullName,
    signatoryNationalId: input.signatoryNationalId,
    signatoryAddress: input.signatoryAddress,
    signatoryRelationship: input.signatoryRelationship,
    createdBy: input.createdBy,
    generatedBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  if (isDbMode) {
    const { prisma } = await import("./db");
    await prisma.studentContract.create({
      data: {
        id: row.id,
        tenantId: row.tenantId,
        studentId: row.studentId,
        contractNumber: row.contractNumber,
        versionNumber: row.versionNumber,
        contractType: row.contractType,
        previousContractId: row.previousContractId,
        documentInstanceId: row.documentInstanceId,
        templateVersion: row.templateVersion,
        status: row.status,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        contractDataSnapshot: row.contractDataSnapshot as any,
        programmeName: row.programmeName,
        enrollmentStartDate: new Date(row.enrollmentStartDate),
        enrollmentEndDate: new Date(row.enrollmentEndDate),
        durationMonths: row.durationMonths,
        monthlyAmount: row.monthlyAmount,
        installmentCount: row.installmentCount,
        totalContractAmount: row.totalContractAmount,
        depositAmount: row.depositAmount,
        paymentMethod: row.paymentMethod,
        signatoryFullName: row.signatoryFullName,
        signatoryNationalId: row.signatoryNationalId,
        signatoryAddress: row.signatoryAddress,
        signatoryRelationship: row.signatoryRelationship,
        createdBy: row.createdBy,
        generatedBy: row.generatedBy,
      },
    });
    if (previous) {
      // 2026-10-04 — koşullu: aynı sürüm iki kez revize/yenilenemez (çift gönderim / eşzamanlı istek).
      const claimed = await prisma.studentContract.updateMany({
        where: { id: previous.id, tenantId: input.tenantId, status: { notIn: ["cancelled", "superseded"] } },
        data: { status: "superseded" },
      });
      if (claimed.count === 0) {
        await prisma.studentContract.delete({ where: { id: row.id } });
        throw new Error(
          "Bu sözleşme az önce başka bir işlemle revize edildi veya yenilendi; ikinci sürüm oluşturulmadı. Sayfayı yenileyip güncel sözleşmeyi kontrol edin."
        );
      }
    }
  } else {
    const all = await loadAll();
    if (previous && all.some((c) => c.id === previous!.id && (c.status === "cancelled" || c.status === "superseded"))) {
      throw new Error(
        "Bu sözleşme az önce başka bir işlemle revize edildi veya yenilendi; ikinci sürüm oluşturulmadı. Sayfayı yenileyip güncel sözleşmeyi kontrol edin."
      );
    }
    const next = [...all, row];
    const finalRows = previous
      ? next.map((c) => (c.id === previous!.id ? { ...c, status: "superseded" as ContractStatus, updatedAt: now } : c))
      : next;
    await saveAll(finalRows);
  }
  const rollbackContractRow = async (createdPaymentIds: string[]) => {
    // Bu işlemde yazılan satırlar (taksitler + bu çağrıda alınan ilk tahsilat) kaldırılır; önceden var olan
    // kayıt anı tahsilatı yalnız sözleşmeden ayrılır — gerçek tahsilat kaybolmaz. Önceki sürüm eski durumuna döner.
    const created = new Set(createdPaymentIds);
    if (isDbMode) {
      const { prisma } = await import("./db");
      await prisma.payment.deleteMany({
        where: { tenantId: input.tenantId, OR: [{ contractId: row.id, paidAmount: 0 }, { id: { in: createdPaymentIds } }] },
      });
      await prisma.payment.updateMany({
        where: { tenantId: input.tenantId, contractId: row.id },
        data: { contractId: null, installmentSequence: null },
      });
      await prisma.studentContract.deleteMany({ where: { id: row.id, tenantId: input.tenantId } });
      if (previous) {
        await prisma.studentContract.updateMany({ where: { id: previous.id, tenantId: input.tenantId }, data: { status: previous.status } });
      }
      return;
    }
    const { isMemoryMode } = await import("./config");
    const fileStore = isMemoryMode ? await import("./store-memory") : await import("./store-json");
    await fileStore.mutateStoreUnderLock(async (current) => ({
      ...current,
      payments: current.payments
        .filter((p) => !((p.contractId === row.id && p.paidAmount === 0) || created.has(p.id)))
        .map((p) => (p.contractId === row.id ? { ...p, contractId: undefined, installmentSequence: undefined } : p)),
    }));
    const all = await loadAll();
    await saveAll(
      all
        .filter((c) => c.id !== row.id)
        .map((c) => (previous && c.id === previous.id ? { ...c, status: previous.status, updatedAt: now } : c))
    );
  };



  // 2026-09-22 — TEK KANONİK İLK TAHSİLAT: kayıtta ilk tahsilatı alınmamış
  // öğrencinin (CSV ile gelen, eski kayıt) İLK sözleşmesinde formda girilen
  // tahsilat, normal kayıttaki gibi `registration_first_payment` olarak yazılır
  // ve 1. taksite bağlanır. Böylece kayıt özeti, "ilk tahsilatı düzelt"
  // (1 → 7000), iptal sonrası yeniden oluşturma ve finans ekranları CSV ile
  // normal öğrenci arasında AYNI satırı okur. Yenilemede (renewal) değişmez.
  // 2026-10-04 — başarısız işlem yarım sözleşme/yarım plan bırakmaz: buradan sonraki her hata kaydı geri alır.
  const createdPaymentIds: string[] = [];
  let paymentRows = installments;
  let amendmentCredit: { collected: number; applied: number; leftover: number } | undefined;
  try {
  if (input.contractType === "amendment" && previous) {
    const collected = await computePriorContractCollected(input.tenantId, previous.id);
    const allocated = allocatePriorCollections(installments, collected, previous.contractNumber);
    // Mahsupla tamamen kapanan satır yazılmaz (0 TL "bekliyor" borcu üretilmez).
    paymentRows = allocated.rows.filter((r) => r.amount > 0);
    amendmentCredit = { collected, applied: allocated.applied, leftover: allocated.leftover };
  }
  let reuseFirstPaymentId = registrationFirstPayment?.id;
  let firstPaymentForInstallments = registrationFirstPayment || fullyWaived ? undefined : input.firstPaymentCollected;
  if (input.contractType === "initial" && !registrationFirstPayment && !fullyWaived && input.firstPaymentCollected && requiresFirstPaymentAtRegistration) {
    const { addRegistrationFirstPayment } = await import("./store");
    const fp = input.firstPaymentCollected;
    const { paymentId } = await addRegistrationFirstPayment({
      studentId: input.studentId,
      method: fp.method,
      amount: fp.amount,
      collectedAt: fp.collectedAt,
      reference: fp.reference,
      note: fp.note,
      receivedByUserId: input.createdBy,
      firstCollectionIncludesNextMonth: input.mergeFirstCollectionWithNextMonth,
    });
    reuseFirstPaymentId = paymentId;
    createdPaymentIds.push(paymentId);
    firstPaymentForInstallments = undefined;
  }

  const installmentPayments = await createInstallmentPayments({
    tenantId: input.tenantId,
    studentId: input.studentId,
    contractId: row.id,
    // Burslu sözleşme: plan PDF/snapshot'ta 0 TL olarak görünür, ama Payment satırı üretilmez.
    installments: fullyWaived ? [] : paymentRows,
    firstPaymentCollected: firstPaymentForInstallments,
    reuseFirstPaymentId,
  });

  return { contract: toPublic(row), installments: installmentPayments, amendmentCredit };
  } catch (e) {
    await rollbackContractRow(createdPaymentIds).catch((rollbackError) => {
      logger.error("createContract rollback failed", rollbackError);
    });
    throw e;
  }
}

/** Sözleşme taksitlerini gerçek `Payment` satırları olarak oluşturur — mode-parity için src/lib/store.ts üzerinden (json/db/memory hepsi). */
async function createInstallmentPayments(input: {
  tenantId: string;
  studentId: string;
  contractId: string;
  installments: ContractInstallmentSnapshot[];
  firstPaymentCollected?: CreateContractInput["firstPaymentCollected"];
  reuseFirstPaymentId?: string;
}): Promise<ContractInstallmentView[]> {
  void input.tenantId; // ALS tenant context zaten çağıran API handler tarafından kurulmuştur (bkz. store.ts withTenantScope).
  const { addContractInstallments } = await import("./store");
  const { installments } = await addContractInstallments({
    contractId: input.contractId,
    studentId: input.studentId,
    installments: input.installments,
    firstPaymentCollected: input.firstPaymentCollected,
    reuseFirstPaymentId: input.reuseFirstPaymentId,
  });
  return installments;
}

export async function getContract(tenantId: string, id: string): Promise<StudentContract | null> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    const r = await prisma.studentContract.findFirst({ where: { id, tenantId } });
    return r ? mapDb(r) : null;
  }
  const all = await loadAll();
  const r = all.find((x) => x.id === id && x.tenantId === tenantId);
  return r ? toPublic(r) : null;
}

/**
 * TEK KANONİK SÖZLEŞME GÖRÜNTÜLEYİCİ (2026-09-20).
 *
 * Kök sorun: bir sözleşme aynı anda iki kayıt olarak var — `StudentContract`
 * (canlı veri + güncel render) ve ona bağlı `DocumentInstance` (üretildiği
 * andaki dondurulmuş `renderedHtml`). Öğrenci ekranı sözleşmeyi
 * `/sozlesme-yazdir/[contractId]` ile (GÜNCEL görünüm) açıyor, Evraklar
 * Merkezi ise aynı sözleşmeyi `/evrak-yazdir/[documentId]` ile (ESKİ, jenerik
 * evrak şablonu) açıyordu — kullanıcı bunu "eski UI geliyor" diye bildirdi.
 *
 * Bu eşleme sayesinde Evraklar da kanonik görüntüleyiciye yönlenir; dondurulmuş
 * snapshot SİLİNMEZ (hukuki arşiv), yalnız varsayılan görüntüleme yolu tekleşir.
 */
export async function findContractIdsByDocumentInstanceIds(
  tenantId: string,
  documentInstanceIds: string[]
): Promise<Record<string, string>> {
  const ids = Array.from(new Set(documentInstanceIds.filter(Boolean)));
  if (ids.length === 0) return {};
  if (isDbMode) {
    const { prisma } = await import("./db");
    const rows = await prisma.studentContract.findMany({
      where: { tenantId, documentInstanceId: { in: ids } },
      select: { id: true, documentInstanceId: true },
    });
    return Object.fromEntries(
      rows.filter((r) => r.documentInstanceId).map((r) => [r.documentInstanceId as string, r.id])
    );
  }
  const all = await loadAll();
  const wanted = new Set(ids);
  return Object.fromEntries(
    all
      .filter((x) => x.tenantId === tenantId && x.documentInstanceId && wanted.has(x.documentInstanceId))
      .map((x) => [x.documentInstanceId as string, x.id])
  );
}

/** Tek belge için kanonik sözleşme kimliği (yoksa null — belge sözleşme değildir veya legacy kayıttır). */
export async function findContractIdByDocumentInstanceId(
  tenantId: string,
  documentInstanceId: string
): Promise<string | null> {
  const map = await findContractIdsByDocumentInstanceIds(tenantId, [documentInstanceId]);
  return map[documentInstanceId] ?? null;
}

/**
 * UAT 2026-09-25 — tenant'ın iptal/yenilenmiş sözleşme kimlikleri (tek sorgu). Borç/gecikme/hatırlatma
 * hesapları bununla `isLiveObligation` (payment-profile.ts) kuralını uygular.
 */
export async function listTerminalContractIds(tenantId: string): Promise<Set<string>> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    const rows = await prisma.studentContract.findMany({
      where: { tenantId, status: { in: ["cancelled", "superseded"] } },
      select: { id: true },
    });
    return new Set(rows.map((r) => r.id));
  }
  const all = await loadAll();
  return new Set(all.filter((x) => x.tenantId === tenantId && (x.status === "cancelled" || x.status === "superseded")).map((x) => x.id));
}

/** Kurum kapsamındaki (tek veya birleşik görünüm) tenant'ların terminal sözleşme kimlikleri. */
export async function listTerminalContractIdsForScope(
  scope: { mode: "single"; tenantId: string } | { mode: "all"; tenantIds: string[] }
): Promise<Set<string>> {
  const ids = scope.mode === "single" ? [scope.tenantId] : scope.tenantIds;
  const sets = await Promise.all(ids.map((t) => listTerminalContractIds(t)));
  return new Set(sets.flatMap((s) => [...s]));
}

export async function listContractsForStudent(tenantId: string, studentId: string): Promise<StudentContract[]> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    const rows = await prisma.studentContract.findMany({
      where: { tenantId, studentId },
      orderBy: [{ versionNumber: "desc" }, { createdAt: "desc" }],
    });
    return rows.map(mapDb);
  }
  const all = await loadAll();
  return all
    .filter((x) => x.tenantId === tenantId && x.studentId === studentId)
    .sort((a, b) => b.versionNumber - a.versionNumber || b.createdAt.localeCompare(a.createdAt))
    .map(toPublic);
}

/**
 * D — Öğrenciler ekranı sözleşme filtreleri için, tenant'ın TÜM öğrencilerinin
 * sözleşme ÖZETİ (tek sorgu; öğrenci başına ayrı okuma YOK).
 *
 * Yalnız filtre için gereken en küçük alan kümesi döner — tam
 * `contractDataSnapshot` (büyük JSON) OKUNMAZ, böylece 500+ öğrencili bir
 * kurumda liste ekranı ağırlaşmaz.
 */
export type StudentContractSummary = {
  studentId: string;
  contractId: string;
  contractNumber: string;
  status: ContractStatus;
  enrollmentStartDate: string;
  enrollmentEndDate: string;
  versionNumber: number;
  /** Sözleşmedeki "Aylık ücret" — ders sayısına göre değişen taksitlerden bağımsız birim ücret. */
  monthlyAmount: number;
};

export async function listContractSummariesByStudent(
  tenantId: string
): Promise<Map<string, StudentContractSummary>> {
  let rows: StudentContractSummary[];
  if (isDbMode) {
    const { prisma } = await import("./db");
    const found = await prisma.studentContract.findMany({
      where: { tenantId },
      select: {
        id: true,
        studentId: true,
        contractNumber: true,
        status: true,
        enrollmentStartDate: true,
        enrollmentEndDate: true,
        versionNumber: true,
        monthlyAmount: true,
      },
      orderBy: [{ versionNumber: "desc" }, { createdAt: "desc" }],
    });
    rows = found.map((r) => ({
      monthlyAmount: r.monthlyAmount,
      studentId: r.studentId,
      contractId: r.id,
      contractNumber: r.contractNumber,
      status: r.status as ContractStatus,
      enrollmentStartDate: r.enrollmentStartDate.toISOString().slice(0, 10),
      enrollmentEndDate: r.enrollmentEndDate.toISOString().slice(0, 10),
      versionNumber: r.versionNumber,
    }));
  } else {
    const all = await loadAll();
    rows = all
      .filter((x) => x.tenantId === tenantId)
      .sort((a, b) => b.versionNumber - a.versionNumber)
      .map((x) => ({
        monthlyAmount: x.monthlyAmount,
        studentId: x.studentId,
        contractId: x.id,
        contractNumber: x.contractNumber,
        status: x.status,
        enrollmentStartDate: x.enrollmentStartDate.slice(0, 10),
        enrollmentEndDate: x.enrollmentEndDate.slice(0, 10),
        versionNumber: x.versionNumber,
      }));
  }

  /**
   * Öğrenci başına TEK özet: `getLatestContractForStudent` ile AYNI kural —
   * önce iptal/yenilenmiş olmayanların en yüksek versiyonu, hiç yoksa
   * en yüksek versiyonlu kayıt. İki farklı "güncel sözleşme" tanımı
   * bırakmamak için kural burada da birebir tekrarlanır, gevşetilmez.
   */
  const byStudent = new Map<string, StudentContractSummary>();
  for (const row of rows) {
    const current = byStudent.get(row.studentId);
    if (!current) {
      byStudent.set(row.studentId, row);
      continue;
    }
    const rowActive = row.status !== "cancelled" && row.status !== "superseded";
    const currentActive = current.status !== "cancelled" && current.status !== "superseded";
    if (rowActive && !currentActive) byStudent.set(row.studentId, row);
    else if (rowActive === currentActive && row.versionNumber > current.versionNumber) {
      byStudent.set(row.studentId, row);
    }
  }
  return byStudent;
}

/**
 * Güncel sözleşme — cancelled/superseded HARİÇ en yüksek versiyon
 * (eşitlikte en yeni createdAt). Hepsi iptal/yenilenmişse null.
 * `selectCurrentContract` ile aynı kural; iptal edilmiş kayıt asla dönmez.
 */
export async function getLatestContractForStudent(tenantId: string, studentId: string): Promise<StudentContract | null> {
  const { selectCurrentContract } = await import("./contract-list-helpers");
  const all = await listContractsForStudent(tenantId, studentId);
  return selectCurrentContract(all);
}

export async function listInstallmentsForContract(tenantId: string, contractId: string): Promise<ContractInstallmentView[]> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    const rows = await prisma.payment.findMany({
      where: { tenantId, contractId },
      orderBy: { installmentSequence: "asc" },
    });
    return rows.map((r) => ({
      paymentId: r.id,
      sequence: r.installmentSequence ?? 0,
      dueDate: r.dueDate.toISOString(),
      amount: r.amount,
      paidAmount: r.paidAmount,
      status: r.status,
      paidAt: r.paidAt ? r.paidAt.toISOString() : undefined,
      paymentMethod: r.method ?? undefined,
    }));
  }
  const { readData } = await import("./store-json");
  const data = await readData();
  return data.payments
    .filter((p) => p.contractId === contractId)
    .sort((a, b) => (a.installmentSequence ?? 0) - (b.installmentSequence ?? 0))
    .map((p) => ({
      paymentId: p.id,
      sequence: p.installmentSequence ?? 0,
      dueDate: p.dueDate,
      amount: p.amount,
      paidAmount: p.paidAmount,
      status: p.status,
      paidAt: p.paidAt,
      paymentMethod: p.method,
    }));
}

async function updateStatus(
  tenantId: string,
  id: string,
  patch: Partial<Pick<StudentContract, "status" | "printedBy" | "printedAt" | "signedAt">>
): Promise<StudentContract | null> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    const existing = await prisma.studentContract.findFirst({ where: { id, tenantId } });
    if (!existing) return null;
    const r = await prisma.studentContract.update({
      where: { id },
      data: {
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.printedBy !== undefined ? { printedBy: patch.printedBy } : {}),
        ...(patch.printedAt !== undefined ? { printedAt: new Date(patch.printedAt) } : {}),
        ...(patch.signedAt !== undefined ? { signedAt: new Date(patch.signedAt) } : {}),
      },
    });
    return mapDb(r);
  }
  const all = await loadAll();
  const idx = all.findIndex((x) => x.id === id && x.tenantId === tenantId);
  if (idx < 0) return null;
  all[idx] = { ...all[idx], ...patch, updatedAt: new Date().toISOString() };
  await saveAll(all);
  return toPublic(all[idx]);
}

/** Trial (documentInstanceId yok) kayıtlarda yazdırma/imza adımları GEÇERSİZDİR — formal belge üretilmedi. */
export class TrialContractHasNoDocumentError extends Error {
  constructor() {
    super("Bu bir tanışma paketi kaydıdır (1-2 ay); resmi sözleşme belgesi üretilmedi, yazdırma/imza adımı geçerli değil.");
  }
}

/** Yazdır — bağlı DocumentInstance'ı da (printCount++) işaretler. */
export async function markContractPrinted(tenantId: string, id: string, printedBy: string): Promise<StudentContract | null> {
  const contract = await getContract(tenantId, id);
  if (!contract) return null;
  if (!contract.documentInstanceId) throw new TrialContractHasNoDocumentError();
  const { markDocumentPrinted } = await import("./documents");
  await markDocumentPrinted(tenantId, contract.documentInstanceId);
  const now = new Date().toISOString();
  return updateStatus(tenantId, id, { status: "printed", printedBy, printedAt: now });
}

/** Staff, basılan nüshayı ıslak imzaya gönderdiğini bildirir. */
export async function markContractWetSignaturePending(tenantId: string, id: string): Promise<StudentContract | null> {
  const contract = await getContract(tenantId, id);
  if (!contract) return null;
  if (!contract.documentInstanceId) throw new TrialContractHasNoDocumentError();
  return updateStatus(tenantId, id, { status: "wet_signature_pending" });
}

/** İmzalı taranmış nüsha yükleme — bağlı DocumentInstance'ın MEVCUT imzalı-dosya akışını kullanır. */
export async function uploadContractSignedScan(
  tenantId: string,
  id: string,
  file: { fileName: string; fileMimeType: string; fileData: string; fileSize: number },
  uploadedBy: string
): Promise<StudentContract | null> {
  const contract = await getContract(tenantId, id);
  if (!contract) return null;
  if (!contract.documentInstanceId) throw new TrialContractHasNoDocumentError();
  const { uploadSignedDocumentFile } = await import("./documents");
  const doc = await uploadSignedDocumentFile(tenantId, contract.documentInstanceId, file, uploadedBy);
  if (!doc) return null;
  const now = new Date().toISOString();
  return updateStatus(tenantId, id, { status: "signed", signedAt: now });
}

/** Yanlışlıkla oluşturulmuş bir sözleşmeyi iptal eder — hard delete YOK, tarihçe korunur. */
export async function cancelContract(tenantId: string, id: string): Promise<StudentContract | null> {
  return updateStatus(tenantId, id, { status: "cancelled" });
}

type DbContractRow = {
  id: string;
  studentId: string;
  contractNumber: string;
  versionNumber: number;
  contractType: string;
  previousContractId: string | null;
  documentInstanceId: string | null;
  templateVersion: number | null;
  status: string;
  contractDataSnapshot: unknown;
  programmeName: string;
  enrollmentStartDate: Date;
  enrollmentEndDate: Date;
  durationMonths: number;
  monthlyAmount: number;
  installmentCount: number;
  totalContractAmount: number;
  depositAmount: number | null;
  paymentMethod: string | null;
  signatoryFullName: string;
  signatoryNationalId: string | null;
  signatoryAddress: string | null;
  signatoryRelationship: string | null;
  createdBy: string;
  generatedBy: string;
  printedBy: string | null;
  printedAt: Date | null;
  signedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function mapDb(r: DbContractRow): StudentContract {
  return {
    id: r.id,
    studentId: r.studentId,
    contractNumber: r.contractNumber,
    versionNumber: r.versionNumber,
    contractType: r.contractType as ContractType,
    previousContractId: r.previousContractId ?? undefined,
    documentInstanceId: r.documentInstanceId ?? undefined,
    templateVersion: r.templateVersion ?? undefined,
    status: r.status as ContractStatus,
    contractDataSnapshot: r.contractDataSnapshot as ContractDataSnapshot,
    programmeName: r.programmeName,
    enrollmentStartDate: r.enrollmentStartDate.toISOString(),
    enrollmentEndDate: r.enrollmentEndDate.toISOString(),
    durationMonths: r.durationMonths,
    monthlyAmount: r.monthlyAmount,
    installmentCount: r.installmentCount,
    totalContractAmount: r.totalContractAmount,
    depositAmount: r.depositAmount ?? undefined,
    paymentMethod: r.paymentMethod ?? undefined,
    signatoryFullName: r.signatoryFullName,
    signatoryNationalId: r.signatoryNationalId ?? undefined,
    signatoryAddress: r.signatoryAddress ?? undefined,
    signatoryRelationship: r.signatoryRelationship ?? undefined,
    createdBy: r.createdBy,
    generatedBy: r.generatedBy,
    printedBy: r.printedBy ?? undefined,
    printedAt: r.printedAt ? r.printedAt.toISOString() : undefined,
    signedAt: r.signedAt ? r.signedAt.toISOString() : undefined,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export function contractStatusLabel(status: ContractStatus): string {
  const labels: Record<ContractStatus, string> = {
    draft: "Taslak",
    generated: "Oluşturuldu",
    printed: "Yazdırıldı",
    wet_signature_pending: "Islak imza bekleniyor",
    signed: "İmzalandı",
    recorded: "Kayıt tamamlandı (tanışma paketi, sözleşme gerekmiyor)",
    superseded: "Yenilendi (eski sürüm)",
    cancelled: "İptal edildi",
  };
  return labels[status] ?? status;
}

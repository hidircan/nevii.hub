/**
 * P0 (2026-09-09) — YOKLAMA TAKVİMİ AY TUTARI: SÖZLEŞME SNAPSHOT'INDAN OKUR.
 *
 * ÖNCEDEN: Yoklama Takvimi ilgili ayın tutarını KENDİ hesaplıyordu
 * (`countBillableLessonsInRange` + `computePeriodAmount(monthlyFee, …)`).
 * Bu, aynı finansal bilgiyi üreten İKİNCİ bir kaynaktı: sözleşme
 * oluşturulduktan sonra ders sayısı değişirse (ders eklenir/iptal edilir/
 * telafiye gider) takvim, sözleşmenin dondurulmuş planından FARKLI bir tutar
 * göstermeye başlıyordu. Sözleşme önizlemesi, ödeme planı, tahsilat ekranı ve
 * takvimin ayrışması kaçınılmazdı.
 *
 * ARTIK: tek doğruluk kaynağı, sözleşme oluşturulurken DONDURULAN ödeme
 * planıdır. O plan, `addContractInstallments` tarafından `Payment` satırları
 * olarak maddileştirilir (`source:"contract"`, `contractId`,
 * `installmentSequence`, dondurulmuş `amount`/`dueDate`). Bu dosya yalnız o
 * satırları OKUR ve toplar — hiçbir tutarı yeniden TÜRETMEZ:
 * `billableLessonCount`, `derivePerLessonAmount`, `monthlyFee × ders /
 * referans` ve yeni bir yuvarlama formülü bu dosyada KULLANILMAZ.
 *
 * Saf: I/O yok, store/DB'ye dokunmaz, aynı girdiye aynı çıktıyı verir.
 */

import { remainingAmount, resolveCollectionStatus } from "./payments/status";
import type { ContractStatus, PaymentStatus, ContractInstallmentKind } from "./types";

/**
 * Ödeme kaynağı OLABİLECEK sözleşme statüleri. `draft` bilinçli olarak
 * DIŞARIDA: taslak bir sözleşme henüz onaylanmamıştır, veliye tebliğ
 * edilmemiştir ve tutarı finansal gerçek sayılamaz. `cancelled`/`superseded`
 * de dışarıdadır (iptal edilmiş ya da yeni bir sürümle değiştirilmiş).
 */
const PLAN_ELIGIBLE_STATUSES: ReadonlySet<ContractStatus> = new Set<ContractStatus>([
  "generated",
  "printed",
  "wet_signature_pending",
  "signed",
  "recorded",
]);

export function isPlanEligibleContractStatus(status: ContractStatus): boolean {
  return PLAN_ELIGIBLE_STATUSES.has(status);
}

/** Çözümleyicinin sözleşmeden ihtiyaç duyduğu minimal alanlar. */
export interface CalendarPlanContract {
  id: string;
  /** 2026-10-09 — sözleşmenin branş kaydı (takvim branş başına süzer). */
  enrollmentId?: string;
  contractNumber: string;
  status: ContractStatus;
  /** ISO tarih ya da tam ISO datetime — yalnız "yyyy-MM" kısmı kullanılır. */
  enrollmentStartDate: string;
  enrollmentEndDate: string;
}

/** Çözümleyicinin taksit satırından ihtiyaç duyduğu minimal alanlar (Payment). */
export interface CalendarPlanInstallment {
  id: string;
  contractId?: string;
  installmentSequence?: number;
  /** Sözleşme oluşturulurken DONDURULAN tutar — yeniden hesaplanmaz. */
  amount: number;
  paidAmount: number;
  dueDate: string;
  status: string;
  kind?: ContractInstallmentKind;
  periodLabel?: string;
  /** `Payment` satırındaki adları — çağıranlar doğrudan `Payment` geçirir. */
  installmentPeriodLabel?: string;
  installmentBreakdown?: { periodLabel: string; amount: number }[];
  /** Sözleşmesiz plan satırlarını ayırt etmek için (`Payment.source`). */
  source?: string;
  /** Gerçek tahsilat anı ve şekli — ay kutusunda sabit gösterilir (2026-10-05). */
  paidAt?: string;
  method?: string;
  /** Tahsilat notu (dekont no vb.) — ay kutusunda tahsilatla birlikte gösterilir. */
  paymentNote?: string;
  /** Sözleşmesiz aylık plan satırının açıklaması ("Aylık plan — 2026-10 (…)") — eski satırlarda dönem ayı burada. */
  description?: string;
  /** Kayıt ekranındaki AÇIK "takip eden ayı da ekle" seçimi (`Payment.firstCollectionIncludesNextMonth`). */
  firstCollectionIncludesNextMonth?: boolean;
}

/** Ayın tahsilatları: satır başına fiilen alınan tutar + tahsilat anı + şekli (en eski önce). */
/** `paidAt` = TAHSİLAT TARİHİ (paranın alındığı gün); hangi aya sayıldığı satırın dönem ayıdır. */
/** `paymentId` + `rowPaidAmount`: "Düzelt" MEVCUT satırı düzenler (çok aylı tahsilatta satır toplamı, ay payı değil). */
export type CalendarMonthCollection = {
  paidAt: string;
  method?: string;
  amount: number;
  note?: string;
  paymentId: string;
  rowPaidAmount: number;
};

/** Bir satırın verilen aya düşen payı (satır + pay). */
type RowShare = { row: CalendarPlanInstallment; share: InstallmentMonthShare };

function sharesForMonth(rows: CalendarPlanInstallment[], monthKey: string): RowShare[] {
  return rows.flatMap((row) => {
    const share = installmentMonthShares(row).find((s) => s.month === monthKey);
    return share ? [{ row, share }] : [];
  });
}

/** Tahsilat satırı: gerçek tahsilat tarihi + o aya MAHSUP edilen pay (çok aylı tahsilat her ayda yalnız kendi payıyla). */
function collectionsOf(items: RowShare[]): CalendarMonthCollection[] {
  return items
    .filter(({ row, share }) => row.paidAt && share.paidAmount > 0 && row.status !== "voided")
    .map(({ row, share }) => ({
      paidAt: row.paidAt!,
      method: row.method,
      amount: share.paidAmount,
      ...(row.paymentNote ? { note: row.paymentNote } : {}),
      paymentId: row.id,
      rowPaidAmount: row.paidAmount,
    }))
    .sort((a, b) => a.paidAt.localeCompare(b.paidAt));
}

/**
 * 8. tur — sözleşmesiz öğrencinin KENDİ planına sayılan satırlar: kayıttaki ilk
 * tahsilat + takvimden/ödemelerden açılan aylık plan satırları (sözleşmeye bağlı değil).
 */
const STUDENT_PLAN_SOURCES = new Set(["registration_first_payment", "monthly_plan"]);

export type CalendarMonthPlan =
  | {
      state: "ok";
      contractId: string;
      contractNumber: string;
      /** Bu aya düşen plan satırlarının 1-tabanlı sıraları. */
      installmentSequences: number[];
      paymentIds: string[];
      /** Sözleşmede DONDURULMUŞ ödenecek tutar (birden fazla satır varsa toplamı). */
      amount: number;
      paidAmount: number;
      remaining: number;
      status: PaymentStatus;
      /** "Ekim 2026" gibi — sözleşme satırından gelir, burada üretilmez. */
      periodLabel?: string;
      collections: CalendarMonthCollection[];
    }
  | {
      /**
       * 8. tur — sözleşme YOK ama öğrencinin kendi ödeme planı var (sözleşme 2026-09-22'den
       * beri kayıtta opsiyonel; tanışma paketi / sözleşme bekleyen öğrenci). Tutarlar yalnız
       * o aya ait gerçek Payment satırlarından toplanır; satır yoksa borç UYDURULMAZ
       * (`paymentIds` boş, `amount` 0) ve aylık ücret ay kutusunda gösterilmez.
       */
      state: "student_plan";
      paymentIds: string[];
      amount: number;
      paidAmount: number;
      remaining: number;
      status?: PaymentStatus;
      message: string;
      collections: CalendarMonthCollection[];
      /**
       * 2026-10-14 — bu ay, kırılımı kayda işlenmemiş eski bir birleşik kayıt tahsilatına dahil (açık "takip eden ay"
       * seçimi): ay karşılanmış sayılır, tutarı tahmin edilmez. Ekranda açıkça yazılır; kırılım yazılınca kaybolur.
       */
      coveredByCombinedFirstCollection?: { paymentId: string; paidAt?: string };
    }
  | {
      state: "no_active_contract";
      message: string;
    }
  | {
      state: "no_installment_for_month";
      contractId: string;
      contractNumber: string;
      message: string;
    }
  | {
      state: "multiple_active_contracts";
      contractNumbers: string[];
      message: string;
    };

/** "2026-10-01T00:00:00.000Z" → "2026-10" */
function monthKeyOf(isoDate: string): string {
  return isoDate.slice(0, 7);
}

const TR_MONTH_NUMBER: Record<string, number> = {
  Ocak: 1, Şubat: 2, Mart: 3, Nisan: 4, Mayıs: 5, Haziran: 6,
  Temmuz: 7, Ağustos: 8, Eylül: 9, Ekim: 10, Kasım: 11, Aralık: 12,
};

/** `formatPeriodLabel` (contracts.ts) çıktısı: "Ekim 2026" / "17–30 Eylül 2026" → "2026-10" / "2026-09". */
function monthKeyOfPeriodLabel(label: string | undefined): string | undefined {
  const m = label?.match(/(\p{L}+)\s+(\d{4})\s*$/u);
  const month = m ? TR_MONTH_NUMBER[m[1]!] : undefined;
  return month ? `${m![2]}-${String(month).padStart(2, "0")}` : undefined;
}

/**
 * UAT 2026-09-24 (F) — taksit satırının KAPSADIĞI ay(lar). Vade ayı dönem ayı
 * değildir: birleşik ilk tahsilat ("17–30 Eylül 2026 + Ekim 2026") tek satırdır
 * ve vadesi kayıt günüdür; önizlemede vadesi elle önceki aya alınmış taksit de
 * kendi dönemine aittir. Önce dönem etiketi/kırılımı, yoksa (legacy) vade ayı.
 */
export function installmentMonthKeys(p: CalendarPlanInstallment): string[] {
  return installmentMonthShares(p).map((s) => s.month);
}

/**
 * 2026-10-14 — bir ödeme satırının dönem(ler)e dağılımı: TEK kural. Takvim ay kutusu, öğrenci dökümü ve sözleşmesiz
 * tahakkuk (`standalone-monthly-accrual.ts`) aynı fonksiyonu okur; böylece "bu ay karşılandı mı" ve "bu aya ne kadar
 * mahsup edildi" sorularının iki ayrı cevabı olmaz.
 *
 * - `amount`: satırın o döneme düşen BORCU; `paidAmount`: o döneme MAHSUP edilen tahsilat. Toplamlar satırın kendi
 *   `amount`/`paidAmount`'ına eşittir — aynı para iki ayda sayılmaz, mahsup tahsilatı aşmaz.
 * - Dönem kırılımı (`installmentBreakdown`) varsa borç, kırılım tutarları sırayla doldurularak dağıtılır; satır tutarı
 *   kırılım toplamından farklıysa (manuel tutar) fark/eksik SON döneme düşer. Tahsilat en eski dönemden başlayarak
 *   mahsup edilir (kısmi ödeme / iade sonrası eksik kalan, en yeni dönemdir).
 * - Kırılımı OLMAYAN eski kayıt ilk tahsilatında "takip eden ayı da ekle" seçiliyse (açık seçim), sonraki ay
 *   KARŞILANMIŞ sayılır ama tutarı kayda işlenmemiştir: o ayın payı 0'dır ve `unsplit` işaretlenir. Tutar TAHMİN
 *   edilmez (öğrencinin bugünkü ücretinden türetilmez); kırılım `scripts/backfill-first-collection-periods.ts` ile,
 *   onaydan sonra yazılır.
 */
export type InstallmentMonthShare = {
  month: string;
  amount: number;
  paidAmount: number;
  /** Kırılımdaki dönem etiketi ("24–30 Eylül 2026" / "Ekim 2026"); yoksa satırın etiketi. */
  periodLabel?: string;
  /** Birleşik eski tahsilatın tutarı kayda işlenmemiş ikinci ayı. */
  unsplit?: true;
};

/** `total`'ı sırayla `caps`'e doldurur; artan son paya eklenir. Saf, deterministik. */
export function allocateInOrder(total: number, caps: number[]): number[] {
  let left = Math.max(0, Math.trunc(total));
  const out = caps.map((c) => {
    const take = Math.min(left, Math.max(0, Math.trunc(c)));
    left -= take;
    return take;
  });
  if (out.length > 0) out[out.length - 1]! += left;
  return out;
}

function nextMonthKeyOf(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

export function installmentMonthShares(p: CalendarPlanInstallment): InstallmentMonthShare[] {
  const amount = Math.trunc(p.amount);
  const paid = Math.trunc(p.paidAmount);
  const parts = (p.installmentBreakdown ?? [])
    .map((b) => ({ month: monthKeyOfPeriodLabel(b.periodLabel), cap: b.amount, label: b.periodLabel }))
    .filter((b): b is { month: string; cap: number; label: string } => !!b.month);
  if (parts.length > 0) {
    const amounts = allocateInOrder(amount, parts.map((b) => b.cap));
    const paids = allocateInOrder(paid, amounts);
    return parts.map((b, i) => ({ month: b.month, amount: amounts[i]!, paidAmount: paids[i]!, periodLabel: b.label }));
  }
  const label = p.installmentPeriodLabel ?? p.periodLabel;
  const fromLabel = monthKeyOfPeriodLabel(label);
  // 2026-10-06 — sözleşmesiz aylık plan: dönem ayı, kullanıcının SEÇTİĞİ ay kutusudur (açıklamaya yazılan ay).
  // Eski takvim tahsilatı vadeye TAHSİLAT günü yazıyordu (Ekim kutusu + 30.09 → Eylül'de görünüyordu);
  // tahsilat tarihi asla dönem ayını belirlemez.
  const fromDescription = p.source === "monthly_plan" ? monthlyPlanMonthOfDescription(p.description) : undefined;
  const month = fromLabel ?? fromDescription ?? monthKeyOf(p.dueDate);
  const own: InstallmentMonthShare = { month, amount, paidAmount: paid, ...(label ? { periodLabel: label } : {}) };
  if (p.source === "registration_first_payment" && !p.contractId && p.firstCollectionIncludesNextMonth && !fromLabel) {
    return [own, { month: nextMonthKeyOf(month), amount: 0, paidAmount: 0, unsplit: true }];
  }
  return [own];
}

const TR_MONTH_NAMES = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

/** "2026-10" → "Ekim 2026" — sözleşmesiz aylık plan satırının KALICI dönem etiketi (`installmentPeriodLabel`). */
export function monthlyPlanPeriodLabel(month: string): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return `${TR_MONTH_NAMES[m - 1]} ${y}`;
}

/** "Aylık plan — 2026-10 (6950 TL)" → "2026-10". */
export function monthlyPlanMonthOfDescription(description: string | undefined): string | undefined {
  return description?.match(/^Aylık plan — (\d{4}-\d{2})/)?.[1];
}

/** Bu satır, verilen dönem ayının sözleşmesiz aylık plan satırı mı (tek kural: tahsilat tarihinden bağımsız). */
export function isMonthlyPlanRowForMonth(p: CalendarPlanInstallment & { studentId?: string }, month: string): boolean {
  return p.source === "monthly_plan" && !p.contractId && installmentMonthKeys(p).includes(month);
}

/** Sözleşmenin kayıt aralığı verilen takvim ayını kapsıyor mu? */
export function contractCoversMonth(contract: CalendarPlanContract, monthKey: string): boolean {
  const start = monthKeyOf(contract.enrollmentStartDate);
  const end = monthKeyOf(contract.enrollmentEndDate);
  return monthKey >= start && monthKey <= end;
}

/**
 * Bir öğrencinin verilen takvim ayı için ödeme planı durumunu çözer.
 *
 * `installments` çağıran tarafından ZATEN okunmuş `Payment` listesinden
 * verilir (takvim yükü nasılsa `AppData`'yı okuyor) — bu fonksiyon için
 * ek bir sorgu/okuma YAPILMAZ.
 */
export function resolveContractPlanForMonth(input: {
  contracts: CalendarPlanContract[];
  installments: CalendarPlanInstallment[];
  year: number;
  month: number;
  now?: Date;
  /** Öğrencinin anlaşılan aylık ücreti — yalnız sözleşmesi hiç olmayan öğrencide tahsilat akışını açar (tutar türetmez). */
  studentMonthlyFee?: number;
}): CalendarMonthPlan {
  const monthKey = `${input.year}-${String(input.month).padStart(2, "0")}`;

  const covering = input.contracts
    .filter((c) => isPlanEligibleContractStatus(c.status))
    .filter((c) => contractCoversMonth(c, monthKey));

  if (covering.length === 0) {
    const own = sharesForMonth(
      input.installments.filter((p) => !p.contractId && STUDENT_PLAN_SOURCES.has(p.source ?? "") && p.status !== "voided"),
      monthKey
    );
    const fee = input.studentMonthlyFee && input.studentMonthlyFee > 0 ? input.studentMonthlyFee : undefined;
    // 2026-10-20 — ay kutusu yalnız o aya ait GERÇEK yükümlülüğü gösterir. Sözleşmesi olan öğrencinin sözleşme dönemi
    // dışındaki ayı (başlamadan önce / bittikten sonra) o aya ait satır yoksa boştur; karttaki aylık ücret her aya
    // "sözleşmesiz plan" olarak yayılmaz (Arcan Ü. / Faruk L. — Eylül kutusunda ücret görünüyordu).
    const hasOtherContract = input.contracts.some((c) => isPlanEligibleContractStatus(c.status));
    if (own.length === 0 && (!fee || hasOtherContract)) {
      return {
        state: "no_active_contract",
        message: hasOtherContract
          ? "Bu ay sözleşme dönemi dışında — bu aya ait ödeme kaydı yok."
          : "Bu ay için aktif ödeme planı bulunmuyor.",
      };
    }
    const amount = own.reduce((sum, r) => sum + r.share.amount, 0);
    const paidAmount = own.reduce((sum, r) => sum + r.share.paidAmount, 0);
    const earliestDue = own.reduce<string | undefined>((min, r) => (!min || r.row.dueDate < min ? r.row.dueDate : min), undefined);
    const combined = own.find((r) => r.share.unsplit);
    return {
      state: "student_plan",
      paymentIds: own.map((r) => r.row.id),
      amount,
      paidAmount,
      remaining: remainingAmount(amount, paidAmount),
      status: earliestDue ? resolveCollectionStatus({ amount, paidAmount, dueDate: earliestDue, now: input.now }) : undefined,
      collections: collectionsOf(own),
      ...(combined ? { coveredByCombinedFirstCollection: { paymentId: combined.row.id, ...(combined.row.paidAt ? { paidAt: combined.row.paidAt } : {}) } } : {}),
      message:
        own.length > 0
          ? "Sözleşmesiz aylık plan (öğrenci kartındaki ödeme bilgisi)."
          : "Sözleşmesiz aylık plan — bu ay için henüz ödeme kaydı yok.",
    };
  }
  if (covering.length > 1) {
    // Rule 7 — sessiz seçim YAPILMAZ. Hangi sözleşmenin geçerli olduğu bir
    // İNSAN kararıdır; sistemin rastgele/ilk olanı seçmesi yanlış tutar
    // göstermekten daha tehlikelidir (kimse fark etmez).
    return {
      state: "multiple_active_contracts",
      contractNumbers: covering.map((c) => c.contractNumber),
      message:
        "Bu ay için birden fazla aktif sözleşme var — tutar belirsiz. Sözleşme Merkezi'nden hangisinin geçerli olduğunu netleştirin.",
    };
  }

  const contract = covering[0]!;
  const rows = sharesForMonth(
    input.installments.filter((p) => p.contractId === contract.id && p.installmentSequence != null),
    monthKey
  ).sort((a, b) => (a.row.installmentSequence ?? 0) - (b.row.installmentSequence ?? 0));

  if (rows.length === 0) {
    return {
      state: "no_installment_for_month",
      contractId: contract.id,
      contractNumber: contract.contractNumber,
      // Plan VAR, yalnız bu aya taksit düşmüyor — "plan yok" demek gerçeği gizler.
      message: `${contract.contractNumber} numaralı sözleşmede bu aya düşen taksit yok. Taksit planını Sözleşme Merkezi'nde kontrol edin.`,
    };
  }

  // Dondurulmuş tutarların bu aya düşen PAYLARI — birleşik ilk tahsilat (Eylül + Ekim) her ayda yalnız kendi
  // kırılım tutarıyla görünür; yeni oranlama/yuvarlama YOK (pay = kırılımın kendisi).
  const amount = rows.reduce((s, r) => s + r.share.amount, 0);
  const paidAmount = rows.reduce((s, r) => s + r.share.paidAmount, 0);
  const earliestDueDate = rows.reduce((min, r) => (r.row.dueDate < min ? r.row.dueDate : min), rows[0]!.row.dueDate);

  return {
    state: "ok",
    contractId: contract.id,
    contractNumber: contract.contractNumber,
    installmentSequences: rows.map((r) => r.row.installmentSequence!),
    paymentIds: rows.map((r) => r.row.id),
    amount,
    paidAmount,
    remaining: remainingAmount(amount, paidAmount),
    status: resolveCollectionStatus({ amount, paidAmount, dueDate: earliestDueDate, now: input.now }),
    periodLabel: rows.length === 1 ? rows[0]!.share.periodLabel : undefined,
    collections: collectionsOf(rows),
  };
}

/** Ayın gerçek plan satırı var mı (sözleşme taksiti VEYA sözleşmesiz planın ödeme satırı)? */
export function planHasRows(
  plan: CalendarMonthPlan
): plan is Extract<CalendarMonthPlan, { state: "ok" }> | Extract<CalendarMonthPlan, { state: "student_plan" }> {
  return plan.state === "ok" || (plan.state === "student_plan" && plan.paymentIds.length > 0);
}

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
}

/** Ayın tahsilatları: satır başına fiilen alınan tutar + tahsilat anı + şekli (en eski önce). */
/** `paidAt` = TAHSİLAT TARİHİ (paranın alındığı gün); hangi aya sayıldığı satırın dönem ayıdır. */
export type CalendarMonthCollection = { paidAt: string; method?: string; amount: number; note?: string };

function collectionsOf(rows: CalendarPlanInstallment[]): CalendarMonthCollection[] {
  return rows
    .filter((r) => r.paidAt && r.paidAmount > 0 && r.status !== "voided")
    .map((r) => ({ paidAt: r.paidAt!, method: r.method, amount: Math.trunc(r.paidAmount), ...(r.paymentNote ? { note: r.paymentNote } : {}) }))
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
       * (`paymentIds` boş, `amount` 0) — yalnız anlaşılan aylık ücret bilgi olarak taşınır.
       */
      state: "student_plan";
      paymentIds: string[];
      amount: number;
      paidAmount: number;
      remaining: number;
      status?: PaymentStatus;
      monthlyFee?: number;
      message: string;
      collections: CalendarMonthCollection[];
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
  const fromBreakdown = (p.installmentBreakdown ?? [])
    .map((b) => monthKeyOfPeriodLabel(b.periodLabel))
    .filter((k): k is string => !!k);
  if (fromBreakdown.length > 0) return fromBreakdown;
  const fromLabel = monthKeyOfPeriodLabel(p.installmentPeriodLabel ?? p.periodLabel);
  // 2026-10-06 — sözleşmesiz aylık plan: dönem ayı, kullanıcının SEÇTİĞİ ay kutusudur (açıklamaya yazılan ay).
  // Eski takvim tahsilatı vadeye TAHSİLAT günü yazıyordu (Ekim kutusu + 30.09 → Eylül'de görünüyordu);
  // tahsilat tarihi asla dönem ayını belirlemez.
  const fromDescription = p.source === "monthly_plan" ? monthlyPlanMonthOfDescription(p.description) : undefined;
  return [fromLabel ?? fromDescription ?? monthKeyOf(p.dueDate)];
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
  /** Öğrencinin anlaşılan aylık ücreti — sözleşmesiz plan bilgisi için (tutar türetmez). */
  studentMonthlyFee?: number;
}): CalendarMonthPlan {
  const monthKey = `${input.year}-${String(input.month).padStart(2, "0")}`;

  const covering = input.contracts
    .filter((c) => isPlanEligibleContractStatus(c.status))
    .filter((c) => contractCoversMonth(c, monthKey));

  if (covering.length === 0) {
    const own = input.installments.filter(
      (p) => !p.contractId && STUDENT_PLAN_SOURCES.has(p.source ?? "") && p.status !== "voided" && installmentMonthKeys(p).includes(monthKey)
    );
    const fee = input.studentMonthlyFee && input.studentMonthlyFee > 0 ? input.studentMonthlyFee : undefined;
    if (own.length === 0 && !fee) {
      return {
        state: "no_active_contract",
        message: "Bu ay için aktif ödeme planı bulunmuyor.",
      };
    }
    const amount = own.reduce((sum, r) => sum + Math.trunc(r.amount), 0);
    const paidAmount = own.reduce((sum, r) => sum + Math.trunc(r.paidAmount), 0);
    const earliestDue = own.reduce<string | undefined>((min, r) => (!min || r.dueDate < min ? r.dueDate : min), undefined);
    return {
      state: "student_plan",
      paymentIds: own.map((r) => r.id),
      amount,
      paidAmount,
      remaining: remainingAmount(amount, paidAmount),
      status: earliestDue ? resolveCollectionStatus({ amount, paidAmount, dueDate: earliestDue, now: input.now }) : undefined,
      monthlyFee: fee,
      collections: collectionsOf(own),
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
  const rows = input.installments
    .filter((p) => p.contractId === contract.id && p.installmentSequence != null)
    .filter((p) => installmentMonthKeys(p).includes(monthKey))
    .sort((a, b) => (a.installmentSequence ?? 0) - (b.installmentSequence ?? 0));

  if (rows.length === 0) {
    return {
      state: "no_installment_for_month",
      contractId: contract.id,
      contractNumber: contract.contractNumber,
      // Plan VAR, yalnız bu aya taksit düşmüyor — "plan yok" demek gerçeği gizler.
      message: `${contract.contractNumber} numaralı sözleşmede bu aya düşen taksit yok. Taksit planını Sözleşme Merkezi'nde kontrol edin.`,
    };
  }

  // YALNIZCA dondurulmuş tutarların TOPLAMI — oranlama/yuvarlama YOK.
  const amount = rows.reduce((s, r) => s + Math.trunc(r.amount), 0);
  const paidAmount = rows.reduce((s, r) => s + Math.trunc(r.paidAmount), 0);
  const earliestDueDate = rows.reduce((min, r) => (r.dueDate < min ? r.dueDate : min), rows[0]!.dueDate);

  return {
    state: "ok",
    contractId: contract.id,
    contractNumber: contract.contractNumber,
    installmentSequences: rows.map((r) => r.installmentSequence!),
    paymentIds: rows.map((r) => r.id),
    amount,
    paidAmount,
    remaining: remainingAmount(amount, paidAmount),
    status: resolveCollectionStatus({ amount, paidAmount, dueDate: earliestDueDate, now: input.now }),
    periodLabel: rows.length === 1 ? (rows[0]!.installmentPeriodLabel ?? rows[0]!.periodLabel) : undefined,
    collections: collectionsOf(rows),
  };
}

/** Ayın gerçek plan satırı var mı (sözleşme taksiti VEYA sözleşmesiz planın ödeme satırı)? */
export function planHasRows(
  plan: CalendarMonthPlan
): plan is Extract<CalendarMonthPlan, { state: "ok" }> | Extract<CalendarMonthPlan, { state: "student_plan" }> {
  return plan.state === "ok" || (plan.state === "student_plan" && plan.paymentIds.length > 0);
}

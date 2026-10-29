/**
 * ÖNCELİK 4 (devam) — Paket Yönetimi. Saf veri dönüşümleri (store-agnostic),
 * aynı desen `lesson-series.ts`/`teacher-fee-rules` gibi: burada asla I/O
 * yok, yalnızca AppData -> AppData dönüşümü + doğrulama.
 */

import type { AppData, BranchId, DiscountType, LessonDurationPreference, Package, PackageStatus, StudentTermType } from "./types";
import type { LessonDurationMinutes } from "./lesson-duration";
import { uid } from "./utils";
import { studentUsesPackage } from "./student-enrollments";

export type PackageInput = {
  title: string;
  description?: string;
  price30Min: number;
  price40Min: number;
  price50Min: number;
  termLabel?: StudentTermType;
  monthlyLessonCount?: number;
  groupLessonCount?: number;
  defaultDurationMinutes?: LessonDurationPreference;
  defaultPaymentDueDay?: number;
  applicableBranchIds?: BranchId[];
  notes?: string;
  createdBy: string;
  createdByUserId?: string;
};

export type PackageMutationResult =
  | { ok: true; data: AppData; pkg: Package }
  | { ok: false; message: string };

function validatePrices(input: Pick<PackageInput, "price30Min" | "price40Min" | "price50Min">): string | null {
  for (const [label, value] of [
    ["30 dk", input.price30Min],
    ["40 dk", input.price40Min],
    ["50 dk", input.price50Min],
  ] as const) {
    if (!Number.isInteger(value) || value < 0) {
      return `${label} fiyatı tam sayı (TL, kuruş yok) ve negatif olmayan bir değer olmalı.`;
    }
  }
  return null;
}

function validateLessonCounts(
  input: Pick<PackageInput, "monthlyLessonCount" | "groupLessonCount" | "defaultPaymentDueDay">
): string | null {
  for (const [label, value] of [
    ["Aylık ders adedi", input.monthlyLessonCount],
    ["Grup solfej / ek ders adedi", input.groupLessonCount],
  ] as const) {
    if (value === undefined) continue;
    if (!Number.isInteger(value) || value < 0) {
      return `${label} negatif olmayan bir tam sayı olmalı.`;
    }
  }
  if (input.defaultPaymentDueDay !== undefined) {
    if (!Number.isInteger(input.defaultPaymentDueDay) || input.defaultPaymentDueDay < 1 || input.defaultPaymentDueDay > 28) {
      return "Varsayılan ödeme günü 1 ile 28 arasında olmalı.";
    }
  }
  return null;
}

export function createPackageData(data: AppData, input: PackageInput, now: Date = new Date()): PackageMutationResult {
  if (!input.title.trim()) return { ok: false, message: "Paket başlığı boş olamaz." };
  const priceError = validatePrices(input);
  if (priceError) return { ok: false, message: priceError };
  const countError = validateLessonCounts(input);
  if (countError) return { ok: false, message: countError };

  const nowIso = now.toISOString();
  // displayId burada atanmaz — store katmanı atar (öğrenci deseniyle aynı:
  // json/memory sayaçtan, db atomik sayaçtan). Bu dosya istemci paketine de
  // girer (`computeMonthlyFee`), sunucu-only `entity-sequence` import YASAK.
  const pkg: Package = {
    id: uid("pkg"),
    title: input.title.trim(),
    description: input.description?.trim() || undefined,
    applicableBranchIds: input.applicableBranchIds?.length ? [...input.applicableBranchIds] : undefined,
    status: "active",
    price30Min: input.price30Min,
    price40Min: input.price40Min,
    price50Min: input.price50Min,
    termLabel: input.termLabel,
    monthlyLessonCount: input.monthlyLessonCount,
    groupLessonCount: input.groupLessonCount,
    defaultDurationMinutes: input.defaultDurationMinutes,
    defaultPaymentDueDay: input.defaultPaymentDueDay,
    notes: input.notes?.trim() || undefined,
    createdBy: input.createdBy,
    createdByUserId: input.createdByUserId,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  return { ok: true, data: { ...data, packages: [...(data.packages ?? []), pkg] }, pkg };
}

export type PackagePatch = Partial<
  Pick<
    Package,
    | "title"
    | "description"
    | "price30Min"
    | "price40Min"
    | "price50Min"
    | "termLabel"
    | "status"
    | "monthlyLessonCount"
    | "groupLessonCount"
    | "defaultDurationMinutes"
    | "defaultPaymentDueDay"
    | "applicableBranchIds"
    | "notes"
  >
>;

/**
 * Fiyat/açıklama/durum güncellenir — GEÇMİŞ Payment kayıtlarına asla
 * dokunmaz (Payment.amount oluşturma anında donmuş bir tam sayıdır, bu
 * fonksiyon yalnızca Package satırını değiştirir). Hard delete yok;
 * `status:"archived"` ile pasife alınır.
 */
export function updatePackageData(
  data: AppData,
  packageId: string,
  patch: PackagePatch,
  now: Date = new Date()
): PackageMutationResult {
  const existing = (data.packages ?? []).find((p) => p.id === packageId);
  if (!existing) return { ok: false, message: "Paket bulunamadı." };

  if (
    patch.price30Min !== undefined ||
    patch.price40Min !== undefined ||
    patch.price50Min !== undefined
  ) {
    const priceError = validatePrices({
      price30Min: patch.price30Min ?? existing.price30Min,
      price40Min: patch.price40Min ?? existing.price40Min,
      price50Min: patch.price50Min ?? existing.price50Min,
    });
    if (priceError) return { ok: false, message: priceError };
  }
  if (
    patch.monthlyLessonCount !== undefined ||
    patch.groupLessonCount !== undefined ||
    patch.defaultPaymentDueDay !== undefined
  ) {
    const countError = validateLessonCounts({
      monthlyLessonCount: patch.monthlyLessonCount ?? existing.monthlyLessonCount,
      groupLessonCount: patch.groupLessonCount ?? existing.groupLessonCount,
      defaultPaymentDueDay: patch.defaultPaymentDueDay ?? existing.defaultPaymentDueDay,
    });
    if (countError) return { ok: false, message: countError };
  }
  if (patch.title !== undefined && !patch.title.trim()) {
    return { ok: false, message: "Paket başlığı boş olamaz." };
  }
  if (patch.status !== undefined && patch.status !== "active" && patch.status !== "archived") {
    return { ok: false, message: "Geçersiz paket durumu." };
  }

  const updated: Package = {
    ...existing,
    ...patch,
    title: patch.title !== undefined ? patch.title.trim() : existing.title,
    updatedAt: now.toISOString(),
  };
  const packages = (data.packages ?? []).map((p) => (p.id === packageId ? updated : p));
  return { ok: true, data: { ...data, packages }, pkg: updated };
}

/** Yeni öğrenci kaydında seçilebilecek (aktif) paketler. */
export function activePackages(packages: Package[] | undefined): Package[] {
  return (packages ?? []).filter((p) => p.status === "active");
}

export function priceForDuration(pkg: Package, durationMinutes: 30 | 40 | 50): number {
  if (durationMinutes === 30) return pkg.price30Min;
  if (durationMinutes === 40) return pkg.price40Min;
  return pkg.price50Min;
}

export function packageStatusLabel(status: PackageStatus): string {
  return status === "archived" ? "Arşivlendi" : "Aktif";
}

/**
 * Package C — süre + indirim + (varsa) manuel override'a göre nihai aylık
 * ücret. Tek merkez hesap: hem sunucu (createStudentTool/
 * updateStudentPaymentProfileTool) hem istemci (canlı önizleme) BU
 * fonksiyonu çağırır — iki ayrı fiyat mantığı YOK. Saf fonksiyon, I/O yok.
 */
export type MonthlyFeeComputation = {
  /** Paketin seçilen süre için liste fiyatı — indirim/override öncesi. */
  baseMonthlyFee: number;
  /** İndirimin TL karşılığı (yüzdeyse tabana göre hesaplanır, tam TL'ye yuvarlanır). */
  discountAmount: number;
  /** Kaydedilecek/gösterilecek nihai aylık ücret — asla negatif değil. */
  finalMonthlyFee: number;
  /** "override" ise finalMonthlyFee admin tarafından elle girilmiştir (taban/indirim yalnız bilgi amaçlı). */
  source: "computed" | "override";
};

/** İndirimin TL karşılığı — negatif olamaz, tabanı aşamaz, yüzde 100'ü aşamaz. */
export function computeDiscountAmount(
  baseMonthlyFee: number,
  discountType: DiscountType | undefined,
  discountValue: number | undefined
): number {
  if (!discountType || !discountValue || discountValue <= 0) return 0;
  if (discountType === "percent") {
    const cappedPercent = Math.min(discountValue, 100);
    return Math.round((baseMonthlyFee * cappedPercent) / 100);
  }
  return Math.min(Math.round(discountValue), baseMonthlyFee);
}

export function computeMonthlyFee(params: {
  pkg: Pick<Package, "price30Min" | "price40Min" | "price50Min">;
  durationMinutes: LessonDurationMinutes;
  discountType?: DiscountType;
  discountValue?: number;
  /** Verilirse hesaplanan değerin yerine geçer (yalnız yetkili yönetici çağırabilmeli — RBAC çağıran katmanda). */
  overrideAmount?: number;
}): MonthlyFeeComputation {
  const baseMonthlyFee = priceForDuration(params.pkg as Package, params.durationMinutes);
  const discountAmount = computeDiscountAmount(baseMonthlyFee, params.discountType, params.discountValue);
  const computedFinal = Math.max(baseMonthlyFee - discountAmount, 0);
  if (params.overrideAmount !== undefined) {
    return {
      baseMonthlyFee,
      discountAmount,
      finalMonthlyFee: Math.max(Math.round(params.overrideAmount), 0),
      source: "override",
    };
  }
  return { baseMonthlyFee, discountAmount, finalMonthlyFee: computedFinal, source: "computed" };
}

/** Bir paketi aktif olarak kullanan (arşivlenmemiş) öğrenci sayısı — tenant-scoped `data` üzerinden. */
export function activeStudentCountForPackage(data: { students: import("./types").StudentRef[] }, packageId: string): number {
  // 2026-10-10 — branşlı öğrencide paket BRANŞ kaydından okunur (aktif bir branşı bu paketi kullanıyorsa sayılır).
  return (data.students ?? []).filter((s) => s.active !== false && !s.archivedAt && studentUsesPackage(s, packageId, { activeOnly: true })).length;
}

/**
 * 9. tur (2026-09-27) — yanlışlıkla oluşturulmuş paketin güvenli silinmesi.
 *
 * Paket şu kayıtlardan referans alabilir (tek kaynak — silme kararı YALNIZ buradan):
 *  - `Student.packageId` (FK) — aktif, pasif veya silinmiş fark etmez: geçmiş kayıt paketi gösterir.
 *  - `Student.packageName` serbest metni paket başlığıyla aynıysa (FK öncesi eski kayıtlar) —
 *    kesin eşleşme kanıtlanamasa da temkinli olarak "kullanılmış" sayılır.
 * Ödeme/sözleşme/rapor satırları pakete canlı referans vermez (tutarlar oluşturma anında
 * donmuştur); bu yüzden onlar silmeyi engellemez ve silmeden etkilenmez.
 * Kullanılmış paket kalıcı silinmez — arşivlenir (yeni kayıtta seçilemez, geçmiş aynen kalır).
 */
export type PackageDeletionImpact = {
  packageId: string;
  title: string;
  status: PackageStatus;
  updatedAt: string;
  /** packageId ile bağlı öğrenci (her durumda). */
  linkedStudentCount: number;
  linkedActiveStudentCount: number;
  /** packageId'siz ama paket adını serbest metin olarak taşıyan öğrenci. */
  nameMatchStudentCount: number;
  hardDeleteEligible: boolean;
  /** Kalıcı silme neden yapılamaz — kullanıcıya aynen gösterilir. */
  blockReason?: string;
};

function normTitle(value: string | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("tr");
}

export function computePackageDeletionImpact(
  data: Pick<AppData, "packages" | "students">,
  packageId: string
): PackageDeletionImpact | null {
  const pkg = (data.packages ?? []).find((p) => p.id === packageId);
  if (!pkg) return null;
  const linked = data.students.filter((s) => studentUsesPackage(s, packageId));
  const title = normTitle(pkg.title);
  const nameMatch = data.students.filter((s) => !s.packageId && title && normTitle(s.packageName) === title);
  const linkedActive = linked.filter((s) => s.active !== false && !s.deletedAt).length;
  const used = linked.length + nameMatch.length;
  return {
    packageId,
    title: pkg.title,
    status: pkg.status,
    updatedAt: pkg.updatedAt,
    linkedStudentCount: linked.length,
    linkedActiveStudentCount: linkedActive,
    nameMatchStudentCount: nameMatch.length,
    hardDeleteEligible: used === 0,
    blockReason:
      used === 0
        ? undefined
        : `Bu paket ${used} öğrenci kaydında kullanılmış (${linkedActive} aktif). Geçmiş kayıtlar bu paketi gösterdiği için ` +
          "kalıcı silinemez. Yeni kayıtlarda seçilmemesi için arşivleyin; arşivlenen paket geçmişi bozmaz.",
  };
}

export type PackageDeleteResult =
  | { ok: true; data: AppData }
  | { ok: false; code: "NOT_FOUND" | "IN_USE" | "CHANGED"; message: string };

/**
 * Saf silme kararı — json/memory store'ları kilit altında bunu çağırır, db store aynı kuralı
 * transaction içinde uygular. `expectedUpdatedAt`: kullanıcı onay kutusunu açtıktan sonra
 * paket değiştiyse (eşzamanlı düzenleme) silme yapılmaz.
 */
export function deletePackageData(data: AppData, packageId: string, expectedUpdatedAt: string): PackageDeleteResult {
  const impact = computePackageDeletionImpact(data, packageId);
  if (!impact) return { ok: false, code: "NOT_FOUND", message: "Paket bulunamadı; başka biri silmiş olabilir. Listeyi yenileyin." };
  if (impact.updatedAt !== expectedUpdatedAt) {
    return {
      ok: false,
      code: "CHANGED",
      message: "Paket, siz onaylarken başka biri tarafından değiştirildi. Silinmedi; sayfayı yenileyip yeniden inceleyin.",
    };
  }
  if (!impact.hardDeleteEligible) return { ok: false, code: "IN_USE", message: impact.blockReason ?? "Paket kullanımda." };
  return { ok: true, data: { ...data, packages: (data.packages ?? []).filter((p) => p.id !== packageId) } };
}

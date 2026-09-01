/**
 * P0-1D — ilk tahsilat, otomatik hesaplanan ilk dönem tutarından manuel
 * olarak farklı girilebilir, ama bu "serbest, izsiz istisna tutarı"
 * OLAMAZ: otomatik≠manuel ise gerekçe zorunludur ve tam audit izi
 * (eski/yeni tutar, fark, gerekçe, kullanıcı, tarih) üretilir. Saf
 * fonksiyonlar; I/O yok, `Payment`/`StudentContract` store'una nasıl
 * yazılacağına karışmaz — yalnız "bu düzeltme geçerli mi" ve "audit
 * kaydı ne olmalı" sorularını cevaplar.
 */

export interface FirstPaymentAdjustmentInput {
  /** Tam sayı TL — motorun ürettiği otomatik ilk dönem tutarı. */
  autoSuggestedAmount: number;
  /** Tam sayı TL — yönetici girdiyse; girmediyse undefined (otomatik tutar aynen kullanılır). */
  manualNetAmount?: number;
  /** manualNetAmount, autoSuggestedAmount'tan FARKLIYSA zorunlu. */
  reason?: string;
}

export interface FirstPaymentAdjustmentResult {
  autoSuggestedAmount: number;
  /** Fiilen tahsil edilecek net tutar — override yoksa autoSuggestedAmount'a eşit. */
  manualNetAmount: number;
  /** manualNetAmount - autoSuggestedAmount. */
  adjustmentDelta: number;
  isManualOverride: boolean;
  /** Yalnız isManualOverride true ise dolu — otomatik hesaplamayı gizleyen "sahte" bir alan değil. */
  reason?: string;
}

export type ResolveFirstPaymentAdjustmentResult =
  | { ok: true; result: FirstPaymentAdjustmentResult }
  | { ok: false; message: string };

export function resolveFirstPaymentAdjustment(
  input: FirstPaymentAdjustmentInput
): ResolveFirstPaymentAdjustmentResult {
  if (!Number.isInteger(input.autoSuggestedAmount) || input.autoSuggestedAmount < 0) {
    return { ok: false, message: "Otomatik hesaplanan tutar geçersiz (negatif olmayan tam sayı TL olmalı)." };
  }

  const hasManual = input.manualNetAmount !== undefined;
  if (hasManual) {
    if (!Number.isInteger(input.manualNetAmount as number) || (input.manualNetAmount as number) < 0) {
      return { ok: false, message: "Manuel net tahsilat tutarı geçersiz (negatif olmayan tam sayı TL olmalı)." };
    }
  }

  const manualNetAmount = hasManual ? (input.manualNetAmount as number) : input.autoSuggestedAmount;
  const isManualOverride = manualNetAmount !== input.autoSuggestedAmount;

  if (isManualOverride && (!input.reason || input.reason.trim().length === 0)) {
    return {
      ok: false,
      message: "Otomatik hesaplanan tutardan farklı bir ilk tahsilat tutarı giriliyorsa gerekçe zorunludur.",
    };
  }

  return {
    ok: true,
    result: {
      autoSuggestedAmount: input.autoSuggestedAmount,
      manualNetAmount,
      adjustmentDelta: manualNetAmount - input.autoSuggestedAmount,
      isManualOverride,
      reason: isManualOverride ? input.reason!.trim() : undefined,
    },
  };
}

export interface FirstPaymentAdjustmentAuditEntry {
  tenantId: string;
  studentId: string;
  contractId?: string;
  paymentId?: string;
  autoSuggestedAmount: number;
  manualNetAmount: number;
  adjustmentDelta: number;
  reason?: string;
  adjustedBy: string;
  adjustedAt: string; // ISO
}

/**
 * `FirstPaymentAdjustmentResult`'ı, mevcut `audit()` yardımcı fonksiyonuna
 * (bkz. `contract.first_payment_collected` deseni) verilebilecek düz bir
 * audit satırına çevirir — ayrı bir yeni audit alt sistemi İCAT EDİLMEZ.
 */
export function buildFirstPaymentAdjustmentAuditEntry(
  result: FirstPaymentAdjustmentResult,
  actor: {
    tenantId: string;
    studentId: string;
    contractId?: string;
    paymentId?: string;
    adjustedBy: string;
    now?: Date;
  }
): FirstPaymentAdjustmentAuditEntry {
  return {
    tenantId: actor.tenantId,
    studentId: actor.studentId,
    contractId: actor.contractId,
    paymentId: actor.paymentId,
    autoSuggestedAmount: result.autoSuggestedAmount,
    manualNetAmount: result.manualNetAmount,
    adjustmentDelta: result.adjustmentDelta,
    reason: result.reason,
    adjustedBy: actor.adjustedBy,
    adjustedAt: (actor.now ?? new Date()).toISOString(),
  };
}

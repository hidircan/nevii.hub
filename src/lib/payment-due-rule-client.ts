/**
 * Faz 2 (ENROLLMENT_PAYMENT_RENEWAL_VALIDATION_FIX) — istemci tarafı (client
 * component) güvenli, KURUMUN VARSAYILAN ödeme politikasının salt bir
 * YANSIMASI. `src/lib/contracts.ts`'teki `resolveContractPaymentDueRule` ile
 * AYNI varsayılan kurallar (kredi kartı 1–5, havale/EFT/nakit ≤15) — ama bu
 * dosya "use client" bileşenlerinden import edilebilir (contracts.ts
 * `fs`/`path` kullanan sunucu-only bir modüldür, tarayıcıya asla
 * gönderilmemelidir).
 *
 * ÖNEMLİ: kurum bu varsayılanı özelleştirmişse (School.collectionsSettings
 * contractCardWindowEndDay/contractBankCashDueDay), bu istemci fonksiyonu
 * bunu BİLMEZ — yalnızca UI'da CANLI, gecikmesiz bir ipucu/ön-doğrulama
 * sağlamak içindir. Sunucu (`resolveContractPaymentDueRule`, gerçek
 * `collectionsSettings` okuyarak) HER ZAMAN otoritedir; nihai kabul/red
 * kararı asla yalnızca bu fonksiyona dayanmaz.
 */

const DEFAULT_CARD_WINDOW_END_DAY = 5;
const DEFAULT_BANK_CASH_DUE_DAY = 15;

export type ClientPaymentDueRule = { windowStartDay: number; windowEndDay: number; ruleText: string };

export function describePaymentDueRule(paymentMethod: string | undefined): ClientPaymentDueRule {
  if (paymentMethod === "credit_card") {
    return {
      windowStartDay: 1,
      windowEndDay: DEFAULT_CARD_WINDOW_END_DAY,
      ruleText: "Kredi kartı ödemeleri her ayın 1–5’i arasında yapılmalıdır.",
    };
  }
  return {
    windowStartDay: 1,
    windowEndDay: DEFAULT_BANK_CASH_DUE_DAY,
    ruleText: "Havale/EFT/nakit ödemeleri her ayın 1–15’i arasında yapılmalıdır.",
  };
}

export function paymentMethodLabel(method: string | undefined): string {
  if (method === "credit_card") return "Kredi kartı";
  if (method === "transfer") return "Havale/EFT";
  return "Nakit";
}

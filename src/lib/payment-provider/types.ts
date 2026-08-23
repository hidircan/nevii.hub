/**
 * Online ödeme sağlayıcı soyutlaması — altyapı iskeleti (henüz gerçek bir
 * sağlayıcı (iyzico/Stripe/PayTR vb.) bağlanmadı). `src/lib/sms/` ve
 * `src/lib/whatsapp/` ile AYNI desen: `types.ts` arayüzü + `config.ts` env
 * okuma + `transport.ts` (burada `provider-factory.ts`) provider seçimi.
 *
 * Mevcut `Payment` modeli/manuel tahsilat akışı (`src/lib/payments/*`)
 * DEĞİŞTİRİLMEDİ — bu katman, ileride gerçek bir online ödeme entegrasyonu
 * eklendiğinde `Payment` kaydını güncellemek için kullanılacak, ayrı ve
 * opsiyonel bir yol. Şu an yalnızca "console" (yapılandırılmamış) provider
 * var; gerçek bir HTTP çağrısı hiçbir yerde yapılmıyor.
 */

export type PaymentCheckoutInput = {
  tenantId: string;
  paymentId: string;
  /** Kuruş/TL — Payment.amount ile aynı birim, integer. */
  amount: number;
  currency: string;
  description: string;
  /** Kullanıcı ödemeyi tamamladıktan/iptal ettikten sonra döneceği URL'ler. */
  successUrl: string;
  cancelUrl: string;
  /** Aynı paymentId için tekrar checkout denemesi aynı sağlayıcı işlemini yeniden kullanmalı (sağlayıcı destekliyorsa). */
  idempotencyKey: string;
  /**
   * Sağlayıcı hosted checkout formunun (ör. iyzico) zorunlu tuttuğu asgari
   * alıcı/adres bilgisi — kart verisi DEĞİLDİR, yalnızca form ön-doldurma +
   * fraud kontrolü için. `buyerIp` sunucu tarafında request'ten çözülür,
   * ASLA client body'sinden alınmaz.
   */
  buyer: {
    id: string;
    name: string;
    surname: string;
    email: string;
    phone: string;
    ip: string;
    addressLine: string;
    city: string;
    country: string;
  };
};

export type PaymentCheckoutResult =
  | { ok: true; checkoutUrl: string; providerReference: string }
  | { ok: false; error: string; errorCode: string };

export type PaymentWebhookVerification =
  | { ok: true; paymentId: string; providerReference: string; status: "paid" | "failed" }
  | { ok: false; error: string };

export interface PaymentProvider {
  name: string;
  isConfigured(): boolean;
  createCheckout(input: PaymentCheckoutInput): Promise<PaymentCheckoutResult>;
  /** Ham webhook gövdesi + imza header'ından doğrulanmış sonucu çıkarır — asla imzasız kabul etmez. */
  verifyWebhook(input: { rawBody: string; signatureHeader: string | null }): Promise<PaymentWebhookVerification>;
}

/**
 * Faz 11 — CRM arama/mesaj sağlayıcı soyutlaması, `src/lib/payment-provider/`
 * ile BİREBİR AYNI 3-dosya deseni (types.ts + config.ts + provider-factory.ts).
 * Gerçek bir telefoni/mesajlaşma sağlayıcısı (ör. Twilio, Netgsm) BİLİNÇLİ
 * OLARAK bağlanmadı — bu spec'in kendi isteği ("gerçek sağlayıcı entegrasyonu
 * sonraki bir işe bırakılıyor"). `verifyWebhook` bir gerçek sağlayıcı payload'ı
 * ÜRETMEZ/AYRIŞTIRMAZ — yalnızca imza doğrulayıp ham gövdeyi + sağlayıcının
 * mesaj kimliğini (idempotency için) döner; CallLog/MessageLog'a dönüştürme
 * gerçek bir sağlayıcı entegre edildiğinde eklenecek (bkz. webhook route
 * yorumu).
 */

export type CommunicationWebhookVerification =
  | { ok: true; providerMessageId: string; rawBody: string }
  | { ok: false; error: string };

export interface CommunicationProvider {
  name: string;
  isConfigured(): boolean;
  /** Ham webhook gövdesi + imza header'ından doğrular — asla imzasız kabul etmez. */
  verifyWebhook(input: { rawBody: string; signatureHeader: string | null }): Promise<CommunicationWebhookVerification>;
}

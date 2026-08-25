export type CommunicationProviderName = "console" | "hmac";

/**
 * "hmac" — sağlayıcıdan bağımsız, JENERİK bir HMAC-SHA256 imza doğrulama
 * şeması (birçok webhook sağlayıcısının kullandığı ortak desen — belirli
 * bir vendöre ("Twilio", "Netgsm" vb.) bağlı DEĞİLDİR, bu yüzden "gerçek
 * sağlayıcı yok" ilkesini bozmaz). `COMMUNICATION_WEBHOOK_SECRET`
 * ayarlanmadıysa "console" (yapılandırılmamış, her zaman reddeder).
 */
export function getCommunicationProviderName(): CommunicationProviderName {
  return process.env.COMMUNICATION_WEBHOOK_SECRET ? "hmac" : "console";
}

export function getCommunicationProviderConfig() {
  return {
    provider: getCommunicationProviderName(),
    webhookSecret: process.env.COMMUNICATION_WEBHOOK_SECRET || "",
  };
}

export function isCommunicationProviderConfigured(): boolean {
  return Boolean(getCommunicationProviderConfig().webhookSecret);
}

export type PaymentProviderName = "console" | "iyzico" | "stripe";

/** Hangi sağlayıcı seçili — env yoksa "console" (yapılandırılmamış, no-op). */
export function getPaymentProviderName(): PaymentProviderName {
  const p = (process.env.PAYMENT_PROVIDER || "").toLowerCase();
  if (p === "iyzico" || p === "stripe") return p;
  return "console";
}

export function getPaymentProviderConfig() {
  return {
    provider: getPaymentProviderName(),
    // Gerçek anahtarlar hiçbir zaman koda gömülmez; yalnızca env'den okunur.
    iyzicoApiKey: process.env.IYZICO_API_KEY || "",
    iyzicoSecretKey: process.env.IYZICO_SECRET_KEY || "",
    /** Sandbox: https://sandbox-api.iyzipay.com — Prod: https://api.iyzipay.com */
    iyzicoBaseUrl: process.env.IYZICO_BASE_URL || "https://sandbox-api.iyzipay.com",
    /**
     * iyzico webhook imza doğrulaması için — ayrı bir "webhook secret"
     * sağlanmazsa iyzicoSecretKey'e düşer (iyzico'nun klasik entegrasyonunda
     * webhook gövdesi de aynı API secret'ıyla imzalanır).
     */
    iyzicoWebhookSecret: process.env.IYZICO_WEBHOOK_SECRET || process.env.IYZICO_SECRET_KEY || "",
    stripeSecretKey: process.env.STRIPE_SECRET_KEY || "",
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
  };
}

export function isPaymentProviderConfigured(): boolean {
  const cfg = getPaymentProviderConfig();
  if (cfg.provider === "iyzico") return Boolean(cfg.iyzicoApiKey && cfg.iyzicoSecretKey);
  if (cfg.provider === "stripe") return Boolean(cfg.stripeSecretKey && cfg.stripeWebhookSecret);
  return false;
}

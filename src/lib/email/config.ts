/**
 * E-posta gönderim yapılandırması — `src/lib/sms/config.ts` ile AYNI desen
 * (sağlayıcı seçimi env'den, "configured" kontrolü ayrı). SMTP kimlik
 * bilgileri YOKSA "console" sağlayıcıya düşülür — hiçbir zaman gönderimi
 * SAHTE başarılı göstermez (bkz. sendEmail, src/lib/email/index.ts).
 */
export type EmailProviderName = "smtp" | "console";

export function getEmailProviderName(): EmailProviderName {
  const p = (process.env.EMAIL_PROVIDER || "").toLowerCase();
  if (p === "smtp" || p === "console") return p;
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) return "smtp";
  return "console";
}

export function getEmailConfig() {
  return {
    provider: getEmailProviderName(),
    smtpHost: process.env.SMTP_HOST || "",
    smtpPort: Number(process.env.SMTP_PORT || 587),
    smtpUser: process.env.SMTP_USER || "",
    smtpPass: process.env.SMTP_PASS || "",
    smtpSecure: (process.env.SMTP_SECURE || "").toLowerCase() === "true",
    fromAddress: process.env.EMAIL_FROM || "no-reply@example.com",
    fromName: process.env.EMAIL_FROM_NAME || "Nevii Hub",
  };
}

export function isEmailProviderConfigured(): boolean {
  const cfg = getEmailConfig();
  if (cfg.provider !== "smtp") return false;
  return Boolean(cfg.smtpHost && cfg.smtpUser && cfg.smtpPass);
}

/** Davet/aktivasyon linklerinin oluşturulduğu temel URL — prod'da mutlaka set edilmeli. */
export function getAppBaseUrl(): string {
  return (process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
}

/**
 * P0 (2026-08-31, hoşgeldin e-postası) — mobil app mağaza linkleri. Uygulama
 * henüz YAYINLANMADI (bkz. apps/mobile — iskelet/geliştirme aşamasında);
 * env değişkeni set EDİLMEDİKÇE `undefined` döner ve e-posta şablonu bu
 * bölümü TAMAMEN GİZLER — asla kırık/sahte bir mağaza linki gösterilmez.
 * Uygulama yayınlandığında yalnızca bu iki env değişkenini set etmek yeterli.
 */
export function getMobileAppLinks(): { appStoreUrl?: string; playStoreUrl?: string } {
  return {
    appStoreUrl: process.env.APP_STORE_URL || undefined,
    playStoreUrl: process.env.PLAY_STORE_URL || undefined,
  };
}

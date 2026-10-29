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
    fromName: process.env.EMAIL_FROM_NAME || "NeviiHub",
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
 * Hesap e-postalarındaki bağlantı. neviihub.com http yazılmışsa https'e
 * yükseltilir. localhost geliştirme adresi olduğu gibi kalır.
 */
export function getPublicAppBaseUrl(): string {
  const raw = getAppBaseUrl();
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1") return url.origin;
    if (url.protocol === "http:" && (host === "neviihub.com" || host.endsWith(".neviihub.com"))) {
      url.protocol = "https:";
    }
    return url.origin;
  } catch {
    return raw;
  }
}

/**
 * Mağaza bağlantılarının tek etkin kaynağı `resolveMobileAppLinks`
 * (`lib/platform/site-mobile-apps.ts`): site ayarı > env. Bu dosyada
 * ikinci bir okuma tutulmaz.
 */

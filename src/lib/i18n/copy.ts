/** İstemciye güvenli dil yardımcıları. Veritabanı veya store import etmez. */
export type AppLocale = "tr" | "en";

export const LOCALE_COOKIE = "nevii_lang";

export function normalizeAppLocale(value: unknown): AppLocale {
  return value === "en" ? "en" : "tr";
}

export function readLocaleCookie(value: string | undefined | null): AppLocale {
  return value === "en" ? "en" : "tr";
}

export function pickTenantLanguage(input: {
  overrideScope: string | null;
  overrideValue: unknown;
  tenantLanguage: unknown;
}): AppLocale {
  if (input.overrideScope === "tenant" || input.overrideScope === "branch" || input.overrideScope === "user") {
    return normalizeAppLocale(input.overrideValue);
  }
  if (typeof input.tenantLanguage === "string" && input.tenantLanguage.trim()) {
    return normalizeAppLocale(input.tenantLanguage);
  }
  return normalizeAppLocale(input.overrideValue);
}

export function formatInLocale(value: Date | string | number, locale: AppLocale, timeZone?: string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const loc = locale === "en" ? "en-GB" : "tr-TR";
  const zone = timeZone && timeZone.trim() ? timeZone : "Europe/Istanbul";
  try {
    return new Intl.DateTimeFormat(loc, { dateStyle: "medium", timeStyle: "short", timeZone: zone }).format(date);
  } catch {
    return new Intl.DateTimeFormat(loc, { dateStyle: "medium", timeStyle: "short" }).format(date);
  }
}

export function formatNumberInLocale(value: number, locale: AppLocale): string {
  return new Intl.NumberFormat(locale === "en" ? "en-GB" : "tr-TR").format(value);
}

export function institutionNameMismatch(tenantName: string, schoolName: string): boolean {
  const left = tenantName.trim().toLocaleLowerCase("tr");
  const right = schoolName.trim().toLocaleLowerCase("tr");
  if (!left || !right) return false;
  return left !== right;
}

export function terminalShellByDefault(savedThemeProfile: string | null | undefined): boolean {
  return savedThemeProfile == null || savedThemeProfile.trim() === "";
}

type AuthCopy = {
  backHome: string;
  signIn: string;
  signInHelp: string;
  email: string;
  password: string;
  signingIn: string;
  forgot: string;
  badCredentials: string;
  rateLimited: string;
  takeover: string;
  takeoverAction: string;
  resetTitle: string;
  resetHelp: string;
};

const AUTH_COPY: Record<AppLocale, AuthCopy> = {
  tr: {
    backHome: "Ana sayfaya dön",
    signIn: "Giriş yap",
    signInHelp: "Okul yönetimi, öğretmen ve öğrenci portalları için oturum açın.",
    email: "E-posta",
    password: "Şifre",
    signingIn: "Giriş yapılıyor…",
    forgot: "Şifremi unuttum",
    badCredentials: "E-posta veya şifre hatalı. Bilgileri kontrol edin; şifrenizi hatırlamıyorsanız “Şifremi unuttum” bağlantısını kullanın.",
    rateLimited: "Çok fazla giriş denemesi yapıldı. Güvenlik için 15 dakika bekleyip tekrar deneyin.",
    takeover: "Bu kullanıcı şu anda başka bir cihazda aktif. Devam ederseniz mevcut oturum kapatılacaktır.",
    takeoverAction: "Devam et ve diğer oturumu kapat",
    resetTitle: "Şifrenizi sıfırlayın",
    resetHelp: "E-postadaki bağlantı 30 dakika geçerlidir ve bir kez kullanılabilir. Bağlantı açılmazsa aynı sayfaya kodu da yazabilirsiniz.",
  },
  en: {
    backHome: "Back to home",
    signIn: "Sign in",
    signInHelp: "Sign in to the school, teacher, and student portals.",
    email: "Email",
    password: "Password",
    signingIn: "Signing in…",
    forgot: "Forgot password",
    badCredentials: "The email or password is incorrect. Check them, or use Forgot password.",
    rateLimited: "Too many sign-in attempts. For security, wait 15 minutes and try again.",
    takeover: "This user is active on another device. Continuing will close that session.",
    takeoverAction: "Continue and close the other session",
    resetTitle: "Reset your password",
    resetHelp: "The link in the email works for 30 minutes and can be used once. If the link does not open, you can enter the code on this page.",
  },
};

export function authCopy(locale: AppLocale): AuthCopy {
  return AUTH_COPY[locale];
}

export function loginErrorText(locale: AppLocale, code: string | undefined, fallback: string): string {
  if (locale !== "en") return fallback;
  if (code === "UNAUTHORIZED") return AUTH_COPY.en.badCredentials;
  if (code === "RATE_LIMITED") return AUTH_COPY.en.rateLimited;
  if (code === "TURNSTILE_UNAVAILABLE") return "The security check service is unreachable, so sign-in failed. Try again in a few minutes.";
  if (code?.startsWith("TURNSTILE_")) return "The security check did not pass. It has been refreshed; wait for it to finish and try again.";
  return fallback;
}

export function passwordResetMail(locale: AppLocale, institution: string): {
  subject: string;
  heading: string;
  intro: string;
  codeLabel: string;
  button: string;
  expiry: string;
  ignore: string;
} {
  if (locale === "en") {
    return {
      subject: `${institution} — Reset your password`,
      heading: "Password reset request",
      intro: `A password reset was requested for your ${institution} account. It expires in 30 minutes and works once.`,
      codeLabel: "If the button does not open, use this code on the reset page:",
      button: "Reset password",
      expiry: "The link expires in 30 minutes and can be used only once.",
      ignore: "If you did not ask for this, ignore the email. Your password will not change.",
    };
  }
  return {
    subject: `${institution} — Şifre sıfırlama`,
    heading: "Şifre sıfırlama isteği",
    intro: `${institution} hesabınız için bir şifre sıfırlama isteği alındı. Bağlantı 30 dakika geçerlidir ve bir kez kullanılabilir.`,
    codeLabel: "Düğme açılmazsa sıfırlama sayfasına bu kodu yazın:",
    button: "Şifremi sıfırla",
    expiry: "Bağlantı 30 dakika içinde geçerliliğini yitirir ve yalnızca bir kez kullanılabilir.",
    ignore: "Bu isteği siz yapmadıysanız e-postayı yok sayın. Şifreniz değişmez.",
  };
}

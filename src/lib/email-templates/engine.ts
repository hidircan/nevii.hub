/**
 * 10. tur iş #2 — şablon doğrulama + e-posta üretim motoru.
 *
 * Güvenlik modeli:
 * - Yer tutucu allowlist'i anahtar başına sabittir (`keys.ts`); bilinmeyen
 *   `{{...}}` YAYIMI ENGELLER (yazım hatası sessizce metne sızmaz).
 * - Zorunlu yapısal alanlar (davet/sıfırlama düğmesi, sıfırlama kodu)
 *   gövdede bulunmak ZORUNDADIR — yönetici bunları silemez.
 * - Yönetici HTML'i her KAYITTA `sanitizeTemplateHtml` ile temizlenir;
 *   render anında değerler kaçışlanır; URL'ler http(s) doğrulanır.
 * - Üretim anında özel şablon render EDİLEMEZSE (bozuk veri) sessizce
 *   varsayılana düşülür — e-posta ASLA gönderimsiz kalmaz, hata loglanır.
 */
import { sanitizeTemplateHtml } from "../document-sanitize";
import { institutionLogoEmailBlock } from "../institution-logo";
import type { EmailAttachment } from "../email/types";
import { CTA_COLORS, placeholdersForKey, type EmailTemplateKey, type EmailTemplateLocale } from "./keys";
import { getDefaultEmailTemplate, sampleValuesForKey } from "./defaults";
import { getPublishedEmailTemplate, type EmailTemplateFields } from "./store";

const PLACEHOLDER_RE = /\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/gi;

export function extractPlaceholders(text: string): string[] {
  const names: string[] = [];
  let m: RegExpExecArray | null;
  PLACEHOLDER_RE.lastIndex = 0;
  while ((m = PLACEHOLDER_RE.exec(text))) names.push(m[1]!.toLowerCase());
  return [...new Set(names)];
}

export type TemplateValidation = { ok: true } | { ok: false; errors: string[] };

/**
 * Yayımlama/kayıt doğrulaması. `strict=true` (yayımlama) zorunlu alanları
 * ister; taslak kaydı (`strict=false`) yalnızca bilinmeyen yer tutucu ve
 * boş-zorunlu-alan kontrolü yapar.
 */
export function validateTemplateFields(
  key: EmailTemplateKey,
  fields: { subject: string; preheader: string; introHtml: string; bodyHtml: string; signatureHtml: string; ctaLabel: string },
  strict: boolean
): TemplateValidation {
  const errors: string[] = [];
  const spec = placeholdersForKey(key);
  const allowed = new Set(spec.map((p) => p.name));
  const combined = `${fields.subject}\n${fields.preheader}\n${fields.introHtml}\n${fields.bodyHtml}\n${fields.signatureHtml}`;
  const used = extractPlaceholders(combined);
  for (const name of used) {
    if (!allowed.has(name)) errors.push(`Bilinmeyen yer tutucu: {{${name}}} — izinli listeden seçin.`);
  }
  if (!fields.subject.trim()) errors.push("Konu boş olamaz.");
  if (!fields.introHtml.trim() && !fields.bodyHtml.trim()) errors.push("Giriş ve gövde aynı anda boş olamaz.");
  if (!fields.ctaLabel.trim()) errors.push("Düğme metni boş olamaz.");
  if (strict) {
    const bodyCombined = `${fields.introHtml}\n${fields.bodyHtml}\n${fields.signatureHtml}`;
    const bodyUsed = new Set(extractPlaceholders(bodyCombined));
    for (const p of spec) {
      if (p.required && !bodyUsed.has(p.name)) {
        errors.push(`Zorunlu alan eksik: {{${p.name}}} (${p.label}) — bu alan olmadan şablon yayımlanamaz.`);
      }
    }
  }
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

/** Kaydedilecek yönetici HTML'ini temizler (konu/düğme düz metne indirgenir). */
export function sanitizeTemplateFields(fields: EmailTemplateFields): EmailTemplateFields {
  const plain = (v: string) => sanitizeTemplateHtml(v).replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  return {
    subject: plain(fields.subject).slice(0, 200),
    preheader: plain(fields.preheader).slice(0, 300),
    introHtml: sanitizeTemplateHtml(fields.introHtml).slice(0, 20000),
    bodyHtml: sanitizeTemplateHtml(fields.bodyHtml).slice(0, 40000),
    signatureHtml: sanitizeTemplateHtml(fields.signatureHtml).slice(0, 10000),
    ctaLabel: plain(fields.ctaLabel).slice(0, 60),
    showLogo: fields.showLogo,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function safeHttpUrl(value: string): string | null {
  const trimmed = value.trim();
  if (/^https?:\/\/[^\s<>"']+$/i.test(trimmed)) return trimmed;
  return null;
}

function buttonHtml(url: string, label: string, color: string): string {
  const safe = safeHttpUrl(url);
  if (!safe) return "";
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0;"><tr><td ` +
    `style="background:${color};border-radius:8px;text-align:center;">` +
    `<a href="${escapeHtml(safe)}" style="display:inline-block;padding:12px 24px;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">${escapeHtml(label)}</a>` +
    `</td></tr></table>`
  );
}

function linkLineHtml(url: string): string {
  const safe = safeHttpUrl(url);
  if (!safe) return "";
  const e = escapeHtml(safe);
  return `<a href="${e}" style="color:#4f46e5;text-decoration:none;word-break:break-all;">${e}</a>`;
}

function codeBlockHtml(code: string): string {
  return (
    `<div style="margin:12px 0;padding:14px 20px;background:#f3f4f6;border-radius:8px;text-align:center;` +
    `font-size:22px;font-weight:700;letter-spacing:0.08em;color:#111827;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">${escapeHtml(code)}</div>`
  );
}

function appLinksHtml(appStoreUrl?: string, playStoreUrl?: string): string {
  const store = appStoreUrl && safeHttpUrl(appStoreUrl) ? appStoreUrl : null;
  const play = playStoreUrl && safeHttpUrl(playStoreUrl) ? playStoreUrl : null;
  if (!store && !play) return "";
  const btn = (url: string, label: string) =>
    `<a href="${escapeHtml(url)}" style="display:inline-block;padding:8px 14px;border:1px solid #d1d5db;border-radius:6px;color:#111827;text-decoration:none;font-size:13px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">${label}</a>`;
  return (
    `<p style="margin:16px 0 8px;font-size:13px;color:#6b7280;">Mobil uygulamamızı da indirebilirsiniz:</p>` +
    `<p style="margin:0 0 8px;">${store ? btn(store, "App Store") : ""}${store && play ? " " : ""}${play ? btn(play, "Google Play") : ""}</p>`
  );
}

export type RenderValues = {
  kurum_adi: string;
  alici_adi: string;
  giris_epostasi: string;
  gecerlilik_suresi: string;
  yil: string;
  /** Davet/sıfırlama hedef URL'si (düğme + düz bağlantı). */
  actionUrl: string;
  /** Sıfırlama kodu (yalnız password_reset). */
  code?: string;
  webPortalUrl?: string;
  appStoreUrl?: string;
  playStoreUrl?: string;
};

function structuralHtml(name: string, values: RenderValues, ctaLabel: string, color: string): string {
  switch (name) {
    case "davet_butonu":
    case "sifirlama_butonu":
      return buttonHtml(values.actionUrl, ctaLabel, color);
    case "davet_baglantisi":
    case "sifirlama_baglantisi":
      return linkLineHtml(values.actionUrl);
    case "web_portal_baglantisi":
      return values.webPortalUrl ? linkLineHtml(values.webPortalUrl) : "";
    case "sifirlama_kodu":
      return values.code ? codeBlockHtml(values.code) : "";
    case "mobil_baglantilar":
      return appLinksHtml(values.appStoreUrl, values.playStoreUrl);
    default:
      return "";
  }
}

function structuralText(name: string, values: RenderValues, ctaLabel: string): string {
  switch (name) {
    case "davet_butonu":
    case "sifirlama_butonu":
      return `${ctaLabel}: ${values.actionUrl}`;
    case "davet_baglantisi":
    case "sifirlama_baglantisi":
      return values.actionUrl;
    case "web_portal_baglantisi":
      return values.webPortalUrl ?? "";
    case "sifirlama_kodu":
      return values.code ?? "";
    case "mobil_baglantilar": {
      const parts: string[] = [];
      if (values.appStoreUrl) parts.push(`App Store: ${values.appStoreUrl}`);
      if (values.playStoreUrl) parts.push(`Google Play: ${values.playStoreUrl}`);
      return parts.length ? `Mobil uygulama:\n${parts.join("\n")}` : "";
    }
    default:
      return "";
  }
}

const PLAIN_VALUE_KEYS = ["kurum_adi", "alici_adi", "giris_epostasi", "gecerlilik_suresi", "yil"] as const;

function fillHtml(template: string, values: RenderValues, ctaLabel: string, color: string): string {
  return template.replace(PLACEHOLDER_RE, (_full, raw: string) => {
    const name = String(raw).toLowerCase();
    if ((PLAIN_VALUE_KEYS as readonly string[]).includes(name)) {
      return escapeHtml(String(values[name as (typeof PLAIN_VALUE_KEYS)[number]] ?? ""));
    }
    return structuralHtml(name, values, ctaLabel, color);
  });
}

function fillText(template: string, values: RenderValues, ctaLabel: string): string {
  return template.replace(PLACEHOLDER_RE, (_full, raw: string) => {
    const name = String(raw).toLowerCase();
    if ((PLAIN_VALUE_KEYS as readonly string[]).includes(name)) {
      return String(values[name as (typeof PLAIN_VALUE_KEYS)[number]] ?? "");
    }
    return structuralText(name, values, ctaLabel);
  });
}

function htmlToText(html: string): string {
  return html
    .replace(/<\/(p|div|tr|li|h1|h2|h3|table)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join("\n");
}

export type RenderedTransactionalEmail = {
  subject: string;
  html: string;
  text: string;
  attachments: EmailAttachment[] | undefined;
  /** true ise kurumun yayınlanmış özel şablonu kullanıldı. */
  customized: boolean;
};

export type RenderTransactionalEmailInput = {
  key: EmailTemplateKey;
  locale: EmailTemplateLocale;
  tenantId: string;
  values: RenderValues;
  institutionName: string;
  logoUrl?: string;
  /** Altbilgi: süre + güvenlik uyarısı + iletişim (her anahtarda ZORUNLU, sabit kabuk). */
  footerLines: string[];
  /** Test/önizleme için belirli bir sürümü zorla (yayın akışı kullanmaz). */
  forceVersion?: number;
};

/**
 * Tek üretim noktası: yayınlanmış özel şablon varsa onu, yoksa varsayılanı
 * kullanır. Özel şablon render edilemezse varsayılana düşer (e-posta asla
 * yanıtsız kalmaz). Logo bloğu + altbilgi sabit kabuktandır (yönetici
 * silemez); içerik alanları şablondandır.
 */
export async function renderTransactionalEmail(input: RenderTransactionalEmailInput): Promise<RenderedTransactionalEmail> {
  const { key, locale, tenantId } = input;
  const fallback = getDefaultEmailTemplate(key, locale);
  let fields: EmailTemplateFields = {
    subject: fallback.subject,
    preheader: fallback.preheader,
    introHtml: fallback.introHtml,
    bodyHtml: fallback.bodyHtml,
    signatureHtml: fallback.signatureHtml,
    ctaLabel: fallback.ctaLabel,
    showLogo: true,
  };
  let customized = false;
  try {
    if (input.forceVersion !== undefined) {
      const { getEmailTemplateVersion } = await import("./store");
      const row = await getEmailTemplateVersion(tenantId, key, locale, input.forceVersion);
      if (row) {
        fields = { ...fields, ...pickFields(row) };
        customized = row.status === "published";
      }
    } else {
      const published = await getPublishedEmailTemplate(tenantId, key, locale);
      if (published) {
        fields = { ...fields, ...pickFields(published) };
        customized = true;
      }
    }
  } catch (e) {
    const { logger } = await import("../logger");
    logger.error("renderTransactionalEmail: özel şablon okunamadı, varsayılan kullanılıyor", e);
  }

  try {
    return buildEmail(input, fields, customized);
  } catch (e) {
    const { logger } = await import("../logger");
    logger.error("renderTransactionalEmail: özel şablon üretilemedi, varsayılan kullanılıyor", e);
    return buildEmail(input, { ...fields, ...fallbackFields(fallback) }, false);
  }
}

function pickFields(row: {
  subject: string;
  preheader: string;
  introHtml: string;
  bodyHtml: string;
  signatureHtml: string;
  ctaLabel: string;
  showLogo: boolean;
}): EmailTemplateFields {
  return {
    subject: row.subject,
    preheader: row.preheader,
    introHtml: row.introHtml,
    bodyHtml: row.bodyHtml,
    signatureHtml: row.signatureHtml,
    ctaLabel: row.ctaLabel,
    showLogo: row.showLogo,
  };
}

function fallbackFields(f: {
  subject: string;
  preheader: string;
  introHtml: string;
  bodyHtml: string;
  signatureHtml: string;
  ctaLabel: string;
}): EmailTemplateFields {
  return { ...f, showLogo: true };
}

function buildEmail(
  input: RenderTransactionalEmailInput,
  fields: EmailTemplateFields,
  customized: boolean
): RenderedTransactionalEmail {
  const color = CTA_COLORS[input.key];
  const subjectRaw = fillText(fields.subject, input.values, fields.ctaLabel).trim();
  const subjectFilled = subjectRaw || fillText(getDefaultEmailTemplate(input.key, input.locale).subject, input.values, fields.ctaLabel);
  const logoBlock = fields.showLogo ? institutionLogoEmailBlock(input.logoUrl, input.institutionName) : null;
  const logoCell = logoBlock
    ? `<tr><td style="background:#ffffff;padding:28px 32px 20px;text-align:center;border-bottom:1px solid #e5e7eb;">${logoBlock.html}</td></tr>`
    : "";
  const intro = fillHtml(fields.introHtml, input.values, fields.ctaLabel, color);
  const body = fillHtml(fields.bodyHtml, input.values, fields.ctaLabel, color);
  const signature = fillHtml(fields.signatureHtml, input.values, fields.ctaLabel, color);
  const footer = input.footerLines
    .map((l) => `<p style="margin:0 0 4px;font-size:12px;color:#9ca3af;">${escapeHtml(l)}</p>`)
    .join("");
  const preheader = fields.preheader.trim()
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(fillText(fields.preheader, input.values, fields.ctaLabel))}</div>`
    : "";

  const html =
    `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f4f2f8;padding:32px 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">` +
    `<tr><td align="center">${preheader}` +
    `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;">` +
    logoCell +
    `<tr><td style="padding:32px 32px 8px;font-size:15px;color:#374151;line-height:1.6;">${intro}${body}${signature}</td></tr>` +
    `<tr><td style="padding:20px 32px;border-top:1px solid #e5e7eb;">${footer}</td></tr>` +
    `</table></td></tr></table>`;

  const text =
    [
      input.values.kurum_adi,
      "",
      htmlToText(fillText(fields.introHtml, input.values, fields.ctaLabel)),
      htmlToText(fillText(fields.bodyHtml, input.values, fields.ctaLabel)),
      htmlToText(fillText(fields.signatureHtml, input.values, fields.ctaLabel)),
      "",
      ...input.footerLines,
    ]
      .filter((l) => l.trim().length > 0 || l === "")
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

  return {
    subject: subjectFilled,
    html,
    text,
    attachments: logoBlock?.attachment ? [logoBlock.attachment] : undefined,
    customized,
  };
}

/** Önizleme/test-e-postası değerleri (örnek veri + verilen bağlantılar). */
export function previewValues(overrides?: Partial<RenderValues>): RenderValues {
  return {
    ...sampleValuesForKey("parent_invite"),
    actionUrl: "https://ornek-gecici-baglanti.neviihub.com/hesap-aktivasyon?token=ORNEK",
    code: "AB12CD34",
    webPortalUrl: "https://ornek.neviihub.com",
    appStoreUrl: undefined,
    playStoreUrl: undefined,
    ...overrides,
  } as RenderValues;
}

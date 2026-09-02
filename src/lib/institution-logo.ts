/**
 * Tenant kurum logosu — HTML/e-posta enjeksiyonu. `school.logoUrl` http(s)
 * veya data-URI olabilir. Aktif şablonu yerinde değiştirmez; görüntüleme
 * anında öneklenir.
 */

export function sanitizeLogoUrl(logoUrl: string | undefined | null): string | null {
  if (!logoUrl) return null;
  const trimmed = logoUrl.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("data:image/")) {
    if (!/^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=\s]+$/i.test(trimmed)) return null;
    return trimmed.replace(/\s+/g, "");
  }
  if (/^https?:\/\//i.test(trimmed) && !/[<>"']/.test(trimmed)) return trimmed;
  if (trimmed.startsWith("/") && !trimmed.startsWith("//") && !/[<>"']/.test(trimmed)) return trimmed;
  return null;
}

/**
 * P0-E (2026-09-02) — kurumun AKTİF olarak seçtiği logo dışında HİÇBİR
 * kaynak kullanılmaz (yerel/varsayılan bir örnek dosya yolu asla
 * hardcode EDİLMEZ). Yükseklik 40–56px aralığında (küçük, ortalanmış bir
 * başlık logosu — büyük bir banner/hero DEĞİL), en-boy oranı `object-fit:
 * contain` ile korunur, baskıda da okunur kalır (düz `<img>`, harici CSS/JS
 * yok). Logo yoksa render KIRILMAZ — kurum adı METİN olarak gösterilir.
 */
export function institutionLogoHtml(logoUrl: string | undefined | null, institutionName: string): string {
  const alt = institutionName.replace(/[<>&"]/g, (ch) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[ch] ?? ch
  );
  const safe = sanitizeLogoUrl(logoUrl);
  if (!safe) {
    if (!alt) return "";
    // `var(--color-text)` — bu blok her zaman uygulamanın kendi
    // sayfalarına (önizleme/yazdırma) gömülür, izole bir iframe DEĞİL; aynı
    // CSS custom property'yi paylaşarak açık/koyu temada okunur kalır.
    return `<div data-institution-logo="1" style="text-align:center;margin:0 0 16px;font-weight:600;font-size:14px;color:var(--color-text, #111827);">${alt}</div>`;
  }
  return `<div data-institution-logo="1" style="text-align:center;margin:0 0 16px;"><img src="${safe}" alt="${alt}" style="height:48px;max-width:220px;object-fit:contain;"/></div>`;
}

export function prependInstitutionLogo(
  html: string,
  logoUrl: string | undefined | null,
  institutionName: string
): string {
  if (html.includes('data-institution-logo="1"')) return html;
  const block = institutionLogoHtml(logoUrl, institutionName);
  if (!block) return html;
  return `${block}${html}`;
}

export function toLogoDataUrl(fileMimeType: string, fileData: string): string {
  const stripped = fileData.includes(",") ? fileData.slice(fileData.indexOf(",") + 1) : fileData;
  return `data:${fileMimeType};base64,${stripped.replace(/\s+/g, "")}`;
}

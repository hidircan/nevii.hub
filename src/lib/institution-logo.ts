/**
 * Tenant kurum logosu — HTML/e-posta enjeksiyonu. `school.logoUrl` http(s)
 * veya data-URI olabilir. Aktif şablonu yerinde değiştirmez; görüntüleme
 * anında öneklenir.
 */

/**
 * Aynı URL üzerine yazılan logonun tarayıcı önbelleğinde kalmaması için
 * sürüm ekler. data-URI zaten içeriğin kendisidir; ona sorgu eklenmez.
 */
export function logoUrlStamp(logoUrl: string): string {
  let hash = 0;
  for (let i = 0; i < logoUrl.length; i++) hash = (hash * 33 + logoUrl.charCodeAt(i)) >>> 0;
  return hash.toString(36);
}

export function withLogoVersion(logoUrl: string | undefined | null, version: string): string | null {
  const safe = sanitizeLogoUrl(logoUrl);
  if (!safe || safe.startsWith("data:")) return safe;
  const stamp = version.trim();
  if (!stamp) return safe;
  const join = safe.includes("?") ? "&" : "?";
  return `${safe}${join}v=${encodeURIComponent(stamp)}`;
}

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
  // P0 (2026-09-05) — kök neden: yalnız kapsayan div'de `text-align:center`
  // yeterli DEĞİL — bu blok Tailwind preflight'ı olan sayfalara gömülüyor
  // (bkz. yukarıdaki yorum) ve Tailwind `img{display:block}` sıfırlaması,
  // inline hizalamayı (text-align) img için ETKİSİZ kılıyordu (blok
  // eleman parent'ın text-align'ından etkilenmez) — logo GERÇEKTE sol
  // hizalı görünüyordu. `display:block;margin:0 auto` img'in KENDİ
  // üzerinde, Tailwind'in reset'inden BAĞIMSIZ, her koşulda ortalar.
  // P0 (2026-09-05) — logo "tam görünmüyor" raporu. Önceki sürüm SABİT
  // `height:48px` + `max-width:220px` kullanıyordu: dar/kare olmayan (ör.
  // 8:1) logolar bu kutuya sığdırılırken görünür biçimde KÜÇÜLÜYORDU.
  // Artık kutu değil TAVAN verilir (`max-height`/`max-width`, `height:auto`)
  // — görsel hiçbir zaman KIRPILMAZ, ORANI BOZULMAZ ve doğal boyutuna kadar
  // büyüyebilir. Beyaz "güvenli alan" kartı, koyu temada koyu bir logonun
  // kaybolmamasını sağlar (baskıda kâğıt zaten beyaz olduğu için görünmez).
  // `-webkit-print-color-adjust` olmadan bazı tarayıcılar bu zemini baskıda
  // atlar ve koyu logolar okunmaz kalır.
  return `<div data-institution-logo="1" style="text-align:center;margin:0 0 16px;"><span style="display:inline-block;background:#ffffff;padding:6px 10px;border-radius:8px;-webkit-print-color-adjust:exact;print-color-adjust:exact;"><img src="${safe}" alt="${alt}" style="display:block;margin:0 auto;height:auto;width:auto;max-height:96px;max-width:100%;object-fit:contain;"/></span></div>`;
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

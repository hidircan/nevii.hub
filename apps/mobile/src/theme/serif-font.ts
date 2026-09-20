/**
 * Gövde serif ailesi — varsayılan çözüm (web + node testleri).
 * Metro, native platformlarda `serif-font.ios.ts` / `serif-font.android.ts`
 * dosyasını seçer; bu dosyada React Native import'u YOK (node testleri
 * `tokens.ts` üzerinden burayı okur, RN çekilemez).
 */
export const serifFontFamily = "Noto Serif, Georgia, serif";
export const serifMediumFontFamily = "Noto Serif, Georgia, serif";
export const serifSemiboldFontFamily = "Noto Serif, Georgia, serif";
export const serifBoldFontFamily = "Noto Serif, Georgia, serif";

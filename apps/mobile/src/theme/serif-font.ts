/**
 * Gövde serif ailesi — varsayılan çözüm (web + node testleri).
 * Metro, native platformlarda `serif-font.ios.ts` / `serif-font.android.ts`
 * dosyasını seçer; bu dosyada React Native import'u YOK (node testleri
 * `tokens.ts` üzerinden burayı okur, RN çekilemez).
 */
export const serifFontFamily = "Times New Roman, Times, serif";
export const serifBoldFontFamily = "Times New Roman, Times, serif";

/**
 * Tek merkez string normalizasyon yardımcıları — CSV import (branch-lookup,
 * students, teachers), enstrüman kataloğu ve seed akışları arasında
 * ÇOĞALTILMIŞ birkaç ayrı normalizasyon deyimi (`.toLowerCase()`,
 * `.toLocaleLowerCase("tr")`, ikisi karışık) buraya toplandı. Türkçe harf
 * büyüklüğü (İ/I/ı/i) yalnızca `"tr"` locale'i ile doğru katlanır — düz
 * `.toLowerCase()` "İ" harfini yanlış katlar (`i̇` — noktalı, iki kod
 * noktalı), bu yüzden "Yan Flüt" gibi değerler farklı yazımlarla (baş harf
 * büyük/küçük, fazladan boşluk, NFC/NFD Unicode biçimi) hep aynı anahtara
 * çözülsün diye tüm karşılaştırmalar buradan geçmeli.
 */

/**
 * Karşılaştırma anahtarı: Unicode NFC'ye normalize eder, baştaki/sondaki
 * boşluğu kırpar, iç boşlukları TEK boşluğa indirger, Türkçe-duyarlı küçük
 * harfe çevirir. "Yan Flüt" / "yan flüt" / "Yan  Flüt" (çift boşluk) hepsi
 * aynı anahtara çözülür.
 */
export function normalizeMatchKey(value: string): string {
  return value
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("tr");
}

/**
 * `normalizeMatchKey`'den TÜM boşlukları da kaldıran, daha gevşek bir
 * eşleştirme anahtarı — yalnızca birebir eşleşme bulunamadığında YEDEK
 * (fallback) olarak kullanılmalı. "Yan Flüt" ile "Yanflüt" gibi boşluk
 * farkı içeren varyasyonları aynı değere çözer.
 */
export function looseMatchKey(value: string): string {
  return normalizeMatchKey(value).replace(/\s+/g, "");
}

/**
 * Bir değeri (ör. CSV'den gelen enstrüman/paket adı) kanonik bir aday
 * listesine karşı çözer: önce tam (boşluk-duyarlı) eşleşme, bulunamazsa
 * gevşek (boşluk-duyarsız) eşleşme denenir. Eşleşirse LİSTEDEKİ kanonik
 * yazımı döner — girdi olduğu gibi değil (ör. "yan flut" girilse bile
 * kayda "Yan Flüt" yazılır), böylece aynı veri her zaman tek bir tutarlı
 * biçimde saklanır ve sonraki tam-eşleşme kontrolleri (ör. öğretmenin
 * enstrüman listesi) bozulmaz.
 */
export function resolveCanonicalValue(
  value: string,
  candidates: readonly string[]
): string | null {
  const exact = normalizeMatchKey(value);
  const exactMatch = candidates.find((c) => normalizeMatchKey(c) === exact);
  if (exactMatch) return exactMatch;

  const loose = looseMatchKey(value);
  const looseMatch = candidates.find((c) => looseMatchKey(c) === loose);
  return looseMatch ?? null;
}

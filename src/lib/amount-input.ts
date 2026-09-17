/**
 * Tutar alanı yazım kuralı (2026-09-17). Kontrollü input'ta her tuşta
 * `Number(value)` yazmak boş alanı 0'a çeviriyor ve 0 geri geliyordu —
 * kullanıcı sıfırı silemiyordu. Değer yazılırken METİN olarak tutulur:
 * yalnız rakam kalır, baştaki sıfırlar atılır, boş değer boş kalır.
 */
export function sanitizeAmountInput(raw: string): string {
  return raw.replace(/[^0-9]/g, "").replace(/^0+(?=\d)/, "");
}

/** Metin tutar → sayı; boşsa null (zorunluluk mesajı çağıranda). */
export function parseAmountInput(raw: string): number | null {
  const digits = sanitizeAmountInput(raw);
  return digits === "" ? null : Number(digits);
}

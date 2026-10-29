/**
 * Tutar alanı yazım kuralı (2026-09-17). Kontrollü input'ta her tuşta
 * `Number(value)` yazmak boş alanı 0'a çeviriyor ve 0 geri geliyordu —
 * kullanıcı sıfırı silemiyordu. Değer yazılırken METİN olarak tutulur:
 * yalnız rakam kalır, baştaki sıfırlar atılır, boş değer boş kalır.
 */
export function sanitizeAmountInput(raw: string): string {
  return raw.replace(/[^0-9]/g, "").replace(/^0+(?=\d)/, "");
}

/** Metin tutar → sayı; boşsa null (zorunluluk mesajı çağıranda). Türkçe biçimi (1.250 / 1.250,00) de okur. */
export function parseAmountInput(raw: string): number | null {
  const parsed = parseMoneyInput(raw);
  if (parsed.kind === "ok") return parsed.value;
  if (parsed.kind === "empty") return null;
  const digits = sanitizeAmountInput(raw);
  return digits === "" ? null : Number(digits);
}

export type MoneyParse = { kind: "empty" } | { kind: "ok"; value: number } | { kind: "error"; message: string };

/** Yazarken yalnız rakam, nokta, virgül ve boşluk kalır (imleç bozulmasın diye başka dönüşüm yok). */
export function filterMoneyTyping(raw: string): string {
  return raw.replace(/[^0-9.,\s]/g, "");
}

const FORMAT_HINT = "Tutar biçimi anlaşılamadı (ör. 1250 veya 1.250).";

/**
 * 2026-10-04 — Türkçe tutar girdisi (yazma, yapıştırma, mobil klavye). Boş ≠ 0: boş metin
 * `empty`, "0" gerçek sıfırdır. Kabul: "1250", "1.250", "1.250,00", "1250,5", "1250.50"
 * (yapıştırılan noktalı ondalık), "₺1.250 TL". Sistemde tutarlar TAM TL tutulur (Payment.amount Int);
 * kuruşlu değer sessizce yuvarlanmaz, açık hata döner.
 */
export function parseMoneyInput(raw: string): MoneyParse {
  const text = raw.replace(/₺|TL|tl/g, "").replace(/\s+/g, "");
  if (text === "") return { kind: "empty" };
  if (!/^[0-9.,]+$/.test(text)) return { kind: "error", message: "Tutara yalnız rakam yazın (ör. 1250 veya 1.250)." };
  let intPart: string;
  let fracPart = "";
  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    // İkisi birden: sonda olan ondalık ayracıdır ("1.250,50" / "1,250.50").
    const decimalSep = lastComma > lastDot ? "," : ".";
    const parts = text.split(decimalSep);
    if (parts.length !== 2) return { kind: "error", message: FORMAT_HINT };
    intPart = parts[0]!.replace(/[.,]/g, "");
    fracPart = parts[1]!;
  } else if (lastComma >= 0) {
    // Türkçe ondalık virgül; "1,250,000" gibi üçlü gruplar binlik sayılır.
    const parts = text.split(",");
    if (parts.length > 2 && parts.slice(1).every((p) => p.length === 3)) intPart = parts.join("");
    else if (parts.length === 2) [intPart, fracPart] = [parts[0]!, parts[1]!];
    else return { kind: "error", message: FORMAT_HINT };
  } else if (lastDot >= 0) {
    // "1.250" / "12.500.000" binlik; "1250.5" yapıştırılmış ondalık.
    if (/^\d{1,3}(\.\d{3})+$/.test(text)) intPart = text.replace(/\./g, "");
    else {
      const parts = text.split(".");
      if (parts.length !== 2) return { kind: "error", message: FORMAT_HINT };
      [intPart, fracPart] = [parts[0]!, parts[1]!];
    }
  } else {
    intPart = text;
  }
  if (intPart === "" && fracPart === "") return { kind: "error", message: FORMAT_HINT };
  if (fracPart.length > 2) return { kind: "error", message: "Kuruş en fazla iki hane olabilir." };
  if (/[1-9]/.test(fracPart)) {
    return { kind: "error", message: "Tutarlar tam TL olarak tutulur; kuruşlu tutar girilemez (ör. 1250 veya 1.250)." };
  }
  const value = Number(intPart === "" ? "0" : intPart);
  if (!Number.isSafeInteger(value)) return { kind: "error", message: "Tutar çok büyük." };
  return { kind: "ok", value };
}

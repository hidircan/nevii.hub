/**
 * Faz 9A — personel IBAN'ı hassas veri. `tc-identity.ts` ile AYNI at-rest
 * şifreleme deseni (AES-256-GCM): listede yok, detayda maskeli, tam
 * çözümleme yalnız yetkili (`canViewFullNationalId` — rol bazlı, TC ile
 * AYNI kontrol) + audit. Ayrı bir dosyada tutulur (genelleştirme yerine)
 * çünkü TC ve IBAN farklı doğrulama/maskeleme kurallarına sahip; ortak
 * AES-GCM iskeleti burada KASITLI olarak kopyalanmıştır (iki küçük saf
 * dosya, bir "hassas alan şifrele" soyutlamasından daha az riskli).
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

function resolveKey(): Buffer {
  const raw =
    process.env.PII_ENCRYPTION_KEY ||
    process.env.JWT_SECRET ||
    "notaplan-dev-only-pii-key-change-me";
  return scryptSync(raw, "notaplan-pii-iban-v1", 32);
}

/** TR IBAN mod-97 checksum doğrulaması (ISO 13616) — yalnızca TR formatı kabul edilir. */
export function isValidIban(input: string): boolean {
  const iban = input.replace(/\s/g, "").toUpperCase();
  if (!/^TR\d{2}\d{5}[0-9A-Z]{17}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55));
  let remainder = 0;
  for (let i = 0; i < numeric.length; i++) {
    remainder = (remainder * 10 + Number(numeric[i])) % 97;
  }
  return remainder === 1;
}

export function normalizeIban(input: string): string {
  return input.replace(/\s/g, "").toUpperCase();
}

/** Mask: TR** **** **** **** **** **34 — son 4 hane (liste asla göstermez; detay varsayılanı). */
export function maskIban(last4: string | undefined | null): string {
  if (!last4 || last4.length < 1) return "TR** **** **** **** **** ****";
  const tail = last4.slice(-4).padStart(4, "*");
  return `TR** **** **** **** **** **${tail}`;
}

export type EncryptedIban = {
  /** base64: iv + tag + ciphertext */
  cipher: string;
  last4: string;
};

export function encryptIban(plain: string): EncryptedIban {
  const iban = normalizeIban(plain);
  if (!isValidIban(iban)) {
    throw new Error("Geçersiz IBAN (yalnızca TR formatı desteklenir)");
  }
  const key = resolveKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(iban, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const packed = Buffer.concat([iv, tag, enc]);
  return { cipher: packed.toString("base64"), last4: iban.slice(-4) };
}

export function decryptIban(cipherB64: string): string {
  const key = resolveKey();
  const packed = Buffer.from(cipherB64, "base64");
  if (packed.length < IV_LEN + TAG_LEN + 1) {
    throw new Error("Bozuk şifreli IBAN verisi");
  }
  const iv = packed.subarray(0, IV_LEN);
  const tag = packed.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const data = packed.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

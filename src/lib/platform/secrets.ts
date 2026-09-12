import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

/**
 * Secret saklama. Production'da PLATFORM_ENCRYPTION_KEY (32+ byte) yoksa
 * secret persist edilmez — "şifreli saklandı" iddiası yapılmaz.
 * Env tabanlı sağlayıcı anahtarları (GEMINI_API_KEY vb.) mevcut yaklaşımda kalır.
 */

export type EncryptedSecret = {
  alg: "aes-256-gcm";
  iv: string;
  tag: string;
  ciphertext: string;
};

function keyMaterial(): Buffer | null {
  const raw = process.env.PLATFORM_ENCRYPTION_KEY?.trim();
  if (!raw || raw.length < 32) return null;
  return createHash("sha256").update(raw).digest();
}

export function isPlatformEncryptionConfigured(): boolean {
  return keyMaterial() !== null;
}

export function last4(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 4) return trimmed;
  return trimmed.slice(-4);
}

export function encryptSecret(
  plaintext: string
): { ok: true; stored: EncryptedSecret; last4: string } | { ok: false; reason: "encryption_key_missing" } {
  const key = keyMaterial();
  if (!key) return { ok: false, reason: "encryption_key_missing" };
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ok: true,
    stored: {
      alg: "aes-256-gcm",
      iv: iv.toString("base64"),
      tag: tag.toString("base64"),
      ciphertext: ciphertext.toString("base64"),
    },
    last4: last4(plaintext),
  };
}

export function decryptSecret(stored: EncryptedSecret): string | null {
  const key = keyMaterial();
  if (!key) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(stored.iv, "base64"));
    decipher.setAuthTag(Buffer.from(stored.tag, "base64"));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(stored.ciphertext, "base64")),
      decipher.final(),
    ]);
    return plain.toString("utf8");
  } catch {
    return null;
  }
}

/** Log / API cevapları için: secret benzeri alan adlarını düşür. */
const SECRET_KEY_PATTERN = /(secret|password|api[_-]?key|token|authorization|credential|private)/i;

export function redactSecrets<T>(value: T): T {
  return redact(value) as T;
}

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY_PATTERN.test(k)) {
        out[k] = typeof v === "string" && v.length > 0 ? `****${last4(v)}` : "[redacted]";
      } else {
        out[k] = redact(v);
      }
    }
    return out;
  }
  return value;
}

export function containsUnredactedSecret(payload: unknown, originalSecret: string): boolean {
  if (!originalSecret || originalSecret.length < 4) return false;
  try {
    return JSON.stringify(payload).includes(originalSecret);
  } catch {
    return false;
  }
}

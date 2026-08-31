/**
 * Paket 7 — ödev/materyal dosya yüklemeleri için paylaşılan doğrulama.
 * Dosya küçük dosya/foto/kısa video için base64 olarak DB'de saklanır
 * (bkz. Homework/HomeworkSubmission/TeachingMaterial şema yorumları) —
 * bu modül o base64 gövdenin türünü/boyutunu, herhangi bir I/O olmadan
 * doğrular. Tek kaynak: hem ödev (teacher attachment), hem ödev teslimi,
 * hem öğretim materyali BU fonksiyonu çağırır — ayrı ayrı kural YOK.
 */

import { checkFileMagicBytes } from "./storage/file-guards";

/**
 * ~2MB — base64 kodlanmış küçük dosya/foto/kısa video için üst sınır.
 * Mevcut `fileUploadSchema` (src/lib/validation.ts) zaten `fileData`'yı
 * 2.8M karakterle (≈2.1MB ham bayt) sınırlıyor — buradaki sınır BİLİNÇLİ
 * OLARAK biraz daha düşük tutulur ki bu dostça mesaj her zaman zod'un
 * genel "string too long" hatasından ÖNCE devreye girsin.
 */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

export const ALLOWED_UPLOAD_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "application/pdf",
  // Müzik okulu bağlamında ses kaydı (çalım/şan pratiği) da olağan bir ödev/teslim türüdür.
  // "audio/mp4"/"audio/x-m4a" ikisi de .m4a için tarayıcıya/cihaza göre değişir (iOS/Safari
  // sık sık x-m4a bildirir — bkz. TASK_ATTACHMENT_ALLOWED_MIME, tools.ts); "audio/aac" ham AAC içindir.
  "audio/mpeg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
  "audio/wav",
  "audio/webm",
  "audio/ogg",
] as const;

export type UploadValidationResult = { ok: true } | { ok: false; message: string };

/** Base64 payload → Buffer, stripping an optional data-URI prefix. */
function base64ToBuffer(base64: string): Buffer {
  const stripped = base64.includes(",") ? base64.slice(base64.indexOf(",") + 1) : base64;
  return Buffer.from(stripped, "base64");
}

/** Base64 (data URI önekiyle veya önek olmadan) gövdenin bayt cinsinden yaklaşık boyutu. */
export function base64ByteSize(base64: string): number {
  const stripped = base64.includes(",") ? base64.slice(base64.indexOf(",") + 1) : base64;
  const padding = stripped.endsWith("==") ? 2 : stripped.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((stripped.length * 3) / 4) - padding);
}

export function validateUploadedFile(input: {
  fileName?: string;
  fileMimeType?: string;
  fileData?: string;
}): UploadValidationResult {
  const { fileName, fileMimeType, fileData } = input;
  // Üçü de yoksa dosya eklenmiyor demektir — geçerli (dosya opsiyonel).
  if (!fileName && !fileMimeType && !fileData) return { ok: true };
  if (!fileName || !fileMimeType || !fileData) {
    return { ok: false, message: "Dosya yüklemek için ad, tür ve içerik birlikte gönderilmeli." };
  }
  if (!(ALLOWED_UPLOAD_MIME_TYPES as readonly string[]).includes(fileMimeType)) {
    return {
      ok: false,
      message:
        "Desteklenmeyen dosya türü. Yalnız fotoğraf (jpg/png/webp/gif), video (mp4/mov/webm), ses (mp3/m4a/aac/wav/ogg) veya PDF yükleyebilirsiniz.",
    };
  }
  const size = base64ByteSize(fileData);
  if (size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      message: `Dosya çok büyük (${Math.round(size / (1024 * 1024))} MB). En fazla ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB yükleyebilirsiniz.`,
    };
  }
  if (size === 0) {
    return { ok: false, message: "Dosya içeriği boş görünüyor. Lütfen tekrar deneyin." };
  }
  // Magic-byte check for the image types we have a signature for (jpeg/png/webp/gif);
  // video/audio/pdf pass through on MIME-allowlist alone (see checkFileMagicBytes).
  const buffer = base64ToBuffer(fileData);
  if (!checkFileMagicBytes(buffer, fileMimeType)) {
    return { ok: false, message: "Dosya içeriği beyan edilen türle uyuşmuyor." };
  }
  return { ok: true };
}

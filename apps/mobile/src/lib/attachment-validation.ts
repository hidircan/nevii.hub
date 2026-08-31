/** Backend `validateUploadedFile` (src/lib/file-upload-validation.ts) ile aynı sınırlar — sunucu reddinden önce hızlı istemci hatası için. */
export const ALLOWED_ATTACHMENT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "application/pdf",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/webm",
  "audio/ogg",
];
export const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;

export function validateAttachment(mimeType: string | undefined, sizeBytes: number | undefined): string | null {
  if (mimeType && !ALLOWED_ATTACHMENT_MIME_TYPES.includes(mimeType)) {
    return "Desteklenmeyen dosya türü. Yalnız fotoğraf, video veya PDF yükleyebilirsiniz.";
  }
  if (sizeBytes && sizeBytes > MAX_ATTACHMENT_BYTES) {
    return `Dosya çok büyük (${Math.round(sizeBytes / (1024 * 1024))} MB). En fazla 2 MB yükleyebilirsiniz.`;
  }
  return null;
}

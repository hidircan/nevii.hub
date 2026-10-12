import { interpolate, lookup } from "../i18n/locales";
import { getActiveLocale } from "../i18n/locale-store";

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
  const locale = getActiveLocale();
  if (mimeType && !ALLOWED_ATTACHMENT_MIME_TYPES.includes(mimeType)) {
    return lookup(locale, "attach.unsupported");
  }
  if (sizeBytes && sizeBytes > MAX_ATTACHMENT_BYTES) {
    return interpolate(lookup(locale, "attach.tooBig"), { mb: Math.round(sizeBytes / (1024 * 1024)) });
  }
  return null;
}

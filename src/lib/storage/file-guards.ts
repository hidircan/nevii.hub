export const ANNOUNCEMENT_ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

export const ANNOUNCEMENT_MAX_BYTES = 2 * 1024 * 1024;

export function isAllowedAnnouncementMime(mimeType: string): boolean {
  return ANNOUNCEMENT_ALLOWED_MIME.has(mimeType);
}

/**
 * Magic-byte / container signature check, shared by every upload path
 * (announcements, documents, homework, teaching-materials, task-attachments) so
 * claimed MIME type can't diverge from actual file content. Returns true when the
 * MIME type has no known signature check here (audio/video/plain-text) — those
 * pass through on MIME-allowlist + extension-denylist alone, same as before.
 */
export function checkFileMagicBytes(buffer: Buffer, mimeType: string): boolean {
  if (buffer.length <= 0) return false;
  switch (mimeType) {
    case "application/pdf":
      return buffer.subarray(0, 4).toString("utf8") === "%PDF";
    case "image/jpeg":
      return buffer[0] === 0xff && buffer[1] === 0xd8;
    case "image/png":
      return (
        buffer.length >= 8 &&
        buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      );
    case "image/gif":
      return (
        buffer.length >= 6 &&
        (buffer.subarray(0, 6).toString("utf8") === "GIF87a" || buffer.subarray(0, 6).toString("utf8") === "GIF89a")
      );
    case "image/webp":
      return (
        buffer.length >= 12 &&
        buffer.subarray(0, 4).toString("utf8") === "RIFF" &&
        buffer.subarray(8, 12).toString("utf8") === "WEBP"
      );
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      // OOXML container is a ZIP archive.
      return buffer[0] === 0x50 && buffer[1] === 0x4b;
    case "application/msword":
      // Legacy OLE Compound File signature.
      return (
        buffer.length >= 8 &&
        buffer.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))
      );
    default:
      // No known signature for this MIME (audio/video/text/etc) — MIME-allowlist
      // and extension-denylist already gate these; not a regression vs. prior behavior.
      return true;
  }
}

/** Magic-byte / container check. Office OLE (.doc/.xls) is extension+MIME only. */
export function assertAnnouncementFileBuffer(buffer: Buffer, mimeType: string): void {
  if (buffer.length <= 0) {
    throw new Error("Dosya içeriği boş görünüyor.");
  }
  if (buffer.length > ANNOUNCEMENT_MAX_BYTES) {
    throw new Error("Dosya 2 MB üstünde.");
  }
  if (mimeType === "application/pdf" || mimeType === "image/jpeg" || mimeType === "image/png") {
    if (!checkFileMagicBytes(buffer, mimeType)) {
      throw new Error("Dosya içeriği beyan edilen türle uyuşmuyor.");
    }
    return;
  }
  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ) {
    if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
      throw new Error("Office belgesi içeriği geçersiz.");
    }
    return;
  }
}

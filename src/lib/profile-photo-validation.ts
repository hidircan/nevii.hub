/**
 * Profil fotoğrafı yükleme doğrulaması — `file-upload-validation.ts`
 * (ödev/materyal ekleri, video/pdf/ses dahil geniş tür seti) ile AYNI amaç
 * ama daha DAR bir kapsam: bir profil fotoğrafı yalnızca resim olabilir.
 * `base64ByteSize` oradan yeniden kullanılır — boyut hesaplama mantığı
 * tekrar yazılmaz.
 */
import { base64ByteSize } from "./file-upload-validation";

export const ALLOWED_PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** 2 MB — bir profil fotoğrafı için fazlasıyla yeterli, base64 şişmesiyle birlikte makul bir DB satırı boyutu. */
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

export type PhotoValidationResult = { ok: true } | { ok: false; message: string };

/**
 * Zod şema üst sınırı (bkz. uploadProfilePhotoSchema `fileData` max) bilinçli
 * olarak BURADAKİ 2 MB sınırından daha geniştir — aksi halde normal boyutlu
 * gerçek dünya fotoğrafları zod'un jenerik "Invalid input" hatasına takılır,
 * dostane boyut mesajına hiç ulaşamaz (kök neden: P0-1).
 */
export function validateProfilePhoto(input: { fileMimeType: string; fileData: string }): PhotoValidationResult {
  const { fileMimeType, fileData } = input;
  if (!(ALLOWED_PHOTO_MIME_TYPES as readonly string[]).includes(fileMimeType)) {
    return { ok: false, message: "Desteklenmeyen dosya türü. Yalnızca JPG, PNG veya WEBP fotoğraf yükleyebilirsiniz." };
  }
  const size = base64ByteSize(fileData);
  if (size === 0) {
    return { ok: false, message: "Dosya içeriği boş görünüyor. Lütfen tekrar deneyin." };
  }
  if (size > MAX_PHOTO_BYTES) {
    return { ok: false, message: `Fotoğraf çok büyük (${Math.round(size / (1024 * 1024))} MB). En fazla 2 MB yükleyebilirsiniz.` };
  }
  return { ok: true };
}

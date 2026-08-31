/**
 * Profil fotoğrafı yeniden boyutlandırma ayarları — orijinal iPhone fotoğrafları
 * (ör. 3024x4032, birkaç MB) backend'in dostane 2 MB sınırına (bkz.
 * src/lib/profile-photo-validation.ts MAX_PHOTO_BYTES) gereksiz yere takılmasın
 * diye yüklemeden ÖNCE istemci tarafında küçültülür. `expo-image-manipulator`
 * ile birlikte kullanılır (RN native modülü — burada import EDİLMEZ, saf
 * sabitler/yardımcılar RN'siz test edilebilsin diye ayrı tutulur).
 */
export const PHOTO_RESIZE_MAX_DIMENSION = 640;
export const PHOTO_JPEG_COMPRESS_QUALITY = 0.8;
export const PHOTO_UPLOAD_MIME_TYPE = "image/jpeg";

/** Yükleme isteği gövdesi — her yüklemede TAZE base64 verisi taşır, önceki seçimden kalan referans YOK. */
export type PhotoUploadRequestBody = { fileMimeType: string; fileData: string };

export function buildPhotoUploadRequestBody(base64: string): PhotoUploadRequestBody {
  return { fileMimeType: PHOTO_UPLOAD_MIME_TYPE, fileData: base64 };
}

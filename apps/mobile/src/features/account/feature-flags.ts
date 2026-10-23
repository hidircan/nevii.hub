/**
 * Profil fotoğrafı yükleme özellik bayrağı.
 *
 * `false` → öğretmenler profil fotoğrafı yükleyemez ve Hesabım ekranında
 * fotoğraf alanı HİÇ gösterilmez (sözleşme: öğretmen hesabında fotoğraf
 * yükleme UI'si ve isteği yok). Diğer roller (öğrenci/veli/yönetici)
 * etkilenmez — mevcut davranışları aynen korunur.
 *
 * Sunucu tarafı erişim kontrolü bu bayraktan BAĞIMSIZ yürür; bayrak yalnız
 * istemci görünürlüğünü kapatır.
 */
export const PROFILE_PHOTO_UPLOAD_ENABLED = false;

/** Verilen rol için profil fotoğrafı yönetimi açık mı? */
export function canManageProfilePhoto(role: string | null | undefined): boolean {
  if (role === "TEACHER") return PROFILE_PHOTO_UPLOAD_ENABLED;
  return true;
}

import * as SecureStore from "expo-secure-store";

/**
 * Veli çocuk-seçimi persist katmanı — TEK anahtar tanımı.
 *
 * Anahtar `userId` ile ad-alanlıdır: farklı kullanıcı aynı cihazda giriş
 * yaptığında başkasının seçimi ASLA okunmaz. Değer her açılışta sunucu
 * listes (`my-children`) ile doğrulanır; erişimden çıkarılan çocuk geçersiz
 * sayılır. Logout'ta anahtar silinir (paylaşımlı cihaz hijyeni); yeniden
 * girişte sunucu listesinden temiz seçim yapılır.
 */
export function selectedStudentKey(userId: string): string {
  return `neviichub_selected_student:${userId}`;
}

export async function clearSelectedStudent(userId: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(selectedStudentKey(userId));
  } catch {
    // Temizlik best-effort: değer zaten userId-ad-alanlı + sunucu-doğrulamalı.
  }
}

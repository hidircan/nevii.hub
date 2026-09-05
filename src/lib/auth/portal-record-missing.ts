/**
 * P0 (2026-09-05) — YÖNLENDİRME DÖNGÜSÜ DÜZELTMESİ.
 *
 * Portal sayfaları (`/ogrenci`, `/ogretmen`, `/veli`), oturum GEÇERLİ olduğu
 * hâlde oturuma bağlı kaydı (öğrenci/öğretmen satırı) bulamadıklarında
 * `redirect("/login")` yapıyordu. `/login` ise geçerli bir oturum görünce
 * kullanıcıyı rolünün ana sayfasına geri gönderiyordu — yani AYNI portala.
 * Sonuç: `/ogrenci → /login → /ogrenci → …` sonsuz döngüsü (gerçek tarayıcıda
 * doğrulandı: bir öğrenci hesabının `studentId`si silinmiş bir kayda işaret
 * ettiğinde).
 *
 * Bu, bir KİMLİK DOĞRULAMA hatası değildir — kullanıcı gerçekten giriş
 * yapmıştır, yalnızca hesabına bağlı kurum kaydı yoktur. Bu yüzden artık
 * `/login`e `hesapKaydiYok=1` işaretiyle gidilir; `/login` bu işareti görünce
 * OTOMATİK YÖNLENDİRME YAPMAZ, durumu açıklayan bir mesaj gösterir. Döngü,
 * tüm portallar için TEK yerde kırılır.
 */
export const PORTAL_RECORD_MISSING_PARAM = "hesapKaydiYok";

/** Portal sayfalarından "oturum var ama kurum kaydı yok" durumunda gidilecek hedef. */
export const PORTAL_RECORD_MISSING_REDIRECT = `/login?${PORTAL_RECORD_MISSING_PARAM}=1`;

/**
 * Panel-içi "bağlamı taşı, geri dön" linkleri için `returnTo` query param
 * doğrulayıcı — TEK kaynak. İş 5 (bu sprint) itibarıyla hem tek tek sayfaların
 * kendi manuel "← Geri dön" linklerinde HEM DE `BackButton`'ın otomatik
 * `?returnTo=` algılamasında AYNI fonksiyon kullanılır — ikinci bir
 * allowlist icat edilmedi.
 *
 * Yalnızca UYGULAMA İÇİ, allowlist edilmiş panel yollarına izin verir —
 * open redirect'e KAPALI: mutlak URL ("https://…"), protokol-göreli
 * ("//evil.com"), veya allowlist dışı bir yol ise reddedilir (null döner,
 * çağıran taraf geri dönüş linkini hiç render etmez / normal fallback'e düşer).
 *
 * Tenant/rol erişimi BURADA doğrulanmaz — hedef sayfanın kendi
 * `requireSessionContext` + `getInstitutionContext`/`readScopedData` akışı
 * her istekte yeniden çalışır; bu fonksiyon yalnızca "bu string bir güvenli,
 * uygulama-içi panel yolu mu" sorusuna cevap verir. Cross-tenant/yetkisiz bir
 * `returnTo` (ör. başka bir kurumun öğrenci ID'si) geçerli GÖRÜNSE bile,
 * kullanıcı o linke tıkladığında hedef sayfa kendi erişim kontrolünde
 * (assertStudentAccess / readScopedData) reddeder — burası yalnızca
 * yönlendirmenin uygulama dışına ÇIKMAMASINI garanti eder.
 */
const ALLOWED_RETURN_TO_PREFIXES = [
  "/panel/odemeler/",
  "/panel/ogrenciler/",
  "/panel/ogretmenler/",
  "/panel/program",
  "/panel/is-takip",
  "/panel/telafi",
  "/panel/kurulum",
  "/panel/ders-duzeltme",
  "/panel/subeler",
  "/panel/evraklar",
  "/panel/personel",
  "/panel/bildirimler",
  "/panel/iletisim-merkezi",
] as const;

export function resolveSafeReturnTo(raw: string | undefined | null): string | null {
  if (!raw) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  // Yalnızca "/" ile başlayan, "//" ile başlamayan (protokol-göreli engeli),
  // ":" içermeyen (şema/host enjeksiyonu engeli, ör. "/x:@evil.com") göreli
  // yollara izin ver.
  if (!decoded.startsWith("/") || decoded.startsWith("//") || decoded.includes("://") || decoded.includes(":")) {
    return null;
  }
  if (!ALLOWED_RETURN_TO_PREFIXES.some((p) => decoded.startsWith(p))) return null;
  return decoded;
}

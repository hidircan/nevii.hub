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
  "/panel/odemeler",
  "/panel/ogrenciler",
  "/panel/ogretmenler",
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
  "/panel/ai",
  "/panel/yoklama",
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

/**
 * 9. tur — alt ekran linkine kaynak bağlamı ekler (`?returnTo=` / `&returnTo=`).
 * `returnTo` önce doğrulanır; güvensizse link DEĞİŞMEDEN döner (hedef kendi varsayılanına düşer).
 */
export function withReturnTo(href: string, returnTo: string | null | undefined): string {
  const safe = resolveSafeReturnTo(returnTo ? encodeURIComponent(returnTo) : null);
  if (!safe) return href;
  return `${href}${href.includes("?") ? "&" : "?"}returnTo=${encodeURIComponent(safe)}`;
}

/**
 * 10. tur iş #10 — uygulama-içi yola sorgu parametresi ekler/değiştirir
 * (mevcut parametreler korunur). Yalnızca `resolveSafeReturnTo`'dan geçen
 * yollarda kullanılmalıdır; mutlak URL verilirse aynen geri döner
 * (güvenlik: yeni bir yönlendirme yüzeyi açılmaz).
 */
export function withQueryParam(path: string, key: string, value: string): string {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes(":")) return path;
  const [base, query] = path.split("?");
  const params = new URLSearchParams(query ?? "");
  params.set(key, value);
  const next = params.toString();
  return next ? `${base}?${next}` : (base ?? path);
}

/** `withQueryParam`'ın tersi — parametreyi kaldırır, diğerlerini korur. */
export function withoutQueryParam(path: string, key: string): string {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes(":")) return path;
  const [base, query] = path.split("?");
  if (!query) return path;
  const params = new URLSearchParams(query);
  params.delete(key);
  const next = params.toString();
  return next ? `${base}?${next}` : (base ?? path);
}

/** Dönüş düğmesinin metni — kullanıcı nereye döneceğini görür. */
export function returnToLabel(path: string): string {
  const p = path.split(/[?#]/)[0];
  if (p === "/panel/evraklar") return "Evraklara dön";
  if (p.startsWith("/panel/evraklar/")) return "Evrak detayına dön";
  if (/^\/panel\/ogrenciler\/[^/]+\/evraklar$/.test(p)) return "Öğrencinin evraklarına dön";
  if (/^\/panel\/ogrenciler\/[^/]+\/sozlesmeler/.test(p)) return "Öğrencinin sözleşmelerine dön";
  if (p === "/panel/yoklama") return "Yoklama takvimine dön";
  if (p === "/panel/yoklama-raporu") return "Yoklama raporuna dön";
  if (/^\/panel\/ogrenciler\/[^/]+\/program/.test(p)) return "Öğrencinin programına dön";
  if (/^\/panel\/ogrenciler\/[^/]+\/odemeler/.test(p) || /^\/panel\/odemeler\/[^/]+/.test(p)) return "Öğrencinin ödemelerine dön";
  if (/^\/panel\/ogrenciler\/[^/]+/.test(p)) return "Öğrenci detayına dön";
  if (p === "/panel/odemeler") return "Ödemelere dön";
  return "Geri dön";
}

/**
 * Merkezi uygulama markası — kullanıcıya görünen TÜM ortak marka metni
 * buradan gelir (metadata, sidebar, login, landing, AI asistan adı, boş
 * durumlar). Teknik/uyumluluk identifier'ları (cookie adları, JWT issuer/
 * audience, npm paket adı, health-check servis adı, env var isimleri,
 * localStorage anahtarları) BİLİNÇLİ OLARAK buradan ÇEKİLMEZ — onlar ayrı,
 * "notaplan" olarak sabit kalır (geriye dönük uyumluluk/migration riski
 * olmadan yeniden markalama amacı taşımaz).
 *
 * `school.logoUrl` (kurum/tenant logosu) BU modülden bağımsızdır — bir okul
 * kendi logosunu ayarladığında UI onu gösterir; bu modül yalnızca uygulama
 * markasını (global "Maestron" kimliği) temsil eder, kurum kapsamını
 * ETKİLEMEZ.
 */
export const BRAND = {
  name: "Nevii Hub",
  shortName: "NeviiHub",
  tagline: "Everything. Connected.",
  description:
    "NeviiHub, Kurumlar için program, yoklama, telafi ve ödeme yönetimi platformudur.",
  assistantName: "NeviiHub AI",
  /**
   * P0 (2026-08-30, temiz karşılama ekranı) — onaylı NeviiHub "N" monogram
   * markası `public/brand/logo.png` altında mevcut; welcome/login ekranları
   * artık bunu kullanır. `logoMarkPath` küçük/kare kullanım (favicon,
   * sidebar) için aynı dosyayı işaret eder — ayrı bir asset yoksa fallback
   * metin/monogram render'a düşülür.
   */
  logoPath: "/brand/logo.png" as string | null,
  logoSvgPath: null as string | null,
  logoMarkPath: "/brand/logo.png" as string | null,
  logoMarkTransparentPath: null as string | null,
  sidebarLogoPath: "/icon.png",
  faviconPath: "/icon.png",
  ogImagePath: null as string | null,
} as const;

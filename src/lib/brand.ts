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
  name: "NeviiHub",
  shortName: "NeviiHub",
  tagline: "Everything. Connected.",
  description:
    "NeviiHub, Kurumlar için program, yoklama, telafi ve ödeme yönetimi platformudur.",
  assistantName: "NeviiHub AI",
  /**
   * Build-time varsayılan: NeviiOS'ta logo yüklenmemişse kullanılır. Yüzeyler
   * bu yolları doğrudan değil `getPlatformBrand()` / `<PlatformLogo>` ile okur.
   */
  logoPath: "/brand/logo.png" as string | null,
  logoSvgPath: null as string | null,
  logoMarkPath: "/brand/logo.png" as string | null,
  logoMarkTransparentPath: null as string | null,
  sidebarLogoPath: "/icon.png",
  faviconPath: "/icon.png",
  /** 10. tur iş #3 — `src/app/opengraph-image.tsx` konvansiyonu ile sunucu tarafında üretilir (1200×630 PNG). */
  ogImagePath: "/opengraph-image" as string | null,
} as const;

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
  name: "Maestron",
  shortName: "Maestron",
  tagline: "Müzik Okulu Yönetimi",
  description:
    "Maestron, müzik okulları için program, yoklama, telafi ve ödeme yönetimi platformudur.",
  assistantName: "Maestron Asistan",
  logoPath: "/brand/maestron-logo.png",
  logoSvgPath: "/brand/maestron-logo.svg",
  logoMarkPath: "/brand/maestron-mark.png",
  /** Şeffaf arka planlı mark — koyu/renkli zeminlerde beyaz kutu olmadan kullanmak için (ör. Gece Obsidyen). */
  logoMarkTransparentPath: "/brand/maestron-mark-transparent.png",
  /** Sidebar marka alanı — İş 2A: sade, tek logomark (bkz. sidebar.tsx). */
  sidebarLogoPath: "/brand/maestron-svg-logo.png",
  faviconPath: "/icon.png",
  ogImagePath: "/brand/maestron-logo.png",
} as const;

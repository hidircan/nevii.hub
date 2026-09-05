/**
 * P1 (2026-09-05) — GİRİŞ ÖNCESİ KURUMSAL SİTE İÇERİĞİ.
 *
 * Sunum (bileşenler, bkz. `src/components/site/sections.tsx`) ile İÇERİK
 * burada AYRIŞTIRILDI: yeni bir referans/fiyat kartı/SSS maddesi eklemek
 * için sayfa yapısına DOKUNMAK GEREKMEZ, yalnızca bu dosyaya veri eklenir.
 *
 * UYDURMA VERİ YASAK: gerçek olmayan kurum adı, müşteri sözü, istatistik,
 * fiyat, telefon/e-posta/adres BURAYA YAZILMAZ. Henüz gerçek veri yoksa
 * ilgili dizi BOŞ bırakılır — bileşenler boş diziyi gördüğünde kırık kart /
 * kırık görsel yerine dürüst bir "yakında/bize ulaşın" durumu gösterir.
 */

export type NavItem = { label: string; href: string };

/** Tüm bağlantılar ya sayfa içi çapa ya da GERÇEKTEN var olan bir rotadır — kırık link yok. */
export const SITE_NAV: NavItem[] = [
  { label: "Ana Sayfa", href: "#ust" },
  { label: "Hakkımızda", href: "#hakkimizda" },
  { label: "Özellikler", href: "#ozellikler" },
  { label: "Referanslar", href: "#referanslar" },
  { label: "Fiyatlandırma", href: "#fiyatlandirma" },
  { label: "İletişim", href: "#iletisim" },
];

export const SITE_HERO = {
  headline: "Müzik kurumunuzun tamamı tek platformda",
  subline:
    "Program, yoklama, telafi, sözleşme ve tahsilat yönetimi; öğretmen ve veli portallarıyla birlikte. Kuruma özel, çok şubeli ve güvenli.",
  primaryCta: { label: "Giriş Yap", href: "/login" },
  secondaryCta: { label: "Platformu Tanıyın", href: "#platform" },
};

export type FeatureItem = { title: string; description: string };

export const SITE_FEATURES: FeatureItem[] = [
  {
    title: "Ders programı ve takvim",
    description: "Şube, salon ve öğretmen bazında çakışmasız planlama; haftalık ve aylık görünüm.",
  },
  {
    title: "Yoklama ve ders durumu",
    description: "Geldi / İşlendi / Telafi durumları tek ekrandan; renk ve etiketle birlikte okunur.",
  },
  {
    title: "Telafi yönetimi",
    description: "Telafi hakkı, süre ve kota kuralları merkezî olarak uygulanır; uygun slot önerilir.",
  },
  {
    title: "Sözleşme merkezi",
    description: "Kayıt sözleşmesi, KVKK ve fotoğraf/video rıza bölümleri tek çıktı olarak üretilir.",
  },
  {
    title: "Tahsilat ve ödeme takibi",
    description: "İlk tahsilat, taksit planı, gecikme takibi ve makbuz çıktısı.",
  },
  {
    title: "Öğretmen ve veli portalları",
    description: "Herkes yalnızca kendi verisini görür; yetkilendirme kurum sınırında zorunlu tutulur.",
  },
];

export type PlatformSurface = { title: string; description: string };

export const SITE_PLATFORM_SURFACES: PlatformSurface[] = [
  { title: "Yönetim paneli", description: "Kurum yöneticisi ve ofis ekibi için tüm operasyon." },
  { title: "Öğretmen portalı", description: "Kendi programı, yoklaması ve öğrencileri." },
  { title: "Veli / öğrenci portalı", description: "Ders programı, devam durumu, ödemeler ve belgeler." },
];

/**
 * Gerçek referans/başarı hikâyesi eklenene kadar BOŞ. Yapı hazırdır:
 * logo, kurum adı, sektör, kısa metin ve hikâye bağlantısı destekler.
 */
export type ReferenceItem = {
  name: string;
  sector?: string;
  quote?: string;
  logoUrl?: string;
  logoAlt?: string;
  storyHref?: string;
};

export const SITE_REFERENCES: ReferenceItem[] = [];

/** Gerçek paket/fiyat verisi hazır olana kadar BOŞ — uydurma fiyat gösterilmez. */
export type PricingPlan = {
  name: string;
  summary: string;
  priceLabel?: string;
  features: string[];
  ctaLabel?: string;
  ctaHref?: string;
};

export const SITE_PRICING_PLANS: PricingPlan[] = [];

export const SITE_PRICING_PLACEHOLDER = {
  title: "Kurumunuza uygun planı birlikte belirleyelim",
  description:
    "Şube sayısı, öğrenci sayısı ve ihtiyaç duyduğunuz modüllere göre uygun bir plan oluşturuyoruz. Güncel paket ve fiyat bilgisi için bizimle iletişime geçin.",
  ctaLabel: "İletişime geçin",
  ctaHref: "#iletisim",
};

/** Ekran görüntüsü/video varlıkları eklenene kadar BOŞ — kırık görsel/oynatıcı gösterilmez. */
export type MediaItem = { title: string; caption?: string; imageUrl?: string; imageAlt?: string; videoUrl?: string };

export const SITE_MEDIA: MediaItem[] = [];

export type FaqItem = { question: string; answer: string };

export const SITE_FAQ: FaqItem[] = [
  {
    question: "Verilerimiz başka kurumlarla karışır mı?",
    answer:
      "Hayır. Her kayıt tek bir kuruma bağlıdır ve kurum kimliği yalnızca oturum bilgisinden çözülür; kullanıcıdan gelen bir değerle değiştirilemez.",
  },
  {
    question: "Öğretmen ve veliler neleri görebilir?",
    answer:
      "Her rol yalnızca kendi kapsamındaki veriyi görür. Öğretmen kendi programını ve öğrencilerini, veli/öğrenci ise yalnızca kendi kaydını görüntüler.",
  },
  {
    question: "Sözleşme ve KVKK belgeleri nasıl üretiliyor?",
    answer:
      "Kurumun yüklediği şablonlar kullanılır. Kayıt sözleşmesi, KVKK aydınlatma metni ve fotoğraf/video açık rıza formu tek bir çıktıda, bölümleri ayrı başlıklar ve imza alanlarıyla birlikte basılır.",
  },
  {
    question: "Mobil cihazlardan kullanılabiliyor mu?",
    answer: "Evet. Tüm portallar mobil tarayıcıda çalışacak şekilde tasarlanmıştır.",
  },
];

/**
 * Gerçek iletişim bilgisi girilene kadar alanlar `undefined` bırakılır —
 * uydurma telefon/e-posta/adres GÖSTERİLMEZ. Bileşen yalnızca dolu alanları
 * render eder.
 */
export const SITE_CONTACT: {
  phone?: string;
  email?: string;
  address?: string;
  mapEmbedUrl?: string;
  social: { label: string; href: string }[];
} = {
  social: [],
};

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
  headline: "Eğitim Kurumları için Yönetim Platformu",
  subline:
    "NeviiHub, kurumunuzun arka ofisidir: ders programı, yoklama, telafi, sözleşme ve tahsilat tek panelde; öğretmen ve veli portallarıyla birlikte. Yapay zekâ taslakları hazırlar, son onayı siz verirsiniz.",
  primaryCta: { label: "Ücretsiz Demo İste", href: "#iletisim" },
  secondaryCta: { label: "Giriş Yap", href: "/login" },
};

/** Hero altı güven satırı — her madde üründe GERÇEKTEN var (pazarlama 03 vaat sınırları). */
export const SITE_HIGHLIGHTS: string[] = [
  "Çok şubeli kurumlar için tek panel",
  "KVKK + fotoğraf/video açık rıza akışları",
  "Onaysız mesaj gitmez",
  "Telefondan da kullanılır",
];

export type StepItem = { title: string; description: string };

export const SITE_STEPS: StepItem[] = [
  {
    title: "Demo isteyin",
    description: "İletişim bölümünden yazın; kurumunuza uygun kısa bir demo planlayalım.",
  },
  {
    title: "Birlikte kurun",
    description: "Mevcut öğrenci listeniz CSV ile taşınır; şube, öğretmen ve paketler tanımlanır.",
  },
  {
    title: "Panelden yönetin",
    description: "Programdan yoklamaya, sözleşmeden tahsilata tüm operasyon tek ekranda.",
  },
];

export type FeatureItem = { title: string; description: string };

export const SITE_FEATURES: FeatureItem[] = [
  {
    title: "Ders programı ve takvim",
    description: "Şube, salon ve öğretmen bazında çakışma kontrollü planlama; haftalık ve aylık görünüm.",
  },
  {
    title: "Yoklama ve telafi merkezi",
    description: "Geldi / İşlendi / Telafi durumları tek ekranda; telafi hakkı ve süre kuralları merkezî uygulanır.",
  },
  {
    title: "Sözleşme merkezi",
    description: "Kayıt sözleşmesi, KVKK ve fotoğraf/video rıza bölümleri tek çıktı; sürümlü revize ve güvenli iptal.",
  },
  {
    title: "Tahsilat ve ödeme takibi",
    description: "İlk tahsilat, taksit planı, gecikme takibi ve makbuz çıktısı; finans özeti tek ekranda.",
  },
  {
    title: "Yapay zekâ asistanı + onaylı mesajlar",
    description: "Asistan taslakları hazırlar, siz onaylarsınız. Onaysız SMS/WhatsApp mesajı gitmez.",
  },
  {
    title: "Öğretmen hakedişleri",
    description: "Ders bazında hakediş hesabı, revizyon geçmişi ve ödeme takibi.",
  },
];

export type PlatformSurface = { title: string; description: string };

export const SITE_PLATFORM_SURFACES: PlatformSurface[] = [
  {
    title: "Yönetim paneli",
    description: "Kayıt, program, yoklama, sözleşme, tahsilat ve raporlar — kurumun tüm operasyonu.",
  },
  {
    title: "Öğretmen portalı",
    description: "Kendi programı, yoklaması, öğrencileri ve hakediş dökümü.",
  },
  {
    title: "Veli / öğrenci portalı",
    description: "Ders programı, devam durumu, ödemeler ve belgeler — yalnızca kendi kaydı.",
  },
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
  {
    question: "Nasıl demo alabilirim?",
    answer:
      "İletişim bölümündeki e-posta adresinden yazın; kurumunuza uygun kısa bir demo planlayalım.",
  },
  {
    question: "Mevcut öğrenci listemi taşıyabilir miyim?",
    answer:
      "Evet. CSV dosyanızdaki öğrenciler içe aktarılabilir; kayıt bilgileri ve ilk tahsilat kayıtları korunur.",
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
  email: "info@neviihub.com",
  social: [],
};

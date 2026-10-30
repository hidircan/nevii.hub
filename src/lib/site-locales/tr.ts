import {
  SITE_CONTACT,
  SITE_FAQ,
  SITE_FEATURE_GROUPS,
  SITE_HERO,
  SITE_HIGHLIGHTS,
  SITE_MEDIA,
  SITE_NAV,
  SITE_PLATFORM_SURFACES,
  SITE_PRICING_PLACEHOLDER,
  SITE_PURCHASE_STEPS,
} from "../site-content";
import type { SiteLocaleContent } from "./types";

/** Türkçe site içeriği — mevcut sabitlerden derlenir, metin tekrarı yok. */
export const trContent: SiteLocaleContent = {
  locale: "tr",
  meta: {
    title: "NeviiHub — Müzik kurumları için yönetim platformu",
    description:
      "Program, yoklama, telafi, sözleşme ve tahsilat yönetimi; öğretmen ve veli portallarıyla birlikte.",
  },
  skip: "İçeriğe geç",
  header: { login: "Giriş Yap", languageLabel: "Dil", demo: "Demo İste" },
  nav: SITE_NAV,
  hero: {
    headline: SITE_HERO.headline,
    subline: SITE_HERO.subline,
    login: "Giriş Yap",
    trial: "30 gün ücretsiz dene",
    tour: "Platformu tanıyın →",
    highlights: SITE_HIGHLIGHTS,
  },
  about: {
    title: "Kurumunuzun günlük işleyişi için tasarlandı",
    description:
      "NeviiHub; ders planlamasından yoklamaya, sözleşmeden tahsilata kadar kurumun tüm operasyonunu tek bir yerde toplar. Her kurum kendi verisini görür, her rol yalnızca yetkili olduğu kadarını.",
  },
  features: {
    title: "Kurumun tüm işi, tek platformda",
    description: "Planlamadan tahsilata, sözleşmeden iletişime — her süreç için ayrı ekran.",
  },
  groups: SITE_FEATURE_GROUPS,
  platform: { title: "Üç portal, tek platform", description: "Herkes kendi işine odaklanır; veri tek yerde kalır." },
  surfaces: SITE_PLATFORM_SURFACES,
  references: {
    title: "Referanslar",
    empty: "Referans kurumlarımız ve başarı hikâyeleri yakında bu bölümde yayımlanacak.",
    story: "Hikâyeyi okuyun →",
  },
  pricing: {
    title: "Paketler ve Fiyatlar",
    description: "Aynı katalog checkout ekranını da besler; gördüğünüz tutar satın almada yeniden doğrulanır.",
  },
  pricingPlaceholder: {
    title: SITE_PRICING_PLACEHOLDER.title,
    description: SITE_PRICING_PLACEHOLDER.description,
    cta: SITE_PRICING_PLACEHOLDER.ctaLabel,
  },
  pricingChrome: {
    periodLabel: "Ödeme periyodu",
    monthly: "Aylık",
    yearly: "Yıllık",
    perMonth: "ay",
    perYear: "yıl",
    yearlyNote: "Yılda tek tahsilat. Aylık eşdeğer {equiv}.",
    savings: "Aylık ödemeye göre %{pct} avantajlı",
    sandboxZero: "SANDBOX test tutarı",
    customQuote: "Özel teklif",
    notApproved: "Bu paketin onaylı fiyatı yok; gerçek checkout kapalı.",
    unlimited: "Sınırsız",
    students: "öğrenci",
    users: "kullanıcı",
    branches: "şube",
    moreModules: "· ve {n} modül daha",
    buy: "Satın al",
    quote: "Teklif iste",
    demoNote:
      "Demo kataloğu: tutarlar örnek fiyattır, gerçek satış fiyatı değildir. Onaylı fiyat yayınlanınca bu not kalkar.",
    trialTeaser: "Kararsız mısınız? Kart bilgisi vermeden 30 gün ücretsiz deneyin.",
    trialCta: "30 gün ücretsiz dene",
  },
  purchase: {
    title: "Nasıl satın alınır?",
    description:
      "Paket seçiminden abonelik yönetimine kadar tüm adımlar şeffaftır; ödeme öncesi toplam tutarı her zaman görürsünüz.",
    cta: "Paketleri inceleyin →",
  },
  mobileApp: {
    title: "NeviiHub cebinizde",
    description: "Yoklama, ödev ve duyurulara telefondan erişin. Uygulama yayınlandığında indirme bağlantıları burada olacak.",
    appStore: "App Store'dan indirin",
    play: "Google Play'den indirin",
    soon: "Mobil uygulama yakında mağazalarda.",
    openInApp: "Uygulamada aç",
    dismiss: "Kapat",
  },
  steps: SITE_PURCHASE_STEPS,
  media: {
    title: "Platformu yakından tanıyın",
    description: "Gerçek NeviiHub ekranları: ders programından öğrenci yönetimine kadar.",
  },
  mediaItems: SITE_MEDIA,
  faq: { title: "Sıkça sorulan sorular", description: "Ürün, kurulum ve satın alma hakkında merak edilenler." },
  faqItems: SITE_FAQ,
  contact: {
    title: "İletişim",
    description: "Kurumunuz için uygun kurulum ve planı birlikte belirleyelim.",
    phone: "Telefon",
    email: "E-posta",
    address: "Adres",
    pending: "İletişim bilgilerimiz yakında burada yayımlanacak. Kurum hesabınız varsa panelden bize ulaşabilirsiniz.",
    demoTitle: "Ücretsiz demo isteyin",
    demoCta: "Demo e-postası gönderin",
    follow: "Sosyal medyada takip edin",
    soon: "yakında",
    mapTitle: "Konum haritası",
  },
  footer: { rights: "" },
};

export const trSocial = SITE_CONTACT.social;
export const trEmail = SITE_CONTACT.email;

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
  { label: "Özellikler", href: "/ozellikler" },
  { label: "Sektörler", href: "/sektorler" },
  { label: "Paketler", href: "#fiyatlandirma" },
  { label: "Blog", href: "/blog" },
  { label: "Ücretsiz Dene", href: "/deneme" },
  { label: "Referanslar", href: "#referanslar" },
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

export const SITE_START = { eyebrow: "Başlangıç", title: "Üç adımda yayında" };

/** Hakkında bölümünün isteğe bağlı alt notu; boşsa görünmez (NeviiOS › Site ayarları). */
export const SITE_ABOUT_NOTE = "";

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

/**
 * Tüm özellikler vitrini — maddeler GERÇEK panel ekranlarına dayanır
 * (program, yoklama, telafi, öğrenciler, öğretmenler, ödemeler, hakedişler,
 * evraklar, müfredat, iletişim, duyurular, raporlar, kurulum). Var olmayan
 * ekran/madde yazılmaz.
 */
export type FeatureGroup = { title: string; description: string; points: string[] };

export const SITE_FEATURE_GROUPS: FeatureGroup[] = [
  {
    title: "Ders planlama ve program",
    description: "Haftalık ders takviminin tümü tek ekranda kurulur ve yürütülür.",
    points: [
      "Şube, öğretmen ve stüdyo bazında haftalık program görünümü",
      "Sürükle-bırak ile ders taşıma, süre uzatma",
      "Tekrarlayan ders oluşturma ve toplu planlama",
      "Stüdyo/oda kapasite ve enstrüman bilgisiyle çakışmasız yerleşim",
    ],
  },
  {
    title: "Yoklama ve telafi",
    description: "Devam takibi ve telafi süreci kurallara bağlı işler.",
    points: [
      "Geldi / İşlendi / Telafi durumlarıyla hızlı yoklama girişi",
      "Telafi hakkı, süre ve kota kurallarının otomatik uygulanması",
      "Uygun telafi slotu önerisi ve telafi merkezi takibi",
      "Öğrenci ve dönem bazında yoklama raporları",
    ],
  },
  {
    title: "Öğrenci ve öğretmen kayıtları",
    description: "Kurumun insan kaynağı düzenli ve aranabilir tutulur.",
    points: [
      "Öğrenci kaydı: şube, enstrüman, öğretmen, paket ve sözleşme durumu",
      "Gelişmiş filtreler, sıralama ve arşivleme",
      "Öğretmen kartları: branş, program yükü ve iletişim bilgileri",
      "Enstrüman ve personel tanımları",
    ],
  },
  {
    title: "Eğitim takibi",
    description: "Öğrenim ilerlemesi ders ders izlenir.",
    points: [
      "Müfredat ve konu ilerleme takibi",
      "Ödev tanımlama ve ödev raporları",
      "Deneme derslerinin kaydı ve takibi",
      "Dönemsel değerlendirmeler ve geri bildirimler",
    ],
  },
  {
    title: "Ödeme ve finans",
    description: "Kurumun para akışı dersle ilişkilendirilir.",
    points: [
      "Taksit planları, vade ve gecikme takibi",
      "Makbuz çıktısı ve ödeme geçmişi",
      "Öğretmen hakediş hesaplama ve ödeme takibi",
      "Ücret kuralları, paket tanımları ve finans özeti",
    ],
  },
  {
    title: "Sözleşme ve belgeler",
    description: "Resmî evrak tek merkezden üretilir.",
    points: [
      "Kayıt sözleşmesi, KVKK aydınlatma ve fotoğraf/video rıza formu",
      "Kuruma özel belge şablonları",
      "Öğrenci ve ödeme dökümleri",
      "Yazdırılabilir resmî çıktılar",
    ],
  },
  {
    title: "İletişim ve duyurular",
    description: "Kurum içi ve dışı iletişim kayıt altındadır.",
    points: [
      "Toplu duyuru ve bildirim gönderimi",
      "İletişim merkezi ve mesaj geçmişi",
      "Aday ve görüşme kayıtlarıyla CRM takibi",
      "Kurum içi mesajlaşma",
    ],
  },
  {
    title: "Kurulum ve yönetim",
    description: "Kurumun yapısı ve günlük işleyişi yönetilir.",
    points: [
      "Adım adım kurum kurulumu: şube, stüdyo, paket ve kullanıcılar",
      "Mevcut kayıtların toplu veri aktarımı",
      "İş takip listeleri ve görev atama",
      "Denetim kaydıyla kim-ne-zaman izlenebilirliği",
    ],
  },
  {
    title: "Yapay zekâ desteği",
    description: "Tekrarlayan işlerde akıllı yardım.",
    points: [
      "Doğal dille soru sorulabilen kurum asistanı",
      "Günlük ve dönemlik otomatik özetler",
      "Kayıtlı işlem geçmişinden bağlamsal yanıtlar",
    ],
  },
];

export type PlatformSurface = { title: string; description: string; points: string[] };

export const SITE_PLATFORM_SURFACES: PlatformSurface[] = [
  {
    title: "Yönetim paneli",
    description: "Kurum sahibi, yönetici ve ofis ekibinin tüm operasyonu yönettiği ana ekran.",
    points: [
      "Günlük özet: bugünkü dersler, bekleyen yoklama ve telafi talepleri, gecikmiş tahsilatlar",
      "Ders programı, yoklama, telafi merkezi, öğrenci ve öğretmen kayıtları",
      "Sözleşmeler, evraklar, ödemeler, öğretmen hakedişleri ve finans özeti",
      "Şube, stüdyo/oda, paket, müfredat ve kullanıcı yetkilerinin merkezi yönetimi",
      "Duyuru, bildirim, iletişim merkezi ve denetim kaydıyla tam izlenebilirlik",
    ],
  },
  {
    title: "Öğretmen portalı",
    description: "Öğretmen yalnızca kendi derslerine ve öğrencilerine odaklanır.",
    points: [
      "Kişisel ders programı ve derslik bilgisiyle günlük akış",
      "Yoklama girişi ve ders durumu takibi",
      "Kendi öğrencileri, ödevler, müfredat ve değerlendirme ekranları",
      "Müsaitlik bildirimi ve hakediş görüntüleme",
      "Ders materyalleri, iş takip ve geri bildirim ekranları",
    ],
  },
  {
    title: "Veli ve öğrenci portalı",
    description: "Aileler ve öğrenciler kendi bilgilerine her yerden ulaşır.",
    points: [
      "Ders programı, devam/devamsızlık durumu ve telafi bilgileri",
      "Ödevler, müfredat ilerlemesi ve dönemsel değerlendirmeler",
      "Ödeme bilgileri, sözleşmeler ve indirilebilir belgeler",
      "Değerlendirme sonuçları ve kurum duyuruları",
      "Her kullanıcı yalnız kendi kaydını görür; veriler kurum sınırında izole",
    ],
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

/**
 * Ürün vitrini — GERÇEK uygulama ekran görüntüleri, `public/images/showcase/`
 * altında optimize yerel dosyalar (Supabase/uzak çağrı yok, egress etkisi yok).
 * Dizi boşalırsa bölüm hiç render edilmez — kırık görsel çıkmaz.
 */
export type MediaItem = { title: string; caption?: string; imageUrl?: string; imageAlt?: string; videoUrl?: string };

export const SITE_MEDIA: MediaItem[] = [];

/**
 * Hero altındaki tek vitrin görseli — ürün iç ekranı eklendiğinde doldurulur.
 * `null` iken hero görselsiz render edilir (kırık görsel çıkmaz).
 */
export const SITE_HERO_SHOWCASE: {
  imageUrl: string;
  imageAlt: string;
  caption: string;
} | null = null;

/**
 * Satın alma ekranı modül detayları — katalogdaki kısa açıklamaların yerine
 * /satin-al sayfasında gösterilen uzun anlatım. Anahtar katalog modül
 * anahtarıyla eşleşir; eşleşmeyen modülde katalog açıklaması kullanılır.
 * Yalnız GERÇEK ekran davranışları anlatılır, özellik uydurulmaz.
 */
export const SATIN_AL_MODULE_DETAILS: Record<string, { detail: string }> = {
  homework: {
    detail:
      "Öğretmenler her öğrenciye özel ödev tanımlar, teslimler sistem üzerinden alınır ve hangi ödevin tamamlanıp hangisinin beklediği rapor ekranında anlık izlenir.",
  },
  curriculum: {
    detail:
      "Her öğrencinin müfredat planı ve konu ilerlemesi ders ders işlenir; bir öğrencinin hangi seviyede, hangi ünitede olduğu her zaman görünür kalır.",
  },
  teacherPerformanceV2: {
    detail:
      "Öğretmenlerin ders, yoklama ve değerlendirme verileri tek görünümde toplanır; program yükü ve devam performansı kurum bazında karşılaştırılabilir.",
  },
  teacherFeedback: {
    detail:
      "Öğrenci ve veliler, öğretmenler hakkında yapılandırılmış geri bildirim bırakır; sonuçlar yönetim panelinde toplanarak dönemsel memnuniyet takibi yapılır.",
  },
  studentFeedback: {
    detail:
      "Öğretmenler öğrencilerin gelişimini dönemsel olarak değerlendirir; hazırlanan gelişim raporları veli portalında görüntülenir.",
  },
  payments: {
    detail:
      "Taksit planları, vade tarihleri ve gecikme takibiyle tüm tahsilat kayıtları dersle ilişkilendirilir; makbuz çıktısı ve tam ödeme geçmişi dahildir.",
  },
  collections: {
    detail:
      "Vadesi geçen ödemeler tutar ve gecikme günü bilgisiyle öncelikli kuyrukta toplanır; hazır mesaj taslaklarıyla takip yazışmaları hızlanır.",
  },
  teacherPayouts: {
    detail:
      "Gerçekleşen ders kayıtlarından öğretmen hakedişleri tanımlı ücret kurallarına göre hesaplanır; ödeme durumu ve geçmişi ay ay takip edilir.",
  },
  tasks: {
    detail:
      "Kurum içi görevler sorumlusuna atanır ve hatırlatmalarla takip edilir; evrak tamamlama gibi rutin işler sistemde kaybolmaz.",
  },
  crm: {
    detail:
      "Aday kayıtlarıyla arama ve mesaj geçmişi tek kartta birleşir; ilk temastan deneme dersine ve kesin kayda kadar tüm süreç izlenir.",
  },
  documents: {
    detail:
      "Kayıt sözleşmesi, KVKK aydınlatma metni ve fotoğraf/video rıza formu kurumun kendi şablonlarından üretilir; imzalı belgeler yüklenip arşivlenir.",
  },
  announcements: {
    detail:
      "Kurum duyuruları tüm kullanıcılara veya seçili şube ve gruplara yayınlanır; veli ve öğrenciler duyuruları kendi portallarından okur.",
  },
  whatsapp: {
    detail:
      "Kurum hattı üzerinden veli ve öğrencilere WhatsApp ile bilgilendirme mesajları iletilir; iletişim geçmişi kayıtta kalır.",
  },
  sms: {
    detail:
      "Duyuru ve bilgilendirme amaçlı toplu SMS gönderimi yapılır; gönderimler kurum bazında kayıt altında tutulur.",
  },
  aiAssistant: {
    detail:
      "Doğal dille soru sorulabilen kurum asistanı, kayıtlı ders ve ödeme verilerinden bağlamsal yanıtlar ve günlük özetler üretir.",
  },
  mobileApp: {
    detail:
      "Tüm portallar mobil tarayıcıda tam çalışır; yönetim, öğretmen ve veli işlemleri telefondan da yapılır, ayrı kurulum gerekmez.",
  },
  parentPortal: {
    detail:
      "Veliler çocuklarının ders programını, devam durumunu, ödevlerini, ödeme bilgilerini, sözleşmelerini ve duyuruları tek portaldan takip eder.",
  },
  studentPortal: {
    detail:
      "Öğrenciler kendi ders programlarına, ödevlerine, ders materyallerine, müfredat ilerlemelerine ve değerlendirmelerine doğrudan erişir.",
  },
};

/** Satın alma süreci — /satin-al akışındaki gerçek adımları anlatır, var olmayan adım yazılmaz. */
export type PurchaseStep = { title: string; description: string };

export const SITE_PURCHASE_STEPS: PurchaseStep[] = [
  {
    title: "1. Paketi inceleyin",
    description:
      "Paketler ve Fiyatlar bölümünden kurumunuza uygun planı, aylık / yıllık seçeneği ve KDV hariç liste fiyatını görün.",
  },
  {
    title: "2. Satın al veya teklif isteyin",
    description:
      "Satın al ile paketin tüm modül ve limit detayını görürsünüz; kurumsal ihtiyaçlar için Teklif iste ile bize ulaşın.",
  },
  {
    title: "3. Sipariş özetini onaylayın",
    description:
      "Ödeme öncesi tutar, KDV dahil toplam, yenileme tarihi, kampanya sonrası fiyat ve iptal koşulu tek ekranda sunulur.",
  },
  {
    title: "4. Güvenli ödeme",
    description:
      "Ödeme adımı güvenli ödeme altyapısı üzerinden tamamlanır; kart bilgileriniz sunucularımıza ulaşmaz.",
  },
  {
    title: "5. Aboneliği yönetin",
    description:
      "Yenileme tarihi, ödeme geçmişi, kart güncelleme ve iptal işlemleri kurum panelinizde her zaman açıktır.",
  },
];

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
    question: "Kurulum ve geçiş süreci nasıl işliyor?",
    answer:
      "Kurulumda kurum yapınız (şube, salon, öğretmen kadrosu) birlikte tanımlanır ve geçiş planı kurumunuzun dönem takvimine göre yapılır. Detay için info@neviihub.com üzerinden bize ulaşın.",
  },
  {
    question: "Kaç şube ve kullanıcı destekleniyor?",
    answer:
      "Limitler seçtiğiniz pakete göre belirlenir; her paketin öğrenci, kullanıcı ve şube sınırı Paketler ve Fiyatlar bölümünde yazar. İhtiyacınız büyürse üst pakete geçiş yapabilirsiniz.",
  },
  {
    question: "Nasıl satın alabilirim?",
    answer:
      "Paketinizi seçip Satın al düğmesine bastığınızda paketin tüm modül ve limit detayını görürsünüz; ardından sipariş özeti ve güvenli ödeme adımına geçersiniz. Adım adım anlatım için Nasıl Satın Alınır bölümüne bakın.",
  },
  {
    question: "Fiyatlara KDV dahil mi?",
    answer:
      "Liste fiyatlarımız KDV hariçtir ve fiyatın yanında +KDV belirtilir. Ödeme öncesinde KDV dahil ödenecek toplam tutar sipariş özetinde net olarak gösterilir.",
  },
  {
    question: "Deneme süresi var mı?",
    answer:
      "Evet, 30 gün ücretsiz deneme sunuyoruz. Ücretsiz Dene bağlantısından başvurabilir, deneme süresince paketin kapsamındaki tüm özellikleri kullanabilirsiniz.",
  },
  {
    question: "İstediğim zaman iptal edebilir miyim?",
    answer:
      "Evet. İptal ettiğinizde ödenmiş sürenizin sonuna kadar erişiminiz sürer; dönem sonunda yenileme yapılmaz. İptal işlemini kurum panelinizden gerçekleştirebilirsiniz.",
  },
  {
    question: "Hangi ödeme yöntemleri geçerli?",
    answer:
      "Online kart ödemesi için güvenli ödeme altyapısı hazırlanıyor. Güncel ödeme seçenekleri ve pilot kurum koşulları için info@neviihub.com üzerinden bilgi alabilirsiniz.",
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
 * İletişim — e-posta kurumun RESMÎ adresidir (sahibi onayladı). Telefon/adres
 * girilene kadar `undefined` kalır; uydurma bilgi GÖSTERİLMEZ.
 * Sosyal medya: hesaplar açılmak üzere; URL uydurulmaz — `href` yoksa
 * bileşen "yakında" rozeti gösterir, kırık link üretmez.
 */
export const SITE_CONTACT: {
  phone?: string;
  email?: string;
  address?: string;
  mapEmbedUrl?: string;
  social: { label: string; href?: string }[];
} = {
  email: "info@neviihub.com",
  social: [
    { label: "YouTube" },
    { label: "Instagram" },
    { label: "LinkedIn" },
    { label: "X" },
    { label: "TikTok" },
  ],
};

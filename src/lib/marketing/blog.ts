/** Blog yazıları. Uydurma istatistik veya alıntı yok; pratik rehber niteliğinde özgün metinler. */
export type BlogPost = {
  slug: string;
  title: string;
  description: string;
  sector: string;
  date: string;
  sections: { heading: string; body: string }[];
  features: string[];
  sectorSlug: string;
};

const DATE = "2026-10-31";

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "muzik-okulu-nasil-yonetilir",
    title: "Müzik Okulu Nasıl Yönetilir? Program, Telafi ve Hakedişte Düzen Kurmak",
    description: "Bireysel derslerle çalışan müzik okullarında program, telafi ve öğretmen ödemelerini sadeleştirmenin pratik yolları.",
    sector: "Müzik",
    sectorSlug: "muzik-okulu-yazilimi",
    date: DATE,
    features: ["ders-programi", "telafi-merkezi", "ogretmen-hakedis"],
    sections: [
      { heading: "Bireysel ders, planlamanın en zor hâlidir", body: "Müzik okulunda her ders bir öğretmen, bir öğrenci ve bir oda demektir. Tek bir saat değişikliği üç takvimi birden etkiler. Bu yüzden planlamayı kişilerin hafızasına bırakmak yerine, öğretmen müsaitliğini ve oda doluluğunu birlikte gösteren tek bir program kullanmak ilk adımdır." },
      { heading: "Telafi kuralını yazılı ve görünür yapın", body: "Velilerle yaşanan tartışmaların büyük kısmı telafi hakkı konusunda çıkar. Dönem başında kaç hak olduğunu, kaç gün içinde kullanılacağını ve kimin süre uzatabileceğini netleştirin. Kural sistemde tanımlı olduğunda karar kişiye göre değişmez, herkes aynı tabloyu görür." },
      { heading: "Hakedişi yoklamadan üretin", body: "Ay sonunda ders saymak hem zaman alır hem hataya açıktır. Öğretmen ücretini dakika veya branş kuralına bağladığınızda işlenen dersler kendiliğinden kalemlere dönüşür. Öğretmen de aynı dökümü gördüğünde hesap tartışması büyük ölçüde biter." },
      { heading: "Nereden başlamalı?", body: "Hepsini aynı anda değiştirmeyin. Önce öğrenci ve öğretmen listenizi aktarın, ardından haftalık programı kurun, sonra yoklamaya geçin. Yoklama oturduğunda telafi ve hakediş kendiliğinden düzene girer." },
    ],
  },
  {
    slug: "dans-okulu-grup-dersi-yonetimi",
    title: "Dans Okullarında Grup Dersi ve Salon Yönetimi Rehberi",
    description: "Seviye grupları, salon planı ve dönemlik ücretleri olan dans okulları için sade bir yönetim düzeni.",
    sector: "Dans",
    sectorSlug: "dans-bale-okulu-yazilimi",
    date: DATE,
    features: ["grup-dersleri", "coklu-sube-oda-yonetimi", "odeme-takibi"],
    sections: [
      { heading: "Grubu önce seviye ve kontenjanla tanımlayın", body: "Dans okulunda asıl birim sınıf değil, seviye grubudur. Her grubun yaş aralığını, kontenjanını ve haftalık oturumlarını baştan tanımladığınızda yeni kayıt geldiğinde nereye yerleşeceği hemen görülür." },
      { heading: "Salonu takvime bağlayın", body: "Salon sayısı sınırlıysa program değişiklikleri zincirleme etki yaratır. Salonları oda olarak tanımlayıp her oturumu bir salona bağlamak, aynı saate iki grup yazılmasını daha kayıt anında engeller." },
      { heading: "Aylık ve dönemlik ücreti karıştırmayın", body: "Bazı gruplar aylık, gösteri hazırlıkları dönemlik ücretlendirilir. Her öğrencinin ödeme planını kendi sözleşmesinden üretmek, gecikme listesinin gerçek durumu göstermesini sağlar." },
      { heading: "Gösteri dönemini ayrı yönetin", body: "Gösteri ve yarışma grupları için başvuru açıp üyeleri ayrı izlemek, normal dersleri etkilemeden ek provaları planlamanızı kolaylaştırır." },
    ],
  },
  {
    slug: "pilates-studyosu-uye-takibi",
    title: "Pilates ve Yoga Stüdyolarında Üye ve Seans Takibi Nasıl Kolaylaşır?",
    description: "Seans planı, paket hakları ve üye iletişimini sadeleştirmek isteyen yoga ve pilates stüdyoları için öneriler.",
    sector: "Yoga ve Pilates",
    sectorSlug: "yoga-pilates-studyosu-yazilimi",
    date: DATE,
    features: ["ders-programi", "yoklama-takvimi", "mobil-uygulama"],
    sections: [
      { heading: "Takvim tek kaynak olmalı", body: "Eğitmenin telefonundaki not, resepsiyondaki defter ve üyeye atılan mesaj ayrı ayrı güncellendiğinde hata kaçınılmazdır. Seans takvimini tek yerde tutup herkesin oradan görmesini sağlamak en büyük kazanımdır." },
      { heading: "Paket hakkını elle saymayın", body: "Katılım işaretlendikçe üyenin durumu kendiliğinden güncellenirse kalan hak tartışması ortadan kalkar. Üyeye “kaç dersim kaldı?” sorusunun yanıtını anında verebilirsiniz." },
      { heading: "İletişimi hedefli yapın", body: "Bir seans iptal olduğunda bütün üyelere değil, yalnız o seansın üyelerine bilgi gitmelidir. Hedefli duyuru hem iş yükünü hem de gereksiz bildirim şikâyetini azaltır." },
      { heading: "Küçük stüdyo için de geçerli mi?", body: "Evet. Tek salon ve tek eğitmenle bile takvim, katılım ve tahsilatı birlikte tutmak, büyüdüğünüzde yeniden düzen kurma zahmetini ortadan kaldırır." },
    ],
  },
  {
    slug: "dil-kursu-kur-takibi",
    title: "Dil Kurslarında Kur ve Seviye Takibi: Veliye ve Öğrenciye Şeffaf Süreç",
    description: "Kur geçişleri, müfredat ilerlemesi ve seviye değerlendirmesini düzenlemek isteyen dil kursları için rehber.",
    sector: "Dil Kursu",
    sectorSlug: "dil-kursu-yazilimi",
    date: DATE,
    features: ["grup-dersleri", "mufredat-odev", "ogrenci-degerlendirme"],
    sections: [
      { heading: "Kuru grup, müfredatı yol haritası yapın", body: "Her kuru bir grup olarak açıp konularını müfredata dökmek, öğretmen değişse bile sınıfın nerede kaldığının görünmesini sağlar." },
      { heading: "Seviye kararını ölçütlere bağlayın", body: "Kur geçişini yalnız öğretmen izlenimine bırakmak yerine konuşma, yazma ve dinleme gibi ölçütlerle değerlendirin. Veliye veya kurumsal müşteriye anlatması da kolaylaşır." },
      { heading: "Devamsızlığı erken görün", body: "Dil öğreniminde süreklilik belirleyicidir. Devam raporunu haftalık izlemek, kursu bırakma riski olan öğrenciye zamanında ulaşmanızı sağlar." },
      { heading: "Ön kaydı kolaylaştırın", body: "Yeni dönem öncesi ön kayıtları form bağlantısıyla toplamak, seviye tespiti için aranacak kişileri tek listede görmenizi sağlar." },
    ],
  },
  {
    slug: "etut-merkezi-veli-iletisimi",
    title: "Etüt Merkezlerinde Yoklama ve Veli İletişimi Nasıl Güçlendirilir?",
    description: "Etüt merkezleri ve sınav hazırlık kurumları için devam, ödev ve veli bilgilendirme düzeni.",
    sector: "Etüt ve Dershane",
    sectorSlug: "etut-merkezi-dershane-yazilimi",
    date: DATE,
    features: ["yoklama-raporu", "veli-ogrenci-portali", "mufredat-odev"],
    sections: [
      { heading: "Veli en çok devamı merak eder", body: "Öğrencinin derse gelip gelmediği, velinin kuruma duyduğu güvenin temelidir. Yoklama girildiği anda veli portalında görünmesi telefon trafiğini azaltır." },
      { heading: "Ödevi takip edilebilir hale getirin", body: "Ödev kâğıtta kaldığında yapılıp yapılmadığı dönem sonunda anlaşılır. Portalda görünen ödev ve teslim durumu, sorunu erken yakalamanızı sağlar." },
      { heading: "Etüt planını yoğun döneme hazırlayın", body: "Sınav yaklaştıkça etüt talebi artar. Öğretmen müsaitliğini ve sınıf doluluğunu birlikte görmek, ek etütleri çakışmadan planlamayı kolaylaştırır." },
      { heading: "Raporla konuşun", body: "Veli görüşmesine dönemlik devam ve değerlendirme raporuyla girmek, konuşmayı izlenimden çıkarıp somut veriye taşır." },
    ],
  },
  {
    slug: "boks-spor-salonu-aidat-takibi",
    title: "Boks ve Dövüş Sporu Salonlarında Aidat ve Grup Takibi",
    description: "Boks, dövüş sporları ve spor akademileri için aidat, yaş grubu ve antrenör yönetimi önerileri.",
    sector: "Spor",
    sectorSlug: "spor-akademisi-yazilimi",
    date: DATE,
    features: ["kulupler", "odeme-takibi", "ogretmen-hakedis"],
    sections: [
      { heading: "Aidatı hatırlamak salon sahibinin işi olmamalı", body: "Kimin ödediğini defterden takip etmek zaman alır ve ilişkileri zorlaştırır. Geciken listesini sistemden görmek, hatırlatmayı kişisel bir mesele olmaktan çıkarır." },
      { heading: "Grupları yaş ve seviyeyle ayırın", body: "Miniklerle yetişkinlerin programı, kontenjanı ve ücreti farklıdır. Her grubu ayrı tanımlamak, yeni üyenin doğru yere yerleşmesini kolaylaştırır." },
      { heading: "Antrenör ödemesini kurala bağlayın", body: "Grup başına veya saat başına ödeme yapıyorsanız kuralı tanımlayıp yoklamayla ilişkilendirmek, ay sonu hesabını dakikalara indirir." },
      { heading: "Duyuruyu gruba özel yapın", body: "Antrenman saati değiştiğinde yalnız ilgili gruba duyuru göndermek, herkesin telefonunu gereksiz bildirimle doldurmaz." },
    ],
  },
  {
    slug: "yuzme-okulu-seans-planlama",
    title: "Yüzme Okullarında Kulvar, Seans ve Kontenjan Planlama",
    description: "Sınırlı kulvar ve yoğun sezonla çalışan yüzme okulları için seans ve üyelik düzeni.",
    sector: "Spor",
    sectorSlug: "spor-akademisi-yazilimi",
    date: DATE,
    features: ["ders-programi", "kulupler", "duyuru-iletisim"],
    sections: [
      { heading: "Kapasite asıl kısıttır", body: "Yüzme okulunda sınır genellikle eğitmen değil kulvardır. Kulvarları oda gibi tanımlayıp seansları buna göre kurmak, sezon başındaki aşırı kaydı önler." },
      { heading: "Bekleme listesini kaybetmeyin", body: "Yaz başında dolan gruplar için gelen talepleri not kâğıdında tutmak yerine bekleme listesine almak, yer açıldığında hızlı dönüş yapmanızı sağlar." },
      { heading: "Telafiyi havaya ve hastalığa hazırlayın", body: "Çocuk gruplarında kaçırılan ders sıktır. Telafi kuralını önceden belirleyip sistemde tutmak hem veliyi hem eğitmeni rahatlatır." },
      { heading: "Veli bilgilendirmesi güven verir", body: "Seviye değişimi ve gelişim notlarının düzenli paylaşılması, özellikle küçük yaş gruplarında veli memnuniyetini doğrudan etkiler." },
    ],
  },
  {
    slug: "sanat-atolyesi-donem-yonetimi",
    title: "Sanat Atölyelerinde Dönem, Başvuru ve Gider Yönetimi",
    description: "Resim, seramik ve tiyatro atölyeleri için başvuru, kontenjan ve malzeme giderini düzenleme rehberi.",
    sector: "Sanat",
    sectorSlug: "sanat-atolyesi-yazilimi",
    date: DATE,
    features: ["online-basvuru-formlari", "kulupler", "finans-ozeti"],
    sections: [
      { heading: "Başvuruyu mesajlardan kurtarın", body: "Sosyal medyadan gelen talepleri tek bir başvuru bağlantısına yönlendirmek, kimin hangi atölyeyi istediğini tek listede görmenizi sağlar." },
      { heading: "Dönemi baştan tanımlayın", body: "Başlangıç ve bitiş tarihi, oturum sayısı ve ücreti net olan bir dönem hem katılımcıya güven verir hem sizin planlamanızı kolaylaştırır." },
      { heading: "Malzeme giderini görünür yapın", body: "Atölyelerde kâr çoğu zaman malzeme ve kira arasında kaybolur. Giderleri kategori bazında girmek, hangi atölyenin gerçekten kazandırdığını gösterir." },
      { heading: "Görsel izinlerini kayıt altına alın", body: "Atölye çalışmalarını paylaşacaksanız fotoğraf ve video iznini kayıt anında almak ve arşivlemek, KVKK açısından sağlıklı bir yol izlemenizi sağlar." },
    ],
  },
  {
    slug: "kodlama-kursu-veli-raporu",
    title: "Kodlama ve Robotik Kurslarında Veliye Gelişimi Göstermek",
    description: "Kodlama, robotik ve zekâ oyunları kurslarında müfredat ilerlemesi ve veli raporlama önerileri.",
    sector: "Kodlama",
    sectorSlug: "kodlama-robotik-kursu-yazilimi",
    date: DATE,
    features: ["mufredat-odev", "ogretmen-gelisim-raporlari", "veli-ogrenci-portali"],
    sections: [
      { heading: "Soyut öğrenmeyi görünür kılın", body: "Veli kodlama dersinde ne öğrenildiğini kolayca göremez. Müfredatı modüllere ayırıp her öğrencinin ilerlemesini göstermek, kursun değerini somutlaştırır." },
      { heading: "Düzenli rapor, kayıt yenilemeyi kolaylaştırır", body: "Birkaç derste bir kısa gelişim raporu yazmak, dönem sonunda sürpriz yaşanmasını önler. Sistem hangi raporun geldiğini hatırlatırsa bu iş öğretmene yük olmaz." },
      { heading: "Yaş gruplarını karıştırmayın", body: "Aynı içerik farklı yaşlarda farklı hızda ilerler. Grupları yaş ve seviye ile ayırmak hem öğrenmeyi hem sınıf yönetimini iyileştirir." },
      { heading: "Proje ve materyalleri paylaşın", body: "Öğrencinin yaptığı çalışmaları ve ders materyallerini portalda görmek, velinin sürece katılımını artırır." },
    ],
  },
  {
    slug: "egitim-kurumlari-kvkk-rehberi",
    title: "Eğitim Kurumları İçin KVKK'ya Hazırlık: Pratik Kontrol Listesi",
    description: "Öğrenci ve veli verisi işleyen özel eğitim kurumlarının gözden geçirmesi gereken temel KVKK başlıkları.",
    sector: "Tüm kurumlar",
    sectorSlug: "muzik-okulu-yazilimi",
    date: DATE,
    features: ["evraklar-merkezi", "guvenlik-denetim"],
    sections: [
      { heading: "Hangi veriyi neden topluyorsunuz?", body: "İlk adım envanter çıkarmaktır. Kayıt formunda istediğiniz her bilginin bir amacı olmalıdır; gerekmeyen veriyi hiç toplamamak en güvenli yöntemdir. Bu yazı genel bilgilendirme amaçlıdır, hukuki danışmanlık yerine geçmez." },
      { heading: "Aydınlatma ve açık rızayı ayırın", body: "Aydınlatma metni veriyi neden işlediğinizi anlatır; fotoğraf ve video paylaşımı gibi konularda ise ayrıca açık rıza gerekebilir. Bu iki belgeyi tek metinde birleştirmemek ve kaydını saklamak önemlidir." },
      { heading: "Erişimi rol bazında sınırlayın", body: "Öğretmenin bütün velilerin ödeme bilgisini görmesi gerekmez. Herkesin yalnız işi kadar veriye erişmesi hem riski azaltır hem denetimde rahat ettirir." },
      { heading: "İz bırakın", body: "Kim, hangi kaydı ne zaman değiştirdi sorusunun yanıtını verebilmek, olası bir sorunda en güçlü dayanağınızdır. Denetim kaydı bu nedenle yönetim yazılımında olmazsa olmazdır." },
    ],
  },
];

export function getPost(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((p) => p.slug === slug);
}

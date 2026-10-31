/** Sektör sayfaları. Uydurma müşteri veya istatistik yazılmaz; bağlantılar gerçek özellik sayfalarına gider. */
export type Sector = {
  slug: string;
  name: string;
  short: string;
  headline: string;
  summary: string;
  pains: string[];
  answers: { feature: string; text: string }[];
  keywords: string[];
};

export const SECTORS: Sector[] = [
  {
    slug: "muzik-okulu-yazilimi",
    name: "Müzik Okulları",
    short: "Müzik okulu ve konservatuvar hazırlık",
    headline: "Müzik okulunuzun bütün günü tek ekranda",
    summary: "Bireysel enstrüman dersleri, oda planlama, telafi ve öğretmen hakedişi için müzik okulu yönetim yazılımı.",
    pains: ["Bireysel derslerde oda ve öğretmen çakışması", "Kaçırılan derslerin telafi takibi", "Derse göre değişen öğretmen ücretleri"],
    answers: [
      { feature: "ders-programi", text: "Öğretmen ve oda çakışmadan haftalık bireysel ders programı." },
      { feature: "telafi-merkezi", text: "Telafi hakkı ve son kullanım tarihi kurallarınızla işler." },
      { feature: "ogretmen-hakedis", text: "Dakika ve branşa göre otomatik hakediş." },
      { feature: "ogretmen-gelisim-raporlari", text: "Velinin görmek istediği düzenli gelişim raporları." },
    ],
    keywords: ["müzik okulu yazılımı", "müzik kursu programı", "konservatuvar hazırlık yönetimi"],
  },
  {
    slug: "dans-bale-okulu-yazilimi",
    name: "Dans ve Bale Okulları",
    short: "Dans stüdyosu ve bale akademisi",
    headline: "Dans okulunuzda grup, salon ve ödeme tek düzende",
    summary: "Grup dersleri, salon doluluğu, dönemlik ücret ve yoklama için dans ve bale okulu yönetim yazılımı.",
    pains: ["Seviye gruplarının kontenjan takibi", "Salon doluluğu ve program değişiklikleri", "Dönemlik ve aylık ücretlerin karışması"],
    answers: [
      { feature: "grup-dersleri", text: "Seviye gruplarını kontenjan ve oturumlarıyla yönetin." },
      { feature: "coklu-sube-oda-yonetimi", text: "Salonları oda olarak tanımlayın, çakışmayı önleyin." },
      { feature: "kulupler", text: "Gösteri grupları için başvuru ve üyelik." },
      { feature: "odeme-takibi", text: "Aylık ve dönemlik tahsilat tek listede." },
    ],
    keywords: ["dans okulu yazılımı", "bale okulu programı", "dans stüdyosu yönetimi"],
  },
  {
    slug: "yoga-pilates-studyosu-yazilimi",
    name: "Yoga ve Pilates Stüdyoları",
    short: "Yoga, pilates ve reformer stüdyosu",
    headline: "Stüdyonuzun seanslarını zahmetsiz yönetin",
    summary: "Seans planı, üye takibi, paket ve tahsilat için yoga ve pilates stüdyosu yönetim yazılımı.",
    pains: ["Seans ve eğitmen planının sık değişmesi", "Paket haklarının elle sayılması", "Üyelere hatırlatma yükü"],
    answers: [
      { feature: "ders-programi", text: "Eğitmen ve salon bazında seans takvimi." },
      { feature: "sozlesme-yonetimi", text: "Paketten otomatik ödeme planı." },
      { feature: "yoklama-takvimi", text: "Katılımı tek dokunuşla işaretleyin." },
      { feature: "mobil-uygulama", text: "Üyeler programı cebinden görsün." },
    ],
    keywords: ["pilates stüdyosu yazılımı", "yoga stüdyosu programı", "reformer stüdyo yönetimi"],
  },
  {
    slug: "dil-kursu-yazilimi",
    name: "Dil Kursları",
    short: "Yabancı dil okulu ve kursu",
    headline: "Dil kursunuzda kur, sınıf ve ilerleme tek yerde",
    summary: "Kur ve sınıf yönetimi, müfredat ilerlemesi, seviye raporu ve tahsilat için dil kursu yazılımı.",
    pains: ["Kur geçişleri ve seviye takibi", "Sınıf bazlı yoklama ve devamsızlık", "Kurumsal ve bireysel kayıtların yönetimi"],
    answers: [
      { feature: "grup-dersleri", text: "Kurları grup olarak açın, oturumları planlayın." },
      { feature: "mufredat-odev", text: "Müfredat ilerlemesini öğrenci bazında izleyin." },
      { feature: "ogrenci-degerlendirme", text: "Ölçütlü değerlendirmeyle seviye takibi." },
      { feature: "online-basvuru-formlari", text: "Ön kayıtları güvenli formla toplayın." },
    ],
    keywords: ["dil kursu yazılımı", "yabancı dil okulu programı", "kur takip sistemi"],
  },
  {
    slug: "etut-merkezi-dershane-yazilimi",
    name: "Etüt Merkezi ve Dershaneler",
    short: "Etüt merkezi, özel öğretim ve sınav hazırlık",
    headline: "Sınav hazırlıkta yoklama, ödev ve veli iletişimi kontrol altında",
    summary: "Sınıf ve etüt planı, devam takibi, ödev ve veli bilgilendirme için etüt merkezi ve dershane yazılımı.",
    pains: ["Devamsızlığın veliye geç ulaşması", "Ödev ve konu takibinin dağınıklığı", "Yoğun dönemlerde etüt planlaması"],
    answers: [
      { feature: "yoklama-raporu", text: "Devam durumunu öğrenci ve dönem bazında görün." },
      { feature: "mufredat-odev", text: "Konu ve ödev takibi tek ekranda." },
      { feature: "veli-ogrenci-portali", text: "Veli ödev ve yoklamayı kendi görsün." },
      { feature: "meb-paneli", text: "MEB süreçlerini ayrı panelde takip edin." },
    ],
    keywords: ["etüt merkezi yazılımı", "dershane yönetim programı", "özel öğretim kursu yazılımı"],
  },
  {
    slug: "spor-akademisi-yazilimi",
    name: "Spor Akademileri",
    short: "Boks, dövüş sporları, yüzme, jimnastik",
    headline: "Antrenman gruplarınızı ve üyelerinizi tek panelden yönetin",
    summary: "Antrenman grupları, üyelik, aidat ve yoklama için boks, dövüş sporları, yüzme ve spor akademisi yazılımı.",
    pains: ["Aidat takibi ve geciken ödemeler", "Yaş ve seviye gruplarının yönetimi", "Antrenör programı ve ödemeleri"],
    answers: [
      { feature: "kulupler", text: "Yaş sınırı, kontenjan ve aidat seçenekleriyle takımlar." },
      { feature: "odeme-takibi", text: "Aidatları takip edin, geciken listesini görün." },
      { feature: "ogretmen-hakedis", text: "Antrenör ücretlerini kurallarla hesaplayın." },
      { feature: "duyuru-iletisim", text: "Antrenman değişikliklerini gruba duyurun." },
    ],
    keywords: ["spor akademisi yazılımı", "boks salonu programı", "yüzme okulu yönetimi", "spor kulübü aidat takibi"],
  },
  {
    slug: "sanat-atolyesi-yazilimi",
    name: "Sanat Atölyeleri",
    short: "Resim, seramik, tiyatro ve yaratıcı atölyeler",
    headline: "Atölyeniz yaratıcılığa, sistem düzene baksın",
    summary: "Atölye dönemleri, başvuru, kontenjan ve ödeme takibi için sanat atölyesi yönetim yazılımı.",
    pains: ["Dönemlik atölyelerin kontenjan yönetimi", "Başvuruların mesajlarda kaybolması", "Malzeme ve kira giderlerinin izlenmemesi"],
    answers: [
      { feature: "kulupler", text: "Dönemlik atölyeleri başvuruya açın, bekleme listesi tutun." },
      { feature: "online-basvuru-formlari", text: "Başvuruları tek listede toplayın." },
      { feature: "finans-ozeti", text: "Malzeme ve kira giderini gelirle birlikte görün." },
      { feature: "evraklar-merkezi", text: "Fotoğraf ve video izinlerini arşivleyin." },
    ],
    keywords: ["sanat atölyesi yazılımı", "resim kursu programı", "atölye yönetim sistemi"],
  },
  {
    slug: "kodlama-robotik-kursu-yazilimi",
    name: "Kodlama ve Robotik Kursları",
    short: "Kodlama, robotik, satranç ve zekâ oyunları",
    headline: "Yeni nesil kurslar için yeni nesil yönetim",
    summary: "Grup programı, müfredat, gelişim raporu ve veli iletişimi için kodlama, robotik ve zekâ oyunları kursu yazılımı.",
    pains: ["Modül modül ilerleyen müfredat takibi", "Velinin gelişimi görmek istemesi", "Hafta sonu yoğunluğunda sınıf planı"],
    answers: [
      { feature: "mufredat-odev", text: "Modülleri müfredata dökün, ilerlemeyi izleyin." },
      { feature: "ogretmen-gelisim-raporlari", text: "Düzenli gelişim raporu otomatik gündeme gelir." },
      { feature: "grup-dersleri", text: "Yaş gruplarını kontenjanıyla yönetin." },
      { feature: "veli-ogrenci-portali", text: "Veli süreci portaldan izlesin." },
    ],
    keywords: ["kodlama kursu yazılımı", "robotik kurs programı", "satranç okulu yönetimi"],
  },
  {
    slug: "ozel-ders-kocluk-yazilimi",
    name: "Özel Ders ve Koçluk Merkezleri",
    short: "Özel ders, koçluk, kişisel gelişim",
    headline: "Bire bir çalışan merkezler için net takip, net hesap",
    summary: "Bire bir randevu programı, öğretmen ücreti, paket ve tahsilat için özel ders ve koçluk merkezi yazılımı.",
    pains: ["Öğretmen başına değişen ücret hesabı", "Paket derslerin kalan hakkı", "İptal ve erteleme karmaşası"],
    answers: [
      { feature: "ogretmen-hakedis", text: "Her öğretmenin kuralı kendine özel." },
      { feature: "telafi-merkezi", text: "Ertelenen dersler kaybolmaz." },
      { feature: "sozlesme-yonetimi", text: "Paket ve taksit tek sözleşmede." },
      { feature: "yapay-zeka-asistani", text: "Durumu doğal dille sorun, özet alın." },
    ],
    keywords: ["özel ders takip programı", "koçluk merkezi yazılımı", "özel ders merkezi yönetimi"],
  },
];

export function getSector(slug: string): Sector | undefined {
  return SECTORS.find((s) => s.slug === slug);
}

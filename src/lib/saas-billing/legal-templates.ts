/**
 * Satın alma hukuki belgelerinin HAZIR TASLAK metinleri (2026-10-30).
 *
 * - Satıcı kimliği metne gömülmez: {{SATICI_*}} yer tutucuları gösterim
 *   anında NeviiOS → Fatura → Satıcı profili (veya SAAS_SELLER_* env)
 *   değerleriyle doldurulur. Unvan değişirse metin kendiliğinden güncellenir.
 * - Taslaklar NeviiOS → Hukuki belgeler'den "Hazır taslağı yükle" ile
 *   revizyona alınır; hukuki inceleme + ticari onay + yayın kapısı aynen
 *   geçerlidir (taslak kendiliğinden "onaylı" olmaz, gerçek satış kilidi sürer).
 * - Metinler kodun gerçek davranışına göre yazıldı (otomatik yenileme,
 *   dönem sonu iptal, 30 gün deneme, kart verisinin ödeme kuruluşunda
 *   kalması, alt yükleniciler). Davranış değişirse metni de güncelleyin.
 */
import type { SellerSnapshot } from "./invoicing-orders";

export type LegalSellerFields = SellerSnapshot & {
  mersisNo?: string | null;
  kepAddress?: string | null;
  phone?: string | null;
};

const MISSING = "[doldurulacak — NeviiOS › Fatura › Satıcı profili]";

/** {{ANAHTAR}} yer tutucularını satıcı bilgisiyle doldurur; boş alan açıkça işaretlenir. */
export function renderLegalText(body: string, seller: LegalSellerFields): string {
  const address = [seller.addressLine, seller.city, seller.country].filter(Boolean).join(", ");
  const values: Record<string, string | null | undefined> = {
    MARKA: "NeviiHub",
    SATICI_UNVAN: seller.verified || !seller.legalTitle.startsWith("[") ? seller.legalTitle : null,
    SATICI_VERGI_NO: seller.taxId,
    SATICI_VERGI_DAIRESI: seller.taxOffice,
    SATICI_ADRES: address || null,
    SATICI_SEHIR: seller.city,
    SATICI_EPOSTA: seller.invoiceEmail,
    SATICI_MERSIS: seller.mersisNo,
    SATICI_KEP: seller.kepAddress,
    SATICI_TELEFON: seller.phone,
  };
  return body.replace(/\{\{([A-Z_]+)\}\}/g, (all, key: string) => {
    if (!(key in values)) return all;
    const v = values[key];
    return v && String(v).trim() ? String(v).trim() : key === "SATICI_SEHIR" ? "İstanbul" : MISSING;
  });
}

const SELLER_BLOCK = `{{SATICI_UNVAN}}
Vergi dairesi / no: {{SATICI_VERGI_DAIRESI}} / {{SATICI_VERGI_NO}}
MERSİS no (şirketler için): {{SATICI_MERSIS}}
Adres: {{SATICI_ADRES}}
E-posta: {{SATICI_EPOSTA}} · KEP: {{SATICI_KEP}} · Telefon: {{SATICI_TELEFON}}`;

const SERVICE_TERMS = `{{MARKA}} ABONELİK VE HİZMET SÖZLEŞMESİ (KURUMSAL / B2B)

MADDE 1 — TARAFLAR
1.1. Hizmet Sağlayıcı ("Sağlayıcı"):
${SELLER_BLOCK}

1.2. Müşteri ("Kurum"): Satın alma adımında unvanı, vergi bilgileri ve adresi beyan edilen; {{MARKA}} hizmetini mesleki veya ticari faaliyeti kapsamında kullanan gerçek ya da tüzel kişi. Kurum adına onay veren kişi, Kurum'u temsil ve ilzama yetkili olduğunu beyan eder.

MADDE 2 — TANIMLAR
Hizmet: {{MARKA}} web paneli, mobil uygulamalar, API ve bunlara bağlı yapay zekâ destekli özelliklerden oluşan, internet üzerinden abonelik modeliyle sunulan kurum yönetim yazılımı.
Paket: Satın alma ekranında adı, kapsamı, kullanıcı/öğrenci sınırları ve fiyatı gösterilen abonelik planı.
Kurum Verisi: Kurum'un ve Kurum'un yetkilendirdiği kullanıcıların Hizmet'e girdiği öğrenci, veli, öğretmen, ders, yoklama, ödeme ve benzeri tüm veriler.
Yetkili Kullanıcı: Kurum'un Hizmet'te hesap açtığı yönetici, personel, öğretmen, veli ve öğrenciler.
Dönem: Seçilen faturalama aralığına göre bir ay veya bir yıl.
Ekler: Yenileme, İptal ve İade Koşulları; Veri İşleme Sözleşmesi; Hizmet Seviyesi ve Destek Esasları; Ön Bilgilendirme Formu. Ekler bu Sözleşme'nin ayrılmaz parçasıdır.

MADDE 3 — KONU VE KAPSAM
3.1. Bu Sözleşme, Sağlayıcı'nın seçilen Paket kapsamındaki Hizmet'e Kurum'a süreli, devredilemez, münhasır olmayan ve alt lisans verilemez bir kullanım hakkı tanımasının koşullarını düzenler.
3.2. Hizmet'in kaynak kodu, tasarımı, veritabanı yapısı, markası ve tüm fikrî mülkiyet hakları Sağlayıcı'ya aittir. Kurum'a yalnızca bu Sözleşme'de açıkça tanınan kullanım hakkı verilir.
3.3. Hizmet "yazılım hizmeti" (SaaS) olarak sunulur; Kurum'a fiziksel ürün teslim edilmez. Hizmet, ödemenin ödeme kuruluşunca onaylanmasının ardından hesap kurulum bağlantısının Kurum'un beyan ettiği e-posta adresine gönderilmesiyle ifa edilmeye başlanır.

MADDE 4 — HESAP, KULLANICILAR VE GÜVENLİK
4.1. Kurum, satın alma sırasında verdiği bilgilerin doğru ve güncel olduğunu, değiştiğinde Hizmet içinden güncelleyeceğini kabul eder.
4.2. Yetkili Kullanıcı hesaplarının oluşturulması, yetkilendirilmesi ve kapatılması Kurum'un sorumluluğundadır. Kullanıcı adı ve şifrelerin gizliliğinden, hesaplar üzerinden yapılan işlemlerden Kurum sorumludur.
4.3. Kurum, yetkisiz erişim veya güvenlik ihlali şüphesini öğrendiği anda {{SATICI_EPOSTA}} adresine bildirir. Sağlayıcı, güvenliği tehdit eden hesap veya oturumları geçici olarak askıya alabilir ve Kurum'u gecikmeksizin bilgilendirir.
4.4. Paket sınırlarının (ör. öğrenci, şube, kullanıcı sayısı) aşılması hâlinde Hizmet yeni kayıt eklemeyi durdurabilir; mevcut veriler silinmez. Kurum üst pakete geçerek veya kayıt sayısını azaltarak devam edebilir.

MADDE 5 — ÜCRETLER VE ÖDEME
5.1. Paket ücreti, satın alma ekranında KDV hariç tutar, KDV oranı ve KDV dahil toplam olarak gösterilir; ödeme anındaki tutar sipariş kaydında dondurulur.
5.2. Ödeme, lisanslı ödeme kuruluşu aracılığıyla kredi/banka kartıyla alınır. Kart numarası, son kullanma tarihi ve güvenlik kodu ödeme kuruluşunun altyapısında işlenir; Sağlayıcı'nın sunucularına ulaşmaz ve Sağlayıcı tarafından saklanmaz.
5.3. Abonelik, Kurum iptal etmedikçe her Dönem sonunda aynı Paket ve o tarihte yürürlükteki fiyatla otomatik olarak yenilenir; Kurum, satın alma adımında ayrı bir onayla bu yenileme tahsilatlarına izin verir. Ayrıntılar Ek: Yenileme, İptal ve İade Koşulları'ndadır.
5.4. Fiyat değişiklikleri, yürürlükten en az 30 gün önce Kurum'un kayıtlı e-posta adresine bildirilir ve yalnızca bildirimden sonra başlayan Dönem'e uygulanır. Kurum, değişikliği kabul etmiyorsa yeni Dönem başlamadan aboneliğini iptal edebilir.
5.5. Yenileme tahsilatı başarısız olursa Sağlayıcı Kurum'u bilgilendirir ve tahsilatı yeniden dener. Ödenmiş süre bittiğinde ve tahsilat yapılamadığında Hizmet salt-okunur kısıtlı moda alınabilir; Kurum Verisi bu nedenle silinmez.
5.6. Faturalar, Kurum'un beyan ettiği fatura bilgileriyle elektronik ortamda (e-Fatura/e-Arşiv) düzenlenir ve fatura e-posta adresine iletilir. Fatura bilgilerinin hatalı beyanından doğan sonuçlar Kurum'a aittir.

MADDE 6 — KURUM'UN YÜKÜMLÜLÜKLERİ VE KABUL EDİLEBİLİR KULLANIM
6.1. Kurum, Hizmet'i yürürlükteki mevzuata, özellikle 6698 sayılı Kişisel Verilerin Korunması Kanunu'na ("KVKK") uygun kullanır. Kurum Verisi bakımından veri sorumlusu Kurum'dur; ilgili kişilere (öğrenci, veli, öğretmen) aydınlatma yapılması ve gerekli hâllerde açık rıza alınması Kurum'un yükümlülüğüdür. Çocuklara ait veriler veli/vasi bilgisiyle işlenir.
6.2. Kurum; Hizmet'i tersine mühendislik, yetkisiz erişim denemesi, güvenlik testi (yazılı izin olmadan), aşırı yük oluşturma, otomatik veri kazıma, hukuka aykırı içerik barındırma veya üçüncü kişilerin haklarını ihlal etmek amacıyla kullanamaz; erişim hakkını üçüncü kişilere satamaz, kiralayamaz.
6.3. Hizmet üzerinden velilere, öğrencilere veya üçüncü kişilere gönderilen e-posta, SMS, WhatsApp ve bildirim içeriklerinden ve bunlar için gerekli izinlerin (6563 sayılı Kanun kapsamındaki ticari elektronik ileti onayları dahil) alınmasından Kurum sorumludur. Yapay zekâ ile hazırlanan mesaj taslakları Kurum yetkilisi onaylamadan gönderilmez.

MADDE 7 — SAĞLAYICI'NIN YÜKÜMLÜLÜKLERİ
7.1. Sağlayıcı, Hizmet'i makul özen ve sektörde kabul görmüş teknik ve idari güvenlik önlemleriyle (iletimde şifreleme, şifrelerin geri döndürülemez özetlenmesi, rol bazlı yetkilendirme, kurumlar arası veri yalıtımı, işlem kayıtları, düzenli yedekleme) sunar.
7.2. Sağlayıcı, Kurum Verisi'ni yalnızca Hizmet'in sunulması, desteklenmesi, güvenliğinin sağlanması ve yasal yükümlülükler amacıyla, Ek: Veri İşleme Sözleşmesi'ndeki talimat ve sınırlar içinde işler; satmaz, reklam amacıyla kullanmaz.
7.3. Destek ve erişilebilirlik hedefleri Ek: Hizmet Seviyesi ve Destek Esasları'nda düzenlenir.
7.4. Sağlayıcı, Hizmet'i geliştirmek için özellik ekleyebilir, değiştirebilir veya kaldırabilir. Paketin temel işlevini esaslı biçimde daraltan bir değişiklik en az 30 gün önce bildirilir; Kurum bu durumda aboneliğini iptal ederek kullanılmayan tam Dönem(ler) için orantılı iade talep edebilir.

MADDE 8 — GİZLİLİK
Taraflar, Sözleşme kapsamında öğrendikleri ve gizli niteliği açık olan ticari, teknik ve kişisel bilgileri Sözleşme süresince ve sona ermesinden sonra 3 (üç) yıl boyunca gizli tutar; yalnızca Sözleşme'nin ifası için ve bilmesi gereken çalışanları/yardımcılarıyla paylaşır. Kişisel veriler bakımından gizlilik yükümlülüğü süresizdir. Yasal zorunlulukla yetkili makamlara yapılan açıklamalar bu yükümlülüğün ihlali sayılmaz.

MADDE 9 — SORUMLULUĞUN SINIRLANDIRILMASI
9.1. Hizmet "olduğu gibi" ve "mevcut olduğu ölçüde" sunulur. Sağlayıcı, Hizmet'in kesintisiz veya hatasız olacağını taahhüt etmez; makul sürede giderilen kesinti ve hatalar Sözleşme ihlali sayılmaz.
9.2. Sağlayıcı'nın bu Sözleşme'den doğan toplam sorumluluğu, zararın doğduğu tarihten önceki 12 ay içinde Kurum'un Sağlayıcı'ya fiilen ödediği abonelik bedeli ile sınırlıdır. Taraflar, dolaylı zarar, kâr kaybı, itibar kaybı ve veri girişindeki Kurum kaynaklı hatalardan doğan zararlardan sorumlu değildir.
9.3. Bu madde, kast veya ağır ihmal hâllerinde ve kanunen sınırlandırılamayan sorumluluklarda uygulanmaz (6098 sayılı TBK m.115).
9.4. Kurum'un, Hizmet'e girdiği verilerin doğruluğu, kendi öğrencileri/velileriyle ilişkileri ve Hizmet üzerinden aldığı kararlar (ör. tahsilat, ders planlaması) kendi sorumluluğundadır. Yapay zekâ özelliklerinin çıktıları öneri niteliğindedir; Kurum yetkilisinin kontrolü olmadan bağlayıcı karar olarak kullanılmamalıdır.

MADDE 10 — SÜRE VE SONA ERME
10.1. Sözleşme, ödemenin onaylandığı anda yürürlüğe girer ve iptal edilmedikçe Dönem'ler hâlinde yenilenerek devam eder.
10.2. Kurum, Hizmet içindeki "Aboneliği iptal et" adımıyla dilediği zaman iptal edebilir; iptal, ödenmiş Dönem'in sonunda hüküm doğurur ve erişim o tarihe kadar sürer.
10.3. Taraflardan biri esaslı bir yükümlülüğü ihlal eder ve yazılı (e-posta dahil) bildirimden itibaren 15 gün içinde ihlali gidermezse, diğer taraf Sözleşme'yi derhâl feshedebilir. Hukuka aykırı kullanım veya güvenliği ağır tehdit eden durumlarda Sağlayıcı erişimi bildirimle derhâl askıya alabilir.
10.4. Sona ermeden sonra Kurum, 30 gün boyunca Kurum Verisi'ni Hizmet'in dışa aktarma araçlarıyla veya {{SATICI_EPOSTA}} üzerinden talep ederek alabilir. Bu sürenin bitiminden itibaren en geç 90 gün içinde Kurum Verisi, yasal saklama yükümlülüğü bulunan kayıtlar (ör. fatura ve muhasebe kayıtları) hariç silinir veya anonim hâle getirilir; yedeklerdeki kopyalar olağan yedek döngüsü içinde silinir.

MADDE 11 — MÜCBİR SEBEP
Doğal afet, salgın, savaş, terör, siber saldırı, genel elektrik/internet kesintisi, barındırma veya ödeme altyapısı sağlayıcılarının kontrol dışı kesintileri ve resmî makam kararları gibi tarafların kontrolü dışındaki olaylar süresince etkilenen yükümlülükler askıda kalır. Mücbir sebep 60 günü aşarsa taraflardan her biri Sözleşme'yi bildirimle feshedebilir; bu hâlde kullanılmayan tam Dönem(ler) için orantılı iade yapılır.

MADDE 12 — BİLDİRİMLER VE ELEKTRONİK ONAY
12.1. Taraflar arasındaki bildirimler; Kurum'un hesapta kayıtlı e-posta adresine, Sağlayıcı'nın {{SATICI_EPOSTA}} adresine e-postayla veya KEP üzerinden yapılır. Adres değişikliği bildirilmedikçe kayıtlı adrese yapılan bildirim geçerlidir.
12.2. Kurum, bu Sözleşme'yi ve Ekleri'ni satın alma ekranında elektronik ortamda onayladığını; onay anında belge sürümünün, tarihin, IP adresinin ve sipariş bilgilerinin Sağlayıcı tarafından kayıt altına alındığını kabul eder.

MADDE 13 — DELİL SÖZLEŞMESİ
Bu Sözleşme'den doğacak uyuşmazlıklarda Sağlayıcı'nın sistem kayıtları, elektronik onay ve denetim kayıtları, e-posta yazışmaları ve ödeme kuruluşu kayıtları 6100 sayılı HMK m.193 uyarınca kesin delil niteliğindedir; karşı delil sunma hakkı saklıdır.

MADDE 14 — DEVİR, DEĞİŞİKLİK VE BÜTÜNLÜK
14.1. Kurum, Sözleşme'den doğan hak ve yükümlülüklerini Sağlayıcı'nın yazılı onayı olmadan devredemez. Sağlayıcı, işletmenin devri, birleşme veya unvan değişikliği hâlinde Sözleşme'yi halefine devredebilir ve Kurum'u bilgilendirir.
14.2. Sağlayıcı bu Sözleşme'yi güncelleyebilir; güncel sürüm yeni Dönem öncesinde e-postayla ve Hizmet içinde bildirilir ve yenileme öncesinde yeniden onaya sunulur. Onaylanmayan sürüm, Kurum'un mevcut Dönem'ine uygulanmaz.
14.3. Sözleşme'nin bir hükmünün geçersizliği diğer hükümleri etkilemez.

MADDE 15 — UYGULANACAK HUKUK VE YETKİ
Bu Sözleşme Türkiye Cumhuriyeti hukukuna tabidir. Uyuşmazlıklarda {{SATICI_SEHIR}} Mahkemeleri ve İcra Daireleri yetkilidir.

MADDE 16 — YÜRÜRLÜK
Bu Sözleşme 16 maddeden ve Ekler'den oluşur; Kurum'un satın alma ekranında onay kutusunu işaretleyip ödemeyi tamamlamasıyla kurulur.`;

const RENEWAL_CANCEL_REFUND = `YENİLEME, İPTAL VE İADE KOŞULLARI
(Ek — {{MARKA}} Abonelik ve Hizmet Sözleşmesi'nin ayrılmaz parçasıdır)

Hizmet Sağlayıcı: {{SATICI_UNVAN}} — {{SATICI_EPOSTA}}

1. OTOMATİK YENİLEME
1.1. Abonelik, seçtiğiniz Dönem (aylık veya yıllık) sonunda aynı Paket ile otomatik olarak yenilenir. Yenileme bedeli, ilk ödemede kullandığınız ve ödeme kuruluşunca güvenli biçimde saklanan kartınızdan, satın alma adımında verdiğiniz ayrı tahsilat yetkisine dayanarak çekilir.
1.2. Yıllık aboneliklerde yenileme tarihinden en az 7 gün önce hatırlatma e-postası gönderilir.
1.3. Fiyat değişikliği en az 30 gün önce bildirilir ve yalnızca bildirimden sonra başlayan Dönem'e uygulanır.

2. BAŞARISIZ TAHSİLAT
2.1. Yenileme tahsilatı başarısız olursa e-postayla bilgilendirilirsiniz ve tahsilat yeniden denenir; Hizmet içindeki "Kartı güncelle" adımıyla ödeme yönteminizi değiştirebilirsiniz.
2.2. Ödenmiş süre bittiği hâlde tahsilat yapılamazsa hesabınız salt-okunur kısıtlı moda alınabilir. Bu durumda verileriniz silinmez; ödeme tamamlandığında tam erişim kendiliğinden geri gelir.

3. İPTAL
3.1. Aboneliğinizi dilediğiniz zaman Hizmet içinde Abonelik › "Aboneliği iptal et" adımıyla, gerekçe göstermeden iptal edebilirsiniz.
3.2. İptal, ödenmiş Dönem'in sonunda hüküm doğurur. O tarihe kadar Hizmet'i kullanmaya devam edersiniz ve sonraki Dönem için tahsilat yapılmaz.
3.3. Dönem sonu gelmeden iptalden vazgeçebilirsiniz (Abonelik › "Aboneliği yeniden etkinleştir").
3.4. Sona ermeden sonra verilerinizi 30 gün boyunca dışa aktarabilirsiniz; ardından en geç 90 gün içinde, yasal saklama yükümlülüğü olan kayıtlar hariç silinir veya anonim hâle getirilir.

4. İADE
4.1. Hizmet kurumsal (B2B) olarak sunulduğundan ve dijital hizmetin ifasına ödeme onayıyla birlikte başlandığından, başlamış Dönem için kısmi süre iadesi yapılmaz.
4.2. Aşağıdaki hâllerde iade yapılır:
 a) Aynı Dönem için mükerrer veya hatalı tutarda tahsilat yapılması — fazla tutarın tamamı;
 b) Ödemenin onaylanmasına rağmen Sağlayıcı kaynaklı bir nedenle hesabın 7 gün içinde kullanıma açılamaması — ödenen tutarın tamamı;
 c) Sağlayıcı'nın Paket'in temel işlevini esaslı biçimde daraltması veya 60 günü aşan mücbir sebep nedeniyle Kurum'un Sözleşme'yi feshetmesi — kullanılmayan tam Dönem(ler) için orantılı tutar;
 d) Sağlayıcı'nın esaslı ihlali nedeniyle Kurum'un haklı feshi — kullanılmayan tam Dönem(ler) için orantılı tutar.
4.3. İade talebi {{SATICI_EPOSTA}} adresine sipariş/fatura numarasıyla iletilir. Haklı bulunan iadeler talebin onayından itibaren en geç 14 gün içinde, ödemenin yapıldığı karta ödeme kuruluşu aracılığıyla yapılır; tutarın hesaba yansıma süresi bankanıza bağlıdır. İade için gerekli hâllerde iade faturası veya fiyat farkı belgesi düzenlenir.

5. PAKET DEĞİŞİKLİĞİ
5.1. Üst pakete geçiş anında uygulanabilir; fark tutarı ve yeni yenileme bedeli onayınıza sunulmadan tahsilat yapılmaz.
5.2. Alt pakete geçiş, mevcut Dönem'in sonunda yürürlüğe girer. Yeni paketin sınırlarını aşan kayıtlar silinmez; sınıra inilene kadar yeni kayıt eklenemez.

6. ÜCRETSİZ DENEME
Ücretsiz deneme sunulduğu hâllerde süre 30 gündür ve kart bilgisi istenmez; deneme bitince ücretli Paket'e geçiş için ayrıca satın alma adımı tamamlanmadıkça tahsilat yapılmaz.`;

const KVKK_NOTICE = `KİŞİSEL VERİLERİN İŞLENMESİNE İLİŞKİN AYDINLATMA METNİ
(Müşteri Kurum yetkilileri, fatura ve iletişim kişileri için — 6698 sayılı KVKK m.10)

1. VERİ SORUMLUSU
${SELLER_BLOCK}
Bu metin, {{MARKA}} hizmetini satın alan veya satın almak için bilgi bırakan kurumların yetkilileri, fatura ve iletişim kişilerine ilişkin kişisel verilerin işlenmesini açıklar. Kurumların Hizmet'e girdiği öğrenci, veli ve öğretmen verileri bakımından veri sorumlusu ilgili kurumdur; {{SATICI_UNVAN}} bu veriler için veri işleyen sıfatıyla hareket eder (bkz. Veri İşleme Sözleşmesi).

2. İŞLENEN KİŞİSEL VERİLER
Kimlik: ad-soyad; şahıs işletmelerinde T.C. kimlik numarası (vergi numarası olarak).
İletişim: e-posta, telefon, fatura adresi.
Müşteri işlem: kurum adı, seçilen paket, sipariş/talep kayıtları, destek yazışmaları.
Finans: vergi dairesi ve numarası, fatura bilgileri, tahsilat sonuçları ve ödeme kuruluşunun verdiği kart referansı (kart numarası ve CVV işlenmez).
İşlem güvenliği: IP adresi, oturum ve giriş kayıtları, sözleşme onay kayıtları (belge sürümü, tarih).
Pazarlama: yalnızca ayrıca izin verdiyseniz e-posta adresinizin kampanya ve yenilik bildirimleri için kullanımı.

3. İŞLEME AMAÇLARI VE HUKUKİ SEBEPLER
a) Sözleşmenin kurulması ve ifası, hesap kurulumu, aboneliğin yönetimi ve destek — KVKK m.5/2-c (sözleşmenin kurulması/ifası).
b) Fatura düzenlenmesi, muhasebe ve vergi kayıtlarının tutulması, yetkili makam taleplerinin karşılanması — m.5/2-ç (hukuki yükümlülük).
c) Ödeme ve otomatik yenileme tahsilatlarının ödeme kuruluşu aracılığıyla yapılması — m.5/2-c.
d) Bilgi güvenliğinin sağlanması, kötüye kullanımın ve dolandırıcılığın önlenmesi, onay ve işlem kayıtlarının delil olarak saklanması — m.5/2-e (hakkın tesisi, kullanılması, korunması) ve m.5/2-f (meşru menfaat).
e) Kampanya ve yenilik bildirimleri — m.5/1 (açık rıza) ve 6563 sayılı Kanun kapsamındaki onay; izin vermemeniz satın almayı etkilemez.

4. AKTARIM
Kişisel verileriniz yukarıdaki amaçlarla sınırlı olarak; ödeme işlemleri için lisanslı ödeme kuruluşuna (PayTR Ödeme ve Elektronik Para Kuruluşu A.Ş. veya kullanılan diğer lisanslı kuruluş), e-Fatura/e-Arşiv için özel entegratöre ve muhasebe hizmeti alınan mali müşavire, yasal talep hâlinde yetkili kamu kurum ve kuruluşlarına aktarılabilir.
Hizmet'in barındırılması ve e-posta gönderimi için kullanılan bulut altyapı sağlayıcılarının (uygulama barındırma: Vercel Inc.; veritabanı: Supabase Inc., Avrupa Birliği — Frankfurt bölgesi; işlem e-postası sağlayıcısı) sunucuları yurt dışında bulunabilir. Bu aktarımlar KVKK m.9 uyarınca Kurul'ca ilan edilen standart sözleşmeler ve kanunda öngörülen diğer güvencelerle yapılır.

5. TOPLAMA YÖNTEMİ
Verileriniz satın alma, deneme, teklif ve iletişim formları, Hizmet içi hesap ve abonelik ekranları, ödeme kuruluşunun bildirimleri ve e-posta yazışmaları aracılığıyla elektronik ortamda toplanır.

6. HAKLARINIZ (KVKK m.11)
Kişisel verilerinizin işlenip işlenmediğini öğrenme, işlenmişse bilgi talep etme, amacına uygun kullanılıp kullanılmadığını öğrenme, aktarıldığı üçüncü kişileri bilme, eksik/yanlış işlenmişse düzeltilmesini, KVKK m.7 şartlarında silinmesini veya yok edilmesini ve bu işlemlerin aktarılan kişilere bildirilmesini isteme, münhasıran otomatik sistemlerle analiz sonucu aleyhinize bir sonuç çıkmasına itiraz etme ve kanuna aykırı işleme nedeniyle zarara uğramanız hâlinde zararın giderilmesini talep etme haklarına sahipsiniz.

7. BAŞVURU
Başvurularınızı, Veri Sorumlusuna Başvuru Usul ve Esasları Hakkında Tebliğ uyarınca; kimliğinizi doğrulayan bilgilerle birlikte, sistemde kayıtlı e-posta adresinizden {{SATICI_EPOSTA}} adresine, KEP ile {{SATICI_KEP}} adresine veya yazılı olarak {{SATICI_ADRES}} adresine iletebilirsiniz. Başvurular en geç 30 gün içinde ücretsiz sonuçlandırılır; işlemin ayrıca bir maliyet gerektirmesi hâlinde Kurul'ca belirlenen tarife uygulanabilir.`;

const PRIVACY_RETENTION = `GİZLİLİK, BİLGİ GÜVENLİĞİ VE VERİ SAKLAMA ESASLARI

Hizmet Sağlayıcı: {{SATICI_UNVAN}}

1. KAPSAM
Bu esaslar, {{MARKA}} hizmetinde kurum ve kullanıcı verilerinin nasıl korunduğunu ve ne kadar süre saklandığını açıklar. Öğrenci, veli ve öğretmenlere yönelik ayrıntılı gizlilik politikası {{MARKA}} web sitesindeki "Gizlilik Politikası" sayfasındadır.

2. TEKNİK VE İDARİ TEDBİRLER
- İletim güvenliği: tüm trafik TLS (HTTPS) ile şifrelenir; tarayıcıya sıkı güvenlik başlıkları (HSTS, içerik güvenlik politikası, çerçeveleme yasağı) gönderilir.
- Kimlik doğrulama: şifreler geri döndürülemez biçimde özetlenerek saklanır; oturumlar kısa ömürlü erişim anahtarlarıyla yönetilir; hareketsiz oturumlar otomatik kapanır; giriş ve satın alma uçlarında istek sınırlaması uygulanır.
- Yetkilendirme ve yalıtım: her kayıt tek bir kuruma bağlıdır; kurum kimliği yalnızca doğrulanmış oturumdan alınır ve kurumlar birbirinin verisine erişemez. Rol bazlı yetkiler (yönetici, öğretmen, veli, öğrenci) ve kayıt düzeyinde erişim kontrolü uygulanır.
- Kart verisi: kart numarası, son kullanma tarihi ve CVV {{MARKA}} sunucularına ulaşmaz; ödeme kuruluşunun PCI-DSS uyumlu altyapısında işlenir.
- Kayıt ve denetim: önemli işlemler (ödeme, sözleşme onayı, yetki değişikliği, veri dışa aktarma) denetim izine yazılır.
- Yedekleme: veritabanı barındırma sağlayıcısında düzenli yedeklenir; yedeklere erişim yetkili personelle sınırlıdır.
- Personel: verilere erişim "bilmesi gereken" ilkesiyle sınırlıdır; erişen kişiler gizlilik yükümlülüğü altındadır.
- Yapay zekâ özellikleri: yapay zekâ asistanı yalnızca kullanıcının yetkili olduğu verilerle çalışır ve aynı yetki kontrollerinden geçer; dış mesaj gönderimi insan onayı olmadan yapılmaz.

3. SAKLAMA SÜRELERİ
- Sözleşme, sipariş, fatura ve tahsilat kayıtları: 10 yıl (6102 sayılı TTK m.82, 213 sayılı VUK m.253).
- Sözleşme onay kayıtları (belge sürümü, tarih, IP): sözleşme süresi + 10 yıl (zamanaşımı süresi boyunca delil amacıyla).
- Satın alma talebi ve teklif kayıtları (sözleşmeye dönüşmeyenler): 2 yıl.
- Güvenlik ve erişim kayıtları: 2 yıl.
- Pazarlama izni kayıtları: izin geri alındıktan sonra 3 yıl (ispat amacıyla).
- Kurum Verisi: abonelik süresince; sona ermeden sonra 30 gün dışa aktarma süresi, ardından en geç 90 gün içinde silme veya anonimleştirme.
- Yedekler: olağan yedek döngüsü içinde kendiliğinden silinir.
Süresi dolan veriler periyodik imha süreçleriyle silinir, yok edilir veya anonim hâle getirilir.

4. VERİ İHLALİ
Kişisel verilerin yetkisiz kişilerce elde edildiğinin tespiti hâlinde, ilgili kurum gecikmeksizin bilgilendirilir ve KVKK m.12/5 kapsamındaki bildirim süreçlerinde gerekli destek sağlanır.

5. İLETİŞİM
Gizlilik ve güvenlik sorularınız için: {{SATICI_EPOSTA}}`;

const DPA = `VERİ İŞLEME SÖZLEŞMESİ (KVKK m.12)
(Ek — {{MARKA}} Abonelik ve Hizmet Sözleşmesi'nin ayrılmaz parçasıdır)

1. TARAFLAR VE ROLLER
Veri Sorumlusu: Hizmet'i satın alan Kurum.
Veri İşleyen: {{SATICI_UNVAN}} ({{SATICI_EPOSTA}}).
Kurum, Hizmet'e girdiği kişisel verilerin işlenme amaç ve vasıtalarını belirler; {{SATICI_UNVAN}} bu verileri yalnızca Kurum adına ve Kurum'un talimatlarıyla işler.

2. İŞLEMENİN KONUSU
Konu: ders programı, yoklama, telafi, ödev, gelişim, sözleşme, tahakkuk/tahsilat ve iletişim süreçlerinin yönetimi için yazılım hizmeti.
İlgili kişi grupları: öğrenciler (18 yaşından küçükler dahil), veliler/vasiler, öğretmenler ve personel, aday başvurucular.
Veri kategorileri: kimlik (ad-soyad; Kurum tercih ederse T.C. kimlik no, doğum tarihi), iletişim, eğitim kayıtları, finans (ücret, ödeme, IBAN — personel hakedişleri için), görsel (isteğe bağlı profil fotoğrafı), işlem güvenliği kayıtları, Kurum'un formlara eklediği diğer alanlar.
Özel nitelikli veri: Hizmet özel nitelikli kişisel veri (sağlık, din, biyometrik vb.) için tasarlanmamıştır. Kurum bu tür verileri serbest metin alanlarına girmemeyi kabul eder; girmesi hâlinde KVKK m.6 yükümlülükleri Kurum'a aittir.
Süre: abonelik süresi ve Ana Sözleşme m.10.4'teki dışa aktarma/silme süreleri.

3. VERİ İŞLEYENİN YÜKÜMLÜLÜKLERİ
a) Kişisel verileri yalnızca Kurum'un belgelenmiş talimatları (Hizmet ayarları ve kullanıcı işlemleri bu talimat sayılır) ve bu Sözleşme doğrultusunda işlemek; kendi amaçları için kullanmamak, satmamak.
b) KVKK m.12/1 kapsamındaki teknik ve idari tedbirleri (Gizlilik, Bilgi Güvenliği ve Veri Saklama Esasları'nda sayılanlar) almak ve güncel tutmak.
c) Verilere erişen personeli gizlilik yükümlülüğüne tabi kılmak ve erişimi "bilmesi gereken" ilkesiyle sınırlamak.
d) Kişisel veri ihlalini öğrenmesinden itibaren gecikmeksizin ve en geç 24 saat içinde Kurum'a bildirmek; Kurum'un KVKK m.12/5 kapsamında Kurul'a (72 saat) ve ilgili kişilere bildirim yapabilmesi için gerekli bilgiyi sağlamak.
e) İlgili kişilerin KVKK m.11 başvurularını Kurum'a yönlendirmek ve Kurum'un bu başvuruları yanıtlaması için makul teknik destek sağlamak.
f) Sözleşme sona erdiğinde Ana Sözleşme m.10.4 uyarınca verileri iade etmek ve ardından silmek veya anonim hâle getirmek.
g) Kurum'un makul talebi üzerine, yılda bir defayı aşmamak, önceden yazılı bildirimle ve ticari sırları korunarak bu Sözleşme'ye uyumu gösteren bilgi ve belgeleri sunmak.

4. ALT VERİ İŞLEYENLER
Kurum, aşağıdaki alt işleyenlerin kullanılmasına genel onay verir. Liste değiştiğinde Kurum'a en az 15 gün önceden e-postayla bildirilir; Kurum makul gerekçeyle itiraz ederse ve uzlaşma sağlanamazsa aboneliğini iptal ederek kullanılmayan tam Dönem(ler) için orantılı iade alabilir.
- Uygulama barındırma: Vercel Inc. (ABD; uygulama sunucuları Avrupa — Frankfurt bölgesi).
- Veritabanı ve yedekleme: Supabase Inc. (ABD şirketi; veriler Avrupa Birliği — Frankfurt bölgesinde).
- İşlem e-postası: Hizmet'e tanımlı SMTP e-posta sağlayıcısı (davet, şifre sıfırlama, bildirim e-postaları).
- Mobil anlık bildirim: Expo / 650 Industries Inc. (ABD) — yalnızca cihaz bildirim anahtarı ve bildirim metni.
- Ödeme (yalnızca Kurum'un kendi tahsilatlarında ve ilgili özellik açıksa): Kurum'un seçtiği lisanslı ödeme kuruluşu.
- SMS / WhatsApp (yalnızca Kurum ilgili kanalı açarsa): Twilio Inc. (ABD) ve/veya Meta Platforms (WhatsApp Business).
- Yapay zekâ özellikleri (yalnızca Kurum yapay zekâ asistanını kullandığında): Anthropic PBC, Google LLC (Gemini), Groq Inc., NVIDIA Corp., Cerebras Systems Inc. (ABD) — kullanıcının sorusu ve sorunun yanıtlanması için gereken kayıt özetleri; sağlayıcıların bu verileri model eğitiminde kullanmadığı kurumsal API koşulları tercih edilir.

5. YURT DIŞINA AKTARIM
Yukarıdaki alt işleyenlerin bir kısmı yurt dışında bulunduğundan aktarım, KVKK m.9 uyarınca Kurul'ca ilan edilen standart sözleşmeler veya kanunda öngörülen diğer güvencelerle yapılır; standart sözleşmelerin imzalanmasından itibaren 5 iş günü içinde Kurum'a bildirimi gibi usul yükümlülükleri taraflarca yerine getirilir. Kurum, yapay zekâ, SMS ve WhatsApp özelliklerini kullanmayarak bu kanallar üzerinden yurt dışı aktarımı önleyebilir.

6. VERİ SORUMLUSUNUN YÜKÜMLÜLÜKLERİ
Kurum; ilgili kişileri aydınlatmak, gerekli açık rızaları almak (özellikle küçüklerin verileri için veli/vasi bilgilendirmesi), VERBİS kayıt yükümlülüğü varsa yerine getirmek, Hizmet'e yalnızca amaçla sınırlı ve ölçülü veri girmek ve Yetkili Kullanıcı yetkilerini doğru ayarlamakla yükümlüdür.

7. SORUMLULUK
Bu Sözleşme'den doğan sorumluluk, Ana Sözleşme'nin "Sorumluluğun Sınırlandırılması" maddesine tabidir; kanunen sınırlandırılamayan hâller saklıdır. Bu Sözleşme ile Ana Sözleşme arasında kişisel verilere ilişkin çelişki olursa bu Sözleşme uygulanır.`;

const SLA = `HİZMET SEVİYESİ VE DESTEK ESASLARI
(Ek — {{MARKA}} Abonelik ve Hizmet Sözleşmesi'nin ayrılmaz parçasıdır)

1. ERİŞİLEBİLİRLİK HEDEFİ
{{MARKA}}, planlı bakım hariç aylık %99,5 erişilebilirlik hedefiyle işletilir. Bu oran bir hedeftir; aşılmaması tazminat veya hizmet kredisi doğurmaz, ancak Ana Sözleşme'deki fesih ve iade hakları saklıdır.

2. PLANLI BAKIM
Planlı bakımlar mümkün olduğunca hafta içi 23:00–06:00 (Türkiye saati) arasında yapılır ve kullanıcıları etkileyecekse en az 24 saat önce duyurulur. Acil güvenlik güncellemeleri önceden bildirilmeden uygulanabilir.

3. DESTEK KANALI VE SAATLERİ
Destek: {{SATICI_EPOSTA}} (telefon: {{SATICI_TELEFON}}).
Destek saatleri: hafta içi 09:00–18:00 (Türkiye saati), resmî tatiller hariç.

4. ÖNCELİK VE İLK YANIT HEDEFLERİ
- Kritik (Hizmet'e hiç erişilemiyor, veri güvenliği şüphesi, ödeme alınamıyor): 4 iş saati içinde ilk yanıt; çözüm sürecinde düzenli bilgilendirme.
- Yüksek (temel bir işlev çalışmıyor, geçici çözüm yok): 1 iş günü.
- Normal (işlev çalışıyor ancak hata/aksaklık var): 2 iş günü.
- Talep (yeni özellik, eğitim, ayar desteği): 5 iş günü.
Süreler destek saatleri içinde işler; ilk yanıt süresidir, çözüm süresi taahhüdü değildir.

5. YEDEKLEME VE KURTARMA
Veritabanı barındırma sağlayıcısında otomatik olarak yedeklenir. Sağlayıcı kaynaklı veri kaybında son geçerli yedekten geri dönüş yapılır; Kurum'un kendi işlemiyle sildiği verinin geri getirilmesi teknik olarak mümkünse ayrıca ücretlendirilebilir.

6. KURUM'UN KATKISI
Hızlı çözüm için destek talebinde etkilenen ekran, tarih/saat, kullanıcı ve mümkünse ekran görüntüsü paylaşılmalıdır. Kurum, Hizmet'e erişim için güncel bir tarayıcı ve kararlı internet bağlantısı kullanmakla yükümlüdür.`;

const PRE_INFO = `ÖN BİLGİLENDİRME FORMU (KURUMSAL SATIŞ)

1. SATICI / HİZMET SAĞLAYICI
${SELLER_BLOCK}

2. ALICI
Satın alma ekranında unvanı, vergi bilgileri ve adresi beyan edilen kurum. Alıcı, hizmeti mesleki veya ticari faaliyeti kapsamında satın aldığını beyan eder.

3. HİZMETİN TEMEL NİTELİKLERİ
{{MARKA}}: eğitim kurumları için ders programı, yoklama, telafi, öğrenci/veli/öğretmen portalları, sözleşme ve tahsilat takibi ile yapay zekâ destekli yardımcı özellikler içeren bulut tabanlı (SaaS) yazılım hizmeti. Seçilen paketin kapsamı ve sınırları satın alma ekranında gösterilir.

4. FİYAT VE ÖDEME
Fiyat, satın alma ekranında KDV hariç tutar, KDV ve KDV dahil toplam olarak gösterilir; ödeme lisanslı ödeme kuruluşu üzerinden kartla tek seferde alınır. Abonelik, iptal edilmedikçe aynı dönem süresiyle otomatik yenilenir. Kargo veya teslimat ücreti yoktur.

5. İFA
Hizmet, ödeme onayının ardından hesap kurulum bağlantısının kayıtlı e-posta adresine gönderilmesiyle derhâl kullanıma açılır.

6. CAYMA HAKKI
Bu satış 6502 sayılı Tüketicinin Korunması Hakkında Kanun kapsamındaki bir tüketici işlemi değildir; tacir veya meslek sahibi alıcıya yapılan kurumsal satışta Mesafeli Sözleşmeler Yönetmeliği'ndeki cayma hakkı uygulanmaz. İptal ve iade hakları "Yenileme, İptal ve İade Koşulları"nda düzenlenmiştir.
Hizmeti kendi kişisel ihtiyacı için (ticari veya mesleki amaç dışında) satın almak isteyen gerçek kişiler bu satın alma akışını kullanmamalı, {{SATICI_EPOSTA}} adresinden iletişime geçmelidir.

7. ŞİKÂYET VE UYUŞMAZLIK
Şikâyetlerinizi {{SATICI_EPOSTA}} adresine iletebilirsiniz. Uyuşmazlıklarda Türk hukuku uygulanır; {{SATICI_SEHIR}} Mahkemeleri ve İcra Daireleri yetkilidir.

8. SÖZLEŞMENİN SAKLANMASI
Onayladığınız sözleşme metinleri ve sürümleri sipariş kaydında saklanır; Hizmet içinde Abonelik › Faturalar › Fatura detayı ekranından erişilebilir ve talep hâlinde e-postayla gönderilir.`;

const MARKETING_CONSENT = `TİCARİ ELEKTRONİK İLETİ ONAY METNİ (İSTEĞE BAĞLI)

Bu kutuyu işaretleyerek, {{SATICI_UNVAN}} tarafından {{MARKA}} ürünlerine ilişkin yenilik, kampanya, etkinlik ve bilgilendirme içerikli ticari elektronik iletilerin, satın alma sırasında verdiğim e-posta adresime gönderilmesine 6563 sayılı Elektronik Ticaretin Düzenlenmesi Hakkında Kanun ve Ticari İletişim ve Ticari Elektronik İletiler Hakkında Yönetmelik kapsamında onay veriyorum.

- Bu onay satın alma için zorunlu değildir; vermemeniz hizmeti etkilemez.
- Onayınızı dilediğiniz zaman, her iletideki "abonelikten çık" bağlantısıyla, İleti Yönetim Sistemi (İYS) üzerinden veya {{SATICI_EPOSTA}} adresine yazarak ücretsiz geri alabilirsiniz; ret bildiriminiz 3 iş günü içinde işleme alınır.
- Abonelik, fatura, güvenlik ve hizmet değişikliği bildirimleri ticari elektronik ileti değildir; onay vermeseniz de gönderilir.
- Bu kapsamda işlenen kişisel verileriniz hakkında bilgi "KVKK Aydınlatma Metni"ndedir.`;

export const LEGAL_TEMPLATES: Readonly<Record<string, string>> = {
  "saas-service-terms": SERVICE_TERMS,
  "renewal-cancel-refund": RENEWAL_CANCEL_REFUND,
  "kvkk-notice": KVKK_NOTICE,
  "privacy-policy": PRIVACY_RETENTION,
  "dpa-note": DPA,
  "sla-note": SLA,
  "distance-sales-note": PRE_INFO,
  "marketing-consent": MARKETING_CONSENT,
};

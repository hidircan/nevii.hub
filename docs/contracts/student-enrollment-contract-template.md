# Öğrenci Kayıt Sözleşmesi — Yapılandırılmış Şablon

> **Kaynak:** Kullanıcının sağladığı `yeni-ogrenci-sozlesmesi-2022.docx` ve 2026–2027 ödeme politikası görseli.
>
> **Kullanım amacı:** Bu belge, uygulamanın yeni öğrenci kaydı sırasında sözleşme verilerini toplaması, yazdırılabilir PDF üretmesi ve imza için fiziksel çıktı hazırlaması için makine-okunur kaynak şablondur.
>
> **Hukuki not:** Sözleşme maddeleri ürün geliştirme sırasında anlamı değiştirilmeden korunmalıdır. Metin, tüketici hukuku, MEB özel öğretim kurumu mevzuatı, KVKK, ödeme/tahsilat ve yetki hükümleri açısından kurumun hukuk danışmanı tarafından canlı kullanımdan önce onaylanmalıdır.

## 1. Şablon sürümü

```yaml
id: student-enrollment-contract
version: 2026-2027-draft-1
institution_name: "Özel Nilüfer Acar Sanat Kursu"
document_title: "Öğrenci Kayıt Sözleşmesi"
execution_method: "physical_print_and_wet_signature"
requires_guardian_if_student_under_18: true
installment_count_min: 1
installment_count_max: 12
currency: TRY
```

## 2. Doldurulacak alanlar

```yaml
contract:
  contract_number: "{{contractNumber}}"
  issue_date: "{{issueDate}}"
  academic_year: "{{academicYear}}" # örn. 2026-2027

institution:
  legal_name: "{{institutionLegalName}}"
  address: "{{institutionAddress}}"
  tax_or_registration_reference: "{{institutionRegistrationReference}}"

student:
  id: "{{studentId}}"
  full_name: "{{studentFullName}}"
  national_id: "{{studentNationalId}}"
  date_of_birth: "{{studentDateOfBirth}}"
  address: "{{studentAddress}}"
  program_name: "{{programName}}"
  instrument_or_course: "{{instrumentOrCourse}}"
  lesson_frequency_per_week: "{{lessonFrequencyPerWeek}}"
  lesson_duration_minutes: "{{lessonDurationMinutes}}"
  lesson_day_and_time: "{{lessonDayAndTime}}"

guardian:
  required: "{{guardianRequired}}"
  full_name: "{{guardianFullName}}"
  national_id: "{{guardianNationalId}}"
  phone: "{{guardianPhone}}"
  email: "{{guardianEmail}}"
  address: "{{guardianAddress}}"

registration:
  start_date: "{{registrationStartDate}}"
  end_date: "{{registrationEndDate}}"
  duration_months: "{{durationMonths}}"
  total_lesson_count: "{{totalLessonCount}}"

payment:
  currency: "TRY"
  monthly_amount: "{{monthlyPaymentAmount}}"
  installment_count: "{{installmentCount}}"
  total_contract_amount: "{{totalContractAmount}}"
  deposit_amount: "{{depositAmount}}"
  payment_method: "{{paymentMethod}}"
  installments: "{{installmentSchedule}}"

consents:
  photo_video_permission: "{{photoVideoPermission}}" # granted | denied

signatures:
  signer_type: "{{signerType}}" # guardian | adult_student
  signer_full_name: "{{signerFullName}}"
  signature_date: "{{signatureDate}}"
  institution_representative: "{{institutionRepresentative}}"
```

## 3. Üretim kuralları

1. Kayıt oluşturulmadan önce yönetici/personel şu alanları zorunlu girer:
   - Öğrenci adı soyadı.
   - Öğrenci 18 yaşından küçükse veli bilgileri.
   - Program/enstrüman.
   - Başlangıç ve bitiş tarihi.
   - Kayıt süresi: 1–12 ay.
   - Aylık ödeme tutarı.
   - Taksit/ay sayısı.
   - Ödeme planı ve ilk vade tarihi.
2. Toplam sözleşme bedeli istemcide yalnız gösterim için hesaplanabilir; backend otoritedir:

   \[
   \text{Toplam sözleşme bedeli} = \text{aylık ücret} \times \text{taksit sayısı}
   \]

   Kaparo/indirim/tek seferlik ücret varsa bunlar ayrı ve açık kalemler olarak gösterilir; toplam gizlice değiştirilmez.
3. Her taksit için tarih, sıra ve tutar sözleşmeye yazılır. Varsayılan plan kurumun ödeme politikasına göre oluşturulur; personel yazdırmadan önce önizlemede düzenleyebilir.
4. PDF oluşturulduğunda sözleşme şablon sürümü, alanların doldurulmuş anlık kopyası, toplam bedel ve taksit satırları immutable/snapshot olarak kaydedilir.
5. Çıktı fiziksel olarak yazdırılır; ıslak imza uygulama içinde imza atılmış sayılmaz.
6. İmzalı nüsha daha sonra taranıp yetkili belge alanına yüklenebilmeli; orijinal üretilen PDF ve imzalı tarama ayrı dosyalar olarak saklanmalıdır.
7. Yeni öğrenci kaydı, kurum politikasına göre:
   - `draft` → sözleşme önizleme → `printed` → `wet_signature_pending` → `signed` → `active`
   durumlarıyla ilerlemelidir.
8. Sözleşme imzalanmadan öğrenci kaydının aktifleşip aktifleşmeyeceği kurum ayarı/iş akışı olarak açıkça belirlenmelidir; sessiz varsayım yapılmamalıdır.
9. Sözleşme PDF'i için erişim, öğrenci/veli/öğretmen/admin rollerinin mevcut yetkilerine göre server-side uygulanır. Başka öğrencinin sözleşmesine ID değiştirerek erişim mümkün olmamalıdır.

## 4. 2026–2027 ödeme politikası özeti

> Bu bölüm, sağlanan görseldeki politika özetidir. Nihai hukuki metin, kurum onayıyla sözleşme ekine veya ana sözleşme metnine yerleştirilmelidir.

- Aylık ödemelerin ilgili ay içinde tamamlanması esastır.
- Kredi kartı ödemeleri: her ayın 1–5’i arasında.
- Havale/nakit ödemeleri: her ayın en geç 15’i.
- Aylık ödemeler sonraki aya devredilemez.
- Önceki dönemden kalan ödemelerin kayıt yenileme öncesinde kapatılması gerekir.
- Ödeme tarihinin aşılması durumunda kurum tarafından bilgilendirme yapılır.
- Gecikmenin devam etmesi halinde öğrencinin ders planlaması ödeme tamamlanana kadar geçici olarak durdurulabilir.
- Telafi için dönem içinde en fazla 2 telafi hakkı bulunur; belgelenebilir ciddi/zorunlu durumlarda kullanılabilir.
- Telafi hakkı ilgili ders tarihinden itibaren 30 gün içinde kullanılmalıdır.
- Öğrencinin kendi isteğiyle iptal ettiği dersler telafi kapsamında değerlendirilmez; ders işlenmiş kabul edilir.

## 5. Sözleşme metni

# T.C. Milli Eğitim Bakanlığı

# ÖZEL NİLÜFER ACAR SANAT KURSU

# ÖĞRENCİ KAYIT SÖZLEŞMESİ

## Giriş

Öncelikle belirtmek isteriz ki kurumumuz Milli Eğitim Bakanlığına bağlı olduğu için tüm iş ve işlemlerimiz denetim altındadır. Kurs ücretlerimizden kaynaklı vergi yükümlülüklerimiz de tam olarak yerine getirilmektedir. Öğretmenlerimiz sadece kurumumuzda görev almaktadır ve sözleşmeleri gereği kurumumuzdan başka yan gelirleri de olmamaktadır. Bu nedenle planlanmış olan her ders, öğretmenlerimiz ve kurumumuz için tek gelir kaynağıdır.

## Sözleşme

NİLÜFER ACAR SANAT KURSU (bundan sonra “Kurs” olarak anılacaktır) işbu kayıt sözleşmesinin sonunda adı ve soyadı bulunan kurs merkezinde öğrenim görmek isteyen öğrenci (bundan sonra “Öğrenci” olarak anılacaktır) ile, öğrenci 18 yaşından küçük ise sözleşmeyi imzalayan velisi (bundan sonra “Veli” olarak anılacaktır) arasında düzenlenmiştir. Taraflar aşağıdaki hükümlerin uygulanacağını kabul eder.

### Madde 1

Bu sözleşmede adı geçen;

- **Kurs:** NİLÜFER ACAR SANAT KURSU.
- **Öğrenci:** Nilüfer Acar Sanat Kursu’nda faaliyet gösteren kurslarda öğrenim görmek isteyen kişi.
- **Veli:** Kursta öğrenim görmek isteyen 18 yaşından küçük öğrencinin her türlü yasal durum ve davranışından sorumlu olan ve sözleşmenin sonunda adı ve soyadı belirtilen kişi.
- **Program:** Öğrencinin öğrenim görmek istediği, içeriğinin hangi ders ve konulardan oluşacağı kurs tarafından belirlenecek program.
- **Mevzuat:** Kurs içerisindeki her türlü faaliyetleri düzenleyen ilgili kanun, yönetmelik, yönerge, genelge ve diğer yazılar.

### Madde 2

Öğrencinin kaydolduğu program içeriğini taraflar birlikte belirler. Öğrenci veya velisinin belirlenen programın içeriğine müdahale hakkı yoktur.

### Madde 3

Öğrencinin kaydolduğu programın uygulanması ile ilgili zaman çizelgesi, yani kursun gün ve saati taraflar birlikte belirlenir. Öğrenci veya veli bu zaman çizelgesine uymakla yükümlüdür.

### Madde 4

Kurs reklamlarında kullanılmak üzere öğrencilerin zaman zaman fotoğrafları ve videoları çekilebilir. Kurum; idari, hukuki ve mali gereklilikler sebebiyle öğrenci ve velilere ait kişisel verileri ilgili mevzuat çerçevesinde işler ve saklar. Yasal zorunluluk halleri dışında kişisel veriler üçüncü kişi ve kuruluşlarla paylaşılmaz.

Fotoğraf, video ve benzeri görüntülerin paylaşımı için tercih:

- [ ] Paylaşılmasına izin veriyorum.
- [ ] Paylaşılmasına izin vermiyorum.

İsim, soyad ve imza: `{{signerFullName}}` / `{{wetSignaturePlaceholder}}`

### Madde 5

Öğrenci 18 yaşından küçük ise kayıt, velisinin kayıt sözleşmesini imzalaması ile; öğrenci 18 yaşından büyük ise öğrencinin kendisinin imzalaması ile yapılır.

### Madde 6

Kayıt yapılan öğrencilerden mevzuat gereği aşağıdaki belgeler istenir:

1. Kimlik fotokopisi.
2. Bir adet vesikalık fotoğraf.

### Madde 7 — Eğitim Ücreti ve Ödeme Planı

Ders saati ücreti: `{{lessonHourlyAmount}}` TL, KDV dahil.

Program: `{{programName}}` / `{{instrumentOrCourse}}`.

Ders sıklığı: haftada `{{lessonFrequencyPerWeek}}` gün.

Kayıt başlangıç tarihi: `{{registrationStartDate}}`.

Kayıt bitiş tarihi: `{{registrationEndDate}}`.

Kayıt süresi: `{{durationMonths}}` ay.

Aylık kurs ücreti: `{{monthlyPaymentAmount}}` TL.

Taksit sayısı: `{{installmentCount}}`.

Toplam sözleşme bedeli: `{{totalContractAmount}}` TL.

Kaparo: `{{depositAmount}}` TL.

Ödeme yöntemi: `{{paymentMethod}}`.

Aylık kurs ücreti, ödeme planında belirtilen tarihlerde kuruma ödenir. Ödeme; elden, kredi kartı veya kuruma ait banka hesabına yatırılarak yapılabilir. Ödeme sonrasında kurum, alınan hizmet karşılığı fatura veya makbuz verir.

Yıl içinde bazı aylar beş hafta çekebilir. Birebir ve grup olarak yapılan derslerde, ay içinde beş hafta olan aylarda ilave ders ücreti ayrıca alınabilir. Ay içinde gelinmemiş dersler kurs ücretinden düşülmez.

Kurs ücretinin ödenmemesi durumunda kurum, öğrenciyi derse almayabilir veya ilgili mevzuat ve sözleşme hükümleri çerçevesinde kayıt işlemlerini değerlendirebilir.

Eğitim dışında gerekli olan not defteri, kitap, yıl sonu gösteri kıyafeti ve benzeri giderler öğrenci/veli tarafından karşılanır.

### Madde 8 — Devamsızlık ve Telafi

Öğrencinin devamsızlık yapması, öğrenci veya velisinin ödeme yükümlülüğünü etkilemez. Öğrencinin kaydı silinmediği sürece, derse devam etsin veya etmesin kayıtlı olduğu programın ücreti öğrencinin kendisi veya velisi tarafından ödenir.

Öğrencinin katılamadığı dersler aşağıdaki şartlarda telafi dersi olarak alınabilir:

- Grup derslerinde telafi dersi yapılmaz.
- Özel derslerde telafi, hastalık, sınav ve benzeri belgelenebilir zorunlu hallerde yapılabilir.
- Telafi dersinin gün ve saati kurumun, öğretmenin ve öğrencinin uygunluğuna göre belirlenir.
- Telafi dersine katılmayan öğrenci için yeniden telafi yapılmaz ve ücret düşülmez.
- Telafi dersi eğitim dönemi içinde, ilgili ders süresi içinde yapılır; dönemler arasında aktarılmaz.

### Madde 9 — Resmi Tatiller

Kurum Milli Eğitim Bakanlığına bağlı olduğundan, Bakanlıkça belirlenen resmi gün ve tatillerde zorunlu olarak kapatılır. Resmi günlere denk gelen derslerin telafisi yapılamaz ve ücret iadesi yapılmaz.

Kurum yarıyıl ve yaz tatilinde eğitimine devam edebilir. Bu sürelerde derse katılamayacak kursiyerlerin ilgili dönemi belirten dilekçeyi kuruma vermesi gerekir.

### Madde 10 — Yıl Sonu Gösterisi

Yıl sonu gösterisinde görev alacak öğrenciler; yaş, sınıf, eğitim süresi, performans, yetenek ve davranışlar dikkate alınarak öğretmenleri tarafından belirlenir. Kurum gerekli görürse seçme sınavı yapabilir.

Grup gösterilerinde prova esastır. Kurumun belirlediği prova günü, saati, kıyafet ve sahne düzenine uyulması gerekir. Konser bileti, kostüm, video/fotoğraf çekimi, salon kirası, nakliyat ve benzeri giderler kurumun belirlediği tutarlar üzerinden öğrenci/veli tarafından karşılanabilir.

### Madde 11

Öğrenci, öğretmeni ile iletişim kuracağı zaman doğrudan iletişime geçmez; kurs yönetimi üzerinden iletişim sağlanır.

### Madde 12

Öğrenci veya veli, sınav sonuçlarının kimlik numarası gizlenerek kurumun internet sayfasında yayınlanmasını kabul eder.

### Madde 13

Kurumda disiplin ile ilgili esaslar ilgili mevzuat doğrultusunda yürütülür.

### Madde 14

Kurs içerisinde işlenmiş suça göre kolluk kuvvetlerine haber verilir. Kurumda toplumca hoş karşılanmayan tutum ve davranışlara yer verilmez.

### Madde 15

Kurum içerisinde sigara, alkollü içecek, gayriahlaki yayın, siyasi ve bölücü yayın bulundurulamaz.

### Madde 16

Öğrenciler tarafından kurs demirbaşlarına veya müzik aletlerine verilen her türlü zarar, öğrenci 18 yaşından küçük ise veli; öğrenci 18 yaşından büyük ise öğrenci tarafından karşılanır. Zarar miktarını kurs yönetimi belirler.

### Madde 17

Kurum mali planlarını öğrenci kayıt sayısına göre yaptığından, kayıtlı öğrencilerin öğretim yılı boyunca kayıtlarını sildirmemeleri temel esastır.

### Madde 18

Öğretim dönemi içinde zorunlu sebeple kayıt sildirmek isteyen öğrenci için, öğrenci 18 yaşından küçük ise velisinin, öğrenci 18 yaşından büyük ise öğrencinin yazılı müracaatı gerekir. Yazılı bildirim yapılmadığı sürece devam edildiği kabul edilir. Kayıt silme gerekçesi kurum tarafından incelenir.

### Madde 19

Kaydı silinecek öğrencinin kursa borcunun bulunmaması gerekir. Borç tahsil edildikten sonra kayıt silinir.

### Madde 20

Kayıt silme işlemi, ilgili dilekçenin kuruma ulaşmasından sonra sözleşme ve mevzuat hükümlerine göre değerlendirilir. Şehir değişikliği, tayin, belgelendirilmiş sağlık engeli veya belgelenmiş mali durum bozulması gibi zorunlu haller değerlendirmeye alınır.

### Madde 21

Kurs ücretinin peşin, banka havalesi, otomatik ödeme talimatı veya kredi kartının otomatik ödeme talimatı ile aylık taksitler halinde ödenmesi esastır. Peşin ödemede kayıt sırasında ödemenin tamamı alınır.

### Madde 22

Taksitli ödemeler banka havalesi/EFT, otomatik ödeme talimatı veya kredi kartı otomatik tekrarlı ödeme talimatı ile yapılabilir.

### Madde 23

Zamanında yapılmayan ödemeler için veliye süre verilir. Bu süre sonunda ödeme yapılmamışsa kursun sunduğu öğretim hizmetleri durdurulabilir ve sözleşme/mevzuat hükümleri çerçevesinde işlem yürütülebilir.

### Madde 24

İşbu sözleşmeden kaynaklanan ihtilaflarda İzmir İcra Mahkemeleri ve icra dairelerinin yetkili olduğu taraflarca kabul edilir.

### Madde 25

Sözleşmede belirtilen adres yasal tebligat adresidir. Adres değişikliğinin on gün içinde kursa bildirilmesi kabul ve taahhüt edilir.

### Madde 26

İşbu sözleşme 26 maddeden oluşur. Taraflar sözleşmeyi okuduklarını, anladıklarını ve hür iradeleriyle kabul ettiklerini beyan eder. Sözleşme iki nüsha düzenlenir ve öğrenci 18 yaşından küçük ise velisi, 18 yaşından büyük ise öğrenci tarafından imzalanır.

## 6. Taksit planı

| Taksit | Vade tarihi | Tutar (TL) | Ödeme yöntemi | Ödeme durumu |
|---:|---|---:|---|---|
| 1 | `{{installment1DueDate}}` | `{{installment1Amount}}` | `{{installment1Method}}` | `{{installment1Status}}` |
| 2 | `{{installment2DueDate}}` | `{{installment2Amount}}` | `{{installment2Method}}` | `{{installment2Status}}` |
| 3 | `{{installment3DueDate}}` | `{{installment3Amount}}` | `{{installment3Method}}` | `{{installment3Status}}` |
| 4 | `{{installment4DueDate}}` | `{{installment4Amount}}` | `{{installment4Method}}` | `{{installment4Status}}` |
| 5 | `{{installment5DueDate}}` | `{{installment5Amount}}` | `{{installment5Method}}` | `{{installment5Status}}` |
| 6 | `{{installment6DueDate}}` | `{{installment6Amount}}` | `{{installment6Method}}` | `{{installment6Status}}` |
| 7 | `{{installment7DueDate}}` | `{{installment7Amount}}` | `{{installment7Method}}` | `{{installment7Status}}` |
| 8 | `{{installment8DueDate}}` | `{{installment8Amount}}` | `{{installment8Method}}` | `{{installment8Status}}` |
| 9 | `{{installment9DueDate}}` | `{{installment9Amount}}` | `{{installment9Method}}` | `{{installment9Status}}` |
| 10 | `{{installment10DueDate}}` | `{{installment10Amount}}` | `{{installment10Method}}` | `{{installment10Status}}` |
| 11 | `{{installment11DueDate}}` | `{{installment11Amount}}` | `{{installment11Method}}` | `{{installment11Status}}` |
| 12 | `{{installment12DueDate}}` | `{{installment12Amount}}` | `{{installment12Method}}` | `{{installment12Status}}` |

## 7. Son beyan ve imza alanı

Toplam sözleşme borcu: `{{totalContractAmount}}` TL.

Ödemelerimi belirtilen tarihlerde yapacağımı ve sözleşmeyi okuduğumu beyan ederim.

Kurs: `{{institutionLegalName}}`

Adres: `{{institutionAddress}}`

Kursiyer / Veli: `{{signerFullName}}`

T.C. Kimlik No: `{{signerNationalId}}`

Adres: `{{signerAddress}}`

Başvuru tarihi: `{{issueDate}}`

Islak imza: `{{wetSignaturePlaceholder}}`

Kurum temsilcisi: `{{institutionRepresentative}}`

Kurum imza/kaşe alanı: `{{institutionSignaturePlaceholder}}`

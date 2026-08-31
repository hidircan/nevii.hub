---
title: "Kayıt / Ödeme Önizleme / Sözleşme Yenileme ve Form Doğrulama — Düzeltme Raporu"
date: "2026-08-29"
branch: "main"
worktree: "canonical (worktree KULLANILMADI)"
---

# Admin Kayıt / Ödeme Önizleme / Sözleşme Yenileme — Düzeltici Paket

Bu rapor `main` dalında (canonical checkout, `/Users/hidircanyagiz/Projects/notaplan`) yapılan
düzeltici işi belgeler. Görev, önceki teslimattan (bkz.
`docs/contracts/ADMIN_WEB_ENROLLMENT_PAYMENT_CONTRACTS_REPORT.md`) sonra bildirilen 6 spesifik
hatayı — kök nedenlerini izleyerek — düzeltmeyi istedi. `docs/contracts/LEGAL_CONTRACT_TEXT_DIFF_REVIEW.md`
ve `docs/contracts/ENROLLMENT_UX_TEMPLATE_RENEWAL_BUGFIX_REPORT.md` bu oturumun başında repoda
YOKTU — görev talimatı gereği "yalnızca varsa oku" kuralına göre atlandı.

**Ürün adı:** Bu oturumda eklenen/değiştirilen TÜM kullanıcıya görünen yeni metinlerde ürün adı
kullanılmadı (mevcut ekranlar zaten kurum adını/genel arayüz dilini kullanıyor); nerede geçtiği
kontrol edildi — "Nevii Hub"/"NEVIIHUB"/"NotaPlan"/"Maestron" bu oturumun dokunduğu HİÇBİR dosyada
YOK (bkz. §13).

---

## 1. Bildirilen sorun matrisi

| # | Bildirilen sorun | Kesin tekrar üretim | Kök neden | Düzeltme | Regresyon testi |
|---|---|---|---|---|---|
| 1 | Ders günü/tarih/saat seçimi profesyonel değil | `contract-panel.tsx`'te `lessonScheduleText` tek bir serbest metin `<Input>` idi ("Çarşamba 16:00" placeholder) — yazım hatasına açık, klavye/mouse için standart bir kontrol değil | Yapısal alan yok, serbest metin | Yeni `LessonScheduleSlotsPicker` bileşeni: erişilebilir gün segmented-button grubu (tam Türkçe gün adları) + `<input type="time">` + tekrar-önleme + çip listesi. `lessonScheveduleText` DEPOLAMA biçimi DEĞİŞMEDİ (hâlâ string) — yalnızca GİRİŞ deneyimi değişti | §2 (bkz. bileşen testi notu) |
| 2 | "Gerekçe" alanı kafa karıştırıcı, görünürlüğü stale kalabiliyor | `firstPaymentNeedsException = preview !== null && !preview.firstDueDateInWindow` — yalnızca son "Önizle" tıklamasının SONUCUNA bağlıydı; ödeme yöntemi/tarih SONRADAN değiştirilirse görünürlük YENİLENMİYORDU | Görünürlük bir ÖNBELLEK (fetch sonucu) alanına bağlıydı, CANLI girdilere değil | Görünürlük artık HER RENDER'DA `paymentMethod` + `firstDueDate`'ten YENİDEN hesaplanan türetilmiş bir değer (`describePaymentDueRule` + `dayOfMonthUtc`) — `preview`'a hiç bağımlı değil. Etiket → **"İstisnai ilk ödeme tarihi gerekçesi"**, yardım metni ve placeholder BİREBİR şartname metni | `contracts.test.ts` (sunucu kuralı, §Faz2) — istemci türetimi mimari olarak stale OLAMAZ (bkz. §4) |
| 3 | Kayıt sonrası yetersiz görünür onay | Önceki oturumda eklenen banner vardı ama: kesin "Öğrenci kaydı başarıyla oluşturuldu." cümlesi yok, ödeme kuralı/plan/sınıflandırma eksikti, geçici toast yoktu | Banner tek bir kısa özetti, şartnamenin istediği alanları içermiyordu | Yeni `RegistrationSuccessPanel`: geçici erişilebilir toast (`role=status`, 6sn) + KALICI özet paneli (öğrenci, program, başlangıç, ödeme yöntemi+kuralı, planlanan süre, tahmini toplam, doğru trial/formal sınıflandırma) | Manuel kabul kontrol listesi (§16) — bileşen test altyapısı repoda yok, bkz. §14 |
| 4 | Kayıttan sözleşmeye ANİDEN geçiş | Form otomatik "initial" modda açılıyordu ama "gözden geçirme" hissi/başlığı/yaşam döngüsü açıklaması yoktu, trial için de aynı CTA gösteriliyordu | Tek bir CTA/tek bir buton metni her durumda aynıydı | Trial: "Tanışma Paketi — Formal sözleşme gerekmiyor" + Ödeme Planını Görüntüle/Öğrenci Detayına Git/Yeni Kayıt Oluştur (formal CTA YOK). Formal: "Formal sözleşme oluşturulmaya hazır" + birincil CTA "Sözleşmeyi Gözden Geçir ve Oluştur". Form başlığı "— Gözden Geçir ve Oluştur", önceki sözleşme özeti (yenilemede), yaşam döngüsü metni eklendi | Manuel kabul kontrol listesi (§16) |
| 5 | Yenileme, alanlar dolu görünse bile şablon hatası gösterebiliyor | `data/document-templates.json`'da GERÇEKTEN 2026-08-25 tarihli, metadata-only bir şablon satırı bulundu (`tenant_nilufer_acar`) — `.find()` dizi sırasına göre İLK eşleşeni seçiyordu, bu yüzden SONRADAN eklenen doğru şablon bile asla seçilmiyordu | GERÇEK içerik eksikliği + şablon SEÇİM sırası (dizi sırası, "en son güncellenen" DEĞİL) — doğrulayıcı DOĞRU çalışıyordu | Tek kaynak kayıt (`contract-template-schema.ts`), `selectActiveContractTemplate` (en son güncellenen kazanır), "kurumsal kaynaktan taslak oluştur + etkinleştir" akışı (tek-aktif garantili), tanılama paneli | `contracts.test.ts` — 2 yeni test (stale şablon reddi → taslak → etkinleştir → başarı; RBAC) |
| 6 | İptal edilmiş sözleşmeden "Yenile" tıklanınca boş alanlarla "Tamamla" konsol hatası veriyor | `latest = contracts.find(aktif) ?? contracts[0]` — TÜM sözleşmeler iptal/yenilenmişse SESSİZCE iptal edilmiş olanı seçiyordu; `firstDueDate` state'i HİÇBİR zaman ön doldurulmuyordu VE `onCreate`'in doğrulaması bunu kontrol ETMİYORDU; `new Date("").toISOString()` → `RangeError: Invalid time value` | (a) yenileme UYGUNLUĞU ile "gösterim için en güncel" birbirine karışmıştı (b) merkezi/güvenli tarih ayrıştırma yoktu (c) `firstDueDate` doğrulanmıyordu | (a) `findLatestActiveContractForRenewal` — iptal/yenilenmiş sözleşme ASLA seçilmez, aktif yoksa "Yeni Kayıt Sözleşmesi Oluştur" gösterilir (b) `date-input.ts` — `toIsoDateOrNull`/`parseDateOnlyInput` ASLA fırlatmaz (c) tam alan doğrulaması + hata özeti + odak yönetimi | `contract-list-helpers.test.ts` (4 test), `date-input.test.ts` (6 test), `contracts.test.ts` (cancelled-renewal reddi + boş firstDueDate reddi, RangeError asla) |

## 2. Ders günü/tarih/saat UX değişiklikleri (Faz 1)

`src/components/lesson-schedule-slots-picker.tsx` (yeni):

- **Gün seçimi:** 7 buton, TAM Türkçe adlar (Pazartesi…Pazar, Türkiye takvim sırasıyla
  görüntülenir), `role="group"` + `aria-labelledby`, her buton `aria-pressed` ile seçili durumu
  bildirir, klavye ile Tab/Enter/Space ile tamamen kullanılabilir (native `<button>`).
- **Saat:** native `<input type="time" step={300}>` — 24 saat biçimi, klavye girişi, tarayıcı
  seviyesinde malformed değer engeli.
- **Tekrar önleme:** aynı gün+saat ikinci kez eklenemez ("Bu gün/saat zaten eklendi." hatası).
- **Çoklu slot:** eklenen her gün/saat bir çip olarak listelenir, ayrı ayrı kaldırılabilir —
  birden fazla haftalık ders günü desteklenir.
- **Depolama biçimi DEĞİŞMEDİ:** bileşen yalnızca `lessonScheduleText: string`'i (ör. "Çarşamba
  16:00, Cuma 17:00") üretir — `contracts.ts`/`documents/index.ts`/veritabanı şeması hiç
  değişmedi, sözleşme PDF'inde Madde 3 aynı şekilde render edilir.

**Kasıtlı kapsam kararı — yeni öğrenci kaydı formuna EKLENMEDİ:** `lessonScheduleText`
kavramı yalnızca SÖZLEŞME düzeyinde vardır (`Student` modelinde yok); kayıt formuna aynı
bileşeni eklemek, hiçbir yere kaydedilmeyen bir alan toplamak anlamına gelirdi ("fake" veri
toplama riski). Bunun yerine kayıt formuna GERÇEKTEN işlevsel yeni bir alan eklendi: "Planlanan
kayıt süresi" (bkz. §3) — bu, kayıttan hemen sonraki sınıflandırma/CTA'yı BELİRLER, dolayısıyla
gerçekten kullanılır. Ders günü/saati, sözleşme oluşturma adımında (asıl kullanıldığı yer)
girilir.

## 3. Ödeme önizleme ve "İstisnai ilk ödeme tarihi gerekçesi" kuralları (Faz 2)

`src/lib/payment-due-rule-client.ts` (yeni, istemci-güvenli, `contracts.ts`'teki sunucu
varsayılanının salt YANSIMASI):

- Etiket **"İstisnai ilk ödeme tarihi gerekçesi"** — artık jenerik "Gerekçe" değil.
- Yardım metni: *"Bu alan, standart ödeme tarihinin dışındaki ilk ödeme planları için
  zorunludur."*
- Placeholder: *"Örn. Kayıt tarihi nedeniyle ilk ödeme 12 Eylül tarihinde planlanmıştır."*
- **Normal planlarda alan HİÇ RENDER EDİLMEZ** (`firstPaymentNeedsException` false ise JSX'te
  yok) — doğrulanmaz, gönderilmez (`onCreate` yalnızca `firstPaymentNeedsException` true iken
  `firstPaymentExceptionReason`'ı payload'a ekler, aksi halde `undefined` — "anlamsız boş
  gerekçe verisi gönderilmez/saklanmaz" kuralı).
- Ödeme yöntemi seçicisinin ALTINDA her zaman görünen, canlı bir yardım satırı: seçili yönteme
  göre "Kredi kartı ödemeleri her ayın 1–5'i arasında yapılmalıdır." / "Havale/EFT/nakit
  ödemeleri her ayın en geç 15'ine kadar yapılmalıdır." — kullanıcı hiçbir şeye tıklamadan
  kuralı görür.
- Sunucu (`resolveContractPaymentDueRule`, `src/lib/contracts.ts`) HER ZAMAN otoritedir; istemci
  yalnızca varsayılan (kurum-özelleştirilmemiş) politikayı yansıtır. Kurum politikayı
  özelleştirmişse istemci geçici olarak yanlış bir ipucu verebilir ama sunucu doğru kararı verir
  — nihai kabul/red asla yalnızca istemci hesabına dayanmaz.

## 4. Retry/stale-state kök neden ve düzeltme (Faz 2C)

**Kök neden:** eski kod `firstPaymentNeedsException`'ı `preview` state'inden (en son "Önizle"
tıklamasının sonucu) türetiyordu. `preview`, yalnızca `onPreview()` çağrıldığında GÜNCELLENIYORDU
— ödeme yöntemi/tarih SONRADAN değiştirilirse `preview` STALE kalıyor, alan yanlış (eski)
görünürlükte kalmaya devam ediyordu.

**Düzeltme:** görünürlük artık `preview`'dan TAMAMEN BAĞIMSIZ, HER render'da güncel
`paymentMethod`+`firstDueDate`'ten yeniden hesaplanan saf bir değer:

```ts
const dueRule = describePaymentDueRule(paymentMethod);
const firstDueDay = dayOfMonthUtc(toIsoDateOrNull(firstDueDate));
const firstPaymentNeedsException =
  firstDueDay !== null && (firstDueDay < dueRule.windowStartDay || firstDueDay > dueRule.windowEndDay);
```

Bu, React'in normal render döngüsünün bir parçası olduğundan **standart → istisna → standart →
istisna**, **kart → EFT → kart**, "başarısız gönderim → tekrar dene", "tarayıcı geri/ileri" gibi
TÜM senaryolarda otomatik ve doğru çalışır — "stale" olması artık YAPISAL OLARAK imkansızdır
(önceki oturumdaki çakışma-uyarısı düzeltmesiyle AYNI desen). Gerekçe metni yalnızca
`firstPaymentNeedsException` false olduğunda payload'dan DÜŞÜRÜLÜR (yukarı bkz.) — kullanıcının
yazdığı metin state'te kalır (silinmez), yalnızca gönderilmez; istisna tekrar gerekirse kaldığı
yerden görünür.

## 5. Yeni kayıt başarı deneyimi (Faz 3)

`src/components/registration-success-panel.tsx` (yeni):

- Geçici toast: `role="status" aria-live="polite"`, sabit konum, 6 saniye sonra otomatik kapanır
  — **"Öğrenci kaydı başarıyla oluşturuldu."** (şartname metniyle BİREBİR).
- Kalıcı panel (server-onaylı redirect sonrası render edilir — `router.refresh()`/yeniden
  yükleme sonrası da KALIR, yalnızca geçici popup'a güvenilmez): öğrenci adı, program özeti,
  başlangıç tarihi, ödeme yöntemi, canlı ödeme kuralı metni, planlanan süre, tahmini toplam
  (aylık ücret × planlanan ay — "kesin plan sözleşme adımında oluşturulur" notuyla), doğru
  trial/formal sınıflandırma.
- Çift kayıt önleme: sunucu action zaten `withAuthContext` içinde tek seferlik çalışır; ek
  olarak `actionAddStudent` başarı sonrası HER ZAMAN `redirect()` eder (form yeniden
  gönderilemez hale gelir, tarayıcı geri tuşu yeni bir POST tetiklemez).

**"Planlanan süre" — yeni, kalıcı olmayan alan:** `Student` modeline HİÇ yazılmaz; yalnızca
`actionAddStudent`'ın ürettiği redirect query'sinde (`?yeniKayit=1&sure=N`) taşınır ve
`ContractPanel`'in `prefill.durationMonths`'unu ayarlar. Şema/migration değişikliği YOK.

## 6. Kayıt → sözleşme gözden geçir/oluştur/yazdır akışı (Faz 4)

- Formal: birincil CTA **"Sözleşmeyi Gözden Geçir ve Oluştur"** → `#sozlesme`'ye kayar, form
  ÖN DOLDURULMUŞ ve AÇIK durumda (program/aylık ücret/ödeme yöntemi/başlangıç/süre) — admin
  değerleri gözden geçirir, gerekirse düzeltir, "Ödeme Planını Önizle" ile taksit tablosunu
  görür, sonra **"Sözleşmeyi Onayla ve Oluştur"** ile onaylar (iki aşamalı: gözden geçir →
  onayla, tek tıkla "anında" oluşturma YOK).
- Trial: **"Tanışma Paketi — Formal sözleşme gerekmiyor"** + Ödeme Planını Görüntüle/Öğrenci
  Detayına Git/Yeni Kayıt Oluştur — formal sözleşme CTA'sı hiç GÖSTERİLMEZ.
- Form içinde yaşam döngüsü açıkça yazılır: *"Taslak/inceleme → Oluşturuldu → PDF önizleme →
  Yazdırıldı → Islak imza bekleniyor → İmzalandı. PDF üretimi TEK BAŞINA ıslak imza yerine
  GEÇMEZ."*
- Yenilemede: önceki sözleşmenin numarası/durumu/dönemi/tutarı özet olarak gösterilir, yeni
  dönem önceki değerlerle ÖN DOLDURULUR ("gerekirse değiştirin" notuyla), "önceki sözleşme
  değişmeden, ayrı bir sürüm olarak arşivde kalır" açıkça belirtilir.

## 7. İptal edilmiş sözleşme yenileme iş kuralı bulgusu (Faz 5)

**Mevcut kanonik politika (yeni İCAT EDİLMEDİ — `src/lib/contracts.ts` `createContract`'ta
ÖNCEDEN vardı, doğrulandı):** iptal edilmiş (`cancelled`) veya zaten yenilenmiş (`superseded`)
bir sözleşme ASLA yeniden yenilenemez — sunucu şu hatayla reddeder: *"İptal edilmiş veya zaten
yenilenmiş bir sözleşme tekrar yenilenemez."* Bu kural iptal GEREKÇESİNDEN bağımsızdır (ayrı bir
iptal-gerekçesi alanı yok, yalnızca `status` kullanılır) — ek bir alan/karar İCAT EDİLMEDİ,
mevcut politika olduğu gibi bırakıldı.

**Bulunan gerçek bug:** istemci (`contract-panel.tsx`) bu politikayı YANSITMIYORDU —
`latest = contracts.find(aktif) ?? contracts[0]` TÜM sözleşmeler iptal/yenilenmişse en son
(iptal edilmiş) olanı "önceki sözleşme" olarak seçiyor, "Sözleşme Yenile" butonunu YANILTICI
biçimde gösteriyordu.

**Düzeltme:** `findLatestActiveContractForRenewal` (yeni, `src/lib/contract-list-helpers.ts`) —
iptal/yenilenmiş bir sözleşmeyi ASLA döndürmez. Aktif sözleşme yoksa (geçmiş tamamen
iptal/yenilenmiş de olsa) buton **"Yeni Kayıt Sözleşmesi Oluştur"** olarak değişir (renewal
DEĞİL, initial) + bilgi notu: *"Bu öğrencinin aktif bir sözleşmesi yok (geçmişte iptal
edilmiş/yenilenmiş) — yeni bir İLK KAYIT sözleşmesi oluşturulacak."* "GÜNCEL" rozeti (salt
gösterim, geçmiş listesinde en yeni versiyonu işaretler) bundan AYRI bir değişkendir — hâlâ en
yeni versiyonu (durumdan bağımsız) işaretler, çünkü bu yalnızca bilgilendiricidir, bir aksiyon
tetiklemez.

## 8. Boş yenileme formu çalışma zamanı hatası — kök neden (Faz 5)

Tam kök neden zinciri:

1. `firstDueDate` state'i (`useState("")`) yenilemede DAHİ hiçbir zaman ön doldurulmuyordu.
2. `onCreate`'in erken-dönüş doğrulaması yalnızca `programmeName`/`enrollmentStartDate`/
   `signatoryFullName`'i kontrol ediyordu — `firstDueDate` (ve `monthlyAmount`,
   `installmentCount`, `paymentMethod`) HİÇ doğrulanmıyordu.
3. Doğrulamadan hemen sonra `firstDueDate: new Date(firstDueDate).toISOString()` koşulsuz
   çağrılıyordu — boş string → `new Date("")` → `Invalid Date` → `.toISOString()` →
   `RangeError: Invalid time value`, yakalanmamış bir promise reddi olarak konsola/arka plana
   düşüyordu.

Bu, "kullanıcı iş aksiyonuna bastıktan sonra yalnızca konsol/arka plan hatası görmesi" sonucunu
doğurdu — kabul edilemez, düzeltildi (bkz. §9-10).

## 9. `firstDueDate` güvenli ayrıştırma/serileştirme düzeltmesi (Faz 5B)

`src/lib/date-input.ts` (yeni, merkezi, tamamen saf, ASLA fırlatmaz):

- `parseDateOnlyInput`/`toIsoDateOrNull` — boş/undefined/null/bozuk/imkansız (ör. 30 Şubat)
  tarihler için `null` döner, hiçbir zaman `Error` fırlatmaz.
- UTC ÖĞLEN (`T12:00:00Z`) ile ayrıştırılır — saat dilimi kayması (bir önceki/sonraki güne
  düşme) yapısal olarak imkansızdır (eski kod `new Date(str).setMonth(...)` gibi UTC-ayrıştırma
  + YEREL-mutasyon karıştıran kalıplar kullanıyordu — bu da AYRI bir potansiyel kayma
  kaynağıydı, o da düzeltildi: `enrollmentEndDate` hesabı artık `setUTCMonth` kullanıyor).
- `contract-panel.tsx`'teki HER tarih dönüşümü (`enrollmentStartDate`, `enrollmentEndDate`,
  `firstDueDate`) artık bu modülden geçer — çıplak `new Date(x).toISOString()` çağrısı KALMADI.
- `isValidDateOnlyInput`/`dayOfMonthUtc` doğrulama ve ödeme-penceresi hesaplarında kullanılır.

## 10. Görünür alan doğrulaması / hata UX'i (Faz 5C/5D/5E)

- `validateForm()` (saf, component içinde) TÜM alanları kontrol eder: program, başlangıç
  tarihi, süre (1-12), aylık ücret (>0), taksit sayısı (1-12), ilk ödeme tarihi (geçerli VE —
  istisna değilse — pencere içinde), ödeme yöntemi, imzalayan ad-soyad, (yenilemede) çakışma
  izni/gerekçesi.
- Hatalar HEM alan-altı satır içi metin (`FieldError`) HEM üstte `role="alert"` bir özet olarak
  gösterilir: *"Sözleşme yenileme bilgilerini tamamlayın."* / *"Sözleşme bilgilerini
  tamamlayın."* + madde madde liste.
- Odak yönetimi: doğrulama başarısız olduğunda veya sunucu hatası döndüğünde özet kutusu
  `tabIndex={-1}` ile programatik olarak fokuslanır (`requestAnimationFrame` ile — DOM henüz
  render edilmemişken fokuslama başarısız olmaz).
- **Girilen veriler ASLA silinmez** — doğrulama/sunucu hatasında yalnızca hata gösterilir, hiçbir
  state sıfırlanmaz.
- Örnek mesajlar (şartnameyle BİREBİR): *"İlk ödeme tarihi zorunludur."*, *"Aylık ücret
  zorunludur."*, *"Ödeme yöntemi seçilmelidir."*, *"Sözleşme başlangıç tarihi zorunludur."*,
  *"Yasal imza sahibi adı soyadı zorunludur."*, *"İlk ödeme tarihi kredi kartı için ayın 1–5'i
  arasında olmalıdır veya istisna gerekçesi girilmelidir."*, *"İlk ödeme tarihi havale/EFT/nakit
  için ayın en geç 15'i olmalıdır veya istisna gerekçesi girilmelidir."*
- Buton artık yalnızca `busy` (aktif istek) iken devre dışı — "form boş başladığı için" ÖNCEDEN
  devre dışı bırakılmaz; tıklanınca doğrulama çalışır ve hataları GÖRÜNÜR yapar (sessizce hiçbir
  şey yapmaz).
- Çift tıklama koruması: `onCreate` başında `if (busy) return;`.
- Sunucu doğrulaması OTORİTE olarak kalır — istemci doğrulaması yalnızca erken/görünür geri
  bildirimdir.

## 11. Sözleşme şablonu eksik-alan kök nedeni/düzeltmesi (Faz 6)

**Gerçek kanıt (varsayım DEĞİL):** `data/document-templates.json` incelendiğinde
`tenant_nilufer_acar` için `student_enrollment_contract` türünde, **2026-08-25** tarihli (bu
oturumdan VE önceki iki oturumdan da ÖNCE oluşturulmuş), gerçekten metadata-only bir şablon satırı
bulundu: `"<h1>Öğrenci Kayıt Sözleşmesi</h1><p>Referans: {{reference}}</p>..."`. Bu, orijinal
görevde tarif edilen "metadata-only PDF" hatasının TA KENDİSİ — hiç düzeltilmemiş, hâlâ aktif.

**Kesin teşhis:** GERÇEK bir içerik eksikliği (validator YANLIŞ değil) + bir SEÇİM sırası hatası
(`templates.find()` dizi/ekleme sırasına göre İLK eşleşeni alıyordu — sonradan eklenen doğru bir
şablon dahi bu eski satırı asla "geçemezdi"). Personelin öğrenci verisini eksik girmesiyle
İLGİSİZ.

**Düzeltme:**

1. `src/lib/contract-template-schema.ts` (yeni) — TEK kaynak placeholder kaydı: her alan için
   `{key, label, required}`. Doğrulayıcı (`contracts.ts`), tanılama (`documents/index.ts`) ve
   yönetim UI'ı (`contract-template-diagnostics.tsx`) AYNI kaydı kullanır.
2. `selectActiveContractTemplate` — dizi sırası yerine **en son güncellenen** aktif şablonu
   seçer; `contracts.ts createContract` VE tanılama fonksiyonu AYNI seçiciyi çağırır (iki yer
   asla farklı bir şablon "görmez").
3. `ContractTemplateIncompleteError` artık **"Şablon Hatası:"** öneki ve Türkçe alan etiketleri
   ile başlar, mesajın kendisi *"öğrenci/veli bilgilerinin eksik girilmesiyle İLGİLİ DEĞİLDİR"*
   der — kategori karışıklığı önlenir.
4. **Yıkıcı olmayan kurtarma:** `createContractTemplateDraftFromCanonicalSource` — kod içindeki
   kanonik gövdeden (hukuki metin DEĞİŞMEDEN) yeni bir taslak oluşturur, `active:false` ile —
   mevcut aktif şablona DOKUNULMAZ. `activateTemplateExclusive` — açıkça etkinleştirir VE aynı
   tür için TÜM diğer şablonları pasifleştirir (tek-aktif garantisi, ileriye dönük).
5. `getContractTemplateDiagnostics` — hangi şablonun seçileceğini, eksik/desteklenmeyen alan
   listesini Türkçe etiketlerle döner.
6. `/panel/evraklar` → "Sözleşme Şablonları" bölümüne YENİ, her zaman görünen bir tanılama
   paneli eklendi (`ContractTemplateDiagnosticsPanel`): durum (hazır/hatalı), eksik alan listesi
   + Türkçe açıklama, "Kurumsal kaynaktan uyumlu taslak oluştur ve etkinleştir" butonu (tek
   tıkla remediasyon — admin HTML elle düzenlemek ZORUNDA değil).

**Önceki mevcut genel şablon bayrağı (`SHOW_TEMPLATE_SECTIONS = false`, kullanıcının kendi
kararıyla kapatılmış) DOKUNULMADI** — bu yeni panel ondan TAMAMEN ayrı, yalnızca sözleşme
şablonlarına kilitli (`lockKind`).

## 12. İlk kayıt vs. yenileme şablon eşlemesi

Her ikisi de AYNI `createContract`'ın `isFormal` dalından geçer, dolayısıyla AYNI
`selectActiveContractTemplate`/`validateContractTemplateBody` çağrısını kullanır — "renewal"da
FARKLI bir şablon türü/kayıt yolu YOKTUR (bildirilen sorun #5'in "yenilemede özellikle" görünme
nedeni: yenileme muhtemelen tenant'ın İKİNCİ formal sözleşme denemesiydi, ilk denemede de aynı
hata oluşurdu — şablon sorunu türden BAĞIMSIZDIR, bu artık teşhis olarak da doğrulandı).

## 13. Güvenlik/RBAC/tenant/audit davranışı

- Yeni tool'lar (`getContractTemplateDiagnosticsTool`, `createContractTemplateDraftFromCanonicalSourceTool`,
  `activateContractTemplateTool`) yalnızca `SCHOOL_ADMIN`/`SUPER_ADMIN` — testle doğrulandı
  (§16).
- Taslak oluşturma VE etkinleştirme AYRI audit kayıtları üretir
  (`document_template.create_canonical_draft`, `document_template.activate_exclusive`).
- Tenant izolasyonu: `activateTemplateExclusive`/`getTemplate` her zaman `{tenantId, id}` ile
  sorgular — başka bir kuruma ait şablon asla etkilenmez.
- İptal edilmiş sözleşme yenileme reddi RBAC'tan BAĞIMSIZ, tenant-scoped, sunucu-otorite bir
  kuraldır — istemci düzeltmesi yalnızca YANILTICI bir aksiyonun GÖRÜNMESİNİ engeller, güvenlik
  sınırı zaten sunucudaydı ve DEĞİŞMEDİ.
- Marka adı taraması (§0) — bu oturumun dokunduğu dosyalarda "Nevii Hub"/"NEVIIHUB"/"NotaPlan"/
  "Maestron" YOK.

## 14. Doğrulama/test/build sonuçları

- `npx prisma validate` → **geçti** ("The schema at prisma/schema.prisma is valid 🚀") — bu
  oturum HİÇBİR migration eklemedi (şema değişikliği yok).
- `npm run typecheck` (kök) → **0 hata** (her değişiklikten sonra tekrar tekrar doğrulandı).
- `npm --prefix apps/mobile run typecheck` → **0 hata** (mobil koda dokunulmadı).
- Bu oturumda dokunulan/eklenen dosyalara scoped `npx eslint` → **0 hata** (1 gerçek hata —
  `react-hooks/set-state-in-effect` — `contract-template-diagnostics.tsx`'te bulunup DÜZELTİLDİ;
  kalan 13 uyarı ÖNCEDEN VAR OLAN, `tools.ts`'te dokunulmayan satırlarda).
- Odaklı testler: `contracts.test.ts` → **48/48 geçti** (44 önceki + 4 yeni: iptal edilmiş
  sözleşme yenileme reddi, boş `firstDueDate` reddi/RangeError-yok, stale şablon reddi→taslak→
  etkinleştir→başarı akışı, RBAC). `date-input.test.ts` → **6/6 geçti** (yeni). `contract-list-helpers.test.ts`
  → **4/4 geçti** (yeni). `contract-template-schema.test.ts` → **8/8 geçti** (yeni).
  `write-scope-actions.test.ts` → **14/14 geçti** (regresyonsuz).
- `npm test` (kök, tam paket) → **2188/2194 test geçti (213/219 dosya), 6 başarısız.** TAMAMI
  ÖNCEDEN VAR OLAN, İLGİSİZ (`find-person-schedule`, `homework-attachment`, `lesson-scheduling`,
  `lesson-series-tools`, `lesson-update`, `program-academic-term` — önceki oturumların
  raporlarında da AYNI liste belgelenmiş; ders programlama/öğretmen müsaitliği/akademik dönem
  alanlarında, bu görevin kapsamı DIŞINDA). Dosya/test sayısındaki artış (216→219, 2172→2194)
  TAMAMEN bu oturumun kendi eklediği 3 yeni test dosyası + 4 yeni test caseiyle açıklanıyor.
  **Şeffaflık notu:** bu tam paket çalışırken (`Start at 12:45:12`, `Duration 422.70s`), AYNI
  canonical checkout'ta EŞ ZAMANLI çalışan başka bir Claude Code oturumunun (farklı bir konu —
  `getRenewalDebtStatusTool` — üzerinde, `src/lib/services/tools.ts`/`src/lib/__tests__/contracts.test.ts`'e
  yazdığı) tespit edildi (bkz. `ps aux`, dosya mtime'ları 12:48-12:52). Bu OLASI bir kirlenme
  riski yarattığından, bu oturumun KENDİ dosyaları (`contracts.test.ts`, `date-input.test.ts`,
  `contract-list-helpers.test.ts`, `contract-template-schema.test.ts`, `write-scope-actions.test.ts`)
  tam paketten SONRA, izole olarak TEKRAR çalıştırıldı: **5/5 dosya, 84/84 test geçti, 0
  başarısız** — hem bu oturumun eklediği testler hem diğer oturumun eş zamanlı eklediği testler
  bu anlık görüntüde ÇAKIŞMADAN birlikte geçiyor. Diğer oturumun kendi işi bu raporun kapsamı
  DIŞINDA — incelenmedi, değiştirilmedi.
- `npm run build` (kök) → **başarılı** (çıkış kodu 0), yeni rotalar dahil (`/api/v1/documents/templates/diagnostics`,
  `/api/v1/documents/templates/canonical-draft`, `/api/v1/documents/templates/[templateId]/activate`)
  hatasız derlendi.
- `npm --prefix apps/mobile test` → **77/77 geçti (12 dosya)** — mobil koda dokunulmadı,
  regresyon yok.
- `npx expo export --platform ios` (mobil) → **başarılı** — `dist/` altına iOS bundle + 42 asset,
  hata yok.
- `git diff --check` → **temiz** (boşluk/çakışma-işareti hatası yok).

## 15. Kalan hukuki/ürün engelleri

Bu oturumun kapsamında YENİ bir hukuki/ürün engeli bulunmadı. Önceki teslimatta raporlanan
madde-madde hukuki metin farkı (kök şablon vs. kod metni, Madde 4/7/18/20/23) HÂLÂ kurumun hukuk
danışmanı onayı bekliyor — bu oturum bu farka DOKUNMADI, yalnızca §11'de bulunan GERÇEK, farklı
bir sorunu (eski/eksik bir şablon SATIRI, hukuki metin farkı DEĞİL) düzeltti.

## 16. Onay ve kapsam teyidi

- ✅ **Hiçbir şey stage edilmedi** (`git add` çalıştırılmadı).
- ✅ **Hiçbir commit oluşturulmadı, push yapılmadı, deploy edilmedi.**
- ✅ **Hiçbir shared/staging/production migration uygulanmadı** — bu oturum zaten hiç migration
  EKLEMEDİ.
- ✅ **Başka bir worktree'ye DOKUNULMADI** — tüm çalışma canonical `main` checkout'unda yapıldı.
- ✅ Hiçbir hukuki metin değiştirilmedi (yalnızca kod metninin EKSİK olup olmadığı kontrol
  edildi, içerik AYNEN korundu — kurumsal kaynak taslağı da BİREBİR mevcut kod sabitinden
  üretilir).
- ✅ Paket/bundle ID'leri, veritabanı tablo/model adları, migration adları, storage yolları,
  ortam değişkeni adları, OAuth ayarları, Vercel/Supabase referansları DEĞİŞTİRİLMEDİ.

## 17. Manuel admin kabul kontrol listesi

- [ ] Standart kredi kartı kaydı oluştur (ilk ödeme günü 1-5 arası) — istisna alanı GÖRÜNMEZ.
- [ ] Standart EFT/havale/nakit kaydı oluştur (ilk ödeme günü ≤15) — istisna alanı GÖRÜNMEZ.
- [ ] Geçerli bir ilk-ödeme istisnası oluştur, gerekçesini gir — kabul edilir, audit'te görünür.
- [ ] Ödeme yöntemini/tarihini tekrar tekrar değiştir — istisna alanı HER SEFERİNDE doğru
      görünür/kaybolur (stale kalmaz).
- [ ] Yeni kayıt oluştur — kalıcı başarı onayını GÖR (toast + panel).
- [ ] 1-2 aylık tanışma kaydı oluştur — formal sözleşme CTA'sı YOK.
- [ ] 3-12 aylık formal kayıt oluştur — "Sözleşmeyi Gözden Geçir ve Oluştur" akışını izle.
- [ ] Sözleşme oluşturmadan/yazdırmadan ÖNCE gözden geçirme ekranını incele.
- [ ] Bir sözleşmeyi iptal et, doğru yenileme uygunluğu davranışını doğrula (Yeni Kayıt
      Sözleşmesi Oluştur gösterilmeli, YANILTICI "Yenile" değil).
- [ ] Yenilemeyi aç, alanları BOŞ bırakıp "Tamamla"ya tıkla.
- [ ] Görünür alan hatalarının GÖRÜNDÜĞÜNÜ ve konsolda çalışma zamanı hatası OLMADIĞINI doğrula.
- [ ] Alanları düzelt, geçerli yenilemeyi tamamla.
- [ ] Kasıtlı olarak eksik bir şablonun GÜVENLİ biçimde engellendiğini doğrula
      (Şablon Hatası + "kurumsal kaynaktan taslak oluştur" akışı).
- [ ] Geçerli bir formal yenileme sözleşmesini oluştur/önizle/yazdır.

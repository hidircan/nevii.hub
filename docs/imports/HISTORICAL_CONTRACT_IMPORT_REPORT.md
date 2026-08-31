# Tarihi Sözleşme Toplu CSV İçe Aktarımı

## DURUM: TAMAMLANDI, TEST EDİLDİ (120 satırlık gerçek uçtan uca testle kanıtlandı)

## 1. Bağlam

Sahibi, önceki turda eklenen tek-dosya-tek-öğrenci elle yükleme akışını
("Tarihi Sözleşme Aktarımı", `DocumentDirectUploadForm` tabanlı) yetersiz
buldu ve bunun yerine: sözleşme oluşturma ekranındaki alanlarla aynı
kolonlardan oluşan, kendi hazırladığımız bir CSV şablonuyla, TEK seferde
en az 100 satır toplu içe aktarım istedi. Bu rapor bu yeni özelliği belgeler
— önceki tek-dosya akışı KALDIRILDI, yerine bu geldi.

## 2. Tasarım kararı — neden `createContract()` değil

Sistemdeki canlı sözleşme oluşturma hattı (`createContract`,
`src/lib/contracts.ts`) kasıtlı olarak SIKI mali doğrulama yapar: ilk ödeme
tutarının hesaplanan 1. taksitle birebir eşleşmesi, ödeme penceresi (kart
1–5, diğer 1–15) kontrolü, yenileme borç kapısı vb. Bu kurallar YENİ, CANLI
kayıtlar için doğrudur. Geçmişte sistem DIŞINDA zaten gerçekleşmiş, gerçek
tarihi verileri bu hatta zorlamak, verinin çoğunu REDDETMEK anlamına
gelirdi (tarihler bugünün ödeme penceresiyle uyuşmaz, tutarlar yıllar
içinde değişmiş olabilir vb.).

Bunun yerine her CSV satırı doğrudan bir **arşiv `DocumentInstance`**
(kind=`student_enrollment_contract`, `status: "uploaded"` — sistem dışından
kaynaklanan belgeler için zaten kullanılan durum) olarak oluşturulur:
- Hiçbir `StudentContract` satırı YARATILMAZ.
- Hiçbir `Payment`/taksit satırı YARATILMAZ.
- Aktif şablon (varsa) yalnızca GÖRÜNTÜLEME/render için kullanılır — hiçbir
  şablon otomatik etkinleştirilmez/değiştirilmez.
- Islak imza durumu ASLA dosyadan varsayılmaz — CSV'nin kendi
  `belge_durumu` beyanı (arsiv_belgesi / imzali_nusha_mevcut /
  imza_durumu_bilinmiyor) aynen kaydedilir.

## 3. CSV şablonu

Kolonlar (`src/lib/import/historical-contracts.ts`,
`HISTORICAL_CONTRACT_CSV_COLUMNS`), sözleşme oluşturma ekranının girdi
alanlarıyla birebir:

```
ogrenci_adi, ogrenci_kodu, sozlesme_turu, program_adi, baslangic_tarihi,
bitis_tarihi, sure_ay, aylik_ucret, taksit_sayisi, odeme_yontemi,
veli_ad_soyad, sozlesme_tarihi, belge_durumu, not
```

- `ogrenci_adi`/`ogrenci_kodu`: mevcut ders programı/öğrenci CSV
  içe aktarımlarıyla AYNI eşleştirme mantığı (`resolveStudentForScheduleRow`,
  `src/lib/import/branch-lookup.ts`, yeniden kullanıldı) — aynı adda birden
  fazla aktif öğrenci varsa "Ad Soyad (kod)" biçimi veya kod kolonu zorunlu,
  tahmin YAPILMAZ.
- `sozlesme_turu`: ilk/yenileme/degisiklik.
- `odeme_yontemi`: nakit/havale/kredi_karti.
- `belge_durumu`: arsiv_belgesi/imzali_nusha_mevcut/imza_durumu_bilinmiyor
  (görev talimatındaki 3 durumla birebir).
- Tüm tarihler `yyyy-aa-gg` — diğer tüm CSV içe aktarımlarıyla tutarlı.

Örnek şablon dosyası indirilebilir (`CsvImportSection` bileşeni üzerinden,
mevcut diğer içe aktarımlarla AYNI "Örnek CSV İndir" mekanizması).

## 4. Satır başına oluşturulan belge

- Başlık (`titleMain`), mevcut `contractTitleFields()` fonksiyonuyla
  üretilir — **öğrenci adını içerir** (ör. "Öğrenci Kayıt Sözleşmesi —
  Deniz Ak"), bu sayede belge listesinde hangi öğrenciye ait olduğu
  isimden bile anlaşılır (Evraklar Merkezi'nin belge tablosu zaten ayrıca
  öğrenci adı/tarih kolonlarını da gösteriyor).
- `titleSub`'a "İçe Aktarılan Tarihi Kayıt · <belge durumu>" eklenir —
  canlı üretilen bir sözleşmeyle KARIŞTIRILMAZ.
- Taksit tarihleri, mevcut `buildInstallmentSchedule()` (aynı saf fonksiyon,
  canlı sözleşmelerle AYNI) ile `sozlesme_tarihi`nden başlayarak hesaplanır
  — tahmini ama tutarlı bir taksit dökümü verir; hesaplanamazsa (bozuk veri)
  sessizce boş bırakılır, belge yine de oluşturulur.
- Kullanılmayan taksit satırları (12'den az ay için) aynı
  `stripUnusedInstallmentRows` düzeltmesiyle (bkz.
  `CONTRACT_CENTER_HYDRATION_DATE_HOTFIX_REPORT.md`'den bağımsız, önceki
  turun P0 baskı düzeltmesi) temiz görünür.

## 5. Doğrulama ve hata davranışı

- Önizleme (`previewHistoricalContractImportTool`) her satırı ayrı ayrı
  doğrular, hata varsa satır+alan+açık Türkçe mesaj döner — hiçbir yazma
  YAPMAZ.
- Commit (`commitHistoricalContractImportTool`): CSV'de TEK bir hatalı satır
  bile varsa **hiçbir kayıt eklenmez** (tüm-veya-hiç, diğer içe aktarımlarla
  AYNI davranış).
- Yalnızca SCHOOL_ADMIN/SUPER_ADMIN çalıştırabilir.

## 6. Kapasite doğrulaması — 100+ satır

Yeni test dosyası `src/lib/__tests__/historical-contract-import.test.ts`,
**120 satırlık** gerçek bir CSV'yi hem önizleme hem commit ile uçtan uca
test eder: `totalRows=120`, `validCount=120`, `errorCount=0`,
`created=120`, ve gerçekten 120 ayrı `DocumentInstance` satırının
oluştuğu doğrudan `listDocumentInstancesTool` ile doğrulanır. Ayrıca:
tek hatalı satırın tüm import'u reddettiği, `StudentContract` dosyasına
hiç yazılmadığı (doğrudan dosya okunarak), RBAC, ve 6 farklı geçersiz-alan
senaryosu (tür/tarih/süre/tutar/ödeme yöntemi/belge durumu) test edildi.
**14/14 test geçti.**

## 7. Veri Aktarım Merkezi UI değişikliği

`src/app/panel/veri-aktar/page.tsx` — "5. Tarihi Sözleşme Aktarımı" bölümü,
önceki `DocumentDirectUploadForm` (tek dosya, tek öğrenci) yerine mevcut
`CsvImportSection` bileşenini (diğer 4 içe aktarımla AYNI, tutarlı UX —
sürükle-bırak, örnek CSV indir, önizleme, hata listesi, commit) kullanacak
şekilde DEĞİŞTİRİLDİ.

## 8. Kesin doğrulamalar

- Hiçbir migration gerekmedi (yalnızca `DocumentInstance.status` alanına
  zaten var olan `"uploaded"` değeri kullanıldı, şema değişmedi).
- Hiçbir şablon otomatik etkinleştirilmedi.
- Hiçbir tarihi/mevcut `DocumentInstance`/`StudentContract` verisi
  değiştirilmedi — bu özellik yalnızca YENİ arşiv kayıtları EKLER.
- `tsc --noEmit`, hedefli `eslint`, `next build`, `prisma validate` temiz;
  ilgili testler (14 yeni + mevcut CSV import testleri) geçti.

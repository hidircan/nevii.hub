# İlk Ödeme Çift Kayıt Önleme — Regresyon Doğrulaması (2026-08-30)

## Bağlam

Ayrı bir P0 görevinde (bu görevden ÖNCE, aynı gün) "kayıt anında tahsil edilen ilk ödeme ile
sözleşme oluşturma anında tahsil edilen ilk ödeme arasında çift `Payment` kaydı" sorunu tespit
edilip düzeltildi:
`docs/roadmap/NEVIIHUB_ADMIN_CONTRACTS_POLICY_REMAINING_WORK.md`'nin "P1 — İlk ödeme ASIL kayıt
sınırına taşındı" bölümü bu sorunu ÇÖZÜLMEMİŞ olarak işaretliyordu — bu görev sırasında bölüm
GÜNCELLENDİ (TAMAMLANDI olarak işaretlendi, bkz. o dosyadaki güncel not).

Bu rapor, Faz 4 talimatı gereği (şablon seçimi P0 işiyle AYNI oturumda) o düzeltmenin HÂLÂ doğru
çalıştığını, bu görevdeki şablon-seçimi değişikliklerinin onu BOZMADIĞINI doğrular.

## Nihai politika (owner, final) — özet

1. İlk ödeme kayıt tamamlanma anında alınır (`createStudentTool`).
2. Kayıt hangi gün yapılırsa yapılsın (1–31) ilk ödeme o gün alınabilir.
3. İlk ödeme NORMALDİR — istisna değildir.
4. Kayıt tarihi ile ders/eğitim başlangıç tarihi (`enrollmentStartDate`) FARKLI olabilir — bu fark
   ASLA bir istisna/gerekçe gerektirmez.
5. Normal yeni öğrenci kayıt ekranında "İstisnai ilk ödeme tarihi gerekçesi" alanı GÖSTERİLMEZ.
6. `createStudentTool` ve `createContract` (initial sözleşme) İKİ AYRI `Payment` kaydı OLUŞTURMAZ
   — aynı kaydı paylaşır.

## Kod kanıtı (bu görevde YENİDEN okunarak doğrulandı, değiştirilmedi)

- `src/lib/services/tools.ts` `createStudentTool` — `firstPaymentCollected` zorunlu, tutar
  `pricing.monthlyFee` ile eşleşmeli; `enrollmentStartDate` karşılaştırması ve
  `firstPaymentExceptionReason` zorunluluğu YOK (kaldırılmış durumda kalıyor — bu görevde tekrar
  eklenmedi). `addRegistrationFirstPayment` — `(studentId, source:"registration_first_payment")`
  doğal anahtarıyla İDEMPOTENT (retry/çift gönderim ikinci satır YARATMAZ).
- `src/components/new-student-form.tsx` — "İstisnai ilk ödeme tarihi gerekçesi" alanı formda
  YOK (grep ile doğrulandı: `firstPaymentExceptionReason` bu dosyada bulunmuyor).
- `src/lib/contracts.ts` `createContract` — `contractType==="initial"` için `firstPaymentCollected`
  input'unu KULLANMAZ; `getRegistrationFirstPayment(studentId)` ile kayıt anındaki ödemeyi BULUR,
  tutarını hesaplanan 1. taksitle karşılaştırır, `addContractInstallments`'a
  `reuseFirstPaymentId` ile REFERANS verir. `contractType==="renewal"` için bu değişmedi (yenileme
  kendi yeni tahsilat anıdır, kayıt anındaki ödemeden BAĞIMSIZDIR — kasıtlı ürün kararı).
- `src/lib/store-json.ts` / `store-db.ts` / `store-memory.ts` `addContractInstallments` — sequence
  1 için `reuseFirstPaymentId` verilmişse YENİ `Payment` satırı YARATMAZ; mevcut satırı
  `contractId`/`installmentSequence=1` ile GÜNCELLER (link). Üç store modu (json/db/memory)
  paritesi korunuyor.

## Bu görevde şablon-seçimi değişikliğinin ödeme mantığına etkisi

**HİÇBİR ETKİ YOK.** `selectEligibleActiveTemplateForContract` yalnızca HANGİ şablon
kullanılacağını belirler — `createContract` içindeki ödeme/taksit/first-payment-reuse mantığı
(`registrationFirstPayment` bulma, `addContractInstallments` çağrısı) şablon seçiminden TAMAMEN
BAĞIMSIZ, ayrı kod bloklarıdır (satır sırası: önce ödeme doğrulaması + taksit hesaplama, SONRA —
yalnızca `isFormal` ise — şablon seçimi/render). Şablon bulunamazsa (`no_active_template`) hata
şablon render adımında fırlatılır — bu noktada ödeme/taksit ZATEN hesaplanmış durumdadır ama
`createContract` TÜMÜYLE throw eder (transaction'ın hiçbir parçası kalıcı yazılmaz, fonksiyon en
sonda tek seferde satırları yazıyor) — yani "ödeme reuse edildi ama sözleşme şablon hatasından
oluşmadı" gibi yarım bir durum OLUŞMAZ.

## Regresyon testi (Faz 4 talimatı — entegrasyon testi)

`src/lib/__tests__/contracts.test.ts` içinde bu tam uçtan uca akışı zaten kapsayan testler
MEVCUT ve bu görevde TEKRAR ÇALIŞTIRILARAK doğrulandı (67/67 geçti):

- `"registration first payment: kayıt anında tahsil edilen ödeme sözleşme oluşturunca YENİDEN
  KULLANILIR — tek gerçek Payment satırı, ikinci kez oluşmaz/paid yapılmaz/toplama iki kez
  eklenmez"` — kayıt → ilk ödeme → sözleşme → **AYNI** `Payment.id`'nin `installments[0].paymentId`
  ile eşleştiğini, store'da `source:"registration_first_payment"` olan satırın TEK olduğunu,
  `source:"contract" && installmentSequence===1` olan İKİNCİ bir satırın OLUŞMADIĞINI doğrudan
  store'dan okuyarak doğrular.
- `"retry/double submit idempotent"` — aynı kayıt ödemesi tekrar seed edilse bile TEK satır
  kaldığını doğrular.
- `"P0 selection fix (2026-08-30) — DAHA YENİ ama HENÜZ AKTİFLEŞTİRİLMEMİŞ bir taslak..."`
  (bu görevde eklendi) — AYNI akışı (kayıt → ilk ödeme → sözleşme), BİRDEN FAZLA şablon (biri
  aktif+eski, biri taslak+yeni) varken çalıştırır ve şablon seçiminin ödeme-reuse mantığını
  BOZMADIĞINI birlikte doğrular — tam olarak Faz 4'ün istediği "registration → first payment →
  contract generation → template selection → payment reuse" zincirini TEK testte kapsar.
- `"FORMAL (>=3 ay) kayıt, öğrencinin kayıt anında tahsil edilmiş ödemesi... YOKSA REDDEDİLİR"`,
  `"kayıt tarihi ile enrollmentStartDate... FARKLI olsa da istisna/gerekçe GEREKTİRMEZ"` — final
  politika maddeleri 1-4'ü doğrular.
- `src/lib/__tests__/registration-first-payment-boundary.test.ts` (8/8 geçti) — kayıt tamamlanma
  sınırını (`createStudentTool`) doğrular; ayın 1'i/31'i kabul, istisna gerekçesi GEREKMEZ.

## Sonuç

**Regresyon YOK.** Final politika (madde 1-6) bu görevden ÖNCE zaten doğru uygulanmıştı; bu
görevdeki şablon-seçimi sertleştirmesi ödeme/taksit/reuse mantığına DOKUNMADI ve mevcut/yeni
testler bunu doğruluyor. Ödeme mantığı kodunda bu görevde HİÇBİR SATIR değiştirilmedi — yalnızca
regresyon DOĞRULANDI.

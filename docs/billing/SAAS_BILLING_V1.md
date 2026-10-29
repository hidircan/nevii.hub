# SaaS Abonelik ve Otomatik Tahsilat Katmanı — V1

Tarih: 2026-10-26 · Branch: `feat/saas-billing-v1` · HEAD: `fbe6f63`
Durum: local'de geliştirildi + hedefli test edildi. **Gerçek provider sandbox
E2E'si ve canlı tahsilat, owner'ın ayrı production onayı + merchant bilgileriyle
bekliyor. Mock testler gerçek tahsilat kanıtı DEĞİLDİR.**
Bu teslim "satışa hazır" veya nihai sağlayıcı kararı verilmiş olarak
KAPATILMAMIŞTIR — bkz. §7 revizyon (R1): PayTR birinci hedef, domain
fintech-bağımsız, QNBpay bekleniyor, iyzico alternatif.

## 1. Kapsam (çalışan)

- Tek paket/fiyat kaynağı: mevcut `commercial-catalog` genişletildi (aylık/
  yıllık, TRY minor-unit, KDV-hariç gösterim, sürüm, onaylı/taslak ayrımı).
  Onaylı fiyat yoksa tutar uydurulmaz, gerçek checkout kapalıdır.
- Abonelik durum makinesi: pending/trialing/active/past_due/suspended/
  canceled/expired; paidThrough, trial, cancelAtPeriodEnd, dönem uzatma,
  upgrade (ödeme doğrulanmadan hak yok), downgrade (sonraki dönem), yıllık
  koruma, iade/chargeback ayrı kayıt.
- iyzico Abonelik sandbox istemcisi (Checkout Form hosted, kart sunucuya
  gelmez; NON-3DS bilinçli olarak yok) + mock provider (etiketli).
  İmza: resmi abonelik V3 formülü (Ekim 2026'da docs.iyzico.com'dan doğrulandı).
- Webhook inbox (idempotent), sıra koruması, başarısız iş görünürlüğü,
  ölçülü mutabakat (manuel, parti 25).
- Enforcement: varsayılan KAPALI (legacy/managed); kurum bazlı açma + audit;
  HYPER_ADMIN muaf; API + panel + öğrenci/öğretmen portalleri kapsanır;
  ödeme/kart/destek yolları açık; güvenli kısıt ekranı (finansal detay yok).
- 30 günlük deneme: herkese açık `/deneme` başvurusu → NeviiOS onayı →
  güvenli davet akışı → deneme; kart istenmez; abuse/rate-limit; e-posta hash'li.
- Pilot kampanya: sunucu-içi kod, zorunlu kurum bağı, süre/yenileme/kullanım
  sınırları, sonrası fiyat notu. Public kupon yok.
- NeviiAds köprüsü: varsayılan KAPALI, tek işlemlik aktarım, dar alan seti,
  idempotent, jeton-hash auth, dosya yüklemez. NeviiAds'e dokunulmadı (local).
- Ekranlar: `/abonelik` (sahip), `/abonelik/davet`, `/abonelik/sonuc`
  (asla "ödendi" iddia etmez), `/platform/fatura` (NeviiOS), `/deneme`.
- E-postalar: mevcut transport + test koruması (`SAAS_EMAIL_LIVE`); dekont ≠ fatura.

## 2. Kanıt ayrımı

| Tür | Durum |
|---|---|
| Birim/hedef test (51 test, mock) | ✅ geçti (local) |
| typecheck / lint (kapsam) / prisma validate / build | ✅ geçti |
| Gerçek iyzico sandbox E2E (checkout → webhook → yenileme) | ❌ YAPILMADI — merchant anahtarları owner'da |
| Canlı tahsilat / enforcement / fiyat yayını | ❌ YAPILMADI — ayrı onay gerekir |

## 3. Ölçülen ek yük (sentetik, local — fatura ölçümü değildir)

- Teklif aktarımı: 2–3 okuma + 1 yazma; istek 237 B, yanıt 187 B.
- Kayıt: abonelik ~1.063 B, webhook ~486 B (8 KB üst sınır), deneme ~385 B.
- Yeni cron/polling/Realtime/senkron: YOK. Mutabakat manuel, parti 25.
- Enforcement bayrağı 30 sn TTL önbellekli; karar her istekte taze.
- Düşük kullanım tahmini (100 kurum, 100 webhook/ay): ~50 KB/ay yeni satır +
  istek başına 1 ayar okuması (önbellekli). Garanti değildir.

## 4. UAT listesi (local, mock provider)

1. `SAAS_BILLING_PROVIDER=mock npm run dev` → `/deneme` başvuru gönder.
2. NeviiOS `/platform/fatura` → başvuruyu onayla.
3. Kurum davetiyle tenant aç → sahip olarak giriş → `/abonelik` → denemeyi başlat.
4. `/abonelik` → paket/periyot seç → koşulları onayla → MOCK checkout formunu gör.
5. Mock retrieve sonrası `/abonelik/sonuc?status=pending` → "doğrulama bekleniyor".
6. İmzalı success webhook'unu sandbox anahtarlarıyla gönder → active + paid-through.
7. Aynı webhook'u tekrar gönder → duplicate, ikinci hak yok.
8. Sahte imzalı webhook → 401, durum değişmez.
9. Failure webhook → past_due; kart güncelleme formunu aç.
10. İptal et → canceled + paid-through korunur; erişim dönem sonuna kadar sürer.
11. Yeniden etkinleştir → pending (ödeme doğrulanmadan hak yok).
12. NeviiOS'tan enforcement aç → panel/ogrenci/ogretmen kısıt ekranını gör.
13. Ödeme sonrası erişimin otomatik açıldığını doğrula (≤30 sn).
14. Pilot kampanya oluştur → yanlış kurumla kullanmayı dene → reddedilir.
15. NeviiAds aktarımını kapalıyken dene → 403; açıp aynı teklifi iki kez aktar → idempotent.

## 5. Canlı tahsilata geçiş için kalanlar (owner onayı gerekir)

- [ ] iyzico merchant: API/secret key + merchant ID + "Merchant Subscription Notifications" URL'i + V3 imza özelliği (entegrasyon@iyzico.com).
- [ ] iyzico panelinde ürün + planlar (aylık/yıllık) → `IYZICO_SUBSCRIPTION_PLAN_REFS`.
- [ ] Onaylı ticari fiyatlar katalogda yayınlanır (fiyat onayı olmadan checkout kapalı kalır).
- [ ] Sandbox E2E: checkout → callback retrieve → webhook → yenileme → kart güncelleme → iptal.
- [ ] İzole test DB + Preview hedefi doğrulanır (test.neviihub.com prod'a redirect — KULLANILMAZ); migration yalnızca oraya, onaylı uygulanır.
- [ ] SMTP (`info@neviihub.com`) + `SAAS_EMAIL_LIVE`/`ALLOWLIST` kararı.
- [ ] Hukuki metinler (yenileme/iptal, vergi, KVKK, iade politikası) incelemesi.
- [ ] Enforcement'ı pilot kurumda açma kararı + kota başlığı değerlendirmesi.
- [ ] E-fatura/e-arşiv ihtiyacı ayrı karar (V1'de yok; "fatura kesildi" üretilmez).

## 6. Bilinen sınırlar / riskler

- iyzico kodu henüz sandbox görmedi; kart-güncelleme ve retrieve yanıt şekilleri E2E'de doğrulanmalı.
- Trial rate-limit süreç-içi (V2: dağıtık).
- Deneme bitiş uyarılarının zamanlanmış gönderimi yok (bilinçli: yeni cron
  açılmadı; `shouldSendTrialReminder` + `sendTrialReminderEmail` hazır,
  zamanlama SMTP kararıyla birlikte owner onayı bekler).
- Offline mobil hakkı: istemci en fazla 24 saat önbellekler (istemci sürümüyle duyurulur).
- `apps/mobile` lint hatası pre-existing (dokunulmadı).

---

## 7. Revizyon R1: fintech-bağımsız domain + PayTR birinci hedef (local, commitsiz)

Tarih: 2026-10-26 · Aynı branch, V1 commit'leri korunur (`8e65b743`,
`44f41802` geri alınmadı/değiştirilmedi). Yeni commit/push/merge/deploy
YOK — açık onay bekleniyor. Migration uygulanmadı (izole test DB + onay
bekliyor). iyzico adaptörü silinmedi, alternatif olarak duruyor.

### 7.1 Ortak domain'de kalanlar / adaptöre taşınanlar / PayTR eksikleri

- Ortak domain (`subscriptions`/`collections`/`periods`/`store`/`catalog`):
  abonelik durumları, paidThrough/dönem matematiği (takvim ayı/yılı, tz-aware),
  fiyat snapshot, entitlement kararı, webhook inbox, enforcement, deneme,
  kampanya, NeviiAds köprüsü. Sağlayıcı adı içermez.
- Adaptöre taşınanlar (`provider-adapter` + `iyzico-subscription` +
  `paytr-subscription`): durum eşlemesi (`mapStatus` her adaptörde),
  checkout başlatma/retrieve, iptal/retry, kart güncelleme formu,
  PayTR server-charge + durum sorgusu + kart listesi, callback doğrulama.
  Desteklenmeyen işlem taklit edilmez (`capability` + `UNSUPPORTED`).
- PayTR için eksikler (kod HAZIR, gerçek doğrulama YOK): merchant
  bilgileri + Direkt API/kart-saklama/Non3D hesap yetkileri; CAPI LIST
  yanıt şekli; `wait_callback` akışı; sandbox E2E.

### 7.2 Çalışan kapsam (R1, local)

- Yürütme modeli: iyzico `PROVIDER_MANAGED` (uygulamada ikinci çekim YOK),
  PayTR `MERCHANT_SCHEDULED` (dayanıklı job + idempotency + uzlaştırma-önce-retry).
  Aynı dönem iki modelce çekilemez (deterministik idempotencyKey + dönem
  tek-success + kısmi unique index + süreç-içi kilit).
- Her abonelik kendi sağlayıcı/merchant kaydını taşır; global varsayılan
  yalnız YENİ abonelikler içindir; eski işlemler eski adaptöre gider.
- PayTR: ilk kart kaydı doğrudan PayTR'ye POST (PAN/CVV sunucuya uğramaz),
  Bildirim URL doğrulaması (HMAC), durum sorgusu, kayıtlı-kart çekimi,
  `user_ip`/tutar/para-birimi dönüşümleri belgeye göre. Yetki yoksa fail-closed.
- Tahsilat job: yetkili endpoint + Vercel cron (günlük, parti 25, dry-run
  varsayılan), indeksli vade sorgusu, kart çözümü (tek CVV'siz kart),
  timeout→belirsiz→uzlaştırma, kör retry yok.
- Manuel mutabakat: HYPER_ADMIN onayı (referans+tutar+para birimi+tarih+
  açıklama), referans tekilliği, "ödedim" beyanı açmaz, dekont≠fatura,
  manuel kanal otomatik abonelik diye gösterilmez.
- TRY+USD ayrı fiyat kayıtları (FX uydurma yok), tr-TR/en-US, IANA timezone,
  ay-sonu/Atlanta-DST testleri. QNBpay: adaptör YOK (bekleniyor, ekranda
  gösterilmiyor). Stripe/Creem/vergi servisi eklenmedi.

### 7.3 Kanıt ayrımı (R1)

| Tür | Durum |
|---|---|
| Hedef test (93 billing testi / 8 dosya: 46 R1 + 47 V1-komşu, mock/json-store) | ✅ geçti (local) |
| typecheck / lint (kapsam) / prisma validate / build | ✅ geçti |
| Tam süit regresyon karşılaştırması | ✅ 3770 geçti / 23 hata — 23'ü de V1 commit'indekiyle dosya-dosya aynı (1/1/4/1/3/1/11/1), pre-existing; yeni regresyon YOK (R1 money regresyonu yakalanıp düzeltildi) |
| Gerçek PayTR sandbox E2E | ❌ YAPILMADI — merchant + yetki owner'da |
| Gerçek iyzico sandbox E2E | ❌ YAPILMADI — merchant owner'da |
| Canlı tahsilat / migration / enforcement / fiyat yayını | ❌ YAPILMADI — ayrı onay gerekir |

### 7.4 Şema + migration değişiklikleri (uygulanmadı)

- `SaasSubscription`: `executionModel`, `merchantAccount`, `providerCardRef`,
  `providerLinks` (JSON), `billingTimeZone`, `billingEmail`, `billingUserIp` +
  `(executionModel, currentPeriodEnd)` indeksi.
- `SaasCollectionAttempt`: `debtKey`, `provider`, `merchantAccount` +
  `debtKey` indeksi, `(provider, providerRef)` indeksi, dönem başına tek
  success kısmi unique indexi.
- Prisma client local'de yeniden üretildi (`prisma generate`); DB'ye
  dokunulmadı.

### 7.5 UAT düzeltmeleri (H)

- "İmzalı success webhook gönder → active" adımı YALNIZCA mock/local
  içindir. Gerçek ortamda esas olan: doğrulanmış callback + işlem bağlamı
  (kayıtlı deneme/sipariş eşleşmesi) + sağlayıcının gerekli sorgulama akışı.
  Kendi ürettiğimiz callback gerçek ödeme kanıtı DEĞİLDİR.
- "Ödeme sonrası ≤30 sn'de açılır": yalnızca ölçülen local koşullarda
  (webhook işleme + önbellek TTL); sağlayıcı bildiriminin geliş süresine
  dair koşulsuz garanti VERİLMEZ.
- Job UAT: `platform/jobs/saas-collections?dryRun=1` (güvenli) →
  `apply=1&limit=5` (izole test DB + sandbox, onaylı).
- Enforcement + NeviiAds aktarımı varsayılan KAPALI; tolerans 0 gün
  (ticari onay değil, pilot kararı bekliyor).

### 7.6 Yeni ek yük (R1, ölçülmedi — canlı öncesi ölçüm şart)

- Günlük 1 cron tetiklemesi (parti ≤25): 1 vade sorgusu (indeksli) +
  vadesi gelen başına ≤2 okuma + 1 çekim + durum sorgusu (belirsizde).
- PayTR callback: imza doğrulama + 1 deneme okuması + idempotent uygulama.
- Yeni ücretli servis/plan/bucket açılmadı.

### 7.7 QNBpay + MoR bekleyenleri

- QNBpay: teknik doküman, test hesabı, otomatik-tahsilat/API yetkileri,
  LinkPOS'tan ayrı değerlendirme. Adaptör/endpoint uydurulmadı.
- Atlanta/ABD: ayrı USD fiyat kayıtları hazır; ABD şirketi/Stripe hesabı
  varsayılmadı. Creem benzeri MoR geçişi yalnız API işi değildir
  (satıcı/fatura/vergi farkları kontrol listesinde).

### 7.8 Canlıya geçiş + rollback kontrol listesi (R1)

- [ ] PayTR merchant bilgileri + Direkt API/kart-saklama/Non3D yetkileri (owner).
- [ ] Sandbox E2E: kart kaydı → ilk çekim → callback → yenileme (job) →
  kart güncelleme → iptal → yanlış tutar/merchant reddi.
- [ ] İzole test DB + güvenli Preview hedefi doğrulandı; migration onaylı uygulandı.
- [ ] Vercel cron (`saas-collections`) + `BILLING_CRON_SECRET`/`CRON_SECRET`
  yapılandırıldı; kuru çalıştırma logları incelendi.
- [ ] Kota ölçümü: günlük job + callback yükü mevcut başlıkla karşılaştırıldı.
- [ ] Rollback: cron kapatılır (vercel.json revert), abonelikler
  `provider`/`merchantAccount` kayıtlarıyla eski akışta kalır; dönem
  tek-success koruması çift çekimi engeller; enforcement bayrağı kapatılır.
- [ ] Hukuki metinler + SMTP kararı + e-fatura kararı (V1 §5 ile aynı).

---

## 8. Son kabul kontrolleri (R1-C: claim, kilitler, güvenlik) — local, commitsiz

Tarih: 2026-10-26 · V1 + R1 commit'leri korundu; yeni commit/push/merge/
deploy/migration/gerçek tahsilat YOK (ayrı onay bekleniyor).

### 8.1 Bulunan açıklar ve düzeltmeler

1. **Claim yoktu (KRİTİK):** iki paralel job aynı döneme iki çekim
   gönderebiliyordu (süreç-içi kilit + sonradan index yetmezdi).
   Düzeltme: dış çağrı ÖNCESİ `claimChargeAttempt` (`store.ts`) — db'de
   abonelik satırı `FOR UPDATE` + borç başına tek açık-claim kısmi indexi,
   json'da kilitli yazım. Kaybeden worker sağlayıcıya istek GÖNDERMEZ.
   Şema: `sentAt`, `retryable` + `one_open_claim_per_debt` indexi
   (migration dosyası güncellendi, UYGULANMADI).
2. **Crash pencereleri:** claim sonrası çöküşte `providerRef` (merchant_oid)
   üzerinden uzlaştırma (`settleOpenAttempt`, `scheduler.ts`):
   gönderilmemiş-bayat → sorgu-sonrası expire; belirsiz → sorguyla
   finalize; kesinleşemeyen → 24 SAAT sonunda REVIEW (serbest kalmaz,
   operatör izni gerekir — bkz. §8.6).
3. **Yeniden-çekimde sessiz uygulanmama:** aynı deterministik key ikinci
   denemede `duplicate` dönüp aboneliği güncellemiyordu. Düzeltme:
   deneme başına key (`_n{attemptNo}`) + claim satırı finalize edilir
   (ikinci satır yazılmaz).
4. **Uzlaştırma tutar kontrolsüzdü:** sorgu `total_amount` döndürüyorsa
   claim tutarıyla karşılaştırılır; uyuşmazlık finalize EDİLMEZ
   (`MISMATCH_REVIEW`).
5. **Tekrar-denenemez sonuçta günlük kör retry:** sağlayıcı `try_again`
   hükmü `retryable` alanında saklanır; `false` ise kart güncellenmeden
   (yeni `providerLinks.cardRef`) çekim yok.
6. **Manuel-otomatik yarışı:** job claim ÖNCESİ ödenmişi görür; çekim
   SONRASI çakışma tespit edilirse kayıt korunur + dönem tek uzar +
   `saas.job.clash_review` audit'i düşer (iade incelemesi). Aynı-anda
   çift ÖDEME kanallar-arası tam engellenemez — tespit + iade süreciyle
   kapatılır (belgeye yazıldı).
7. **Canlı kilit yoktu:** `liveChargeGate` (`providers.ts`) — PayTR
   `test_mode=0` / iyzico prod URL için `SAAS_BILLING_LIVE_CHARGES=true` +
   `VERCEL_ENV=production` gerekir; Preview'de canlı çekim İMKÂNSIZ.
   Kilitli koşuda başarısız-ödeme kaydı/past_due YOK (claim expire + skip).
8. **Job secret düz karşılaştırma:** `timingSafeEqual` ile değiştirildi
   (`platform/jobs/saas-collections/route.ts`); secret loglanmaz.
9. **Yetenek ilanları yanlıştı:** iyzico `status_query`, PayTR
   `card_update_form` ilan ediyor ama desteklemiyordu. İlanlar düzeltildi;
   PayTR kart güncelleme = checkout ile borç ödemesi (belgelendi).
10. **Callback route sabit iyzico kullanıyordu:** adaptör artık aboneliğin
    kayıtlı sağlayıcısından çözülüyor (provider-pin).
11. **Geçiş sonrası eski callback reddediliyordu:** kayıtlı `providerLinks`
    bağlantısı varsa eski sağlayıcı olayı işlenir (legacy merchant
    hesabıyla doğrulanır); bağlantısız olay reddedilir.
12. **Onay kaydı yoktu:** checkout'ta ayrı `acceptedRecurring` onayı
    zorunlu + `providerLinks.consent` kaydı (kapsam/sürüm/zaman).
13. **DB okuma eşlemesi yoktu:** Prisma Date'leri ISO'ya çevrilmeden
    `as unknown` ile dönüyordu (db modunda dönem karşılaştırmaları
    bozulurdu). `mapSubscriptionRow`/`mapAttemptRow` eklendi.

### 8.2 Kanıt (dosya/fonksiyon/test)

- Claim: `store.ts:claimChargeAttempt/expireStaleClaim` + migration
  `one_open_claim_per_debt` + `scheduler.ts` (claim→charge→finalize) +
  `saas-billing-acceptance.test.ts` (paralel claim, busy/paid, expire).
- Crash/uzlaştırma: `settleOpenAttempt` + testler (timeout→uncertain→
  sorgu→charged, yeni çekim isteği SIFIR; tutar uyuşmazlığında finalize yok).
- Dry-run: route `apply=1` ayrımı + test (deneme/abonelik/e-posta değişmez).
- Auth/kilit: route 401 testleri + `liveChargeGate` testleri (bayraksız,
  preview, sandbox).
- Non-retryable + kart re-arm + manuel yarış testleri (§8.1-5/6).
- Legacy callback: `merchantForEvent` + iki yönlü test (işlenir/reddedilir).
- Toplam: 119 billing testi (9 dosya) geçti; typecheck/lint-validate/build
  geçti; tam süit aşağıda.

| Tür | Durum |
|---|---|
| Hedef test (119 billing, mock/json-store + stub fetch) | ✅ geçti (local) |
| typecheck / lint (kapsam) / prisma validate / build | ✅ geçti |
| Tam süit | ✅ 3796 geçti / 23 hata — V1 ile dosya-dosya aynı (1/1/4/1/3/1/11/1), pre-existing; yeni regresyon YOK (ara koşudaki 1 flaky `teacher-student-access` hatası bağımsız+tekrar-koşuda yok) |
| Gerçek PayTR/iyzico sandbox E2E | ❌ YAPILMADI — merchant + yetki owner'da |

### 8.3 Cron ve ortam notları (kod + Vercel davranışı)

- `vercel.json`: `30 1 * * *` = her gün 01:30 **UTC** (04:30 Türkiye).
  Vercel cron ifadeleri UTC çalışır; DST yoktur (TR zaten sabittir).
- Cron'lar SADECE production deployment'ta etkinleşir; Preview
  deployment'ları cron ÇALIŞTIRMAZ. Şu an hiçbir ortama deploy YOK →
  cron hiçbir yerde etkin DEĞİL.
- Vercel plan uyumu: repo erişiminden plan görülemez — **DOĞRULANMADI**.
  Günlük tek cron, Hobby sınırları içindedir (2 cron kotası); Pro'da
  sorun yoktur. Dashboard'dan plan + cron kotası onayı gerekir (deploy
  öncesi kontrol listesinde).
- Kaçırılan gün: vade sorgusu `currentPeriodEnd <= now` olduğundan birikmiş
  dönemler SONRAKİ koşularda parti parti (≤25/gün) çekilir; kontrolsüz
  toplu çekim YOK. En eski vade önce (`orderBy currentPeriodEnd asc`).
- Secret: `BILLING_CRON_SECRET` (≥16) veya Vercel `$CRON_SECRET`;
  secretsiz/yanlış → 401, işlem yok.

### 8.4 Rollback runbook (genişletilmiş)

Kapatma kararı sonrası sıra (owner onayı + izole ortamda prova önerilir):

1. **Yeni çekimleri durdur:** `vercel.json` saas-collections cron satırını
   kaldır (veya `apply` parametresini sil → dry-run'a düşer) + deploy.
   (Şu an deploy olmadığı için bu adım beklemede.)
2. **İşlemdeki tahsilatlar:** `pending` claim'ler 30 dk içinde ya uzlaşır
   ya expire olur; YENİ claim açılmaması için 1. adım yeterli. Acilse job
   endpoint secret'ı döndürülür (Vercel env) → cron 401 alır.
3. **Belirsiz sonuçlar:** `uncertain` satırlar durum sorgusuyla kapanır;
   kesinleşemeyen 24 SAAT sonunda REVIEW işaretlenir (otomatik serbest
   kalmaz). Kapatma `release_claim` ile olur (dış doğrulama + gerekçe +
   audit). Bu satırlar SİLİNMEZ.
4. **Bekleyen callback'ler:** endpoint'ler AÇIK kalır (eski merchant
   sırları korunur); gelen bildirimler inbox'a düşer, claim finalize eder.
   Callback kapatılmaz — kapatma = kayıp tahsilat riski.
5. **Mutabakat:** son bir `reconcileSubscriptions` + job dry-run raporu
   alınır; açıklar listelenir, manuel incelemeye düşer.
6. **Enforcement:** bayrak kapatılır (açıksa); mevcut erişimler korunur.
7. **Kayıtlar:** ödeme geçmişi, denemeler, webhook inbox ve audit
   SİLİNMEZ (muhasebe + itiraz izi). Yeni abonelik alımı durdurulacaksa
   checkout route bayrakla kapatılır (kod değişikliği + deploy, ayrı onay).
8. **Sağlayıcı tarafı:** iyzico abonelikleri provider panelinden
   askıya alınır/iptal edilir (PROVIDER_MANAGED yenilemeler uygulama
   kapalıyken de ÇALIŞIR — unutulursa çekim sürer!). PayTR'de zamanlanmış
   çekim yoktur (uygulama başlatır), ek işlem gerekmez.

### 8.5 PayTR kart-veri yolu (kanıtlı iz)

Tarayıcı → PayTR → callback → uygulama:

1. **Sunucu siparişi hazırlar** (`checkout/route.ts` → `provider-adapter`
   `initializeCheckout` → `buildPaytrCardRegisterForm`): HMAC token +
   sipariş alanları (`merchant_id/user_ip/merchant_oid/email/amount/...`).
   Kart alanı YOK; `merchant_key/salt` sunucuda kalır.
2. **Tarayıcı doğrudan PayTR'ye POST eder** (`billing-dashboard.tsx` /
   `invitation-checkout.tsx` → `https://www.paytr.com/odeme`): PayTR Direct
   API akışında kart alanları bizim sayfadaki `form_post` formunda yazılır
   ve tarayıcıdan DOĞRUDAN PayTR'ye gönderilir. PAN/CVV backend'imize,
   DB'ye, log'a GİRMEZ (POST hedefi `paytr.com`'dur); ancak yazım anında
   bizim sayfanın DOM'unda bulunur. Bu yüzden sayfada üçüncü-taraf
   analytics/session-replay/error-tracking kodu YOKTUR (doğrulandı) ve onay
   metni "kart numaram sunucularda saklanmaz" der; "kartı yalnızca
   sağlayıcı sayfasında yazarsınız" İDDİA EDİLMEZ.
3. **PayTR yönlendirir** (`merchant_ok/fail_url` → `/abonelik/sonuc`):
   YALNIZCA UX; ödeme kanıtı DEĞİL (kodda statü değiştirmez).
4. **PayTR sunucudan sunucuya bildirir** (Bildirim URL →
   `callbacks/paytr/route.ts` → `processPaytrCallback`): HMAC doğrulanır;
   gelen `utoken/ctoken` TOKEN'dır (PAN değil). Tutar/merchant/sipariş
   kayıtla eşleşirse uygulanır; yanıt gövdesi her zaman düz `OK`
   (PayTR sözleşmesi).
5. **Yakalama yüzeyleri:** repo'da analytics/session-replay/error-tracking
   bağımlılığı YOK (`package.json` + `src` tarandı); API katmanı body
   loglamaz (`api/handler.ts`); middleware yalnız auth bakar; webhook
   payload yazımında kart alanları ayıklanır (`stripCardFields`,
   `boundedPayload` 8 KB).
6. **Yetki kapıları:** merchant bilgileri + Direct/kart-saklama/Non3D
   bayrakları eksikse checkout/job AÇIK hata verir
   (`PRECONDITION_MISSING`), sessizce farklı akışa DÜŞMEZ. Eksik
   yetkiler blocker olarak döner (checkout 500/providerCode, job skip).

### 8.6 Kabul soruları C2: süre eşikleri + kilit matrisi

**Q1 — "24s kuralı"nın tam anlamı:** 24 SANİYE DEĞİL, **24 SAAT**tir
(`STUCK_CLAIM_REVIEW_AFTER_MS`, `scheduler.ts`). Eşik DOLANCA expire
OLAN kayıt yoktur — 24 saati dolduran belirsiz işlem `STUCK_REVIEW`
işaretlenir, `uncertain` kalır, yeni çekime KAPANIR. Serbest bırakma
yalnızca operatörle olur (`releaseStuckClaim` + `release_claim` action:
dış doğrulama + gerekçe + audit). Süre eşikleri tablosu:

| Eşik | Süre | Anlam | Serbest bırakır mı? |
|---|---|---|---|
| `UNCERTAIN_RECONCILE_AFTER_MS` | 5 DAKİKA | Taze deneme beklenir, sorgulanmaz | Hayır (bekler) |
| `STALE_UNSENT_CLAIM_MS` | 30 DAKİKA | Gönderilmemiş claim sorguya alınır | Sorgu "kayıt yok" derse EVET (aşağıdaki varsayımla) |
| `STUCK_CLAIM_REVIEW_AFTER_MS` | 24 SAAT | Belirsiz işlem REVIEW işaretlenir | HAYIR — operatör izni gerekir |

Kabul senaryosu testle kanıtlandı (`saas-billing-acceptance.test.ts`,
"Q1" bloğu): timeout → sorgu sonuçsuz → 25 SAAT geçse de ikinci dış
çekim SIFIR → geç başarı bildirimi claim'i finalize eder (tek hak).

**Garanti edilmeyen varsayımlar (açık liste):**

1. Durum-sorgunun "bulunamadı" cevabının, gönderilmiş bir ücreti
   gizlemediği (gönderilmemiş-claim expire'ında kullanılır). PayTR
   tarafında DOĞRULANMADI — sandbox blocker'ı, PayTR sorusu #10.
2. PayTR `test_mode=1` isteklerinin fon hareketi yaratmadığı (resmî
   belgede ima edilir, panel kaydıyla doğrulanacak — sandbox blocker'ı).
3. CAPI LIST / durum-sorgu yanıt alan adları (savunmacı parse; sandbox'ta
   doğrulanacak).

**Q2 — kilit matrisi** (`liveChargeGate`, `providers.ts`; kapılar
`provider-adapter.ts` PayTR `serverCharge`/`initializeCheckout` +
iyzico `initializeCheckout`/`retryPayment`):

| Hücre | Davranış | Test |
|---|---|---|
| A) Preview + test hesabı | `test_mode=1` → kilit AÇIK, kontrollü sandbox testi mümkün | "sandbox modu kilide takılmaz" |
| B) Preview + gerçek merchant (`test_mode=0`) | `LIVE_LOCKED` (production şartı) | "bayrak + production birlikte gerekli (preview yetmez)" |
| C) Production + bayrak kapalı | `LIVE_LOCKED`, ağ çağrısı yok | "C: production + bayrak kapalı" |
| D) Production + bayrak açık | Kilit geçer AMA yetki eksikse `PRECONDITION_MISSING`, ağ çağrısı yok | "D: …yetki eksik" + "D-karşıtı" (stub) |

**PayTR test/merchant düzeni (resmî belgeden, 2026-10-26):**

- Aynı endpoint (`www.paytr.com/odeme`) test + canlı için kullanılır;
  testlik istek bayrağıyla (`test_mode=1`) belirtilir:
  "When the merchant is in live mode, it can be sent as 1 to run a test"
  ([kayıtlı karttan ödeme](https://dev.paytr.com/en/direkt-api/kart-saklama-api/kayitli-karttan-odeme)).
- Merchant hesabının da modu vardır: test işlemleri panelden izlenir,
  ardından "Evet, Entegrasyonu Tamamladım" → PayTR incelemesi → "Canlı
  Moda Geçiş Talebi" → SMS/e-posta bildirimiyle gerçek tahsilat
  ([Direkt API canlı moda geçiş](https://dev.paytr.com/en/home/direkt-api-entegrasyon-sureci)).
- Sonuç: env adında "TEST" yazması kanıt DEĞİLDİR. Sandbox yürütme,
  merchant test modu panelden doğrulanana + test bilgileri alınana kadar
  BLOCKER'dır (kilit gevşetilmedi). Test kartları merchant panelinden
  alınır ([test kart bilgileri](https://dev.paytr.com/direkt-api/test-kart-bilgileri)).

# SESSION_HANDOFF.md

## Son oturum: 2026-10-26 — SaaS billing kabul soruları C2 (24-saat REVIEW + kilit matrisi)

**En önemli bulgu:** "24s kuralı"ndaki otomatik serbest bırakma KALDIRILDI —
gönderilmiş-belirsiz işlem artık süreyle ASLA serbest kalmıyor (24 SAAT
sonunda REVIEW + operatör izni). Kilit matrisi A–D testle kanıtlandı;
PayTR test düzeninin merchant-hesap seviyesi olduğu resmî belgeden
doğrulandı; sandbox yürütme blocker olarak duruyor. Commit YOK (onay bekleniyor).

**Yapılan iş (yalnız ilgili düzeltmeler, yeni kapsam yok):**
1. `scheduler.ts`: 24-saat auto-expire → `STUCK_REVIEW` (serbest kalmaz);
   eşik adları netleşti; claim borç-dönemiyle finalize edilir.
2. `store.ts`: `releaseStuckClaim` (yalnız uncertain, koşullu) + overview
   route'unda `release_claim` action (HYPER_ADMIN, dış doğrulama + audit).
3. Kilit testleri C/D eklendi; PayTR test/canlı düzeni dev.paytr.com'dan
   doğrulandı (belge §8.6 + rehber soru 0/10/11).
4. Doğrulama: 119/119 billing (26 kabul), typecheck + lint + build geçti.
   Final tam süit: 3796 geçti / 23 hata — V1 ile dosya-dosya aynı,
   yeni regresyon YOK (1 flaky billing-dışı hata tekrar-koşuda kayboldu).

## Önceki oturum: 2026-10-26 — SaaS billing son kabul (R1-C: claim, kilitler, güvenlik)

**En önemli bulgu:** Kabul kontrollerinde KRİTİK bir açık bulundu ve
kapatıldı — paralel job'lar aynı döneme iki çekim gönderebiliyordu.
Artık dış çağrı öncesi atomik claim var (db: `FOR UPDATE` + kısmi unique
index). 112 billing testi + typecheck/lint/build geçti; tam süit sonucu
aşağıda. Gerçek sandbox E2E hâlâ merchant + yetki bekliyor; "satışa hazır"
KAPATILMADI. Commit/push/merge/deploy/migration/gerçek tahsilat YOK.

**Yapılan iş (branch `feat/saas-billing-v1`, commit'ler korundu, push YOK):**
1. `store.ts`: `claimChargeAttempt`/`expireStaleClaim`, kilitli yazım,
   `mapSubscriptionRow`/`mapAttemptRow` (Date→ISO). Şema: `sentAt`,
   `retryable` + `one_open_claim_per_debt` (migration güncellendi, UYGULANMADI).
2. `scheduler.ts`: claim→charge→finalize, `settleOpenAttempt` (sorgu-sonrası
   expire, tutar karşılaştırma, 24s kuralı), non-retryable kapısı + kart
   re-arm, manuel-çarpışma audit'i, LIVE_LOCKED/PRECONDITION skip'i.
3. `providers.ts`: `liveChargeGate`; adapter'da PayTR + iyzico canlı
   kilitleri; yanlış capability ilanları düzeltildi.
4. Job route: `timingSafeEqual` secret; checkout: ayrı `acceptedRecurring`
   onayı + `providerLinks.consent`; callback route provider-pin;
   webhook legacy-link izni + `merchantForEvent`.
5. `docs/billing/ISOLATED_TEST_GUIDE.md` (yeni): izole DB+Preview rehberi,
   env tablosu, 9 PayTR sorusu, 15 satır test matrisi, simüle-edilemeyenler.
6. `SAAS_BILLING_V1.md` §8: 13 bulgu+düzeltme, kanıt tablosu, cron/ortam
   notları, genişletilmiş rollback runbook, kart-veri yolu izi.
7. Doğrulama: 112/112 billing (19 kabul testi dahil), typecheck + kapsam
   lint + `prisma validate` + build geçti. Final tam süit: 3789 geçti /
   23 hata — V1 ile dosya-dosya aynı, yeni regresyon YOK.

**Açık kararlar (yalnız owner):** PayTR merchant + 3 yetki; QNBpay teklifi;
onaylı fiyatlar; izole DB/Preview; Vercel plan + cron kotası onayı; SMTP +
hukuki metinler; R1-C commit onayı.

## Önceki oturum: 2026-10-26 — SaaS billing revizyon R1 (fintech-bağımsız domain + PayTR)

**En önemli bulgu:** R1 local'de tamamlandı ve 85 billing testi geçti;
ancak gerçek PayTR/iyzico sandbox E2E'si yapılmadı — merchant bilgileri +
hesap yetkileri owner'da bekliyor. "Satışa hazır" KAPATILMADI. Yeni
commit/push/merge/deploy YOK (onay bekleniyor); migration uygulanmadı.

**Yapılan iş (branch `feat/saas-billing-v1`, V1 commit'leri korundu, push YOK):**
1. Domain/adaptör ayrımı: `subscriptions`/`collections`/`periods`/`store`/
   `catalog` sağlayıcı adı içermez; `mapStatus`/checkout/iptal/kart/callback
   her adaptörde. `PROVIDER_MANAGED` (iyzico) vs `MERCHANT_SCHEDULED` (PayTR);
   desteklenmeyen işlem `UNSUPPORTED` (taklit yok).
2. PayTR adaptörü (`paytr-subscription.ts`, resmî dev.paytr.com belgelerinden):
   karta ilk kayıt doğrudan PayTR'ye POST, Bildirim URL HMAC doğrulama,
   durum sorgusu, kayıtlı-kart çekimi. Yetki yoksa fail-closed.
3. Tahsilat job (`scheduler.ts` + `platform/jobs/saas-collections` + günlük
   Vercel cron, parti 25, dry-run varsayılan): dönem tek-success
   (idempotencyKey + kısmi unique index + kilit), uzlaştırma-önce-retry.
4. Manuel mutabakat (`manual.ts` + NeviiOS formu): HYPER_ADMIN onayı,
   referans tekilliği, "ödedim" açmaz, dekont≠fatura.
5. Geçiş/Atlanta: abonelik başına provider/merchant kaydı, TRY+USD ayrı
   fiyat, tz-aware dönemler, ay-sonu/DST testleri. QNBpay adaptörü YOK
   (bekleniyor). iyzico silinmedi (alternatif).
6. Şema: `executionModel`/`merchantAccount`/`providerCardRef`/`providerLinks`/
   `billingTimeZone`/`billingEmail`/`billingUserIp`, `debtKey`, indeksler
   (migration dosyası güncellendi, UYGULANMADI; `prisma generate` local).
7. Doğrulama: typecheck + kapsam lint + `prisma validate` + build geçti;
   93 billing testi geçti (46 R1 + 47 V1-komşu, 8 dosya). Tam süit ara sonuç:
   3766 geçti / 24 hata; 1'i R1 money regresyonu (`formatMinorTR` Intl'e
   dönmüştü) — V1 biçimine döndürüldü + 3 biçim testi eklendi, düzeltme
   doğrulandı. Final tam süit: 3770 geçti / 23 hata — V1 commit'iyle
   dosya-dosya aynı, yeni regresyon YOK.
8. `docs/billing/SAAS_BILLING_V1.md` §7: denetim bulgusu, kapsam, kanıt
   ayrımı, şema deltaları, UAT düzeltmeleri, QNBpay/MoR bekleyenleri,
   go-live + rollback listesi.

**Açık kararlar (yalnız owner):** PayTR merchant + Direkt/kart-saklama/Non3D
yetkileri; QNBpay teklif/koşullar; onaylı fiyatlar; izole test DB/Preview;
SMTP + hukuki metinler; cron sırrı + kota ölçümü; pilot enforcement; R1 commit
onayı.

**Sonraki mantıklı adım:** owner PayTR bilgilerini girince sandbox E2E
(kart kaydı → çekim → callback → job yenilemesi → iptal), sonra izole
hedefe migration + Preview + UAT.

## Önceki oturum: 2026-10-26 — SaaS abonelik ve otomatik tahsilat katmanı V1

**En önemli bulgu:** SaaS billing V1 local'de tamamlandı ve hedefli testler
geçti, ancak gerçek iyzico sandbox E2E'si yapılmadı ve canlı tahsilat için
owner onayı + merchant bilgileri gerekiyor. Mock testler gerçek tahsilat
kanıtı değildir. `test.neviihub.com` prod'a 307 redirect veriyor — test
hedefi olarak kullanılamaz, deploy yapılmadı.

**Yapılan iş (branch `feat/saas-billing-v1`, commit `44f41802`, push YOK):**
1. `src/lib/saas-billing/` (12 dosya): katalog görünümü, durum makinesi,
   iyzico Abonelik istemcisi (resmi V3 abonelik imza formülü, Ekim 2026
   docs.iyzico.com'dan doğrulandı), provider adapter (iyzico/mock/none),
   webhook inbox + mutabakat, enforcement, trial, kampanya, NeviiAds
   aktarımı (varsayılan kapalı), e-postalar, özet.
2. Prisma: 6 yeni tablo + `20261026090000_saas_billing_v1` (additive,
   UYGULANMADI). Payment/Contract/Payout'a dokunulmadı.
3. API: 12 billing + 2 platform route; sayfalar: `/abonelik`, `/deneme`,
   `/platform/fatura`; enforcement `withApiHandler` + panel/portal layout'larda.
4. 8 test dosyası, 51 test — hepsi geçti. typecheck/prisma validate/build
   geçti; kapsam lint temiz (repo genelinde 1 pre-existing mobil lint hatası).
5. `docs/billing/SAAS_BILLING_V1.md`: kapsam, kanıt ayrımı, ölçüm, 15 adım
   UAT, go-live kontrol listesi. NeviiAds'e dokunulmadı; yeni cron yok.

**Çalıştırılan testler:** 51 yeni (8 dosya) + 37 rbac/api + 25 platform/
payment-hedefli = 113 geçti, 0 başarısız. Tam paket (`npm test`) rapor
sırasında arka planda koşuyordu — sonucu sohbete ayrıca bildirilecek.

**Açık kararlar (yalnız owner):** iyzico merchant bilgileri + imza özelliği;
onaylı ticari fiyatlar; izole test DB/Preview; SMTP + SAAS_EMAIL_LIVE;
hukuki metinler; pilot enforcement; e-fatura ihtiyacı.

**Sonraki mantıklı adım:** owner merchant bilgilerini girince sandbox E2E
(checkout → webhook → yenileme → kart güncelleme → iptal), sonra izole
test hedefine migration + Preview deploy + UAT.

# SaaS Abonelik ve Otomatik Tahsilat Katmanı — V1

Tarih: 2026-10-26 · Branch: `feat/saas-billing-v1` · HEAD: `fbe6f63`
Durum: local'de geliştirildi + hedefli test edildi. **Gerçek provider sandbox
E2E'si ve canlı tahsilat, owner'ın ayrı production onayı + merchant bilgileriyle
bekliyor. Mock testler gerçek tahsilat kanıtı DEĞİLDİR.**

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
- Offline mobil hakkı: istemci en fazla 24 saat önbellekler (istemci sürümüyle duyurulur).
- `apps/mobile` lint hatası pre-existing (dokunulmadı).

# Admin Mobile Parity Audit — `release/mobile-review`

- HEAD: `4a23319` (audit shell written at this HEAD; verification rerun before final commit)
- Kapsam: admin portal paritesi + 4 portal TR/EN dil seçeneği
- Yöntem: kaynak taraması (`tr()` kapsama testi + statik sözleşme testleri), `tsc`, `vitest`, `eslint`, `prisma validate`

## 1. Sonuç özeti

- Mobil vitest: **60 dosya / 428 test — tamamı yeşil** (bu tur öncesi taban: 24 dosya / 27 test kırmızıydı; tamamı statik denetimlerin i18n-öncesi literallere kilitlenmesinden kaynaklanıyordu, davranış bozukluğu değil).
- Mobil `tsc --noEmit`: temiz. Kök `tsc --noEmit`: temiz. Kök `eslint`: **0 error** (25 pre-existing warning; dokunulmayan backend dosyalarında `_input`).
- `prisma validate`: geçerli.
- i18n: `tr` kanonik, `en: Strings` derleme-zamanı paritesi; anahtar kapsama testi (`locales.test.ts`) kaynakta geçen her `tr("…")` literali için tr+en karşılığı şart koşar.
- Tespit edilen gerçek kod hatası: `app/(teacher)/bugun/index.tsx` içinde erken `return` sonrası hook çağrısı (`react-hooks/rules-of-hooks` error) — düzeltildi, lint 0 error.

## 2. Portal kapsama (TR/EN)

| Alan | Durum |
|---|---|
| Giriş akışı (welcome/login/forgot/reset/select-child), hesap/silme-talebi, bildirimler, ödeme-sonucu, değerlendirme | TR/EN, önceki commitlerde |
| Öğrenci + veli ana ekranlar (home, program, ödemeler, devam, telafi, ödev, sözleşme, gelişim, materyal) | TR/EN, önceki commitlerde |
| Öğretmen portalı tamamı (bugün, ödevler, öğrencilerim+detay, iş-takip, telafi, hakediş, müsaitlik, performans, materyaller, geri-bildirim, ödevlerim, bildirimler) | TR/EN, bu turda |
| Admin portalı tamamı (özet, program+ders detayı, kişiler+öğrenci/öğretmen detayları, yoklama, telafi, tahsilat, izinler, finans, silme-talepleri, duyurular, iş-takip, ödev-raporu, öğretmen-performans, workflows, katalog) | TR/EN, bu turda |
| API hata metinleri (`errors.ts`, `client.ts` dev tanılaması), yoklama yardımcısı (`attendance.ts`) | locale parametreli TR/EN, bu turda |
| Sunucudan gelen alan adları/değerler, bilinmeyen statü kodları | Olduğu gibi gösterilir (uydurma yok) — bilinçli kapsam dışı |

## 3. RBAC / tenant / güvenlik notları (statik)

- Değişen davranış YOK: tüm kapsam kararları sunucuda; mobilde rol/tenant gevşetmesi yapılmadı.
- `TASK_SEGMENTS` `label` → `labelKey` dönüşümü iki tüketiciyle birlikte taşındı (teacher + admin iş-takip); harici tüketici kalmadı (`tsc` ile doğrulandı).
- `OPS_FLAG_LABEL` (ölü export, UI tüketicisi yok) → locale-aware `opsFlagLabel()`; `classifyOpsResult` locale parametresi aldı.
- `NETWORK_ERROR` / `FEATURE_UNAVAILABLE` sabitleri → `networkError()` / `featureUnavailable()` fonksiyonları; tüketiciler (`client.ts`) + testler güncellendi.
- Ödeme/tahsilat tutarları sunucu-hesaplı olmaya devam eder; istemcide fiyat hesabı eklenmedi.

## 4. Tutarsızlık bulgusu (davranış değişikliği YOK, kayıt)

- `app/(admin)/ogretmenler.tsx` placeholder notu "GET /api/v1/teachers (liste) yok" der; ancak `app/(admin)/kisiler/index.tsx` ve `app/(admin)/program/index.tsx` bu ucu zaten kullanır. Not bayat; ekran rota olarak korunur. Takip işi: placeholder notunu güncellemek veya ekranı gerçek listeye bağlamak (bu turun kapsamı dışında bırakıldı).

## 5. Bilinçli kapsam dışı / insan aksiyonu gerektirenler

- Fiziksel cihaz ölçümleri, VoiceOver/TalkBack + en büyük font geçişi, EAS preview / TestFlight / Internal Testing, ikon/splash/privacy URL yayın adımları: `docs/mobile/EAS_DEVICE_TEST_READINESS.md` ve runbook'taki haliyle insan aksiyonu bekler; bu turda kod tarafı hazırlandı, mağaza gönderimi yapılmadı.
- Gerçek Apple/Google/Expo/Firebase/ödeme kimlik bilgisi kullanılmadı; secret üretilmedi, PII loglanmadı.

# Push + Ödeme Altyapısı — Teknik Plan (uygulama öncesi)

Tarih: 2026-09-20 · Branch: `release/mobile-review`
Denetim temeli: audit sentezi + dosya-doğrulama (bu tur).

## 0. Mevcut durum (doğrulandı)

- Push: SIFIR altyapı — sender yok, token deposu yok, `expo-notifications`
  yok, policy `disabled`, `pushEnabled` sunucuda `false`'a zorlanıyor.
  In-app center + `lesson_upcoming` sweep + tercihler + `tick` VAR.
- Ödeme: `POST /payments/:id/pay` ADMIN-ONLY (öğrenci akışında kullanılmaz);
  `POST /payments/:id/checkout` (`payments:checkout`, STUDENT var) + webhook
  (imza zorunlu, paid yalnız webhook'la) + `PaymentCheckoutAttempt`
  idempotency VAR. Provider: console (fail-closed) + iyzico (sandbox
  doğrulanmamış); stripe adapter YOK, stripe bağımlılığı YOK.
- Mobil: `expo-web-browser` YOK; redis/queue YOK; cron bağlı DEĞİL.

## 1. Etkilenecek alanlar

Backend endpoint (yeni): `POST /api/v1/mobile/push-tokens`,
`DELETE /api/v1/mobile/push-tokens`, `POST /api/v1/mobile/payments/:paymentId/checkout`,
`GET /api/v1/mobile/payments/:paymentId/checkout-status`.
Schema (yeni tablo + migration SQL): `DevicePushToken`. Kod genelleme:
`notification-categories.ts` (3 offset + 1 display kategorisi),
`lesson-notifications.ts` (per-offset sweep), `notification-sweeps.ts`
bağlantı, push sender (`src/lib/push/`), token store (`src/lib/device-push-tokens.ts`).
Env (YENİ, secretsiz default): `PUSH_ENABLED=false`, `EXPO_PUSH_ACCESS_TOKEN=`
(boş=kapalı), `PUSH_SENDER_CONCURRENCY`, mevcut ödeme env'leri aynen.
`.env.example` dosyası DEĞİŞMEYECEK (önceden kirli, dokunulmuyor).
Mobil paket (SDK57 uyumlu): `expo-notifications`, `expo-device`,
`expo-web-browser`.

## 2. Güvenlik kararları

- Token sahibi yalnız `ctx.userId`; tenant `ctx`'ten; token değeri yanıtlarda
  ASLA dönmez, loglanmaz (maskeli audit).
- Kategori tercihleri mevcut `NotificationPreference` satırları (migration
  gerektirmez); `pushEnabled=true` yalnız push aktifken kabul edilir, aksi
  halde sunucu `false`'a zorlar (mevcut davranış korunur).
- Sweep gönderim-öncesi: rol, tenant üyeliği, guardian active-access, tercih
  (inApp+push ayrı) tekrar kontrol; idempotency
  `lessonId+userId+category+offset+occurrence(startAt)`.
- Checkout: tutar/para birimi sunucudan; `payments:write`'a dokunulmaz;
  success yalnız webhook/doğrulanmış status; double-click idempotency mevcut
  attempt yeniden-kullanımıyla.
- Stripe adapter YAZILMAYACAK (bağımlılık + credential yok; sahte kod riski).
  iyzico sandbox E2E bu turda YOK (credential yok) — blocker.

## 3. Commit planı

1. `DevicePushToken` schema/store + migration SQL + unit test
2. Push token API + owner/tenant negatif testleri
3. Kategori genişletme + per-offset sweep + guardian kapsam testleri
4. Push sender (Expo Push) + tick bağlantısı + in-app/push ilişkisi testleri
5. Mobil: paketler + izin/token/deep-link + ayar ekranı genişletme
6. Mobil checkout endpointleri + status + güvenlik testleri
7. Mobil ödeme UX (session/status/polling/invalidation) + testler
8. Sözleşme-tab yasağı kilidi + docs/parite/UAT

## 4. Bilinen operasyon blocker'ları (uygulanamaz)

`EXPO_PUSH_ACCESS_TOKEN`, APNs/FCM kimlikleri, cron bağlama
(`tick` 5 dk), `NotificationPreference` migration prod durumu, iyzico
sandbox E2E + `PAYMENT_PROVIDER` seçimi, EAS push credentials. Hepsi docs'ta.

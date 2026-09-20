# Push Production Runbook — fiziksel cihazda gerçek bildirimler (secret içermez)

- Tarih: 2026-09-20 · Branch: `release/mobile-review`.
- Kapsam: Expo Push (APNs/FCM taşıyıcı) uçtan uca prod/test hazırlığı.
- İlgili kod: `src/lib/push/*`, `src/app/api/v1/mobile/push-tokens`,
  `src/app/api/v1/mobile/push-test`, `src/app/api/v1/notifications/tick`,
  `src/lib/lesson-notifications.ts`, `apps/mobile/src/push/*`, `eas.json`,
  `.github/workflows/notification-tick.yml`.

## 1. Mimari (tek bakış)

```
cihaz (izin → ExpoPushToken → POST push-tokens) ─┐
                                                 ├─► tick (cron, 10 dk) → sweepLessonReminders
sunucu (sweep → tercih kapısı → sender → Expo) ──┘      → deliverPushForUser → Expo Push → APNs/FCM
```

- Token kaydı: oturum sahibinin kendi token'ı (`POST /api/v1/mobile/push-tokens`).
- Çıkışta: `DELETE /api/v1/mobile/push-tokens` tüm cihaz token'larını devre dışı bırakır.
- Tarama: `POST /api/v1/notifications/tick` (Bearer `NOTIFICATION_CRON_SECRET`,
  JWT kabul edilmez), per-offset (1g/1s/15dk) + guardian tüm aktif çocuk kapsamı.
- Gönderim fail-closed: `PUSH_ENABLED=true` + `EXPO_PUSH_ACCESS_TOKEN` dolu
  değilse HTTP YOK; kategori `pushEnabled` kapalıysa gönderim YOK.
- `DeviceNotRegistered` cevabında token otomatik devre dışı bırakılır.
- Push `data.kind` → uygulama içi hedef (`push-destination.ts`); bilinmeyen
  türler bildirim merkezine düşer (ölü deep-link yok).

## 2. EAS build komutları (kopyala-çalıştır)

Önkoşul: `npm i -g eas-cli && eas login`, sonra `apps/mobile` dizininde `eas init`
(`extra.eas.projectId` yazar — push token için zorunlu).

```bash
cd apps/mobile

# iPhone'da bildirim testi (önerilen ilk adım — dahili dağıtım):
eas build --profile preview --platform ios

# Android'de bildirim testi:
eas build --profile preview --platform android

# Geliştirme istemcisi (canlı kod + gerçek push, Expo Go DEĞİL):
eas build --profile development --platform ios
eas build --profile development --platform android

# Mağaza sürümü:
eas build --profile production --platform ios
eas build --profile production --platform android
```

Notlar:

- `EXPO_PUBLIC_APP_VARIANT` her profilde gömülüdür (kayıt `appVariant`
  alanını besler); `preview`/`production` ayrıca EAS `environment` kullanır —
  `EXPO_PUBLIC_API_URL` (HTTPS backend) o ortamlarda tanımlı olmalı.
- Expo Go ile push token alınamaz (SDK kısıtı) — gerçek test için yukarıdaki
  build'lerden biri şart; uygulama Expo Go'da sessizce atlar, hata vermez.
- iOS ATS / Android cleartext nedeniyle backend `https://` zorunlu.

## 3. Operatör checklist'i (kullanıcının yapacağı işler)

### Expo

- [ ] `eas init` (owner hesabı) → `app.json` içinde `extra.eas.projectId`.
- [ ] Expo dashboard → Access Tokens → push gönderimi için token üret →
  backend secret `EXPO_PUSH_ACCESS_TOKEN` (asla repoya yazılmaz).
- [ ] `preview`/`production` EAS environment'ına `EXPO_PUBLIC_API_URL` (HTTPS).

### Apple (iOS push için)

- [ ] Apple Developer üyeliği + `com.neviihub.mobile` bundle kaydı.
- [ ] APNs anahtarı (.p8) → `eas credentials` ile Expo'ya tanıtma
  (EAS managed credentials önerilir).
- [ ] TestFlight iç test kullanıcısı (fiziksel iPhone).

### Firebase/Google (Android push için)

- [ ] Firebase projesi + Android uygulaması (`com.neviihub.mobile`).
- [ ] FCM servis hesabı anahtarı → `eas credentials` ile Expo'ya tanıtma.
- [ ] (Mağaza öncesi) Google Play Console kaydı.

### Backend (deployment ortamı)

- [ ] `PUSH_ENABLED=true`
- [ ] `EXPO_PUSH_ACCESS_TOKEN=<expo-token>` (Expo dashboard'dan)
- [ ] `NOTIFICATION_CRON_SECRET=<uzun-rastgele>` (tick auth; JWT değil)
- [ ] Tenant ayarı `mobile.pushPolicy=allowed` (kapalıysa istemci tercihi
      gösterilmez; gönderim zaten fail-closed).

## 4. Cron bağlantısı

Birincil (repoda tanımlı): `.github/workflows/notification-tick.yml` — 10
dakikada bir `POST /api/v1/notifications/tick`. Repository secrets:

- `APP_BASE_URL` (örn. `https://app.neviihub.com`, sonda `/` yok)
- `NOTIFICATION_CRON_SECRET` (backend ile aynı değer)

Alternatif (platform bağımsız): herhangi bir cron çalıştırıcıdan (cron-job.org,
Render/Vercel cron, systemd timer) aynı POST isteği; Vercel `vercel.json`
cron'ları GET-only + özel header'sız olduğu için bu uçla KULLANILAMAZ
(Bearer zorunlu).

Doğrulama: workflow çalışması 200 dönmeli; yanıt
`{ok:true,data:{reminders:{pushSent…}}}` içerir. Başarısız tarama audit'e
(`notifications.tick`, outcome `denied`/`success`) yazılır.

## 5. Test dersi oluşturma + test bildirimi tetikleme

1. Web panelden (admin) bir öğrenciye **15 dakika sonrasına** ders planla
   (öğretmen + şube + oda dolu olsun).
2. Mobil cihazda ilgili hesapla giriş yap (SELF öğrenci / veli / öğretmen),
   bildirim iznini VER (Ayarlar → Nevii Hub → Bildirimler).
3. Veli testi için: aynı veli e-postasına iki aktif öğrenci erişimi ver
   (bkz. `docs/mobile/MOBILE_GUARDIAN_MULTI_STUDENT.md`), iki çocuğun da
   dersini planla.
4. Hızlı yol (cihaz doğrulaması): development build'de Hesabım → Bildirim
   ayarları → Geliştirici → "Test bildirimi gönder" (yalnız kendi cihazına,
   saatte en fazla 5).
5. Gerçek akış: cron'u bekle (≤10 dk) veya Actions → notification-tick →
   "Run workflow" ile manuel tetikle; ders saatinden 15 dk önce bildirim düşer.
6. Push'a dokun → doğru persona ekranı açılır (ders → program/gün ekranı,
   ödeme → ödemeler, görev → iş takip, diğer → bildirim merkezi).

## 6. Başarısız olursa — triyaj

| Belirti | Kontrol |
|---|---|
| Token kaydı yok | Cihaz logu `[push] kayıt atlandı: …`; izin durumu; `extra.eas.projectId` var mı; Expo Go mu (beklenen atlama) |
| Tick 403 | `NOTIFICATION_CRON_SECRET` eşleşmiyor; audit `notifications.tick/denied` (`bad_secret`) |
| Tick 200 ama `pushSent: 0` | `PUSH_ENABLED`/`EXPO_PUSH_ACCESS_TOKEN` eksik; kategori `pushEnabled` kapalı; cihaz token kaydı yok |
| Bildirim gelmiyor (sent>0) | Expo dashboard push geçmişi; APNs/FCM credential (`eas credentials`); cihazda bildirim izni + odak modu |
| Test push CONFLICT | Cihaz kaydı yok (izni açıp yeniden giriş) veya push altyapısı kapalı |
| Rate limit (429) | Test ucu saatte 5; tick sonucu `Retry-After` |

Uçlar: `GET /api/v1/mobile/policy` (`push.active` gerçek durum),
audit `mobile.push-test` / `notifications.tick`, sunucu logu `push gönderimi …`
(token maskeli — ham token ASLA loglanmaz).

## 7. Push UAT (fiziksel cihaz)

- [ ] iOS gerçek cihaz: foreground / background / killed → bildirim + dokunma hedefi
- [ ] Android gerçek cihaz: foreground / background / killed → bildirim + kanal ("Ders hatırlatmaları")
- [ ] SELF öğrenci: 1g / 1s / 15dk tercihleri (açık/kapalı)
- [ ] Guardian: iki aktif çocuk için ayrı bildirimler
- [ ] Öğretmen: 1s / 15dk
- [ ] Ders iptali / değişiklik / telafi bildirimi
- [ ] Guardian erişim iptali sonrası bildirim kesilmesi
- [ ] Logout → token invalidation (sonrasında bildirim YOK)
- [ ] Tercih kapalı kategori → gönderim YOK (in-app da yok)

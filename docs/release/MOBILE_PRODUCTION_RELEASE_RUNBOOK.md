# Mobil Production Release Runbook (Android öncelikli)

- Tarih: 2026-10-10 · Branch: `release/mobile-review` (origin/main merge'ü sonrası)
- **Bu belgede secret/parola yok.** Yalnız değişken İSİMLERİ ve komutlar.
- Kural: production'a `migrate deploy`, `vercel deploy --prod`, `eas submit` ve store gönderimi **yalnız owner** tarafından,
  açık onayla yapılır. Aşağıdaki "🛑" işaretli adımlar hazırlanmıştır, ÇALIŞTIRILMAMIŞTIR.

## 1. Ortam matrisi

| | Local | Preview (EAS internal) | Production (Play/App Store) |
|---|---|---|---|
| API (`EXPO_PUBLIC_API_URL`) | LAN IP / localhost (yalnız dev) | TEST API (HTTPS) — şu an kalıcı test ortamı YOK, gerekirse geçici | `https://neviihub.com` |
| `EXPO_PUBLIC_APP_VARIANT` | `development` | `preview` | `production` |
| Backend | `npm run dev` (json) | geçici izole DB | Vercel `neviihub` (`main`), Supabase `wsbucznpujcfzhitzrbl` (eu-central-1), fonksiyon `fra1` |
| localhost/LAN/http | serbest | serbest | **build fail-fast** (aşağıda) |

Production guard (kod): `apps/mobile/src/api/api-url-policy.js` — `app.config.js` (EAS build'i başlamadan düşürür) +
`src/api/client.ts` (çalışma anı). Reddedilenler: http, localhost/`*.localhost`, `127.*`, `10.*`, `172.16–31.*`,
`192.168.*`, `169.254.*`, ham IP, IPv6, `.local/.internal`, tek etiketli host, kullanıcı bilgisi, eksik URL.
Test: `apps/mobile/src/api/__tests__/api-url-policy.test.ts`.

## 2. EAS kurulumu (bir kez; owner / 2FA gerekir)

Hesap: `nevii-production` (proje `@nevii-production/nevii-hub-mobile`, id `aa045f7e-…`). Komutlar `apps/mobile` içinde.

```bash
npx eas-cli whoami
# Production API (düz metin; EXPO_PUBLIC_* asla secret değildir)
npx eas-cli env:create --environment production --name EXPO_PUBLIC_API_URL --value https://neviihub.com --visibility plaintext
# Preview (TEST API adresini sen ver; yoksa preview build alma)
npx eas-cli env:create --environment preview --name EXPO_PUBLIC_API_URL --value https://<test-api-host> --visibility plaintext
# Android push — Firebase google-services.json (secret dosya; repoya girmez)
npx eas-cli env:create --environment production --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json --visibility secret
# FCM V1 servis hesabı anahtarı (Expo push gönderimi için) — etkileşimli, Google hesabı gerekir
npx eas-cli credentials --platform android
```

`app.config.js`, `GOOGLE_SERVICES_JSON` varsa `android.googleServicesFile`'a bağlar; yoksa build alınır ama Android push çalışmaz.
iOS APNs (ikinci öncelik): `npx eas-cli credentials --platform ios` (Apple Developer hesabı + 2FA).

## 3. Build komutları

```bash
cd apps/mobile
# (opsiyonel) TEST API ile kurum içi Android preview (APK)
npx eas-cli build --profile preview --platform android
# Production AAB (Play için). versionCode: eas.json `appVersionSource: remote` + `autoIncrement: true` → otomatik
npx eas-cli build --profile production --platform android --non-interactive
```

### 🛑 Submit (ÇALIŞTIRMA — owner)

`eas.json` → `submit.production.android = { track: "internal", releaseStatus: "draft" }` hazır.
**Play'de uygulama yoksa ilk AAB Play Console'a MANUEL yüklenmeli** (API ile ilk yükleme yapılamaz). Sonraki sürümler:

```bash
cd apps/mobile && npx eas-cli submit --profile production --platform android --latest
```

Beklenen etki: AAB, Play "Dahili test" kanalına **taslak** olarak girer; testçilere ancak Console'da yayınlayınca ulaşır.
Servis hesabı JSON'u (Play API erişimi) `eas credentials`/`eas submit` etkileşiminde tanımlanır; repoya girmez.

iOS (Android hazır olduktan sonra, 🛑): `eas build --profile production --platform ios` → `eas submit --platform ios --latest`.

## 4. Play Console checklist (insan adımları)

1. **Uygulama oluştur**: ad "Nevii Hub", paket `com.neviihub.mobile`, varsayılan dil TR, ücretsiz.
2. **Play App Signing** açık bırak (AAB'yi Google imzalar).
3. **Mağaza girişi**: kısa/uzun açıklama, anahtar kelimeler, sürüm notu → `docs/mobile/MOBILE_STORE_PACK.md` §2–5. İkon 512×512 ve
   feature graphic 1024×500 gerekir (repoda yok; marka asseti — `docs/release/BRAND_ASSET_CONTRACT.md`). Ekran görüntüleri §6 senaryosu.
4. **Gizlilik politikası URL**: `https://neviihub.com/gizlilik` (kaynak: `src/app/gizlilik/page.tsx`). **Hesap silme URL**:
   `https://neviihub.com/hesap-silme-talebi`.
5. **Data safety** formu → `MOBILE_STORE_PACK.md` §8 matrisi. Özet: toplanan = ad, e-posta, telefon, kullanıcı kimliği,
   eğitim kayıtları (yoklama/ödev/ödeme durumu), cihaz/push token, isteğe bağlı fotoğraf; **kart verisi yok**; konum/kişiler/kamera/mikrofon yok;
   aktarım şifreli (HTTPS); silme talebi var; çocuk verisi: kurum hesabıyla.
6. **İçerik derecelendirme** anketi, **hedef kitle** (13+/veli-öğrenci; çocuklara yönelik DEĞİL → "Designed for Families" kapsamı dışı), **reklam yok**,
   **Haber/Finans/Sağlık** uygulaması değil beyanları.
7. **Uygulama erişimi (App access)**: giriş zorunlu → inceleyici için demo hesap bilgisi girilir (kimlik bilgisi YALNIZ Console formunda; repoya yazılmaz).
   Production'da deneme hesabı açma kuralı (`docs/operations/LOCAL_FIRST_DEPLOYMENT.md` ilke 3) nedeniyle owner, kurumda
   **kısıtlı yetkili ayrı bir inceleme hesabı** (tek öğrenci/öğretmen, sentetik veri) oluşturmaya karar vermelidir. Ben production'a hesap eklemedim.
8. **Dahili test**: testçi e-posta listesi oluştur → AAB yükle (ilk sürüm manuel) → "Dahili test" bağlantısını testçilere gönder.
9. İzinler: yalnız `POST_NOTIFICATIONS`, galeri (Photo Picker); `CAMERA`, `RECORD_AUDIO`, `SYSTEM_ALERT_WINDOW`, `WRITE_EXTERNAL_STORAGE` `blockedPermissions` ile engelli.

## 5. Backend yayın sırası (🛑 owner)

Mobil sürüm şu uçlara ihtiyaç duyar ve bunlar **production'da henüz yok** (2026-10-10 GET probu 404): `mobile/push-tokens`, `mobile/push-test`,
`mobile/my-children`, `account/deletion-request*`. Bunlar bu branch'in (merge sonrası) kodundadır; `main` bunları içermiyor. Sıra:

1. Bu branch → PR → owner review → `main` merge (owner).
2. **Migration (🛑)** — bekleyen, bu branch'e özgü 2 migration; ikisi de **additive + idempotent** (`CREATE TABLE/INDEX IF NOT EXISTS`, yıkıcı SQL yok):
   `20260920090000_device_push_tokens`, `20260920120000_account_deletion_requests`.
   Not: tarihleri main'in son migration'larından ESKİ; `migrate deploy` bekleyenleri uygular (sorun değil), `migrate dev` kullanmayın.
   ```bash
   # Önce salt-okunur durum (SESSION pooler 5432; transaction pooler 6543'te komut asılır). Production DATABASE_URL Vercel'de
   # "sensitive" olduğu için pull edilemez — owner kendi kasasından verir:
   DATABASE_URL="<prod session-pooler url, :5432>" npx prisma migrate status
   # Yedek notu: Supabase Free'de PITR yok → önce `pg_dump` (docs/operations/TEST_TO_PRODUCTION_DATA_CUTOVER.md) al.
   # Uygula:
   DATABASE_URL="<prod session-pooler url, :5432>" npx prisma migrate deploy
   ```
   Beklenen etki: 2 yeni boş tablo + 5 index + 1 FK. Mevcut veriye dokunmaz; kilit süresi ihmal edilebilir. Geri alma: tablolar boş kaldığı sürece `DROP TABLE` güvenli (owner kararı).
3. **Deploy (🛑)**: `main` merge'i Vercel production'ı tetikler (ya da `vercel deploy --prod` — owner). Smoke:
   `curl -s https://neviihub.com/api/v1/ready` → `{"ok":true,"data":{…"ready":true…}}`; `POST /api/v1/auth/login` (yanlış kimlik) → 401 JSON.
4. Ardından production AAB build + Play internal.

Migration olmadan deploy edilirse yeni uçlar 500 verir (tablo yok) — sırayı bozmayın: **önce migrate, sonra deploy**.

## 6. UAT listesi (internal test cihazı)

| Alan | Beklenen |
|---|---|
| Admin / öğretmen / öğrenci / veli login | Doğru persona ana sayfası; yanlış parola → Türkçe, net hata |
| Session restore | Uygulama kapat-aç → oturum korunur; 15 dk sonra token yenilenir |
| Tek oturum | İkinci cihazda giriş → onay uyarısı (takeover) → ilk cihaz "oturum devralındı" ile düşer |
| Öğretmen | **Yoklama / dersi başlat-bitir UI'ı YOK**; ders detayında bilgi notu + canlı sayaç görünür |
| Admin | Yoklama alabilir |
| Veli çok çocuk | Çocuk seçici → seçim persist → çıkışta temizlenir |
| Policy kapısı | Bakım/güncelleme/kapalı portal ekranları (Control Center ayarıyla) |
| Küçük ekran / büyük font | Taşma yok (Android 320dp, font scale 1.3) |
| Dark / light | Her ikisinde okunur |
| Push | **Development build** ile (Expo Go'da çalışmaz): izin → token kaydı → `mobile/push-test` → bildirim → dokunma doğru ekrana |
| Hesap silme | Hesabım → Gizlilik → talep oluşur; web sayfası da çalışır |
| Çevrimdışı | Önbellekten "çevrimdışı" etiketli veri; ağ gelince tazelenir |

## 7. Rollback

- **Mağaza**: Play Console → sürümü durdur / önceki sürümü yeniden yayınla (internal'da anında). EAS Update kullanılmıyor; JS değişikliği de yeni build ister.
- **Vercel**: Dashboard → Deployments → önceki başarılı production deployment → "Promote/Rollback" (şema değişikliği geri alınmaz; yeni tablolar eski kodu bozmaz).
- **DB**: migration'lar additive; geri alma gerekmez. Supabase Free'de PITR yok → yedek = `pg_dump` (yayın öncesi zorunlu).
- **Cron**: `.github/workflows/notification-tick.yml` schedule satırını yorumla.

## 8. Kota / performans bulguları (etki sırasıyla)

| # | Bulgu | Durum |
|---|---|---|
| 1 | `readData()` (store-db) her istekte tenant'ın TÜM veri setini okuyor → Supabase egress + Vercel CPU'nun ana sürücüsü | Yapısal. PR #21 (`fix/supabase-egress-p0`) main'de → merge ile geldi. Dilimleme/sayfalama ayrı iş; **şema/mimari değişikliği, önerildi** |
| 2 | `pg` Pool `max` verilmemişti → instance başına 10 bağlantı (Supabase pooler limitini tüketir) | **Düzeltildi**: `src/lib/db.ts` varsayılan 5 + `idleTimeoutMillis` 10 sn; `DATABASE_POOL_MAX` ile ayarlanır. Singleton (`globalThis`) zaten doğru |
| 3 | `next/link` otomatik prefetch → Vercel Active CPU alarmı (2026-10-01) | Main'de `@/components/link` + ESLint kuralı; bu branch'teki 2 dosya (`legal-page.tsx`, `hesap-silme-talebi/page.tsx`) geçirildi |
| 4 | `NOTIFICATION_CRON_SECRET` Vercel **Production**'da listelenmiyor (yalnız `CRON_SECRET` var); tick route fail-closed (403). Eksikse bildirim/hatırlatma/ödeme-izin-sözleşme süpürmeleri çalışmıyor VE GitHub cron'u (144 çağrı/gün) boşa invocation üretiyor | **Doğrulanmalı (owner)**: Vercel'e `NOTIFICATION_CRON_SECRET` ekle, GitHub secret ile aynı değer; sonra `gh workflow run notification-tick.yml` |
| 5 | Index boşlukları: `Lesson`, `Attendance`, `MakeupRequest` yalnız `tenantId` indeksli (FK kolonlarında bileşik indeks yok) | **Sadece öneri** (şema değişikliği): `Lesson(tenantId,teacherId,startAt)`, `Lesson(tenantId,studentId,startAt)`, `Attendance(tenantId,studentId)`, `MakeupRequest(tenantId,studentId,status)`; `EXPLAIN` + migration + geri alma notu ile, ölçüm sonrası |
| 6 | Production env'de `SMS_TEST_MODE=true` tanımlı (env contract: production'da tanımlıysa fail); `SMS_PROVIDER/TWILIO_*` yok | Owner kararı: SMS gerçekten kapalı mı, test modu kaldırılsın mı |
| 7 | Mobil: polling yok (yalnız UI zamanlayıcıları); GET dedupe, TTL önbellek, 2 retry (yalnız 5xx/ağ), arama debounce var | Değişiklik gerekmedi |
| 8 | Vercel `fra1` ↔ Supabase `eu-central-1` bölge uyumu | Uyumlu |
| 9 | Supabase advisors / egress / Realtime-Storage kullanımı | **Ölçülemedi**: Supabase MCP hesabında production projesi (`wsbucz…`) görünmüyor; eski test/`neviihub` projeleri paused. Dashboard → Advisors + Usage'dan owner baksın |
| 10 | Kod-içi varsayılan parolalar (`src/lib/auth/users.ts`) | Production `STORE_MODE=db` → DB tek kaynak, bootstrap'a düşülmüyor (2026-10-02 düzeltmesi); ek kod gerekmedi. `AUTH_HYPER_ADMIN_*` production'da yok → hyper-admin hesabı üretilmiyor (fail-closed) |

## 9. Doğrulama kayıtları (bu branch, merge sonrası)

- Mobil: `typecheck` ✓ · `vitest` 66 dosya / 489 test ✓ · `eslint` ✓ · `verify:mobile-bundle` (iOS+Android) ✓ · `expo-doctor` 20/21 (1: paket sürüm kayması — önceden var, `npx expo install --check`).
- Kök: `prisma validate` ✓ · `eslint` hata yok · `tsc`: yalnız commit'lenmemiş `src/lib/student-contract-reminder-tick.ts` (kullanıcının WIP dosyası; main'de `listContractsForTenant` yok).

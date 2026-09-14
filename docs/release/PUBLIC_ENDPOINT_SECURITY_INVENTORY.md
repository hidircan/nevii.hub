# Public Endpoint Security Inventory

- Tarih: 2026-09-14 · Branch: `release/mobile-review` · Neden: test.neviihub.com Vercel SSO'suz public.
- Kapsam: `src/app/api/**/route.ts` (212 route). "Public" = `withApiHandler({ public: true })` veya
  `withApiHandler` kullanmayan (kendi kimlik doğrulamasını yapan) route. Diğer tüm route'lar `withApiHandler`
  varsayılanıyla JWT/oturum ister (`src/lib/api/handler.ts`, `authenticateRequest`).
- Kilit test: `src/lib/__tests__/public-endpoint-security.test.ts` — `public: true` kümesi bu tabloyla birebir
  eşleşmezse fail eder (yeni public route → bu belge + test güncellenir).

## 1. Diagnostic / health

| Endpoint / Surface | Public mi? | Amaç | Önceki Response / Risk | Uygulanan Fix | Final Public Contract | Test | Durum |
|---|---|---|---|---|---|---|---|
| `GET /api/v1/ready` | Evet | Readiness (DB ping) | `service:"notaplan"`, `storeMode`, `database.{configured,reachable,errorClass}`, `sms.*`, `storage.configured` | `ccf64ba`: yalnız 3 alan; errorClass yalnız sunucu logu | `{service:"NeviiHub", ready, time}`; DB yoksa `ready:false` (200) | `ready-route.test.ts`, `ready-route-error-class.test.ts` | ✅ |
| `GET /api/v1/health` | Evet | Liveness | `service:"notaplan"`, `version`, `storeMode` | Yalnız 3 alan; `STORE_MODE` guard'a taşındı | `{service:"NeviiHub", healthy:true, time}` | `public-endpoint-security.test.ts` | ✅ |
| `GET /api/v1/ai/health` | Hayır (`tools:catalog`) | AI sağlayıcı durumu | Oturumlu | — | Değişmedi | handler auth | ✅ kapsam dışı (auth) |
| `GET /api/v1/platform/health` | Hayır (HYPER_ADMIN) | Platform sağlığı | Oturumlu | — | Değişmedi | handler auth | ✅ |
| `GET /api/v1/config/snapshot` | Hayır (oturum) | Kurum ayar görüntüsü | Oturumlu | — | Değişmedi | handler auth | ✅ |
| `GET /api/v1/documents/templates/diagnostics` | Hayır (`documents:read`) | Şablon tanısı | Oturumlu | — | Değişmedi | handler auth | ✅ |
| `GET /api/v1/sms/status` | Hayır (oturum) | SMS durumu | Oturumlu | — | Değişmedi | handler auth | ✅ |

Gelecek iş (authenticated diagnostic): DB/provider readiness detayı gerekiyorsa mevcut RBAC ile (ör. HYPER_ADMIN,
`platform/health` deseni) yetkili bir uç olarak eklenir; public uçlara geri konmaz.

## 2. Secret / imza korumalı public uçlar

| Endpoint / Surface | Public mi? | Amaç | Önceki Response / Risk | Uygulanan Fix | Final Public Contract | Test | Durum |
|---|---|---|---|---|---|---|---|
| `POST /api/v1/notifications/tick` | Evet (Bearer secret) | Bildirim cron'u | Secret yokken mesaj env adını (`NOTIFICATION_CRON_SECRET`) ve yapılandırma durumunu veriyordu | Yanlış secret ile aynı mesaj; neden audit'te | 403 `Geçersiz tick kimliği.` | `public-endpoint-security.test.ts` | ✅ |
| `POST /api/v1/platform/jobs/retention` | Evet (Bearer secret) | Log retention cron'u | 503 mesajı env adı, kod `NOT_CONFIGURED` yapılandırma durumunu içeriyordu | Genel mesaj + kod `UNAVAILABLE` | 503 `UNAVAILABLE` / 401 | aynı + `neviios-round3.test.ts` | ✅ |
| `POST /api/v1/platform/releases/events` | Evet (HMAC) | CI release olayı | 503 mesajı env adı, kod `NOT_CONFIGURED` yapılandırma durumunu içeriyordu | Genel mesaj + kod `UNAVAILABLE` | 503 `UNAVAILABLE` / 401 `Geçersiz imza` | aynı + `neviios-round3.test.ts` | ✅ |
| `POST /api/v1/payments/webhook` | Evet (sağlayıcı imzası) | Ödeme sonucu | 401 mesajı doğrulayıcı metnini (ör. "sağlayıcı yapılandırılmadı", header adı) yansıtıyordu | Tek tip mesaj; detay `logger.warn` | 401 `Webhook doğrulanamadı.` | aynı + `payment-checkout-security.test.ts` | ✅ |
| `POST /api/v1/communications/webhook` | Evet (imza) | İletişim webhook iskeleti | 503/401 mesajı sağlayıcı durumunu yansıtıyordu | Tek tip mesajlar | 503 `Bu uç şu anda kullanılamıyor.` / 401 `Webhook doğrulanamadı.` | aynı | ✅ |
| `POST /api/v1/sms/webhook` | Evet (Twilio imzası) | Gelen SMS | 401 `Invalid signature` — sızıntı yok | — | Değişmedi | mevcut testler | ✅ |
| `GET/POST /api/v1/whatsapp/webhook` | Evet (verify token / Meta HMAC) | Meta doğrulama + gelen mesaj | GET: challenge veya 403 `Forbidden`; production'da varsayılan verify token yok | — | Değişmedi | mevcut testler | ✅ |
| `POST /api/v1/chat/stream` | Hayır (kendi `authenticateRequest`) | AI sohbet SSE | 401/403 | — | Değişmedi | mevcut testler | ✅ |

## 3. Kimliksiz ürün uçları (`public: true`)

| Endpoint / Surface | Public mi? | Amaç | Önceki Response / Risk | Uygulanan Fix | Final Public Contract | Test | Durum |
|---|---|---|---|---|---|---|---|
| `/api/v1/auth/login` | Evet | Giriş | Standart hata kodları; tercih çerezleri legacy adlı (`notaplan_*`) | — (çerez adı teknik identifier, bkz. §5) | Değişmedi | auth testleri | ✅ |
| `/api/v1/auth/logout` | Evet | Çıkış | — | — | Değişmedi | auth testleri | ✅ |
| `/api/v1/auth/refresh` | Evet | Token yenileme | — | — | Değişmedi | auth testleri | ✅ |
| `/api/v1/auth/forgot-password` | Evet | Parola sıfırlama isteği | — | — | Değişmedi | mevcut testler | ✅ |
| `/api/v1/auth/reset-password` | Evet | Parola sıfırlama | — | — | Değişmedi | mevcut testler | ✅ |
| `/api/v1/password-reset` | Evet | Parola sıfırlama (eski yol) | — | — | Değişmedi | mevcut testler | ✅ |
| `/api/v1/auth/accept-invitation` | Evet | Davet kabulü | — | — | Değişmedi | mevcut testler | ✅ |
| `/api/v1/invitations/[inviteId]/accept` | Evet | Davet kabulü | — | — | Değişmedi | mevcut testler | ✅ |
| `/api/v1/account/email-change/confirm` | Evet | E-posta değişikliği onayı | — | — | Değişmedi | mevcut testler | ✅ |
| `/api/v1/catalog/plans` | Evet | Yayındaki fiyat kataloğu | Yalnız yayındaki katalog | — | Değişmedi | mevcut testler | ✅ |
| `GET /api/v1/branding/platform-logo` | Evet | Platform logosu | Doğrulanmış görsel veya `/brand/logo.png` redirect; `nosniff` + sandbox CSP | — | Değişmedi | `neviios-round3.test.ts` | ✅ |

Beklenmeyen hata: `withApiHandler` hata detayını yalnız sunucuda loglar; public yanıt `INTERNAL_ERROR` + `requestId`
(stack/mesaj yok).

## 4. Public metadata / robots

| Endpoint / Surface | Public mi? | Amaç | Önceki Response / Risk | Uygulanan Fix | Final Public Contract | Test | Durum |
|---|---|---|---|---|---|---|---|
| `X-Robots-Tag` (`next.config.ts` `headers()`, `/:path*`) | Evet | review/test indeks engeli | `d92e623` ile eklendi | — (tek mekanizma) | review/test/eksik tier → `noindex, nofollow`; production → yok | `test:release`, `ready-route.test.ts`, `public-endpoint-security.test.ts` | ✅ |
| Root `metadata` (`src/app/layout.tsx`) | Evet | Başlık/açıklama | `BRAND.name` ("NeviiHub") | — | `NeviiHub — Everything. Connected.` | `neviios-round2.test.ts` | ✅ |
| `robots.ts`/`robots.txt`/`sitemap`/`manifest` | — | — | Repoda yok | Eklenmedi (production SEO korunur) | — | — | ✅ |
| Favicon / app icon | Evet | `src/app/icon.png`, `public/icon.png`, `public/brand/logo.png` | Byte-eşit canonical | — | bkz. `BRAND_ASSET_CONTRACT.md` | `sidebar-branding.test.ts` | ✅ |

## 5. Legacy "notaplan" taraması

| Surface | Tür | Karar |
|---|---|---|
| `/api/v1/health`, `/api/v1/ready` `service` | Public API | **Düzeltildi** → `NeviiHub` |
| Çerez adları (`notaplan_theme_profile`, `notaplan_font`, `notaplan_density`, `notaplan_sidebar_collapsed`, `notaplan_portal_presentation`) | Teknik identifier | Korunur — ad değişirse mevcut kullanıcı tercihleri/oturumlar kopar (`src/lib/brand.ts` politikası) |
| localStorage anahtarları (`notaplan_*`, `notaplan.assistant.*`) | Teknik identifier | Korunur (aynı neden) |
| JWT `issuer`/`audience` (`notaplan`, `notaplan-api`) | Teknik identifier | Korunur — değişirse tüm canlı token'lar geçersizleşir |
| `/tmp/notaplan-data`, `__notaplanByTenant`, PII KDF salt | İç | Korunur (salt değişirse şifreli IBAN'lar çözülemez) |
| `notaplan.vercel.app` (guard production host listesi) | Dış (Vercel proje adı) | Manuel follow-up: Vercel proje adı bu turda değiştirilmedi |
| Kullanıcıya görünen UI/metadata/mobil app adı | Public | Legacy ad yok (`BRAND.name`, app.json `Nevii Hub`) |

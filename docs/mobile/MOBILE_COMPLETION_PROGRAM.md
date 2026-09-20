# NeviiHub — Mobil Ürün Tamamlama Programı

Tarih: 2026-09-20 · Branch: `release/mobile-review` · HEAD: `6cfe2c4`

## 0. Faz 0 audit özeti (mevcut durum)

- **Branch:** `release/mobile-review`, origin'den 53 commit ileride. Dirty dosyalar:
  - `apps/mobile/.env.example` → yerel LAN IP (`192.168.0.18`) — **yerel/tesadüfi, ASLA dokunulmayacak.**
  - `apps/mobile/app.json` → EAS `projectId` + `owner` + `ITSAppUsesNonExemptEncryption` — **proje hedefiyle uyumlu**,
    Faz 5 (push/preflight) commitinde dahil edilecek.
- **Mevcut ve sağlam:** persona modeli (`GUARDIAN`/`SELF`), `submitHomeworkTool` SELF-only yorumu,
  guardian ödev kilidi mobil testi, admin route iskeleti (`(admin)`:
  program/islemler/kisiler/hesabim), notification tick cron (10 dk), push token migration,
  `WEB_MOBILE_SYNC_PARITY.md`, `PUSH_PRODUCTION_RUNBOOK.md`, store checklist taslağı,
  Noto Serif tipografi altyapısı.
- **Eksik / yapılacak:** yasal URL'ler `null` (release blocker), public hukuki route yok
  (`/gizlilik`, `/kullanim-kosullari`, `/hesap-silme-talebi`), hesap-silme backend akışı yok,
  offline read-cache yok, admin mobilde finans/duyuru/onay/rapor derinliği eksik,
  release preflight komutu kısmi (`scripts/release/` mobile-review-env var, push env
  kapsamı genişletilecek), guardian negatif backend testleri doğrulanacak.

## 1. Fazlar ve bağımlılıklar

| Faz | Konu | Bağımlılık | Ana çıktı |
|-----|------|------------|-----------|
| 0 | Ön kontrol + plan | — | Bu belge |
| 1 | Student/parent/teacher hardening | 0 | Guardian kilit testleri, cache temizliği, tipografi UAT düzeltmeleri |
| 2 | Admin P0: saha operasyon | 1 | Yoklama alma, kişiler, portal erişimi |
| 3 | Admin P1: finans/duyuru/onay | 2 | Tahsilat, duyuru gönderimi, onay akışları |
| 4 | Admin P2: rapor/ayarlar | 3 | Özet raporlar, hesap ayarları |
| 5 | Push + bildirim operasyonu | 1 | Preflight komutu, cron hardening, runbook, app.json EAS |
| 6 | Hukuk + hesap silme + store | 2–5 | Public sayfalar, deletion API+migration, store paketi |
| 7 | Offline-first read cache | 1–4 | Tenant-scoped cache, TTL/invalidation, temizlik |
| 8 | Realtime/freshness | 7 | Hedefli revalidation, event akışları |
| 9 | Kalite/a11y/performans | 1–8 | UAT düzeltmeleri, virtualization, bundle ölçümü |
| 10 | Final readiness | 1–9 | Parite matrisi, UAT checklist, teslim raporu |

## 2. API / RBAC etkileri (öngörülen)

- Yeni yazma endpointleri: portal erişim invite/revoke/re-enable (admin),
  duyuru gönderim/iptal (admin), hesap-silme talebi (self) + inceleme (admin).
- Hepsinde: `withApiHandler` + permission, zod validation, tenant scope, audit log,
  rate limit (hassas olanlarda), negatif test (403/tenant-leak/idempotency).
- Değişmez kurallar: öğretmen attendance write 403; guardian öğrenci mutation 403;
  finans/yoklama offline kuyruklanmaz; PII/token/secret loglanmaz.

## 3. Gerçek dış sistem gerektiren son kurulum adımları

1. Expo EAS hesabı + `EXPO_TOKEN` (CI), `projectId` doğrulama (fiziksel build).
2. APNs (Apple Developer: Key ID, Team ID, .p8) + FCM (google-services.json /
   GoogleService-Info.plist) → `EXPO_PUSH_ACCESS_TOKEN` veya EAS credentials.
3. `APP_BASE_URL`, `NOTIFICATION_CRON_SECRET` GitHub Actions secret'ları + backend env.
4. Fiziksel cihaz UAT (iOS + Android, foreground/background/killed).
5. App Store Connect + Google Play Console hesapları, icon/screenshot yükleme, review.
6. Hukuki metinlerde kurum unvan/adres/iletişim: merkezi site config'e işlenecek
   (kodda placeholder URL yok).

## 4. UAT planı (özet)

- Persona bazlı: student SELF, guardian (2 çocuk), teacher, admin — her fazda ilgili akış.
- Cihaz matrisi: iPhone SE (320pt), standart iPhone, Android orta ekran, büyük font ölçeği.
- Senaryolar: login/logout/revoke/child-switch, uçak modu, stale cache, push offset kuralları,
  deep-link fallback, Android back / iOS swipe-back, light/dark, screen reader.
- Detaylı checklist final committe (`docs/mobile/MOBILE_UAT_CHECKLIST.md`).

## 5. Varsayımlar

- `.env.example`'daki LAN IP kullanıcıya ait yerel geliştirme ayarıdır; korunur.
- `app.json`'daki EAS projectId/owner gerçektir ve projeye aittir; Faz 5'te commitlenir.
- Ödeme gerçek para hareketi hosted checkout ile yapılır; mobilde kart formu asla yok.
- Gerçek credential/console erişimi yok; ilgili adımlar runbook + validation olarak hazırlanır.

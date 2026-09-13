# Mobile Review Staging Runbook

- Sözleşme: `docs/release/MOBILE_REVIEW_ENVIRONMENT_CONTRACT.md` · Guard: `npm run validate:mobile-review-env`
- Bu belge hazırlandığında **hiçbir dış işlem yapılmadı** (push/deploy/Vercel env/DNS/Supabase/EAS/store yok).
- Parola, token, connection string bu belgeye **yazılmaz**; hesap bilgileri parola yöneticisinde tutulur.

> **Kritik:** Store'a gönderilen binary içindeki `EXPO_PUBLIC_API_URL` build-time'da gömülür. Review backend'ine
> bağlı bir build **gerçek müşterilere Release edilemez** — onaydan sonra production URL'li yeni build gerekir
> (veya review için production backend + demo tenant stratejisine geçilir; bu bir ürün kararıdır).

## 1. Ön koşullar (hepsi ✅ olmadan başlanmaz)

- [ ] Claude/Muse mobile integration tamam, `feature/mobile-p0` birleştirme kararı verildi.
- [ ] Full regression geçti (`npm run typecheck`, `lint`, `test`, `prisma validate`, `build`; mobil testler).
- [ ] EAS config doğrulandı (`apps/mobile/eas.json`, `app.json`; bkz. `docs/mobile/EAS_DEVICE_TEST_READINESS.md`).
- [ ] Icon/splash doğrulandı (`apps/mobile/assets/icon.png` 1024², alfa yok).
- [ ] Test Supabase healthy (Dashboard; migration durumu `npm run verify:test-schema`).
- [ ] Review domain/URL hazır (ör. `review.neviihub.com` — production domain DEĞİL).
- [ ] Vercel deployment erişim politikası kararlaştırıldı (§2.6).
- [ ] Demo **Student SELF**, **Guardian** (STUDENT + `StudentPortalAccess.accessType=GUARDIAN`), **Teacher** hesapları
      canonical yönetim akışıyla kuruldu; gerçek kişi yok; parolalar dokümanda yok.
- [ ] Gerçek müşteri verisi yok; production Supabase bağlı değil (guard §2.9'da doğrular).

## 2. Vercel review staging ayarları (operatör — insan onayıyla)

1. **Branch:** ayrı review branch (ör. `mobile-review`), `main` değil.
2. **Project:** mevcut Vercel projesi; review branch'i **Preview** environment'ına bağlanır. Production
   environment'ına review değeri **yazılmaz**.
3. **Review domain:** custom domain review branch'ine atanır (DNS Cloudflare'de, ayrı onay).
4. **Environment tier (Preview kapsamı, yalnız review branch):** `NEVII_DEPLOYMENT_TIER=review`.
5. **Test Supabase environment:** `STORE_MODE=db`, `DATABASE_URL` (test transaction pooler), `JWT_SECRET`
   (production'dan farklı), `APP_BASE_URL` (review HTTPS), gerekiyorsa `NEXT_PUBLIC_SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY` (test projesi). Provider değişkenleri **boş** (console/fail-closed).
6. **SSO/public access:** Vercel Deployment Protection (Vercel Authentication) native uygulamanın
   `/api/v1/**` çağrılarını **401/redirect ile bloklar** — native istemci SSO çerezi taşımaz, Expo Go/TestFlight
   "Sunucuya ulaşılamadı" gösterir. Karar: review domain'inde protection **kapalı** (uygulama içi login korur) veya
   yalnız preview `*.vercel.app` URL'lerinde açık. "Protection Bypass for Automation" secret'ı mobil binary'ye
   **gömülmez**.
7. **Mobile public API URL:** EAS dashboard → `preview` environment → `EXPO_PUBLIC_API_URL` = review HTTPS.
8. **noindex kontrolü:** `curl -sI https://<review-domain>/ | grep -i x-robots-tag` → `noindex` görülmeli.
   Görülmezse deploy **NO-GO**; `robotsPolicyForTier` bağlaması (sözleşme §5) onaylanıp uygulanır.
9. **Guard:** deploy'dan önce CI/Vercel build ortamında:
   `npm run validate:mobile-review-env` (web) — exit 0 değilse deploy edilmez.
   Mobil build öncesi: `NEVII_DEPLOYMENT_TIER=review EXPO_PUBLIC_API_URL=… npm run validate:mobile-review-env -- --target=store`.
10. **Runtime logs/health:** `curl -s https://<review-domain>/api/v1/health` → `storeMode: "db"`;
    `/api/v1/ready` → `database.reachable: true`; Vercel Runtime Logs açık tutulur.
11. **Rollback planı:** §7.

## 3. Deployment sonrası smoke test

| # | Kontrol | Beklenen |
|---|---|---|
| 1 | `GET /api/v1/health` | 200, `storeMode: "db"` |
| 2 | Login (her üç demo rol) | 200, oturum açılır |
| 3 | Session refresh | yeni access token, tekrar login gerekmez |
| 4 | Logout | refresh reddedilir, korumalı çağrı 401 |
| 5 | Teacher program | haftalık program yüklenir |
| 6 | Teacher attendance | yoklama kaydı, tekrar gönderimde çift kayıt yok |
| 7 | Teacher makeup | telafi listesi/aksiyonu |
| 8 | Student program | kendi programı |
| 9 | Student homework | ödev listesi |
| 10 | Student payment history | yalnız kendi ödemeleri |
| 11 | Guardian child context | `GET /api/v1/mobile/session` → `portalAccessType: "GUARDIAN"` |
| 12 | Guardian attendance | yalnız bağlı öğrenci |
| 13 | Guardian makeup | yalnız bağlı öğrenci |
| 14 | Receipt | read-only; yazma denemesi 403/405 |
| 15 | Unsupported role (ör. SCHOOL_ADMIN mobilde) | anlaşılır "desteklenmiyor" ekranı |
| 16 | 401 / 403 / 404 / 429 / 5xx | Türkçe hata durumu, crash yok |
| 17 | Network retry | geçici hata sonrası yeniden deneme çalışır |
| 18 | `x-robots-tag` header | `noindex` |

## 4. Expo Go testi

- [ ] iPhone ve Android, `EXPO_PUBLIC_API_URL` = review/test **HTTPS** (LAN IP değil).
- [ ] Student, Guardian, Teacher akışları (§3 5–15).
- [ ] Offline (uçak modu) → anlaşılır hata; geri gelince toparlanma.
- [ ] Weak network (Network Link Conditioner / Android throttling).
- [ ] Uygulamayı kapat/aç → oturum korunur.
- [ ] Logout sonrası geri tuşu korumalı ekrana dönmez.
- [ ] Deep link (`neviihub://…`) ve bilinmeyen route → güvenli fallback.

## 5. EAS preview go/no-go

| Madde | Durum |
|---|---|
| Apple Developer hesabı / Team ID | ☐ |
| Google Play Console hesabı | ☐ |
| EAS project (`eas init`, owner hesabıyla) | ☐ |
| Bundle identifier `com.neviihub.mobile` | ✅ app.json |
| Android package `com.neviihub.mobile` | ✅ app.json |
| App icon / adaptive icon | ✅ |
| Splash | ✅ |
| Review environment URL EAS `preview` env'de | ☐ |
| Guard `--target=mobile` exit 0 | ☐ |
| Binary'de production secret yok (yalnız `EXPO_PUBLIC_API_URL`) | ☐ |
| Preview build number (EAS remote) not edildi | ☐ |
| Gerçek cihaza kurulum | ☐ |

Tümü ✅ değilse **NO-GO**.

## 6. Store test go/no-go

| Madde | Durum |
|---|---|
| TestFlight build + internal tester | ☐ |
| Google Internal Testing track + tester listesi | ☐ |
| App Store review demo credentials (App Store Connect "Sign-in required" alanına; dokümana değil) | ☐ |
| Privacy Policy URL | ☐ |
| Support URL | ☐ |
| Terms URL | ☐ |
| Account deletion policy (uygulama içi veya web yolu — Apple 5.1.1(v)) | ☐ |
| App Privacy (Apple) beyanı | ☐ |
| Data Safety (Google) beyanı | ☐ |
| Screenshot set (iPhone 6.7"/6.5", iPad — `supportsTablet: true` ise, Android) | ☐ |
| Support email: **info@neviihub.com** | ☐ |
| Guard `--target=store` exit 0 (review tier) | ☐ |

## 7. Rollback

- **Review deploy rollback:** Vercel → Deployments → önceki sağlıklı review deployment → "Promote/Redeploy";
  gerekirse review domain'i deployment'tan ayrılır. Production'a dokunulmaz.
- **Test DB rollback policy:** review yalnız test Supabase'e yazar; demo veri bozulursa canonical yönetim akışıyla
  düzeltilir. SQL/seed/reset yalnız ayrı insan onayıyla ve `preflight:test-*` guard'larından sonra.
- **Production untouched confirmation:** production Vercel env değişmedi, `main` deploy edilmedi, production
  Supabase'e bağlanılmadı — guard çıktısı (`DATABASE_URL: points-to-expected-tier (hedef=test …)`) kanıt olarak saklanır.
- **Migration:** bu akışta migration uygulanmadıysa migration rollback **gerekmez**.

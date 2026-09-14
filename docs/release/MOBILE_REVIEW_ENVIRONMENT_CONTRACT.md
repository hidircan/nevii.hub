# Mobile Review Environment Contract (secret içermez)

- Tarih: 2026-09-13 · Base: `4e0451c` · Guard kodu: `scripts/release/mobile-review-env.ts`
- Doğrulama: `npm run validate:mobile-review-env [-- --target=web|mobile|store]` · Testler: `npm run test:release`
- Bu belgede **hiçbir değer yok** — yalnız değişken İSİMLERİ ve politika.

## 1. Ortamlar

| | local | test | review | production |
|---|---|---|---|---|
| Amaç | Geliştirme | İç kabul testi (A/B/C/D, smoke) | **App Store / Google Play review + TestFlight/Internal** | Gerçek müşteriler |
| Supabase | yok / local Postgres | `neviihub-test` | `neviihub-test` (ayrı proje/şema kararı operatörde; production ASLA) | `NeviiHub` (production) |
| Branch | worktree | `test` | ayrı review branch (ör. `mobile-review`); **`main` değil** | yalnız `main` |
| Public erişim | yok | kısıtlı | **public HTTPS** (store reviewer erişmeli) | public |
| Vercel SSO | — | **kapalı** (test.neviihub.com public, 2026-09-14) | **`/api/v1/**` için KAPALI** (native istemci SSO çerezi taşımaz) | kapalı |
| robots/noindex | — | noindex, nofollow | **noindex, nofollow** | mevcut SEO korunur |
| `EXPO_PUBLIC_API_URL` | Mac LAN IP / localhost | test HTTPS | review HTTPS | production HTTPS |
| Gerçek cihaz | LAN'da | evet | evet | evet |
| Expo Go | evet | evet | evet | hayır (store build) |
| EAS preview | hayır | evet | evet | hayır |
| TestFlight / Internal | hayır | **hayır → review kullan** | **evet** | release build |
| Müşteri verisi | hayır | hayır | **hayır** — yalnız demo | evet |
| Ödeme / e-posta / SMS / WhatsApp | console | **console** (sandbox/test modu dahil kapalı) | **console; sandbox/test modu dahil KAPALI** | gerçek |

## 2. Kesin ortam matrisi

| Ortam | Branch | DB | Public erişim | Vercel SSO | Expo Go | EAS Preview | Store Review | Production veri |
|---|---|---|---|---|---|---|---|---|
| local | worktree | local/json | Hayır | — | Evet (LAN) | Hayır | Hayır | Hayır |
| test | `test` | test Supabase | Kısıtlı | Açık olabilir | Evet | Evet | **Hayır** | Hayır |
| review | review branch (≠ `main`) | test Supabase | **Evet (HTTPS)** | **API için kapalı** | Evet | Evet | **Evet** | **Hayır** |
| production | `main` | production Supabase | Evet | Kapalı | Hayır | Hayır | Release | Evet |

## 3. Değişken sözleşmesi (yalnız isimler)

| Değişken | Hedef | Kural |
|---|---|---|
| `NEVII_DEPLOYMENT_TIER` | hepsi | **zorunlu**; `review` \| `test` \| `production`; eksik/geçersiz → fail |
| `NODE_ENV` | web: `production` zorunlu · mobile/store: `development` → fail | Vercel preview de `production` taşır; tier'ı AYIRT ETMEZ |
| `STORE_MODE` | web | **`db` zorunlu** — `json` Vercel'de `/tmp`'ye yazar, `memory` her cold start'ta sıfırlanır; review'da login/yoklama kaybolur |
| `DATABASE_URL` | web | zorunlu; review/test → test ref, production → production ref (`classifyDatabaseTarget`) |
| `DIRECT_URL` | web | varsa aynı kural (bugün kod kullanmıyor; `prisma.config.ts` yalnız `DATABASE_URL` okur) |
| `NEXT_PUBLIC_SUPABASE_URL` | web | review/test'te production ref → fail; production'da test ref → fail |
| `APP_BASE_URL` (fallback `NEXT_PUBLIC_APP_BASE_URL`) | web | kanonik public app URL; HTTPS, public host, userinfo/query yok; review/test'te production domain → fail, production'da yalnız production domain |
| `EXPO_PUBLIC_API_URL` | mobile/store | mobil istemcinin TEK backend değişkeni (`apps/mobile/src/api/client.ts`); aynı URL kuralları |
| `VERCEL_ENV`, `VERCEL_GIT_COMMIT_REF` | web (Vercel sistem değişkenleri) | review/test'te `production` / `main` → fail; production web'de **zorunlu** — eksik veya `production` / `main` dışı → fail |
| `NEVII_PRODUCTION_HOSTS` | opsiyonel | virgüllü production host listesi; varsayılan `neviihub.com, www.neviihub.com, notaplan.vercel.app` |
| `PROD_SUPABASE_REF`, `TEST_SUPABASE_REF` | opsiyonel | mevcut guard override'ları (`src/lib/env/test-target-guard.ts`) |
| `PAYMENT_PROVIDER`, `IYZICO_BASE_URL`, `EMAIL_PROVIDER`, `SMTP_*`, `WHATSAPP_PROVIDER`, `SMS_PROVIDER`, `TWILIO_*`, `SMS_TEST_MODE` | web review/test | sağlayıcı açık → fail: `PAYMENT_PROVIDER` console dışı (iyzico sandbox dahil), SMTP, WhatsApp console dışı, Twilio SMS (`SMS_TEST_MODE` olsa da). Seçim kuralları `src/lib/*/config.ts` ile aynı |
| `AUTH_DEMO_*`, `SMS_TEST_MODE`, iyzico sandbox | web production | tanımlıysa → fail (demo/test yapılandırması production'a taşınmış; `IYZICO_BASE_URL` boşsa kod sandbox'a düşer) |

> Görevde geçen `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_MOBILE_API_URL`, `MOBILE_API_URL` repoda **yok**. Kanonik
> karşılıkları `APP_BASE_URL` ve `EXPO_PUBLIC_API_URL`; yeni isim icat edilmedi.

## 4. Review ortamı kuralları

1. Ayrı test Supabase — production DB/ref **asla** (`DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`).
2. Yalnız test/demo veri; demo hesaplar gerçek kişi içermez, parolalar dokümana/loga yazılmaz.
3. Public HTTPS; localhost, `127.*`, `0.0.0.0`, özel LAN IP, `.local`, tek etiketli host → fail.
4. Native mobil istemci erişebilmeli: Vercel SSO/Deployment Protection `/api/v1/**`'yi bloklamamalı.
5. Uygulama içi login zorunlu kalır (public erişim ≠ kimliksiz erişim).
6. Production domain (`neviihub.com` vb.) review URL'i olamaz.
7. Arama motoru indekslemesi engellenir (noindex, nofollow — §5).
8. Gerçek ödeme/e-posta/SMS/WhatsApp kapalı.
9. Vercel Runtime Logs + `/api/v1/health` / `/api/v1/ready` ile gözlemlenebilir. İkisi de public-safe: yalnız
   `service: "NeviiHub"`, `healthy`/`ready`, `time` (bkz. `PUBLIC_ENDPOINT_SECURITY_INVENTORY.md`).

## 5. Noindex / review safety

- Repoda `robots.ts`/`robots.txt` ve root `metadata.robots` **yok**; production'ın mevcut davranışı varsayılan
  (index serbest) ve **aynen korunur**.
- **Runtime bağlaması (2026-09-14, `release/mobile-review`):** `next.config.ts` `headers()` →
  `robotsPolicyForTier(NEVII_DEPLOYMENT_TIER, VERCEL_ENV)` (`src/lib/env/robots-policy.ts`) null değilse tüm
  yollara (HTML + `/api/**`) `X-Robots-Tag: noindex, nofollow` ekler. Tek mekanizma; metadata/robots.txt eklenmedi
  çünkü runbook doğrulaması header'a (`curl -sI`) dayanır ve native API yanıtlarını da kapsamalı.
- Karar tablosu:

  | `NEVII_DEPLOYMENT_TIER` | `VERCEL_ENV` | Sonuç |
  |---|---|---|
  | `review` / `test` | herhangi | `noindex, nofollow` |
  | `production` | herhangi | header yok (mevcut SEO) |
  | eksik / geçersiz | `production` | header yok — tier'ı henüz tanımlanmamış production domain'i indeksten düşmesin |
  | eksik / geçersiz | diğer / yok | `noindex, nofollow` (fail-closed) |

- **Build-time:** Next `headers()` build sırasında `routes-manifest`'e yazılır → `NEVII_DEPLOYMENT_TIER` Vercel'de
  build'e görünür olmalı (Vercel env değişkenleri build'de de okunur); değer değişirse **redeploy** gerekir.
- Testler: `npm run test:release` (politika + `next.config` `headers()` çıktısı, production'da header yokluğu,
  sızıntı yokluğu). Yerel kanıt: tier'sız `next start` → `/` ve `/api/v1/*` yanıtlarında `X-Robots-Tag: noindex, nofollow`.
- Review custom domain'inde deploy sonrası runbook §2.8 / §3 #18 `curl -sI` ile yine **doğrulanır**, varsayılmaz.

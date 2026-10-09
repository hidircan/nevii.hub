# VERCEL / SUPABASE COST RUNBOOK

> Canlı kota görünürlüğü, alarm eşikleri ve aksiyonlar. Fiyat/limit
> hard-code edilmez — eşikler ölçümden türetilir, ilk 7 gün baz alınır.

## 1. Mimari özeti (maliyet açısından)

- **Vercel:** Next.js API (`force-dynamic` JSON) + dosya proxy indirmeleri.
  Tüm JSON yanıtlar `private, no-store` + `Vary: Authorization` (CDN yanlış-cache yok).
- **Sunucu cache:** best-effort, instance-içi, 60sn TTL, tenant-kapsamlı anahtar
  (`dashboard-summary`, `finance-summary`, `homework-report`). Miss = normal sorgu.
- **Supabase:** Postgres (Prisma) + Storage (`announcement-attachments`, private).
  Dosya indirmeleri yetki kontrolü için sunucu proxy'sinden geçer (bayt Vercel'den
  akar — bilinçli güvenlik/maliyet takası). Realtime aboneliği YOK.
- **Cron:** GitHub Actions `notification-tick` (10dk) → `POST /api/v1/notifications/tick`
  (Bearer secret, idempotent `dedupeKey`, tenant-izole).

## 2. Env şablonu (değer YAZMAYIN — yalnız ad + açıklama)

| Değişken | Zorunlu | Açıklama |
|---|---|---|
| `COST_METRICS_SAMPLE_RATE` | Hayır | `cost_metric` örnekleme oranı [0,1], varsayılan 0.1. Kota baskısında düşürün (ölçümün kendisi log üretir). |
| `NOTIFICATION_CRON_SECRET` | Evet (canlı) | Tick Bearer secret'ı; GitHub secret'ıyla AYNI değer. |
| `APP_BASE_URL` | Evet (canlı) | Cron hedefi (GitHub secret): `https://…` herkese açık HTTPS. |
| `NEXT_PUBLIC_SUPABASE_URL` | Evet | Supabase proje URL'si. |
| `SUPABASE_SERVICE_ROLE_KEY` | Evet | YALNIZ sunucuda; istemciye/ repoya asla. |
| `EXPO_PUBLIC_API_URL` | Evet (mobil) | Mobil API tabanı; cihazdan erişilebilir HTTPS (canlı). |

Doğrulama (değer yazdırmadan): `npm run preflight:push` + `npm run preflight:cost-efficiency`.

## 3. İzlenecek metrikler (ilk 7 gün)

| Metrik | Kaynak | Baz çizgisi | Aksiyon eşiği |
|---|---|---|---|
| Günlük function invocation | Vercel Analytics/Logs | 1–3. gün ortalaması | Baz × 1.5 (2 gün üst üste) → §5 |
| Endpoint süreleri (p50/p95) | `cost_metric` durationMs | route bazında p95 | p95 >1sn (3 gün) → sorgu/pencere incelemesi |
| Yanıt baytı (p95, route bazında) | `cost_metric` responseBytes | route bazında | schedule p95 >200KB → pencere daraltma |
| Cache hit (sunucu özetler) | `cost_metric` cached | >%50 hedef | <%30 → TTL/anahtar incelemesi |
| Cache hit (mobil) | UAT `getCacheStats` | freshHits/reads >%60 warm | <%40 → TTL/ekran incelemesi |
| DB query yoğunluğu | Supabase Dashboard | 1–3. gün | Baz × 1.5 → index planı (§6) |
| Storage egress | Supabase Storage | 1–3. gün | Baz × 2 → dosya erişim denetimi |
| Auth refresh yoğunluğu | `cost_metric` route=`/api/v1/auth/refresh` | düşük/sabit | Ani artış → token ömrü/istemci incelemesi |
| Push tick sonucu | `notifications.tick` audit | created/error sayaçları | `*TenantErrors` >0 (2 koşu) → tenant verisi incelemesi |
| Error/retry rate | `cost_metric` status + mobil | <%1 5xx | >%2 5xx (1sa) → olay müdahalesi |
| Crash-free session | Expo/Sentry (varsa) | >%99 | <%98 → sürüm incelemesi |

## 4. Alarm kuralları (Vercel/Supabase konsolunda manuel kurulur)

1. **Invocation artışı:** günlük invocation > 7-günlük baz × 1.5 → uyarı.
2. **Yavaş uç:** `cost_metric` forced (yavaş/5xx) oranı >%5/saat → uyarı.
3. **Cron sessizliği:** `notifications.tick` success audit'i >30dk yok → kritik
   (cron secret/URL kontrolü).
4. **Cron hatası:** `*TenantErrors` >0 iki koşu üst üste → uyarı.
5. **Storage sıçraması:** günlük egress > baz × 2 → uyarı (toplu indirme taraması).

## 5. Kota baskısı oyun kitabı (güvenli davranış)

Sırayla, etkiyi ölçerek uygulayın. Kritik mutation ve auth akışları ASLA
devre dışı bırakılmaz; yetki/audit/idempotency gevşetilmez.

1. `COST_METRICS_SAMPLE_RATE` düşürün (0.1 → 0.02): ölçüm log maliyetini azaltır.
2. Bildirim tick sıklığını gevşetin (10dk → 15dk): `.github/workflows/notification-tick.yml`
   cron'u + runbook güncelleyin. Hatırlatma pencereleri etkilenir (kabul edilebilir).
3. Sunucu özet TTL'lerini uzatın (60sn → 5dk): `admin-lists.ts` + `tools.ts`
   `serverCacheGetOrCompute` çağrıları; "canlı" etiketi olmadığı için güvenli.
4. Mobil TTL'leri uzatın (örn. schedule 15dk → 30dk): `cache-keys.ts` + yeni
   mobil sürüm gerekir (mağaza süreci!).
5. Non-kritik backfill/refresh işlerini durdurun; pull-to-refresh ve push
   revalidation ÇALIŞMAYA DEVAM EDER.
6. Kullanıcıya düşük-veri sinyali: stale rozeti zaten var; ek banner KONSERVATİF
   (sahte "güncel" etiketi yasak).

## 6. DB index planı (DB modunda, ölçüm sonrası)

JSON-store modunda `readData` tam-okuma mimari gerekliliktir. Prisma/Postgres
modunda, `cost_metric` yavaş-uç verisine göre sırayla değerlendirin:

- `Lesson(studentId, startAt)`, `Lesson(teacherId, startAt)` — program pencereleri.
- `Payment(studentId, status, dueDate)` — ledger + süpürmeler.
- `Notification(userId/studentId, createdAt)` — sayfalama.
- `MakeupRequest(teacherId/studentId, status)` — telafi listeleri.

Her index: migration + `EXPLAIN` doğrulaması + geri alma notu. RLS bypass ASLA.

## 7. Production checklist (canlıya alım)

- [ ] Vercel env: `COST_METRICS_SAMPLE_RATE` (opsiyonel), Supabase anahtarları, cron secret.
- [ ] Supabase: `announcement-attachments` private bucket, RLS politikaları, bağlantı havuzu.
- [ ] Mobil: `EXPO_PUBLIC_API_URL` canlı HTTPS; `apps/mobile/.env.example` dokümantasyonu güncel.
- [ ] Sentry (varsa): PII-safe yapılandırma (token/e-posta/telefon scrub).
- [ ] Vercel log drain: `cost_metric` satırları görünüyor.
- [ ] Cron: GitHub secrets (`APP_BASE_URL`, `NOTIFICATION_CRON_SECRET`) + son koşu success.
- [ ] Push: `npm run preflight:push` yeşil (hedef ortama göre).
- [ ] Maliyet: `npm run preflight:cost-efficiency` yeşil.
- [ ] Rollback: önceki Vercel deployment'ı işaretli; mobil mağaza aşamalı dağıtım.

## 8. Rollback planı

- **Sunucu:** Vercel'den önceki deployment'a anında geri alma (şema değişikliği
  YOK — bu turda migration yok).
- **Mobil:** mağaza aşamalı dağıtımı durdurma + önceki sürüme dönüş. Cache formatı
  (`CACHE_VERSION`) değişmedi — eski/yeni sürüm aynı kayıtları okur.
- **Cron:** workflow'u `workflow_dispatch`-only yapma (schedule satırını yorumlama).

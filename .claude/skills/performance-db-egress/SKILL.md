---
name: performance-db-egress
description: NeviiHub performans ve maliyet işleri — Supabase egress / Usage kotası, yavaş sorgu (slow query, pg_stat_statements), tam readData() okumaları, UserSession kilit/gecikme, Vercel Active CPU, polling, bağlantı/statement timeout, bench ölçümü (önce/sonra). "Egress arttı", "Supabase kısıtlama uyarısı", "sayfa yavaş", "DB hatası", "CPU uyarısı" denince kullan.
---

# Performans / DB egress (NeviiHub)

Kalıcı kurallar + yöntem burada. **Tarihli durum (sayılar, kalan yollar, baseline) burada DEĞİL** — her oturumda
yeniden doğrula: en yeni `docs/performance/DB_EGRESS_*.md` (şu an `DB_EGRESS_2026_10_17.md` §2 kalan yollar),
`QUOTA_AUDIT_2026_10_12.md` (Vercel CPU + alternatif altyapı), `DB_EGRESS_2026_10_10.md`, `DB_EGRESS_2026_09_30.md`,
`docs/agent-memory/PROJECT_STATE.md`, `LESSONS_LEARNED.md` (2026-10-10 maddesi).

## 1. Geçmiş (kısa)
- 2026-09-30: dar dilimler (`reference-data.ts`) + logo hiç okunmaz → sayfa okumaları −83 %.
- 2026-10-01: Vercel Hobby Active CPU %75 → `@/components/link` (prefetch kapalı, ESLint `next/link` yasak), polling ≥5 dk.
- 2026-10-10 (PR #21, prod deploy `cf12bc0`): yoklama/ders başlat-bitir-oluştur/tahsilat/öğretmen ana sayfa/makbuz/
  ödeme profili/Öğretmenler tam okumadan çıktı (−84…−98 %); UserSession tek ifade + koşullu yazım + `after()`.
  Kanıt: üretim `pg_stat_statements` ekran görüntüsü (Lesson/Payment `schoolId IN … OFFSET`, tarih filtresiz).
- 2026-10-13/14 (#26/#27): `egress:readData:full` ölçüm satırı; evrak/ödev listeleri dosya gövdesi okumaz (`omit`).
- 2026-10-16 (#55/#56): bildirim tekilleştirmesi SQL'de (19 M Notification satırı/gün!), tick Vercel Cron `*/10` yalnız
  ders penceresi + günde 1 tam tur; Telafi Merkezi dilimi; tek kurumlu "Tüm kurumlar" dar yolda; cırcır testi.
- 2026-10-17 (`perf/egress-p3`): canlı log (33 sa ~280 tam okuma ≈ 500 MB/gün) → Ders Programı seri önizle/oluştur
  (istek başına 1+3 tam okuma), mobil listeler/defterler/programlar, öğretmen detay sekmeleri dar dilime (−85…−98 %).

## 2. Kalıcı kurallar (kod yazarken)
1. **"Var mı" kontrolü için tam `readData()` YAZMA.** Tek satır okuyucu kullan; yoksa önce onu ekle (3 store modu).
   Katalog (`src/lib/store.ts`): `readStudentById`, `readLessonById`, `readPaymentById`, `readTeacherPayoutsForTeacher`;
   dilimler: `readReferenceData` (ders/ödeme yok), `readStudentScope` (tek öğrenci), `readLessonWindow` /
   `readPayoutWindow` / `readDashboardData` (tarih penceresi; çağıran kesin filtreden ±1–2 gün geniş verir),
   `readStudentListData`, `readPaymentsPageData`, `readLessonScope` (tek ders mutasyonu), yeni ders için
   `store-db.readSlotScope` ≡ `lesson-scope.ts narrowSlotScope`; seri/tool için `readSlotScopeData(target, days)`
   (seri: `seriesScopeDays`), `readLessonSeriesForStudent`, `readLessonsForTeacher`, `readLessonsStartingBetween`,
   `readMakeupCenterData`. Panel sayfaları `institution/context.ts readScoped*` (+ `readScopedTeacherPayouts`).
   Saf doğrulayıcı `AppData` istiyorsa pencere dilimine boş koleksiyon ekle (`{ ...win, payments: [], … }`) — yalnız
   o fonksiyonun gerçekten okumadığı koleksiyonlar (ör. `validateLessonSlot`: ayarlar/öğretmen/oda/öğrenci/ders).
2. **Mod paritesi:** db dilimi Prisma filtresiyle üretilir; json/memory aynı dilimi `narrow*` ile tam veriden türetir ve
   saf kuralı DİLİMLE çalıştırır, sonucu `mergeLessonScope` ile bütüne yazar. Dar veriyi asla `writeData`'ya "tam veri"
   diye verme (kayıt siler).
3. Dilim tipleri ağır koleksiyonu içermez → yanlış kullanım derlenmez. Saf fonksiyon `AppData` istiyorsa ve yalnız
   birkaç alan okuyorsa parametreyi `Pick<AppData, …>`'ya daralt (ör. `teacher-performance-v2.ts`).
4. **Prisma 7 `updateMany` = BEGIN→UPDATE→COMMIT.** Tek satır koşullu yazımda `update({ where: { id, …koşul },
   select: { id: true } })` kullan (tek ifade; eşleşmezse P2025 → `false`).
5. **Yanıt sonrası DB işi `after()` (next/server) ile**, `void (async…)()` ile değil (Vercel askıya alır → kilit/bağlantı
   açık kalır). İstek bağlamı yoksa `try { after(t) } catch { void t() }`.
6. Yüksek frekanslı yazımları DB'de koşulla seyrelt (UserSession: presence `lastSeenAt` 5 dk, refresh `expiresAt`).
   İptal kontrolünü ASLA gevşetme (`revokedAt IS NULL` koşulu).
7. `School.logoUrl` (~79 KB data-URI) yalnız logoyu gösteren ekranda; dilimlerde `omit: { logoUrl: true }`.
8. INSERT/UPDATE dönüşü kullanılmıyorsa `select: { id: true }` (geniş RETURNING yok). Audit kaydını egress için silme.
9. Polling/yenileme < 5 dk yok; `next/link` yok (`@/components/link`). Cache eklenirse tenant/rol anahtarlı, finans/auth
   doğruluğu gevşemez.
10. **`readData()` önüne istekler arası önbellek KOYMA** (2026-10-17 değerlendirildi, reddedildi): Vercel instance'ları
   arası bayat veri (tahsil edilmiş ödeme ödenmemiş görünür → mükerrer tahsilat), store içi kilitli çakışma
   doğrulaması bayat veriyle çalışır; React `cache()` bile yazım-sonrası-okumayı bozar. Çözüm her zaman dar dilim.
11. **Mobil/API uçları mağaza yayınından ÖNCE dar olmalı.** Her uygulama açılışı birden çok GET'i paralel atar
   (Kişiler, program, defterler); tek tam okuma × açılış × kullanıcı = kotanın en hızlı büyüyen kalemi.
12. Server Action tam okuması log'da `POST <sayfa yolu>` görünür; eylem adı satırın sonunda (`egress-label.ts`).
13. Cırcır (`egress-full-read-ratchet.test.ts`): json/memory'de yeni okuyucu `readData()` kullanır (yerel, egress yok) —
   taban çizgisini PR'da gerekçeyle yükselt; db/tool/sayfa dosyasında sayı yalnız AZALIR.

## 3. Kanıt toplama (erişim sınırları)
- Üretim Supabase (`wsbucz…`, org `neviihub-prod-org`) bu ortamdaki Supabase MCP'de GÖRÜNMEZ (yalnız eski org).
  Usage, Query Performance, `pg_stat_statements`, hata dökümü → owner'dan ekran görüntüsü iste. Sayaç başlangıcı bilinmez:
  "son 24 saat" deme; satır sayısını GB'a çevirme; Auth MAU 0 normal (kendi UserSession auth'u).
- Vercel (team `team_2B4OtczujC3syAAg8SWmvGS6`, project `prj_hmg2Nu2GtPs0JrfEcllpeUIbWpIG`): `get_runtime_errors`
  7 gün. **En hızlı kanıt:** `get_runtime_logs` `environment=production` `query="egress:readData:full"`
  `group_by=requestPath` `since="3d"` (Pro'da 3 gün çalıştı; Hobby'de yalnız 1 saat) → tam okuma yapan rotalar;
  `limit` ile tek satırlara bakıp aynı `request=` kimliğindeki satır sayısı = istek başına tam okuma.
  Deploy saati: `list_deployments target=production` (`created` ms) — "önce/sonra" penceresini ona göre seç. Env için
  `filter_project_envs decrypt=false` → yalnız ad/hedef ayrıştır, değer yazma. `list_deployments target=production`
  ile "merge ≠ deploy" kontrol et.
- Canlı DB'ye ops betiği gerekirse: port 5432 / `BEGIN TRANSACTION READ ONLY`; `:6543`'te asla session `SET`.
  Canlıda load test, toplu export, dump, `pg_stat_statements_reset` YOK.
- Tel düzeyinde SQL görmek: `scripts/_x.tmp.ts` içinde `pg.Client.prototype.query`'yi sarıp log'la, çalıştır, SİL.

## 4. Ölçüm (önce/sonra) — yalnız yerel tek kullanımlık DB
```bash
scripts/bench/reseed-bench-db.sh                    # her koşudan ÖNCE (3 200 ders · 1 300 ödeme · 228 öğrenci · 2 kurum)
# (node_modules kurulu worktree'de; dışarıdan verilen DATABASE_URL'ü .env ezmez — doğrulandı 2026-10-12)
export DATABASE_URL=postgresql://$USER@127.0.0.1:5432/neviihub_egress_bench_p0
STORE_MODE=db npx tsx scripts/bench/bench-tool-egress.ts --label after     # tool/mutasyon + oturum
npx tsx scripts/bench/bench-db-egress.ts --app . --label after --repeats 1   # sayfalar (önce `npx next build`)
STORE_MODE=db npx tsx scripts/bench/verify-db-slices.ts                     # dilim ≡ tam veri, 0 hata beklenir
```
- "Önce": `git worktree add --detach ../nevii-hub-perf-base origin/main` → `npm ci` → `npx prisma generate` →
  `npx next build`; bench betiklerini oraya kopyala (yeni betikler tabanda yok); sayfa bench'i `--app ../nevii-hub-perf-base`.
- İçerik eşitliği: aynı DB durumunda `textBagSha` karşılaştır (yeniden tohumlama saat/sıra farkı üretir).
- Rapor dili: "DB→uygulama baytı (yerel, sentetik)", faturalanan egress DEĞİL; HTTP boyutu ayrı sütun.
- Tuzaklar: Prisma `startsWith` `_`'yi kaçırmaz (kimliği JS'te süz); havuz `pool.query` callback biçimi (satır sayacı
  callback'i sarmalı); güz döneminde Pazartesi kapalı, oda enstrüman kısıtlı (fixture seçimi); json merge satır sırasını
  değiştirir (testte kimliğe göre sırala); test/verify'ın dişini mutasyonla kanıtla (değiştir → kırıldı mı → geri al).

## 5. Altyapı kararları (2026-10-17, kanıtla değişmedikçe yeniden açma)
- Egress %100 Shared Pooler (Prisma satırları); Storage ≈ 0, dosya kolonları canlıda boş → **R2'ye taşıma bugün kazanç
  vermez** (yükleme hacmi büyürse `src/lib/storage/*` arayüzüne R2 adaptörü). **D1 yok** (günlük limit = kesinti, SQL/kilit
  yeniden yazımı). Hosting değişimi egress'i değiştirmez; Workers Free 10 ms CPU → bcrypt girişi sığmaz (Paid $5/ay).
- Vercel Pro → Hobby: `*/10` cron Hobby'de deploy'u reddeder → `apps/cloudflare-cron` (Workers Free Cron Trigger) +
  `vercel.json` crons kaldır, aynı PR.

## 6. Teslim
- Rapor: kanıt → dosya/fonksiyon → değişiklik → test → ölçülen kazanım tablosu; önce/sonra; kalan yollar; deploy/rollback;
  smoke test; 24–48 saat izleme (deploy saati, günlük egress eğilimi, Query Performance çağrı artış hızı, Vercel hataları).
  Yeni `docs/performance/DB_EGRESS_<tarih>.md` yaz; bu dosyadaki kalıcı kurala yeni ders eklenirse buraya da ekle.
- Kapı ve tam test paketinde başarısızlık varsa aynı dosyaları taban worktree'de koş, yalnız yenileri say.
- Migration gerekirse yalnız eklemeli, yerelde doğrulanmış; canlıya owner onayıyla (bkz. `api-data-change`,
  `production-readiness`). Her prod deploy owner sürüm onayı ister.

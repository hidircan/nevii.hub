# Production Database — Source of Truth Audit

> ⚠️ **2026-10-01'den beri güncel değil:** canlı DB `wsbucznpujcfzhitzrbl`; `vxzewyiwfshobjizzetw` gerçek veri
> taşıyan salt-okunur geri dönüş kaynağıdır (test hedefi DEĞİL); `uqkafczrplqitzumtrqy` artık erişilebilir değil.
> Güncel model ve ortam haritası: `docs/operations/LOCAL_FIRST_DEPLOYMENT.md`.

**Tarih:** 2026-09-06 · **Taban:** `infra/vercel-test-environment` @ `12060fa`
**Yöntem:** salt-okunur kaynak kod analizi + herkese açık production endpoint'leri +
salt-okunur Supabase Management API sorguları. **Hiçbir secret değeri okunmadı,
gösterilmedi veya yazıldı. Hiçbir veritabanına yazılmadı.**

---

## Yönetici özeti (tek cümle)

**Production uygulaması bugün hiçbir veritabanı kullanmıyor** — canlı deployment
`STORE_MODE=memory` ile çalışıyor, yani tüm veri process belleğinde tutuluyor ve
her cold start'ta sıfırlanıyor; production Supabase projesi (`uqkafczrplqitzumtrqy`)
bu yüzden **sıfır tablo** içeriyor.

---

## Kanıt tablosu

| # | Soru | Sonuç | Kanıt dosyası/symbol | Kesinlik |
|---|------|-------|----------------------|----------|
| 1 | Production uygulama hangi `STORE_MODE` ile çalışıyor? | **`memory`** | `GET https://notaplan.vercel.app/api/v1/health` → `{"storeMode":"memory"}` (2026-09-06 02:41 UTC). Endpoint `src/app/api/v1/health/route.ts:13`, `STORE_MODE`'u herkese açık döndürüyor. | VERIFIED_FROM_DEPLOYMENT_METADATA |
| 2 | Prisma production runtime'da aktif mi? | **Hayır** | `src/lib/store.ts` backend'i `STORE_MODE`'a göre seçer; `memory` modunda `src/lib/db.ts` (`getPrisma`) hiç import edilmez. `isDbMode` (`src/lib/config.ts:14`) false. | VERIFIED_FROM_SOURCE |
| 3 | `DATABASE_URL` hangi kod tarafından kullanılıyor? | 4 yer, hepsi koşullu | `src/lib/db.ts:10` (yalnız `STORE_MODE=db`), `prisma.config.ts:15` (yalnız Prisma **CLI**), `src/lib/ai/memory/vector/pgvector-store.ts:16` (yalnız `VECTOR_BACKEND=pgvector`), `src/app/api/v1/ready/route.ts:30` (yalnız varlık kontrolü). | VERIFIED_FROM_SOURCE |
| 4 | Supabase production public schema neden boş? | **Hiç migration uygulanmadı + uygulama zaten DB'ye yazmıyor** | Supabase Management API (salt-okunur): `list_tables(uqkafczrplqitzumtrqy, public)` → `[]`; `list_migrations` → `[]`. Ayrıca #1: runtime `memory` modunda. | VERIFIED_FROM_DEPLOYMENT_METADATA |
| 5 | Supabase production gerçekten aktif application database mi? | **Hayır** — sadece sağlanmış (provisioned) boş bir proje | #1 + #4. Proje `ACTIVE_HEALTHY`, PostgreSQL 17.6.1, ap-southeast-1; ama uygulama ona hiç bağlanmıyor. | VERIFIED_FROM_DEPLOYMENT_METADATA |
| 6 | Gerçek veri nerede tutuluyor? | **Process belleğinde**, cold start'ta `createSeedData()` ile yeniden üretiliyor | `src/lib/store-memory.ts` + `src/lib/seed.ts:357`. Kalıcılık YOK: her yeni lambda instance'ı sıfırdan seed'lenir. | VERIFIED_FROM_SOURCE |
| 7 | Supabase Storage aktif mi? | **Doğrulanamadı** — `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` production'da set edilmiş mi bilinmiyor | `src/lib/storage/index.ts:37-42`: ikisi de yoksa `resolveAdapter()` hata fırlatır (fail-closed, sahte başarı yok). Bucket: `announcement-attachments` (private). `/api/v1/ready` (storage durumunu döndürecek endpoint) canlıda **404** — o build'de henüz yok. | UNKNOWN_USER_ACTION_REQUIRED |
| 8 | Supabase Auth mı, custom JWT mi? | **Custom JWT/cookie/RBAC** — Supabase Auth kullanılmıyor | `src/lib/auth/config.ts:7` (`JWT_SECRET`), `jose` + `bcryptjs`, `src/middleware.ts`. `createServerClient` / `supabase.auth` kullanımı kaynakta **sıfır** (grep: `src/` altında hiç eşleşme yok). `@supabase/ssr` bağımlılığı yüklü ama çağrılmıyor. | VERIFIED_FROM_SOURCE |
| 9 | pgvector/memory hangi bağlantı üzerinden çalışıyor? | Varsayılan **`file`** backend — pgvector kapalı | `src/lib/ai/memory/vector/index.ts:18` → `VECTOR_BACKEND ?? "file"`. `pgvector-store.ts:16` seçilirse `DATABASE_URL \|\| PGVECTOR_URL` kullanır. Test projesinde `vector` extension **mevcut ama kurulu değil** (`installed_version: null`). | VERIFIED_FROM_SOURCE |
| 10 | Prisma migration'ları committed mi? | **Evet — 65 migration dizini** | `prisma/migrations/` (ilk: `20260802152131_add_ai_audit_log`, son: `20260905120000_student_lesson_start_date`). | VERIFIED_FROM_SOURCE |
| 11 | `migration_lock.toml` eksik mi? | **Eksikti — bu commit'te eklendi** (`provider = "postgresql"`) | Dosya bu çalışmadan önce `prisma/migrations/` altında yoktu; `prisma migrate deploy` provider doğrulamasını yapamıyordu. | VERIFIED_FROM_SOURCE |
| 12 | Test Supabase'e gerçek şemayı taşımak için doğru source nedir? | **`prisma/migrations/` → `npx prisma migrate deploy`** | `db push` bu repoda günlük yol değil (`docs/project-brain/API_AND_DATA.md:11`, `CLAUDE.md`). 65 migration zaten sıralı ve committed; boş bir veritabanına ilk kurulum için doğru komut `migrate deploy`. **`db push` KULLANILMAMALI** — `_prisma_migrations` tablosunu doldurmaz, sonraki `migrate deploy` çağrıları drift görür. | VERIFIED_FROM_SOURCE |
| 13 | Production migration öncesi kesin gereken adımlar? | Aşağıdaki "Production öncesi zorunlu adımlar" bölümü | — | INFERRED |

---

## Ek kanıtlar (production'ın gerçekte ne çalıştırdığı)

| Gözlem | Kanıt |
|---|---|
| `neviihub.com` **DNS'te yok** | `dig +short neviihub.com A/CNAME` → boş; `curl` → `Could not resolve host`. Production bugün yalnız `notaplan.vercel.app` üzerinden erişilebilir. |
| `test.neviihub.com` DNS'te yok | `dig +short test.neviihub.com` → boş (beklenen — henüz oluşturulmadı). |
| Canlı build ESKİ marka ile | `notaplan.vercel.app` HTML `<title>` → **"Maestron — Müzik Okulu Yönetimi"**. Marka `Nevii Hub`'a geçmiş commit'ler canlıda YOK. |
| Canlı build `/api/v1/ready` içermiyor | `GET /api/v1/ready` → **404**. Bu route local HEAD'de var → canlı build repo'nun çok gerisinde. |
| Local `main`, `origin/main`'in **178 commit** önünde | `git status -sb` → `## main...origin/main [ahead 178]`. LESSONS_LEARNED (2026-09-05) aynı olguyu 170 commit iken kaydetmiş; production `4ab2f3d`'den derleniyor. |
| Test Supabase de boş | `list_tables(vxzewyiwfshobjizzetw, public)` → `[]`. Temiz sayfa — ilk migration için ideal. |

---

## Kök neden zinciri (Supabase production neden boş)

```
STORE_MODE Vercel production'da set edilmemiş (veya "memory" olarak set edilmiş)
        │
        ▼
src/lib/config.ts:7  →  (process.env.STORE_MODE ?? "json")  →  runtime "memory"
        │
        ▼
src/lib/store.ts  →  store-memory.ts seçilir; src/lib/db.ts hiç yüklenmez
        │
        ▼
Prisma Client HİÇ instantiate edilmez  →  Supabase'e tek bir bağlantı bile açılmaz
        │
        ▼
Ayrıca: prisma migrate deploy production'a HİÇ çalıştırılmadı (0/65 uygulandı)
        │
        ▼
Sonuç: public schema'da 0 tablo, _prisma_migrations tablosu bile yok
```

**İki bağımsız neden var ve ikisi de doğru.** Yalnızca migration uygulamak
yetmez: `STORE_MODE=db` set edilmedikçe uygulama yine belleğe yazmaya devam eder.

---

## Kullanıcıdan gereken minimum kontrol (secret değeri PAYLAŞILMAYACAK)

Aşağıdaki iki bilgi yalnızca Vercel production environment'ından doğrulanabilir.
**Değerleri kimseyle paylaşmayın, buraya yazmayın** — yalnız "eşleşiyor/eşleşmiyor"
cevabı yeterli:

1. **`STORE_MODE`** production environment'ında hangi değere set edilmiş?
   (Beklenen sorun: hiç set edilmemiş veya `memory`.)
2. **`DATABASE_URL`**'in host/project-ref'i production Supabase ref'i
   (`uqkafczrplqitzumtrqy`) ile eşleşiyor mu?
3. Bonus: `NEXT_PUBLIC_SUPABASE_URL` ve `SUPABASE_SERVICE_ROLE_KEY` set mi
   (Storage'ın aktif olup olmadığı sorusu #7).

> Bu oturumda Vercel environment variable'ları **okunmadı ve değiştirilmedi**.

---

## Production öncesi zorunlu adımlar (henüz YAPILMADI — ayrı onay gerektirir)

1. Test ortamında (`neviihub-test`) tam şema migration'ı + demo seed + kabul testi
   tamamlanmadan production'a dokunulmaz.
2. Production Supabase'de **PITR/otomatik yedek durumu** doğrulanır. (Bugün veri
   olmadığı için risk düşük, ama süreç şimdi kurulmalı.)
3. `prisma migrate status` production'a karşı **SESSION pooler** (port 5432) ile
   çalıştırılır — transaction pooler'da (6543) komut sessizce asılı kalır
   (`docs/agent-memory/LESSONS_LEARNED.md`, 2026-09-05).
4. `STORE_MODE=db` + doğru `DATABASE_URL` Vercel production'a yazılır — **migration'dan
   SONRA**, aksi halde uygulama var olmayan tablolara sorgu atar.
5. `GET /api/v1/health` → `storeMode: "db"` ve `GET /api/v1/ready` →
   `database.reachable: true` ile canlı doğrulama yapılır.
6. `main`'e push, 178 commit'in **herkese açık** bir GitHub reposuna yayınlanması
   anlamına gelir (LESSONS_LEARNED 2026-09-05) — bu ayrı bir ifşa kararıdır.

---

## İlgili belgeler

- `docs/TEST_SUPABASE_RUNBOOK.md` — test veritabanına migration/seed adımları
- `docs/TEST_DATABASE_SAFETY.md` — guard davranışı ve secret maskeleme
- `docs/VERCEL_TEST_ENVIRONMENT_RUNBOOK.md` — Local → Test → Production akışı
- `docs/agent-memory/LESSONS_LEARNED.md` — PgBouncer/migrate ve release dersleri

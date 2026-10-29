# Test Supabase Runbook — `neviihub-test`

> ⚠️ **2026-10-01'den beri güncel değil:** canlı DB `wsbucznpujcfzhitzrbl`; `vxzewyiwfshobjizzetw` gerçek veri
> taşıyan salt-okunur geri dönüş kaynağıdır (test hedefi DEĞİL); `uqkafczrplqitzumtrqy` artık erişilebilir değil.
> Güncel model ve ortam haritası: `docs/operations/LOCAL_FIRST_DEPLOYMENT.md`.

**Hedef proje:** `neviihub-test` · ref `vxzewyiwfshobjizzetw` · bölge `ap-south-1`
**Production (DOKUNULMAZ):** `NeviiHub` · ref `uqkafczrplqitzumtrqy` · `ap-southeast-1`

> Bu runbook'taki hiçbir komut bu hazırlık oturumunda **çalıştırılmadı**.
> Test Supabase'e yazılmadı, migration/seed uygulanmadı. Aşağıdakiler operatörün
> açık onayından sonra, sırayla çalıştırılacak adımlardır.

---

## 1. Ön koşullar

- [ ] Test Supabase projesi `ACTIVE_HEALTHY` (doğrulandı 2026-09-06).
- [ ] `public` şeması boş (doğrulandı: 0 tablo — temiz ilk kurulum).
- [ ] `.env.test` dosyası `.env.test.example` şablonundan oluşturuldu ve
      **test** projesinin değerleriyle dolduruldu. Bu dosya commit EDİLMEZ.
- [ ] `STORE_MODE=db`.
- [ ] `DATABASE_URL` = test projesinin **transaction** pooler'ı (port `6543`,
      `pgbouncer=true`) — bu runtime içindir.
- [ ] Migration için ayrıca test projesinin **session** pooler'ı (port `5432`)
      elde hazır. **Bu repoda `prisma.config.ts` yalnız `DATABASE_URL` okur;
      `DIRECT_URL` OKUNMAZ** — migration komutlarında `DATABASE_URL`'i satır içi
      override etmek zorunludur.
- [ ] `npm ci` çalıştırıldı.

## 2. Test database preflight

```bash
npm run preflight:test-env      # env isimleri + hedef sınıfı + sızıntı uyarıları
npm run preflight:test-db       # yalnız hedef sınıflandırması
npm run preflight:test-migration  # + STORE_MODE + pooler modu + migration dizini
```

Üçü de `0` dönmeden **hiçbir migration çalıştırmayın**. Hepsi secret maskeler,
hiçbirine bağlantı açmaz (migration/seed çalıştırmaz).

## 3. Gerçek schema / migration source of truth

**`prisma/migrations/` — 65 committed migration.**
İlk: `20260802152131_add_ai_audit_log` · Son: `20260905120000_student_lesson_start_date`.
`prisma/migrations/migration_lock.toml` = `provider = "postgresql"`.

- ✅ Doğru komut: `npx prisma migrate deploy`
- ❌ **`npx prisma db push` KULLANMAYIN** — `_prisma_migrations` tablosunu
  doldurmaz; sonraki her `migrate deploy` şemayı "drift" olarak görür ve
  test/production arasındaki migration geçmişi kalıcı olarak ayrışır.

## 4. Migration komutu

`DATABASE_URL`'i **session pooler** (port 5432) ile satır içi override edin:

```bash
# <SESSION_POOLER_URL> = test projesinin port 5432 connection string'i.
# Değeri terminal geçmişine/loga yazmamak için önce bir dosyadan okuyun:
export DATABASE_URL="$(cat .env.test.session-url)"   # gitignore'lu, tek satır

npm run preflight:test-migration   # ZORUNLU — pooler modunu da doğrular
npx prisma migrate status          # beklenen: "65 migrations found ... 0 applied"
npx prisma migrate deploy          # ← ŞEMAYI UYGULAR
```

Transaction pooler (6543) ile çalıştırırsanız komut **hata vermeden sonsuza kadar
asılı kalır**; preflight bunu önceden yakalar.

## 5. Migration sonrası schema doğrulama

```bash
npm run verify:test-schema
```

Kontrol ettikleri: `public` tablo sayısı, çekirdek tablolar (`Tenant`, `User`,
`Student`, `Teacher`, `Lesson`, `Payment`, `MakeupRequest`), `_prisma_migrations`
içindeki uygulanmış migration sayısı (≥ 65), `vector` extension durumu, RLS'li
tablo sayısı, `tenantId` içeren index sayısı.

## 6. pgvector extension kontrolü

Test projesinde `vector` **mevcut ama kurulu değil** (`installed_version: null`,
`default_version: 0.8.2`). Uygulama varsayılan olarak `VECTOR_BACKEND=file`
kullanır, yani **pgvector zorunlu değildir**. Yalnız `VECTOR_BACKEND=pgvector`
ile test edilecekse Supabase Dashboard → Database → Extensions üzerinden `vector`
etkinleştirilir; `verify:test-schema` bu tutarsızlığı hata olarak raporlar.

## 7. RLS kontrolü

Bu uygulama tenant izolasyonunu **veritabanı RLS'i ile değil**, uygulama
katmanında yapar: `AsyncLocalStorage` (`src/lib/tenant-context.ts`) + her Prisma
sorgusunda `tenantId` filtresi (`src/lib/store-db.ts`). Dolayısıyla migration
sonrası **RLS'li tablo sayısının 0 olması BEKLENEN sonuçtur**; `verify:test-schema`
bunu bilgi olarak yazar, hata saymaz. Uygulama Supabase Auth kullanmadığı için
`auth.uid()` tabanlı politika yazmak da anlamlı değildir.

## 8. Index kontrolü

`verify:test-schema` `tenantId` içeren index sayısını raporlar. Tablo varken bu
sayı 0 ise çok-tenantlı sorgular tam tarama yapar — hata olarak işaretlenir.

## 9. Storage bucket kontrolü

Duyuru eklerinin çalışması için test projesinde **`announcement-attachments`**
adlı **private** bucket gerekir (`src/lib/storage/index.ts:41`). Ayrıca
`NEXT_PUBLIC_SUPABASE_URL` ve `SUPABASE_SERVICE_ROLE_KEY` test değerleriyle set
edilmelidir. Eksikse uygulama fail-closed davranır — sahte başarı üretmez, açık
bir yapılandırma hatası döndürür.

## 10. Auth / custom JWT kontrolü

**Supabase Auth kullanılmaz.** Giriş `JWT_SECRET` ile imzalanan kendi
access/refresh cookie'lerimizle çalışır (`src/lib/auth/*`, `src/middleware.ts`).
Test ortamı için **production `JWT_SECRET`'i ASLA kopyalanmaz** — ayrı bir değer
üretilir. Aksi halde production'da üretilmiş bir token test ortamında geçerli olur.

## 11. Demo seed preflight

```bash
npm run preflight:test-seed
```

`assertNotProductionRuntime()` + `assertDbStoreMode()` + `assertTestDatabaseTarget()`.
`0` dönmeden seed çalıştırmayın.

## 12. Demo seed komutu

**Runtime** connection string'i (transaction pooler, 6543) ile:

```bash
npm run seed:makeup-demo        # A/B/C/D telafi senaryoları + Program Vitrini
npm run seed:attendance-demo    # yoklama durum vitrini (opsiyonel, tamamlayıcı)
```

`seed:makeup-demo` telafi taleplerini **gerçek Tool Layer** çağrılarıyla üretir
(`createMakeupLessonTool` / `cancelMakeupLessonTool`), yani kota kuralları
gerçekten çalışır.

> `npm run dev` AÇIKKEN seed çalıştırmayın (`STORE_MODE=json`'da cross-process
> dosya kilidi yok; `db` modunda da eşzamanlı yazım karışıklığı yaratır).

## 13. Seed'i ikinci kez çalıştırma (idempotency)

```bash
npm run seed:makeup-demo   # ikinci kez
```

Beklenen: script kendi demo öğretmenini adından tanır ve **tüm seed adımını
atlar** — kopya öğrenci/ders/telafi ÜRETİLMEZ. Öğrenci/ders sayıları birinci
çalıştırmadakiyle **aynı** kalmalıdır. Farklıysa idempotency bozulmuştur, seed
mantığı düzeltilmeden ilerlenmez.

## 14. A/B/C/D telafi demo doğrulaması

`test.neviihub.com` → panel → Telafi Merkezi:

| Öğrenci | Beklenen kota metni |
|---|---|
| `… Öğrenci A` | **1 / 2 kullanıldı · 1 hak kaldı** (aktif dönemde 1 onaylı telafi) |
| `… Öğrenci B` | **2 / 2 kullanıldı · Hak kalmadı** (aktif dönemde 2 onaylı) |
| `… Öğrenci C` | **0 / 2 kullanıldı · 2 hak kaldı** (2 onaylı telafi ÖNCEKİ dönemde) |
| `… Öğrenci D` | **kota tüketilmemiş** (iptal edilmiş talep hak yakmaz) |

C ve D'nin geçmesi kritik: C dönem sınırının, D iptal davranışının testidir.

## 15. Program Vitrini doğrulaması

`… Program Vitrini` öğrencisi → Program ekranı:

- ≥ 8 geçmiş ders: ≥2 **Geldi**, ≥2 **İşlendi**, ≥2 **Telafi**, ≥1 **İptal**
- ≥ 3 gelecek **Planlandı** dersi, farklı gün/saatlere dağılmış
- Renkler (owner kararı, 2026-09-05): **İşlendi = KIRMIZI, Telafi = SARI,
  Geldi = yeşil**. Ters görünüyorsa eski build çalışıyordur.

## 16. Test DB cleanup yaklaşımı

Test verisi bozulursa **tabloları elle silmeyin**. Sırayla:

1. `npx prisma migrate reset` — **yalnız test hedefinde**, `preflight:test-db`
   `test` döndüğü doğrulandıktan sonra.
2. `npx prisma migrate deploy`
3. `npm run preflight:test-seed` → `npm run seed:makeup-demo`

`migrate reset` **veri siler**. Production hedefinde ASLA çalıştırılmaz; hedefi
her seferinde preflight ile doğrulayın.

## 17. Production'da KESİNLİKLE çalıştırılmayacak komutlar

```
npx prisma migrate reset      # veri siler
npx prisma db push            # migration geçmişini bozar
npm run seed:makeup-demo      # demo veri üretir (guard zaten reddeder)
npm run seed:attendance-demo
npm run seed:demo-schedule
npm run seed:multi-tenant     # (npx tsx scripts/seed-multi-tenant.ts)
npm run backfill:display-ids  # önce test'te doğrulanmadan çalıştırılmaz
```

Production'a `prisma migrate deploy` yalnız ayrı, açık, hedefi adıyla belirten
insan onayıyla çalıştırılır (`CLAUDE.md`, `AGENTS.md` §6).

## 18. Hata / rollback yaklaşımı

| Belirti | Yapılacak |
|---|---|
| `migrate deploy` çıktısız asılı kaldı | Transaction pooler kullanılıyor. `Ctrl+C`, session pooler'a (5432) geçin, `preflight:test-migration` çalıştırın. |
| `migrate deploy` yarıda hata verdi | `npx prisma migrate status` ile hangi migration'da durulduğunu görün. Test ortamında en temiz yol `migrate reset` + `migrate deploy`. Elle SQL ile düzeltmeye ÇALIŞMAYIN. |
| `verify:test-schema` eksik tablo raporladı | `migrate deploy` tamamlanmamış. Tekrar çalıştırın; hâlâ eksikse `migrate reset`. |
| Seed "zaten var" deyip atladı | Beklenen idempotency davranışı. Gerçekten yeniden üretmek için `migrate reset` + `deploy` + `seed`. |
| Preflight `hedef=unknown` dedi | `DATABASE_URL` beklenen biçimde değil. Guard doğru davranıyor — **override etmeyin**, string'i düzeltin. |
| Preflight `hedef=production` dedi | **DURUN.** Yanlış connection string yüklü. Kabuğu kapatın, `.env.test` değerlerini yeniden yükleyin. |

Rollback notu: migration'lar ileri yönlüdür, `down` migration yoktur. Test
ortamında geri dönüş yolu `migrate reset`'tir; production'da geri dönüş yolu
**yedekten geri yükleme**dir — bu yüzden production migration'ı öncesinde yedek
zorunludur.

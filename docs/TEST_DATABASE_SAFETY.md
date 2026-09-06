# Test Database Safety — guard davranışı

Tek kaynak: **`src/lib/env/test-target-guard.ts`**.
Testleri: `src/lib/__tests__/test-target-guard.test.ts` (25 test).

## Neden var

Production Supabase (`uqkafczrplqitzumtrqy`) ve test Supabase
(`vxzewyiwfshobjizzetw`) **aynı hesapta, aynı organizasyonda**. Connection
string'leri yalnızca ref ve bölge ile farklılaşıyor. Yanlış `DATABASE_URL` ile
çalıştırılan TEK bir `prisma migrate deploy` veya demo seed komutu production
veritabanına yazar. Guard, her test komutunun **önce hedefini sınıflandırmasını**
ve hedef kesin olarak "test" değilse **durmasını** zorunlu kılar.

## Hedef sınıflandırma

`classifyDatabaseTarget(url)` connection string'i ayrıştırır ve şunlardan birini döner:

| Sınıf | Koşul | Test komutlarında sonuç |
|---|---|---|
| `test` | ref == `vxzewyiwfshobjizzetw` | **kabul** |
| `production` | ref == `uqkafczrplqitzumtrqy` | **RED** (özel mesaj) |
| `local` | host `localhost` / `127.0.0.1` / `::1` | **RED** |
| `unknown` | başka herhangi bir host | **RED** |
| `missing` | `DATABASE_URL` boş/tanımsız | **RED** |
| `unparseable` | geçerli `postgresql://` URL değil | **RED** |

Ref iki biçimden de çıkarılır:
- doğrudan host — `db.<ref>.supabase.co`
- pooler — kullanıcı adı `postgres.<ref>`, host `*.pooler.supabase.com`

**Fail-closed ilkesi:** yalnız `test` geçer. "Muhtemelen test" diye bir sınıf yok;
tanınmayan her hedef reddedilir.

## Guard fonksiyonları

| Fonksiyon | Ne yapar | Kullanan |
|---|---|---|
| `assertTestDatabaseTarget(url)` | Hedef test projesi değilse fırlatır | seed preflight, schema verify, env preflight |
| `assertMigrationSafeConnection(url)` | Yukarısı **+** transaction pooler'ı (6543 / `pgbouncer=true`) reddeder | migration preflight |
| `assertNotProductionRuntime()` | `NODE_ENV=production` **veya** `VERCEL_ENV=production` ise fırlatır | tüm demo seed script'leri + preflight'lar |
| `assertDbStoreMode()` | `STORE_MODE !== "db"` ise fırlatır | migration/seed preflight |
| `missingEnvNames(names)` | Eksik değişkenlerin yalnız **İSİMLERİNİ** döner | env preflight |
| `productionLeakWarnings()` | Production `APP_BASE_URL` / Supabase URL'inin test ortamına sızmasını yakalar | env preflight |

### Transaction pooler neden migration için reddediliyor

`prisma migrate status`/`deploy`, PgBouncer transaction modunda (port 6543)
**hata vermeden sonsuza kadar asılı kalır** — advisory lock ve prepared statement
gerektirir. Doğrulandı 2026-09-05, bkz. `docs/agent-memory/LESSONS_LEARNED.md`.
Guard bunu bir hata olarak yakalar, böylece asılı kalan bir terminal yerine
anlaşılır bir mesaj alırsınız. Runtime (Prisma Client) için 6543 **doğru** olandır.

## Secret maskeleme

Guard'lar ve preflight script'leri **hiçbir koşulda** şunları çıktıya yazmaz:

- connection string'in kendisi
- parola, kullanıcı adı, service role key, JWT secret, API key
- tam hostname
- Supabase project ref değeri
- query string

Dışarı çıkan tek şey **güvenli metadata**'dır:

```
[hedef] hedef=test host=*.pooler.supabase.com port=5432 pooler=session-or-direct
```

Host yalnız son ek olarak yazılır (`*.pooler.supabase.com`), ref hiç yazılmaz —
`test` / `production` sınıflandırması operatörün doğru projeyi hedeflediğini
görmesi için zaten yeterlidir. Bu davranış testle sabitlendi
(`safeLabel parola, kullanıcı adı, ref veya tam host SIZDIRMAZ`).

## Demo seed — production bloğu

Tüm demo/QA seed script'leri açılışta `assertNotProductionRuntime()` çağırır:

| Script | Guard |
|---|---|
| `scripts/seed-attendance-demo.ts` | önceden vardı (`NODE_ENV`/`VERCEL_ENV` kontrolü, satır içi) |
| `scripts/seed-makeup-demo.ts` | önceden vardı (aynı desen) |
| `scripts/seed-demo-schedule.ts` | **bu commit'te eklendi** |
| `scripts/seed-hybrid-portal-demo.ts` | **bu commit'te eklendi** |
| `scripts/seed-multi-tenant.ts` | **bu commit'te eklendi** |
| `scripts/seed-ogrenci-demo-json.ts` | **bu commit'te eklendi** |
| `scripts/seed-demo-csv-teachers.ts` | **bu commit'te eklendi** |

`NODE_ENV=production` tek başına yeterli değildir: Vercel preview deployment'ları
da `NODE_ENV=production` taşır. Gerçek production'ı ayıran `VERCEL_ENV=production`
olduğu için **ikisi de** kontrol edilir.

## `STORE_MODE` ayrımı

`STORE_MODE=json` veya `memory` iken DB migration/seed komutları çalıştırmak
sessizce yanlış hedefe (dosya veya bellek) yazar ve "çalıştı" gibi görünür.
`assertDbStoreMode()` bunu engeller. Karşıt yön de geçerlidir: production
uygulaması bugün `memory` modunda olduğu için Supabase'e migration atmak tek
başına hiçbir şeyi değiştirmez — bkz. `docs/PRODUCTION_DATABASE_SOURCE_OF_TRUTH.md`.

## Migration öncesi manuel yedek

Test veritabanı için bile:

1. İlk kurulumdan önce Supabase Dashboard → Database → Backups üzerinden
   projenin yedek/PITR durumu **görülür** (test projesinde veri yoksa gerekmez,
   ama alışkanlık production'a taşınacaktır).
2. **Production için zorunlu:** migration öncesi elle yedek + PITR doğrulaması,
   ve her koşulda ayrı, açık bir insan onayı.

## Test ve production connection string'lerinin ayrılması

- Test değerleri yalnız `.env.test` / `.env.local` (gitignore'lu) veya Vercel
  **Preview** environment'ında bulunur.
- Production değerleri yalnız Vercel **Production** environment'ında bulunur.
- `.env.test.example` ve `.env.example` **yalnız isim** içerir, hiç değer içermez.
- Aynı terminal oturumunda ikisi birden export edilmez; migration komutları
  `DATABASE_URL`'i **satır içi** override ederek çalıştırılır, kalıcı export ile değil.

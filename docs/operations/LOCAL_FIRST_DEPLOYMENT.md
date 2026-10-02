# Local-first geliştirme ve yayın modeli

Durum tarihi: 2026-10-01 (canlı geçişinden sonra). Bu belge günlük geliştirmenin nerede yapılacağını, hangi işin
doğrudan canlıya çıkabileceğini, hangisinin geçici bir test ortamı istediğini ve ücretsiz planlarda nasıl kalınacağını
tanımlar. Altyapı kimlikleri değişirse önce bu belge ve `src/lib/env/test-target-guard.ts` güncellenir.

## İlkeler

1. Sürekli açık bir online test ortamı zorunlu değildir. Günlük iş yerelde yapılır ve doğrulanır.
2. Doğrudan canlıya çıkış yalnız düşük riskli, migration içermeyen ve yerelde net doğrulanmış işlerde, owner'ın
   sürüm onayıyla yapılır. Hiçbir değişiklik onaysız canlıya alınmaz.
3. Migration, fiyatlandırma/finans hesabı, silme/arşiv, auth/RBAC, tenant izolasyonu, toplu veri düzeltme ve dışarıya
   mesaj gönderen işler ayrı doğrulama ister: izole DB'de kapsamlı prova (yerel veya geçici test ortamı) + owner
   UAT + planlı yayın. Canlıda deneme hesabı açılmaz, veri silinmez.
4. Hiçbir proje, veritabanı, yedek veya veri owner'ın açık onayı olmadan silinmez. Plan değişikliği ve faturalandırma
   owner kararıdır.
5. Test ortamına gerçek kişisel veri konmaz. (Eylül 2026'da `test.neviihub.com` fiilen canlı olarak gerçek veriyle
   kullanıldı; bu durum 2026-10-01 geçişiyle kapatıldı.)

## Ortam haritası (2026-10-01)

| Bileşen | Kimlik | Rol | Not |
|---|---|---|---|
| Canlı site | `neviihub.com` | KORU | Vercel projesi `neviihub` (Hobby, Fluid, fonksiyon bölgesi `fra1`), dal `main` |
| Canlı DB | Supabase `wsbucznpujcfzhitzrbl` (eu-central-1, org `neviihub-prod-org`, Free) | KORU | Uygulama transaction pooler 6543; dump/migration session pooler 5432 |
| Eski test DB | Supabase `vxzewyiwfshobjizzetw` (ap-south-1, org `neviihub-test-org`, Free) | PASİF TUT | Geçiş anındaki GERÇEK veri; DB düzeyinde salt-okunur, Data API erişimi kapalı. Geri dönüş kaynağı. 2026-10-31 yalnız YENİDEN DEĞERLENDİRME tarihidir, silme tarihi değildir; geri yükleme doğrulanmadan ve owner onayı olmadan kaldırılmaz. Test hedefi DEĞİL; korumalar production gibi davranır |
| `test.neviihub.com` | Vercel alan adı | PASİF TUT | Geçici olarak 307 ile `neviihub.com`'a yönlenir |
| `test` dalı preview'ları | Vercel preview | PASİF TUT | Dal bazlı preview değişkenleri hâlâ eski test DB'sini (salt-okunur) gösterir. 2026-10-02'den beri tüm preview'lar Vercel Authentication ile korunur (yalnız ekip üyeleri); bu, uygulamanın kendi yetkilendirmesinin yerine geçmez |
| Yerel geliştirme DB'si | `127.0.0.1` Postgres `neviihub_dev` | Günlük iş | Canlı şemasının verisiz kopyası + migration geçmişi + sentetik iki kurum. Ana çalışma ağacındaki `.env`/`.env.local` bunu gösterir (2026-10-02) |
| Yerel doğrulama kopyaları | `neviihub_verify_*`, `neviihub_restore_verify` | Geçici | GERÇEK veri kopyaları (kişisel veri). Günlük işte kullanılmaz; yeniden değerlendirme tarihinde owner kararıyla silinir |

Supabase Free projeleri bir hafta düşük etkinlikte otomatik duraklatılır (veri korunur, 90 gün içinde panelden
"Resume project" ile açılır). Eski test DB'si trafik almadığı için duraklatılacaktır; bu beklenen bir durumdur. Canlı
DB'yi günlük cron (`/api/v1/platform/jobs/retention`, 00:30 UTC) ve kullanıcı trafiği etkin tutar.

## Günlük yerel akış

Varsayılan olarak DB'siz çalışılır. UI, iş kuralı ve testlerin çoğu bu modda yapılır:

```bash
npm run dev                      # STORE_MODE=json (varsayılan), http://localhost:3000
npx vitest run <dosya>           # hedef testler
```

DB moduna özgü iş (sorgu, dilim, Prisma davranışı) yerel PostgreSQL'de, sentetik veriyle yapılır. Önerilen kurulum
(2026-10-02'de `neviihub_dev` ile doğrulandı: migration durumu temiz, iki kurum tohumlandı, kritik akış 19/19):

```bash
# canlı şemasının VERİSİZ kopyası + migration geçmişi (yerel gerçek-veri kopyasından yalnız şema alınır)
pg_dump -h 127.0.0.1 -d neviihub_verify_prodbase --schema-only --no-owner --no-privileges --schema=public -f schema.sql
pg_dump -h 127.0.0.1 -d neviihub_verify_prodbase --data-only --table='public."_prisma_migrations"' -f migrations.sql
createdb -h 127.0.0.1 -T template0 neviihub_dev
psql -h 127.0.0.1 -d neviihub_dev -c 'DROP SCHEMA public CASCADE' -f schema.sql && psql -h 127.0.0.1 -d neviihub_dev -f migrations.sql
export DATABASE_URL="postgresql://$USER@127.0.0.1:5432/neviihub_dev"
npx prisma migrate status                              # "Database schema is up to date!"
STORE_MODE=db npx tsx scripts/seed-multi-tenant.ts     # iki sentetik kurum
```

Hızlı alternatif (migration geçmişi gerekmiyorsa), 2026-10-01'de doğrulandı:

```bash
createdb -h 127.0.0.1 -T template0 neviihub_dev_local
export DATABASE_URL="postgresql://$USER@127.0.0.1:5432/neviihub_dev_local"   # her zaman AÇIKÇA verin
npx prisma db push                                    # boş DB'ye şema (97 tablo)
STORE_MODE=db npx tsx scripts/seed-multi-tenant.ts    # varsayılan kurumu demo veriyle doldurur
STORE_MODE=db npm run dev
```

- `.env` / `.env.local` başka bir hedefi gösterebilir (`prisma.config.ts` ve seed betikleri `dotenv` okur).
  `DATABASE_URL`'i her komutta açıkça verin. Seed betikleri `assertSeedTarget` ile yalnız yerel veya açıkça
  tanımlanmış test DB'sine yazar. Varsayılan tenant (`tenant_nilufer_acar`) canlıdaki gerçek kurumdur.
- Boş DB'de `prisma migrate deploy` ÇALIŞMAZ: 90 migration'ın 12'si eski MySQL sözdizimindedir. Boş yerel DB için
  `db push`; migration denemesi için aşağıdaki migration akışı kullanılır.
- `seed-multi-tenant.ts` iki kurumu da tohumlar (ikinci kurumdaki paket kimliği çakışması 2026-10-02'de düzeltildi).
- Yerelde gerçek SMTP bilgisi varsa (`.env.local`) ve `EMAIL_PROVIDER` tanımsızsa uygulama GERÇEK e-posta gönderir; demo
  verisinde kurumun gerçek alan adındaki adresler var. Yerelde `EMAIL_PROVIDER=console` önerilir.
- Yerel Postgres saat dilimi İstanbul, canlı DB UTC. `timestamp without time zone` sütunlara ham SQL ile `now()`
  yazmak yerelde 3 saat ileri bir değer üretir; `now() at time zone 'UTC'` kullanın.
- Demo kullanıcıları ve şifreleri `src/lib/auth/users.ts` içindedir ve yalnız yerel/demo içindir.

## Risk sınıfları: hangi iş nereden geçer

| Değişiklik | Yol | Gerekli doğrulama |
|---|---|---|
| Metin, stil, küçük hata düzeltmesi; migration/auth/finans/silme yok | yerel → owner sürüm onayı → canlı | Doğrulama kapısı + yerel tarayıcı kontrolü + yayın sonrası duman testi |
| Okuma yolu/performans değişikliği, yeni ekran | yerel (DB modunda) → owner sürüm onayı → canlı | + yerel production build'de ilgili sayfalar, gerekirse ölçüm (`docs/performance/*`) |
| Migration, finans hesabı, silme/arşiv, auth/RBAC/tenant, toplu veri düzeltme, e-posta/SMS/WhatsApp gönderimi | yerel → izole DB'de kapsamlı prova → owner UAT → owner sürüm onayı → planlı canlı yayın | + canlı yedeği, yazılı geri dönüş planı |
| Vercel/Supabase/DNS ayarı, env değeri, plan/faturalandırma | owner kararı | — |

## Geçici test ortamı (gerektiğinde açılır)

Yüksek riskli işler için açılır, iş bitince kapatılır. Gerçek kişisel veri konmaz.

- **Yalnız ekran/akış onayı** (owner telefondan bakacaksa): preview deployment, DB'siz `STORE_MODE=memory`
  (demo veri bellekte). Ek maliyeti yok; dal bazlı preview değişkenlerini owner bir kez tanımlar.
- **DB'ye özgü test** (migration, Supabase davranışı): sentetik veriyle geçici bir Supabase projesi. Free sınırı
  hesap genelinde (tüm organizasyonlarda) 2 aktif projedir; duraklatılmış proje sayılmaz. Şu an canlı + eski test aktif;
  eski test DB'si duraklatılınca yer açılır. Hedef ref'i yalnız o oturumda `TEST_SUPABASE_REF` ile verilir; verilmezse
  hiçbir uzak DB "test" sayılmaz.
- Yerel PostgreSQL çoğu DB testinde yeterlidir. Uzak test ortamı yalnız Supabase'e özgü davranış gerekiyorsa açılır.

## Migration akışı

1. Migration SQL'i `prisma/migrations/<zaman>_<ad>/migration.sql` olarak, eklemeli (additive) yazılır. Yıkıcı adım
   (kolon/tablo silme, tip daraltma) ayrı plan ve owner onayı ister.
2. Yerelde canlı şemasının **verisiz** bir kopyasına uygulanır (`_prisma_migrations` geçmişi dahil şema dump'ı).
   `prisma migrate deploy` yalnız yeni migration'ı uygular. Ardından uygulama DB modunda denenir.
3. Canlıya: owner onayı → canlı yedeği (`pg_dump -Fc`) → `prisma migrate deploy`, **session pooler 5432** üzerinden.
   Transaction pooler 6543'te `migrate` sessizce asılı kalır. Sonra kod `main`'e itilir.
4. Sıra önemlidir: önce migration, sonra kod. `main` build'indeki migration kapısı
   (`scripts/check-pending-migrations.ts`) uygulanmamış migration görürse build'i durdurur; canlıda önceki sürüm
   çalışmaya devam eder. Acil durumda `SKIP_MIGRATION_GATE=1` (owner kararı).

## Canlıya çıkış kontrol listesi

1. `git fetch origin`; çıkacak commit `origin/main`'in hızlı ileri sarmasıdır. Force-push yok.
2. Doğrulama kapısı, sırayla: `npm run typecheck` → `npm run lint` → `npm test` → `npx prisma validate` →
   `npm run build`. Taban (2026-10-01): lint 1 hata (`apps/mobile/app/index.tsx`) + 34 uyarı; testte 13 bilinen
   hata: staff-onboarding 1, trial-edit-notes-dashboard 2, attendance-calendar-tools 6 (sıra bağımlı),
   lesson-series-tools 1 ve lesson-revise-after-ops-undo 3 (tarih bağımlı). Farklı bir hata kümesi = yeni regresyon.
3. Migration var mı? → yukarıdaki akış. Env değişikliği var mı? → owner.
4. Etkilenen sayfalar yerel production build'de (`next start`, yerel DB) açılır.
5. `git push origin <sha>:main` (isteğe bağlı aynı commit `test`'e de).
6. İzleme: deployment READY, bölge `fra1`, `neviihub.com` yeni deployment'a atandı; `/api/v1/health` 200,
   `/api/v1/ready` → ready; giriş + 2–3 ana sayfa; 15 dakika boyunca Vercel → Logs (level error).
7. `docs/agent-memory/PROJECT_STATE.md` snapshot'ına bir satır.

## Otomatik derleme ve deploy yolları (envanter 2026-10-02)

- **Vercel Git entegrasyonu** (`hidircan/nevii.hub`): `main` push → production; diğer her dal → preview (Git kaynaklı,
  deploy hook'tan bağımsız). Preview'lar Vercel Authentication ile korunur.
- **Deploy hook:** yok. Tek "Test Hook" (dal `test`) 2026-09-06'da bir kez kullanılmıştı; 2026-10-02'de kaldırıldı.
- **GitHub Actions `ci.yml`** (`main` push + PR): lint adımında `apps/mobile/app/index.tsx` hatasıyla kırmızı; bu yüzden
  CI'da typecheck/test/build HİÇ çalışmıyor. Yerel kapı tek güvence; CI'ın yeşile dönmesi ayrı iş.
- **GitHub Actions `production-migration.yml`** (`main`'e migration push'u veya elle): eski migration'lardaki onaysız
  `DROP` yüzünden güvenlik adımında duruyor, production'a hiç uygulamadı. Hedeflediği gizli `DATABASE_URL` değeri
  GitHub'da; doğrulanmadı. Migration'lar bu modelde elle, yedekten sonra uygulanır.
- **Vercel cron:** yalnız production, günlük 00:30 UTC retention.

## Geri dönüş

- **Kod:** Vercel → Deployments → bir önceki production deployment → Instant Rollback (CLI: `vercel rollback`).
  Vercel belgesine göre belirli eski bir deployment'a dönmek Pro/Enterprise özelliğidir; Hobby'de bir önceki
  production deployment'a dönülür. Ardından `main`'e revert commit'i ile kalıcı düzeltme yapılır.
- **Veri:** Free planda otomatik yedek yok. Riskli işten önce manuel `pg_dump -Fc` alınır ve doğrulanır. Geri yükleme
  tek işlemde (`pg_restore --single-transaction --exit-on-error`) ve önce yerel kopyada denenerek yapılır. Geçiş
  günü prosedürü ve yedekleri repo dışında: `~/NeviiHub-Backups/CUTOVER_RUNBOOK.md`.

## Ücretsiz planda kalmak

**Vercel Hobby** (belge: vercel.com/docs/plans/hobby): ayda 4 saat Fluid Active CPU, 1M fonksiyon çağrısı,
360 GB-saat bellek, 100 GB veri aktarımı. Hobby'de fatura döngüsü yoktur. Sınır aşılırsa ilgili özellik 30 güne kadar
durur; bu, sitenin kapanması demektir. Hobby yalnız ticari olmayan kullanım içindir (Fair Use); ticari kullanım Pro
gerektirir ve bu owner kararıdır.

Kod kuralları (2026-10-01 olayından):
- `next/link` doğrudan kullanılmaz; `@/components/link` önyüklemeyi kapatır (ESLint engeller). Önyükleme her
  görünür bağlantı için sunucuda render demekti: tek sayfa açılışı 55 istek.
- Yoklama/periyodik yenileme 5 dakikadan sık olmaz. Sekmeye dönüşte en fazla 60 saniyede bir istek atılır.
- `router.refresh()` döngüye sokulmaz. Sayfa açılışında ek API çağrısı eklemeden önce gerçekten gerekli mi bakılır.
- Ağır `readData()` yerine `src/lib/reference-data.ts` dilimleri kullanılır (Supabase egress).

Haftalık kontrol (owner veya oturum): Vercel → Usage (Fluid Active CPU, Function Invocations) ve Supabase → Usage
(Egress, Database size). Vercel kullanımı son 30 günün toplamıdır.
- Active CPU 4 saatin %60'ını geçtiyse kaynak araştırılır (`get_runtime_logs` rota sayımı + yerel ölçüm düzeneği).
- %85'i geçtiyse owner Pro'ya geçişi hemen değerlendirir; sınırın aşılması 30 güne kadar kesinti demektir.
- Supabase Free: 5 GB egress, 500 MB DB, otomatik yedek yok.

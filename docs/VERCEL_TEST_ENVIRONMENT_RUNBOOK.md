# Vercel Test Environment Runbook — `test.neviihub.com`

> ⚠️ **2026-10-01'den beri güncel değil:** canlı DB `wsbucznpujcfzhitzrbl`; `vxzewyiwfshobjizzetw` gerçek veri
> taşıyan salt-okunur geri dönüş kaynağıdır (test hedefi DEĞİL); `uqkafczrplqitzumtrqy` artık erişilebilir değil.
> Güncel model ve ortam haritası: `docs/operations/LOCAL_FIRST_DEPLOYMENT.md`.

Ana runtime **Vercel**'dir. Cloudflare yalnız DNS/SSL/CDN/WAF katmanında kalır;
Cloudflare Workers ana application runtime olarak **kullanılmayacaktır** —
request başına 10 ms CPU sınırı bcrypt, SSR, Prisma/PostgreSQL ve AI tool
runtime için yetersizdir (bundle boyutu nedeniyle değil).

> Bu belgedeki hiçbir dış sistem işlemi bu hazırlık oturumunda **yapılmadı**:
> GitHub push yok, Vercel deployment/env değişikliği yok, DNS kaydı yok,
> Supabase yazımı yok.

---

## Ortam matrisi

| Ayar | Local | Test | Production | Not |
|---|---|---|---|---|
| Git branch | `infra/*` worktree | `test` | `main` | Test branch'i henüz oluşturulmadı |
| Domain | `localhost:3000` | `test.neviihub.com` | `neviihub.com` | `neviihub.com` **şu an DNS'te yok**; canlı adres `notaplan.vercel.app` |
| Runtime | `next dev` | Vercel (Preview) | Vercel (Production) | — |
| `VERCEL_ENV` | (yok) | `preview` | `production` | Demo seed guard'ı bunu okur |
| `NODE_ENV` | `development` | `production` (Vercel) | `production` | Tek başına ortam ayırt etmez |
| `STORE_MODE` | `json` (veya `db`) | **`db`** | **`db`** (bugün fiilen `memory`) | Bkz. `PRODUCTION_DATABASE_SOURCE_OF_TRUTH.md` |
| Supabase projesi | — / local Postgres | `neviihub-test` (`vxzewyiwfshobjizzetw`) | `NeviiHub` (`uqkafczrplqitzumtrqy`) | Aynı hesap → guard şart |
| Supabase bölge | — | `ap-south-1` | `ap-southeast-1` | — |
| `DATABASE_URL` (runtime) | local Postgres | test transaction pooler (6543) | prod transaction pooler (6543) | Serverless için pooler zorunlu |
| Migration bağlantısı | local | test **session** pooler (5432) | prod session pooler (5432) | 6543'te `migrate` asılı kalır |
| `APP_BASE_URL` | `http://localhost:3000` | `https://test.neviihub.com` | `https://neviihub.com` | Davet/şifre linkleri buradan üretilir |
| `JWT_SECRET` | local değer | **ayrı test değeri** | production değeri | Asla paylaşılmaz |
| E-posta | `console` (log) | `console` veya test SMTP | production SMTP | Test'te production SMTP **yasak** |
| AI sağlayıcı | `heuristic` | `heuristic` veya test key | production key | Test'te production key **yasak** |
| WhatsApp | `console` | `console` / test numarası | production webhook | Test'te production token **yasak** |
| Ödeme | kapalı (fail-closed) | yalnız **sandbox** | production key | Test'te production key **yasak** |
| Demo seed | serbest | **serbest** (A/B/C/D + Vitrin) | **guard ile bloklu** | `assertNotProductionRuntime()` |
| Supabase Storage bucket | — | `announcement-attachments` (private) | `announcement-attachments` (private) | Ayrı projelerde ayrı bucket |

## Release akışı

```
Local branch/worktree
        ↓  (yalnız local commit)
GitHub `test` branch
        ↓  (otomatik)
Vercel test deployment
        ↓
test.neviihub.com
        ↓
neviihub-test Supabase (vxzewyiwfshobjizzetw)
        ↓
Manual acceptance test  (A/B/C/D telafi + Program Vitrini + smoke)
        ↓  ← AYRI İNSAN ONAYI
main
        ↓  (otomatik)
Vercel production deployment
        ↓
neviihub.com
        ↓
Production database (uqkafczrplqitzumtrqy)
```

Her ok bir kapıdır. `test` → `main` geçişi **ayrı ve yeni** bir onay gerektirir;
test ortamı onayı production onayı yerine geçmez.

## Test deployment için gereken Vercel ayarları

**Bu oturumda hiçbiri yapılmadı — onay sonrası operatör tarafından yapılacak.**

1. Vercel projesinde `test` branch'i için **Preview** environment tanımlanır.
2. Aşağıdaki değişkenler **yalnız Preview** kapsamına eklenir (Production
   kapsamına ASLA yazılmaz). İsim listesi: `.env.test.example`.
3. Zorunlu minimum (`REQUIRED_TEST_ENV`, `src/lib/env/test-target-guard.ts`):
   - `STORE_MODE` = `db`
   - `DATABASE_URL` = **neviihub-test** transaction pooler'ı
   - `JWT_SECRET` = test'e özel, production'dan farklı
   - `APP_BASE_URL` = `https://test.neviihub.com`
4. Storage kullanılacaksa: `NEXT_PUBLIC_SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY` (test projesinin değerleri).
5. Güvenli varsayılan olarak boş bırakılacaklar: `EMAIL_PROVIDER` (→ console),
   `AI_PROVIDER` (→ heuristic), `PAYMENT_PROVIDER` (→ fail-closed),
   `WHATSAPP_PROVIDER` (→ console). Test ortamı bu haliyle **gerçek e-posta
   göndermez, gerçek AI çağrısı yapmaz, gerçek tahsilat başlatmaz.**

### Production secret'inin test'e yazılmasını önleyen kontroller

- `npm run preflight:test-env` → `DATABASE_URL` production ref'ini gösteriyorsa
  **exit 1**; `APP_BASE_URL` test domain'i/localhost değilse uyarı;
  `NEXT_PUBLIC_SUPABASE_URL` production ref'i içeriyorsa uyarı.
- `npm run preflight:test-db` / `:test-migration` / `:test-seed` → production
  hedefinde koşulsuz **exit 1**.
- Vercel tarafında teknik bir kilit yoktur; bu yüzden **Preview ve Production
  environment'ları asla aynı değerle doldurulmaz** ve her deployment sonrası
  `preflight:test-env` bir kez çalıştırılır.

## Test domain DNS gereksinimi

```
test.neviihub.com  →  Vercel test deployment target
```

Kayıt Cloudflare DNS üzerinde oluşturulacaktır (CNAME, Vercel'in verdiği hedefe;
proxy durumu Vercel'in custom-domain doğrulamasına göre ayarlanır).
**Bu oturumda hiçbir DNS kaydı oluşturulmadı/değiştirilmedi.** `neviihub.com`
bugün DNS'te hiç çözümlenmiyor — test alt alan adı eklenmeden önce ana alan
adının delegasyonu da netleştirilmelidir.

## Test ortamı doğrulama sırası (deployment sonrası)

```bash
# 1) Ortam
npm run preflight:test-env

# 2) Şema (migration sonrası)
npm run verify:test-schema

# 3) Canlı runtime — secret içermez, herkese açık
curl -s https://test.neviihub.com/api/v1/health   # storeMode: "db" bekleniyor
curl -s https://test.neviihub.com/api/v1/ready    # database.reachable: true bekleniyor
```

`/api/v1/health` `storeMode: "memory"` veya `"json"` dönerse **test ortamı
veritabanına bağlı değildir** — production'da bugün tam olarak bu durum var.

## Cloudflare kapsamı (bu görevde değişmedi)

- Cloudflare Workers araştırma branch'i `infra/cloudflare-staging` @ `20832f7`
  **korundu**: silinmedi, merge/rebase edilmedi, dosyası değiştirilmedi.
- Cloudflare'ın rolü: DNS, SSL, CDN, WAF, DDoS koruması, cache; ileride yalnız
  hafif webhook/edge endpoint'leri.
- Ana application runtime **Vercel**'dir ve bu görevde Workers migration'ı
  yapılmamıştır.

## İlgili belgeler

- `docs/PRODUCTION_DATABASE_SOURCE_OF_TRUTH.md` — production'ın gerçek durumu
- `docs/TEST_SUPABASE_RUNBOOK.md` — migration/seed adım adım
- `docs/TEST_DATABASE_SAFETY.md` — guard davranışı, secret maskeleme

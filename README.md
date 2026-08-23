# NotaPlan

Müzik okulları için operasyon SaaS: **program, yoklama, telafi planlama, ödemeler, WhatsApp şablonları, veli & öğretmen portalı**.

## İlk müşteri

**[Nilüfer Acar Müzik Akademisi](https://www.niluferacar.com.tr)** — İzmir

| Şube | Not |
|------|-----|
| **Erzene** (Merkez) | Erzene Mah. Türkeli Cad. No:18/A Bornova |
| **Evka 3** | Bornova / İzmir |

**Telefon:** 0553 848 16 58 · **E-posta:** merhaba@niluferacar.com.tr

**Aktif enstrümanlar (şimdilik):** Piyano, Yan Flüt, Gitar, Bateri, Keman, Şan  
*(Bağlama, ud, klarnet vb. sonra eklenebilir.)*

## Sayfalar

| URL | Açıklama |
|-----|----------|
| `/` | Landing + fiyatlandırma |
| `/panel` | Yönetim paneli (özet) |
| `/panel/telafi` | Telafi merkezi ★ |
| `/panel/yoklama` | Yoklama → telafi hakkı |
| `/panel/bildirimler` | WhatsApp mesaj kuyruğu |
| `/veli` | Veli mobil portal (demo) |
| `/ogretmen` | Öğretmen mobil portal (demo) |

## Demo senaryosu

1. `/panel/yoklama` → **Gelmedi (+telafi)**
2. `/panel/telafi` → **Uygun slot öner** → **Onayla**
3. `/panel/bildirimler` → **WhatsApp’ta aç**

## Çalıştırma

```bash
# Node 18+
export PATH="$HOME/.local/node-v22.14.0-darwin-arm64/bin:$PATH"  # gerekirse

cd notaplan
npm install
npm run dev
```

→ [http://localhost:3000](http://localhost:3000)

## Canlıya alma

### Hızlı demo (varsayılan)
`STORE_MODE=memory` veya `json` — Vercel üzerinde ayrı bir veritabanı olmadan da çalışır (demo veri).

Vercel env:
```env
STORE_MODE=memory
```

### Kalıcı production (PostgreSQL)
```env
STORE_MODE=db
DATABASE_URL=postgresql://user:password@host:5432/database
```

1. GitHub repo: https://github.com/hidircan/notaplan
2. [vercel.com/new](https://vercel.com/new) → Import `hidircan/notaplan`
3. Env variables ekle → Deploy
4. `prebuild` otomatik `prisma generate` çalıştırır
5. Şema hazır değilse, kontrollü staging akışıyla uygula: `prisma validate` → `prisma migrate status` → (onaylandıktan sonra) `prisma migrate deploy`

> Not: `STORE_MODE=db` için PostgreSQL (Supabase, RDS, Neon vb.) gerekir — runtime `@prisma/adapter-pg` + `pg` `Pool` üzerinden bağlanır.
>
> **Legacy:** Bu proje eskiden MySQL/MariaDB üzerinde çalışıyordu; bu tarihsel bağlam, güncel olmayan bazı yorum/dokümanlarda hâlâ görülebilir — canonical runtime artık PostgreSQL'dir.

## Multi-Tenant Demo (kurum odağı doğrulaması)

Kurum seçici ve yazma-kapsamı koruması (`src/lib/institution/*`) json/memory
modunda tek kurumla çalışır ama gerçek çoklu-kurum davranışı yalnızca
**`STORE_MODE=db`** ile, gerçekten 2+ ayrı `Tenant` satırı olan bir
PostgreSQL veritabanı üzerinde gözlemlenebilir. Aşağıdaki adımlar iki izole,
gerçek kurum (`NotaPlan Demo Akademi`, `NotaPlan Test Kampüs`) seed eder.

> ⚠️ **Yalnızca yerel geliştirme/demo içindir.** Aşağıdaki şifreler
> ortam değişkeni verilmezse sabit demo değerlerine düşer — bunları asla
> production'da varsayılan bırakmayın; her ortamda `AUTH_*` değişkenlerini
> kendi güçlü değerlerinizle ayarlayın.

### 1) Veritabanı hazırla

```bash
# PostgreSQL'in yerel/erişilebilir bir instance'ı olmalı
createdb notaplan_demo

export DATABASE_URL="postgresql://postgres@localhost:5432/notaplan_demo"
npx prisma migrate deploy
```

> **Legacy:** Bu adım eskiden `mysql -u root -e "CREATE DATABASE ... CHARACTER SET utf8mb4;"` +
> `prisma db push --accept-data-loss` ile yapılıyordu (MySQL/MariaDB dönemi). Güncel runtime
> PostgreSQL olduğu için şema artık `prisma migrate deploy` ile, migration geçmişi üzerinden
> uygulanır — `db push` günlük/staging akışı değildir.

### 2) İki kurumu seed et

```bash
STORE_MODE=db DATABASE_URL="$DATABASE_URL" npx tsx scripts/seed-multi-tenant.ts
```

Bu betik `NotaPlan Demo Akademi` (mevcut varsayılan tenant) ve
`NotaPlan Test Kampüs` (yeni, ayrı bir tenant) için şube/öğretmen/öğrenci/
oda/ders/yoklama/ödeme oluşturur — **hiçbir kimlik paylaşılmaz** — ve
ardından `listTenants`/`readData`/`mergeAppData`'yı bu canlı veriye karşı
çalıştırıp sonucu konsola yazdırır. Yeniden çalıştırmak güvenlidir (her
kurumun kendi verisini siler ve yeniden oluşturur, diğer kurumu etkilemez).

### 3) Uygulamayı db modunda başlat

```bash
STORE_MODE=db DATABASE_URL="$DATABASE_URL" npm run dev
```

### Demo hesapları (yalnızca dev — env ile geçersiz kılın)

| Rol | E-posta | Şifre (env değişkeni / varsayılan) | Kapsam |
|-----|---------|-------------------------------------|--------|
| Kurum sahibi (SUPER_ADMIN) | `super@notaplan.app` | `AUTH_SUPER_PASSWORD` / `demo-super` | Her iki kurum, varsayılan "Tüm kurumlar" |
| Kurum müdürü (SCHOOL_ADMIN) | `admin@niluferacar.com.tr` | `AUTH_ADMIN_PASSWORD` / `demo-admin` | Yalnızca NotaPlan Demo Akademi |
| Kurum müdürü (SCHOOL_ADMIN) | `admin@testkampus.notaplan.app` | `AUTH_TEST_ADMIN_PASSWORD` / `demo-test-admin` | Yalnızca NotaPlan Test Kampüs |

### Manuel doğrulama akışı

1. **Kurum sahibi** olarak giriş yap → sidebar'da kurum seçicinin
   varsayılan olarak **"Tüm kurumlar"** seçili geldiğini doğrula.
2. Öğrenciler/Öğretmenler/Program gibi ekranlarda her iki kurumun
   **birleşik, salt okunur** verisinin göründüğünü ve üstte "Tüm kurumlar
   görünümü — 2 kurumun birleşik verisi gösteriliyor" notunun çıktığını
   doğrula.
3. 10 ekranın (Özet, Ders Programı, Tahsilat, Ödemeler, Telafi, Öğrenciler,
   Öğretmenler, Hakediş, WhatsApp, Yoklama) her birinde bir mutasyon
   dene (ör. yeni öğrenci ekle, yoklama işaretle, ödeme kaydet) — hepsinin
   **"Tüm kurumlar görünümünde işlem yapılamaz. Lütfen önce tek bir kurum
   seçin."** mesajıyla engellendiğini doğrula.
4. Kurum seçiciden **NotaPlan Demo Akademi**'yi seç → her ekranda birer
   kayıt oluştur/düzenle (öğrenci ekle, yoklama al, ödeme kaydet vb.).
5. Kurum seçiciden **NotaPlan Test Kampüs**'e geç → 4. adımda oluşturulan
   kayıtların **görünmediğini** (izolasyon) doğrula.
6. Çıkış yap, **kurum müdürü** (`admin@niluferacar.com.tr`) olarak giriş
   yap → kurum seçici yerine düz "NotaPlan Demo Akademi" etiketinin
   göründüğünü, Test Kampüs'e dair hiçbir verinin görünmediğini doğrula.
7. Tarayıcı geliştirici araçlarından `notaplan_kurum` cookie'sini elle
   `tenant_test_kampus` yap (sahte/forge deneme) ve sayfayı yenile →
   hâlâ yalnızca kendi kurumunun (Demo Akademi) verisinin göründüğünü ve
   herhangi bir mutasyonun hâlâ yalnızca Demo Akademi'ye yazıldığını
   doğrula (asla Test Kampüs'e sızmaz).

### Demo verisini sıfırlama (db modu)

Panel özet sayfasındaki **Demo verisini sıfırla** butonu yalnızca
**oturumun kendi kurumunu** sıfırlar (yetki kontrollü, tenant-scoped —
`resetDemoTool` her zaman `ctx.tenantId`'ye göre çalışır). Diğer kurumu
asla etkilemez ve production'da varsayılan olarak otomatik çalışmaz —
yalnızca panelden elle tetiklenir.

## Teknik

Demo verisini sıfırlamak: panel özet sayfasındaki **Demo verisini sıfırla**.

## Teknik

- Next.js (App Router) + TypeScript + Tailwind
- Prisma + PostgreSQL (`@prisma/adapter-pg`) production-ready persistence
- Telafi motoru: `src/lib/makeup-engine.ts` (şube + öğretmen + oda skoru)
- WhatsApp şablonları: `src/lib/whatsapp-templates.ts`

## Fiyat (referans)

- Başlangıç: ~2.500 ₺/ay (1 şube)
- Akademi: ~4.500 ₺/ay (2 şube + portaller) — **önerilen**
- Kurumsal: özel

## Repo

https://github.com/hidircan/notaplan

## Supabase storage (announcement attachments)

- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are safe for client use.
- `SUPABASE_SERVICE_ROLE_KEY` is a server-only secret used for uploading to private buckets and generating signed URLs. Do NOT expose it to browsers or commit its value. See `.env.example` for variable names.

## Deploy (staging / production)

1. `npx prisma migrate deploy` — additive migrations (telafi kotası, duyuru ekleri, tahsilat v3, SMS inbound event).
2. `npx prisma generate` (build zaten `prebuild` ile çalıştırır).
3. Gerekli sunucu env: `DATABASE_URL`, `JWT_SECRET`, SMS/Twilio, Supabase storage.
4. Geri dönüş: son migration’ı `prisma migrate resolve` / yeni kolonlar nullable/default olduğu için veri silmeden geri alınabilir; uygulama önceki koda dönebilir (yeni kolonlar kalır).

## Tahsilat SMS ve WhatsApp

- Gerçek SMS yalnızca yönetici son onayından sonra, sunucu tarafı sağlayıcı ile gider. UI asla sağlayıcıya doğrudan bağlanmaz.
- `SMS_PROVIDER=twilio` + `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_SMS_FROM`.
- Development/staging: `SMS_TEST_MODE=true` iken gerçek SMS yalnızca `SMS_TEST_ALLOWED_RECIPIENTS` allowlist’ine gider. Production’da test bypass yoktur.
- Inbound webhook: `POST /api/v1/sms/webhook` (JWT yok). Twilio `X-Twilio-Signature` zorunlu. İmza URL’si için `SMS_WEBHOOK_PUBLIC_URL` (reverse proxy arkasında tam public HTTPS path) ayarlayın.
- Allowlist, credential ve gerçek numaralar source/README’ye yazılmaz.
- `wa.me` WhatsApp bağlantısı teslim kanıtı değildir; kayıt `manual_send_pending` olur.

## Supabase storage (announcement attachments)

- Private bucket adı: `announcement-attachments`.
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are safe for client use.
- `SUPABASE_SERVICE_ROLE_KEY` is a server-only secret used for uploading to private buckets and generating signed URLs. Do NOT expose it to browsers or commit its value. See `.env.example` for variable names.

## Bildirim taraması (cron)

`POST /api/v1/notifications/tick` — yaklaşan ders, bekleyen ödeme, bekleyen izin.
`Authorization: Bearer <NOTIFICATION_CRON_SECRET>` zorunlu; secret yoksa 403. JWT kabul edilmez.
Önerilen sıklık: 15–30 dakika. Aynı ders/ödeme/izin için tekrar çağrı duplicate üretmez.

İş Takip hatırlatmaları ayrıdır: `POST /api/v1/tasks/reminders/tick` + `TASK_REMINDER_CRON_SECRET`.

## Health

- `GET /api/v1/health` — liveness
- `GET /api/v1/ready` — DB erişimi, SMS/storage env varlık bayrakları (secret yok)

# TASK_BOARD.md

Sadece aktif/sıradaki/bloke/önemli-tamamlanmış işler. Kaynak:
`docs/agent-memory/PROJECT_STATE.md` + oturumların (2026-08-31) taraması.
**Öncelik sırası:** web canlıya alma → öğretmen/öğrenci mobil → yönetim
mobil portal (bkz. `VISION.md`, `DECISIONS.md`).

## 🔴 EN YÜKSEK ÖNCELİK — Güvenli Canlıya Alma (Go-Live) Sırası

CEO'nun 2026-08-31 tarihli talimatıyla kesinleşen, **değiştirilmeden takip
edilmesi gereken** sıra. Her adım bir öncekinin doğrulanmasına bağlıdır —
sıra atlanmaz.

| # | Adım | Durum | Not |
|---|---|---|---|
| 1 | Yerel gerçek veriyi (`data/store.json` — 94 öğrenci, 8 öğretmen) şifreli/yedekli ikincil bir konuma taşı | Yapılmadı | Tek kopya risk — önce güvenli yedek, sonra hiçbir şey |
| 2 | Boş Supabase production ortamını ve erişimi doğrula | Kısmen — "0 tablo" tespiti bu oturumda list_tables ile TEKRAR doğrulandı (2026-08-31), ama bu durağan bir gerçek değil | Migration'dan hemen önce yeniden kontrol edilmeli, bkz. KNOWN_GAPS §1 |
| 3 | Prisma migration'larını kontrollü şekilde uygula | Yapılmadı | `npx prisma migrate deploy` — CEO onayıyla, Seviye 3 |
| 4 | Nilüfer Acar verisini önce, dry-run + doğrulama ile taşı | Yapılmadı | Diğer kurumlardan önce, izole test |
| 5 | Kayıt sayılarını ve veri bütünlüğünü doğrula | Yapılmadı | Kaynak vs hedef satır sayısı, örnek kayıt karşılaştırması |
| 6 | Supabase + harici şifreli yedek oluştur | Yapılmadı | Tek nokta hata olmaması için ikinci, bağımsız yedek |
| 7 | Vercel ortam değişkenlerini ayarla ve production deploy yap | Yapılmadı | `STORE_MODE=db`, `DATABASE_URL`, Supabase key'leri — Seviye 3 |
| 8 | `neviihub.com`, `www.neviihub.com`, `app.neviihub.com` adreslerini Cloudflare DNS üzerinden bağla | Yapılmadı | Domain satın alındı ama **DNS/Vercel bağlantısı HENÜZ YAPILMADI** — aşağıdaki not |
| 9 | HTTPS, yetkilendirme/RBAC doğrulama, hata izleme (error tracking), rollback planı ve gerçek cihaz testi | Yapılmadı | Go-live'ın son kapısı, tek tek işaretlenmeli |

**Not (2026-08-31):** `neviihub.com`, CEO tarafından Cloudflare Registrar
üzerinden **2 yıllığına** satın alındı (Vercel üzerinden değil). Domain
henüz Vercel projesine/DNS'e **bağlanmadı** — adım 8'e kadar bağlanmayacak,
sıra bozulmamalı (önce veri güvenliği ve migration doğrulaması).

| Ek iş | Durum | Not |
|---|---|---|
| Vercel Hobby → Pro plan kararı | CEO KARARI (2026-08-31): go-live'a yakın bir zamana ertelendi | Şimdilik Hobby planda kalınıyor, aylık ücret başlamıyor |
| Nilüfer Acar kendi sitesinden "Giriş Yap" yönlendirmesi | Go-live SONRASI | DNS/redirect kurulumu gerekiyor, adım 8'den sonra |

## 🟠 Bloke

| İş | Neden bloke |
|---|---|
| Live tarayıcı doğrulama (DOCX round-trip, print-preview, hydration konsol) | Bu ajan ortamında Chrome kurulumu sudo gerektiriyor |
| `vitest`/`tsx` ile hedeflenmiş test/script çalıştırma| Native binding hatası (rolldown/esbuild) — CEO'nun kendi Mac terminalinde çalışmalı |
| "Ödeme Şekli" sütun düzeltmesi | Hukuk/sahip onayı bekliyor |
| `AGENTS.md`/DB mimarisi çelişkisi | Çözüldü (bkz. KNOWN_GAPS #4-5) |

## 🟡 Sırada (planlandı, henüz uygulanmadı)

| İş | Not |
|---|---|
| KVKK + foto/video rızasının ana sözleşmeyle birleşik sunumu | Kaynak metin (`student-enrollment-3008.md`) zaten birleşik — plan CEO'ya sunuldu |
| Sözleşmeyi davet e-postasına ekleme (PDF eki veya link) | Link YOL DAHA UCUZ/HIZLI (mevcut yetkili portal görüntüleme sayfası var); PDF eki Puppeteer altyapısı gerektirir (henüz yok) |
| `.docx` dışında `.doc`/`.pdf`/`.md` şablon yükleme desteği | Şu an yalnızca `.docx` kabul ediliyor |
| Puppeteer/benzeri PDF sayfa numarası pipeline'ı | Bundle boyutu/cold-start altyapı kararı gerekiyor |
| Aynı-gün iptal: sunucu mantığı + UI | Şema var, mantık yok. LESSONS_LEARNED #1'i önce oku |
| Tam ZIP+CSV toplu geçmiş sözleşme içe aktarma | Manifest/eşleştirme kuyruğu/audit raporu YOK |
| `PROJECT.md`/`DEVOPS_GUIDE.md`'deki eski MySQL varsayımını düzeltme | DATABASE_ARCHITECTURE.md daha önce düzeltildi; PROJECT.md/DEVOPS_GUIDE.md paralel oturumun marka geçişinde dokunuldu ama MySQL/MariaDB anlatısı hâmâ orada olabilir — tekrar taranmalı |
| `apps/mobile/app.json` bundle identifier değişikliği (`com.notaplan.mobile`→`com.neviihub.mobile`) | Paralel/eş oturum tarafından yapılmış, bu oturumun aldığı talimatla ("apps/mobile'da bundle identifier değiştirilmeyecek") çelişiyor — bkz. DECISIONS.md, CEO onayı/gözden geçirmesi gerekiyor, geri alınmadı |

## 🟢 Son tamamlanan

### 2026-08-31, Portal Erişim Yönetimi oturumu
- **Panel admin artık öğrenci/öğretmen detay ekranından portal erişimini
  açıp kapatabiliyor, davet gönderip yeniden gönderebiliyor, admin-tetikli
  şifre sıfırlama bağlantısı yollayabiliyor.** Yeni "Portal Erişimi" kartı
  (`src/components/portal-access-card.tsx`) hem öğrenci hem öğretmen detay
  sayfasına eklendi; yeni öğretmen oluşturma formuna "Portal erişimi
  (opsiyonel)" seçeneği eklendi (öğrenci formunda zaten vardı).
- **İki gerçek hata bulundu ve düzeltildi:** (1) json/memory modunda
  (bugünkü production modu) erişimi kapatmak girişi GERÇEKTEN
  engellemiyordu, yalnızca ekranda gösteriyordu — `authenticateUser`
  düzeltildi. (2) self-servis "şifremi unuttum" hiçbir zaman gerçek e-posta
  göndermiyordu — düzeltildi.
- **Yeni Prisma migration'a gerek YOK** — `StudentPortalAccess` ve
  `PasswordResetToken` tabloları/migration'ları zaten diskte mevcut
  (henüz Supabase'e uygulanmadı, go-live sırası adım 3'ü bekliyor).
- **12 zorunlu test senaryosu** `src/lib/__tests__/portal-access-management.test.ts`e
  yazıldı (aynı-e-posta çakışması, e-posta yokken engel, gönderim hatası
  sızdırmama, token süre aşımı/tek kullanım, RBAC, öğretmen login engeli
  dahil). `tsc --noEmit` temiz; `vitest` bu ortamda madde KNOWN_GAPS #10
  kısıtı nedeniyle ÇALIŞTIRILAMADI.
- Detay: `DECISIONS.md` "Portal Erişim Yönetimi" bölümü,
  `AUTH_SECURITY_RBAC.md`, `COMMUNICATIONS.md`, `KNOWN_GAPS.md` #16.
  Kapsam: yalnızca web admin paneli + backend — `apps/mobile/`'a
  DOKUNULMADI (görev talebi gereği).
- **İKİNCİ TUR (CEO gerçek panelde denedi, GERÇEK KÖK NEDEN bulundu) —
  ÇÖZÜLDÜ.** Mevcut bir öğrenciye davet göndermek "Kullanıcı hesabı
  oluşturulamadı/bulunamadı" ile başarısız oluyordu — `provisionEntityLogin`
  yalnızca `db` modunda yeni `User` satırı oluşturabiliyordu, ama bugünkü
  TEK üretim modu `json`. Yeni `src/lib/auth/dynamic-users.ts` (dosya-tabanlı
  kalıcı depo) ile json/memory modunda da gerçek kullanıcı oluşturma artık
  ÇALIŞIYOR. Eski/bozuk (User'sız) `StudentPortalAccess` kayıtları admin
  yeniden davet gönderince güvenle onarılıyor (veri silinmeden "revoked").
  CEO'nun kendi makinesinde bulduğu 4 başarısız test de düzeltildi. Detay:
  `DECISIONS.md`, `KNOWN_GAPS.md` #16.

### 2026-08-31, marka geçişi doğrulama oturumu
- **Marka geçişi (NotaPlan/Maestron → Nevii Hub) — paralel bir oturum
  tarafından zaten Faz 0-3/5-7 kapsamında tamamlanmış bulundu ve bu
  oturumda doğrulandı** (bkz. `NEVII_HUB_BRAND_MIGRATION_REPORT.md`,
  `BRAND_MIGRATION_INVENTORY.md`, `DECISIONS.md`). Bu oturum: kalan
  `docs/project-brain/*` dosyalarını (VISION/DECISIONS/TASK_BOARD) bu
  göç kararlarıyla senkronize etti, go-live sırasını CEO'nun verdiği
  kesin 9 adıma göre yeniden yazdı, `tsc --noEmit` ile tekrar doğruladı.

### 2026-08-31, önceki oturum
- **Öğrenci kaydı "davet e-postası gönder" sessiz hatası düzeltildi.** Admin
  artık gönderim başarısız olursa uyarı görüyor. `tsc --noEmit` temiz.
- **78 öğrenci + 7 öğretmen displayId backfill'i çalıştırıldı** (S00017–
  S00094, T00002–T00008), yeni kayıtlar zaten otomatik numara alıyor.
- **`AGENTS.md` geri yüklendi** (yanlışlqkla silinmişti).
- **`DATABASE_ARCHITECTURE.md`** MySQL/MariaDB → PostgreSQL/Supabase olarak
  düzeltildi (§1/§2/§7.4/§15/§18), `.env.example` örnek `DATABASE_URL`
  düzeltildi.
- **`docs/project-brain/` + `.claude/skills/` ilk kurulumu.**

## Son tamamlanan (PROJECT_STATE.md, 2026-08-31 öncesi)
- P0 hydration hotfix, karşılama e-postası şablonu, CSV toplu geçmiş
  sözleşme içe aktarma (tekil-dosya kapsamı).

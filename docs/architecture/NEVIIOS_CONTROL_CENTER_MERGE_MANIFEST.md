# NeviiOS Control Center → NeviiHub birleştirme manifesti (2026-09-12)

Durum: **SEÇENEK 1 UYGULANDI** (owner kararı). Kod hedefte birleştirildi; commit/push/
deploy/migration uygulaması/uzak yazım YOK. Kaynak worktree (`~/Projects/neviios-control`)
salt-okunur kullanıldı — hiçbir dosyası değişmedi/silinmedi.

| | Hedef (canonical) | Kaynak (NeviiOS) |
|---|---|---|
| Branch / HEAD | `fix/admin-payment-attendance-sync-p0` @ `5d3a2b7` | `grok-neviios-control` @ `8dfb929` (= merge-base) |
| Başlangıç yedeği | `$CLAUDE_JOB_DIR/tmp/target-start.patch` + untracked tar (iş dizini, geçici) | — |

## 1. Kanonik rol sözleşmesi (tek sahip: `src/lib/auth/platform-access.ts`)

| Rol | Anlam | `/platform/*` | "Tüm kurumlar" | Personel/özlük/bordro/izin/avans/IBAN/gider/bütçe/finans özeti | `/panel/*` operasyon |
|---|---|---|---|---|---|
| HYPER_ADMIN | Platform sahibi | ✓ | ✓ | ✗ (kurum paneline girmez; panel aksiyonları reddedilir) | ✗ |
| SUPER_ADMIN | Kurum sahibi (tek tenant) | ✗ (404/403) | ✗ | ✓ | ✓ |
| SCHOOL_ADMIN | Kurum yöneticisi | ✗ | ✗ | ✗ | ✓ |
| BRANCH_MANAGER (`unified`) | Şube yöneticisi, efektif SCHOOL_ADMIN | ✗ | ✗ | ✗ | ✓ (efektif rol) |
| BRANCH_MANAGER (`branch_scoped`) | Yalnız atanmış şube | ✗ | ✗ | ✗ | ✗ → `/sube` |

- "OWNER_ADMIN" ayrı enum olarak EKLENMEDİ; kurum sahibi = `SUPER_ADMIN` (kural 3), UI etiketi "Kurum Sahibi".
- Kararlar yalnız ROL ile verilir; eski userId listeleri (`PLATFORM_OWNER_USER_ID`, env listeleri) kaldırıldı.
- **Login rol ↔ efektif rol:** efektif rol yalnız `resolveEffectiveRole` (`src/lib/platform/manager-preset.ts`)
  ile, oturum bağlamı kurulurken üretilir: `authenticateRequest` (API) ve `getSessionContext`
  (sayfa/server action). `ServiceContext.role` = efektif, `ServiceContext.loginRole` = token rolü.
  JWT ve `User.role` asla değişmez. Refresh her seferinde rolü güncel kullanıcı kaydından basar.
- **Fixture (yalnız json/memory bootstrap, db satırı değişmez) — 2026-09-12 NİHAİ hesap modeli:**

  | Kimlik | Login rolü | Efektif rol | Tenant | Durum |
  |---|---|---|---|---|
  | `user_hyper_admin` (e-posta yalnız `AUTH_HYPER_ADMIN_EMAIL`; dev varsayılanı `hyper@nevii-hub.test`) | HYPER_ADMIN | HYPER_ADMIN | `tenant_platform` | aktif (prod'da env yoksa hesap yok) |
  | `user_owner_nilufer` / `nilufer.acar@niluferacar.com.tr` | SUPER_ADMIN | SUPER_ADMIN | `tenant_nilufer_acar` | aktif — kurum sahibi |
  | `user_manager_ezgi` / `ezgi.guclu@…` | SCHOOL_ADMIN | SCHOOL_ADMIN | `tenant_nilufer_acar` | aktif |
  | `user_manager_nihal` / `nihal.gedikli@…` | BRANCH_MANAGER | SCHOOL_ADMIN (`unified`) | `tenant_nilufer_acar` | aktif |
  | `user_admin` / `admin@niluferacar.com.tr` | SCHOOL_ADMIN (kurum sahibi yetkisi kaldırıldı) | — | `tenant_nilufer_acar` | **EMEKLİ**: giriş kapalı, açık token/refresh 401, bildirim listesinde yok; kayıt ve geçmiş referansları korunur (`RETIRED_BOOTSTRAP_USER_IDS`) |
  | `user_super` / `super@notaplan.app` | SCHOOL_ADMIN (kurum sahibi yetkisi kaldırıldı) | — | `tenant_nilufer_acar` | **EMEKLİ** (4. karar): giriş kapalı, açık token/refresh 401, bildirim listesinde yok; kayıt korunur |

## 2. Route / sahiplik

- `/panel/*` → hedef NeviiHub (tek sahip). Kaynaktan panel ekranı ALINMADI; yalnız hedefte olmayan
  3 kurum-sahibi ayar sayfası eklendi: `/panel/ayarlar/{kurum,ozellikler,entegrasyonlar}`.
- `/platform/*` (31 sayfa), `/api/v1/platform/*`, `/api/v1/config/snapshot`, `/sube` + `/api/v1/sube/*`,
  `/api/v1/{branding,catalog,mobile,institution,invitations,password-reset}` → taşınan Control Center.
- Route manifesti: 359 URL, **aynı URL için ikinci page/route sahibi YOK** (route group'lar düzleştirilerek sayıldı).
- Guard katmanları: middleware (`/platform`, `/sube` korumalı) → sayfada `requireHyperAdminPage` (404) →
  `withApiHandler({ hyperAdminOnly })` 403 → servis `requireHyperAdmin`. BRANCH_MANAGER tüm API'lerde
  varsayılan 403 (`allowBranchManager` açmadıkça); HYPER_ADMIN/BRANCH_MANAGER panel server action'larında reddedilir.

## 3. Taşınan / birleştirilen / taşınmayan

**Taşındı (kaynakta untracked, 163 dosya, olduğu gibi):** `src/lib/platform/*`, `auth/session-registry.ts`,
`auth/session-validity.ts`, `src/app/platform/**`, `src/app/sube`, `src/app/davet`, `src/components/platform/*`,
yukarıdaki API'ler, 4 test dosyası (`neviios-control-center|round2|round3`, `platform-control-center`),
`scripts/bootstrap-hyper-admin.ts`, `docs/platform-control-center.md`.
Release merkezi / sürümler / deploymentlar / paketler / log saklama: dependency closure tam (typecheck + testler yeşil) → taşındı.

**3-yollu birleştirildi (base `8dfb929`, hedefin mevcut diff'leri korunarak):** auth çekirdeği
(`types, rbac, jwt, session, authenticate, config, index, role-labels, role-routes, users`), `middleware.ts`,
`api/{handler,context}`, `services/{context,tools}`, `actions.ts`, `institution/{context,scope}`,
`nav/panel-nav.ts`, `command-palette`, `sidebar`, `user-menu`, `context-header`, `panel-header`,
`panel/layout`, `panel/personel/*`, `panel/finans-ozeti`, `panel/yardim`, `layout.tsx`, `gorunum-ayarlari`,
`theme-preferences-form`, `manager-notifications`, `notification-sweeps`, auth route'ları (login/logout/refresh/
change-password — hedefin P1 workspace-bootstrap diff'i korundu), `tahsilat/{cases,roi}`, 17 test.
12 çakışma elle çözüldü; ayrıntı: `layout.tsx` = hedefin `clampPreferencesToPolicy` + NeviiOS
`applyAppearancePolicy` (policy üstte); `tools.ts` kapanış günü kontrolü hedefteki saf fonksiyonda kaldı.

**Taşınmadı:** kaynağın marka/logo dosyaları ve `brand.ts` (hedefin `/brand/logo.png` seti kanonik),
`src/app/page.tsx`, `login/page.tsx`, `sifre-sifirla/page.tsx` (hedefinki), `icon.png`, `.env.example`,
`README.md`, `WORK_PROGRESS.md`, kaynağın 5 migration dosyası (bkz. §4).

## 4. Şema / migration

- Şema: 14 yeni model (`SettingOverride, FeatureFlagOverride, PlatformAuditEvent, IntegrationConnection,
  OwnerInvitation, ProvisioningRun, UserBranchAccess, SupportAccessSession, PolicyVersion, TenantCustomRole,
  UserRoleAssignment, UserSession, PlatformRelease, PlatformDeployment`), `Tenant` profil/yaşam döngüsü
  kolonları, `User.{displayName,deletedAt,lastLoginAt,sessionsRevokedAt}` (nullable).
- **PasswordResetToken:** hedef modeli kanonik (tenant ilişkisi + `tokenHash` indeksi korunur);
  kaynağın ikinci modeli kaldırıldı; yalnız `createdBy String?` (NULLABLE) eklendi — mevcut "şifremi
  unuttum" satırları etkilenmez; kod tipi `string | null`.
- **Yeni migration (UYGULANMADI):** `prisma/migrations/20260913140000_neviios_control_center/migration.sql`
  — `prisma migrate diff` ile çevrimdışı üretildi, yalnız `ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS` /
  `CREATE [UNIQUE] INDEX IF NOT EXISTS`; DROP/ALTER COLUMN/UPDATE yok. Zincirin sonuna doğru sıralı.
- Kaynağın `20260826*`, `20260911120000_neviios_*`, `20260912120000_*`, `20260913120000_*` dosyaları
  yeniden adlandırılmadı/sıralanmadı/alınmadı (kaynakta duruyor).
- Migration uygulanmadan (db modu): platform tabloları yok → platform ekranları/API'leri Prisma hatası
  verir (fail-closed, JSON'a düşmez); `UserSession` yokken `startUserSession` sid üretemezse token sid'siz
  kalır; `deletedAt/lastLoginAt/sessionsRevokedAt` kolonları yokken **db modunda login/getUserById sorguları
  hata verir** → test ortamında kod, migration'dan ÖNCE deploy EDİLMEMELİ. json/memory mod tam çalışır.

## 5. Legacy `/panel/*` — sonraki tur silme manifesti (kaynak `~/Projects/neviios-control`)

Bu turda kaynakta HİÇBİR dosya silinmedi. Kaynakta 61 izli `/panel/*` dosyası; Control Center import
kapanışı (163 untracked dosyadan transitif) hiçbirini kullanmıyor.

**Silinmemeli (başlangıçtan kullanıcı diff'i var — manuel karar):**
`panel/layout.tsx`, `panel/finans-ozeti/page.tsx`, `panel/personel/page.tsx`, `panel/personel/[staffId]/page.tsx`,
`panel/personel/bordrolar/page.tsx`, `panel/personel/izinler/page.tsx`, `panel/yardim/page.tsx`
(değişiklikleri hedefe zaten 3-yollu taşındı).
**Silinmemeli (Control Center kurum tarafı, untracked):** `panel/ayarlar/{kurum,ozellikler,entegrasyonlar}` — hedefe taşındı.

**Sonraki turda silinebilir (54 dosya — izli, temiz, CC tarafından import edilmiyor; git'ten geri alınabilir):**
- `src/app/panel/ai/logs/page.tsx`
- `src/app/panel/ai/memory/page.tsx`
- `src/app/panel/ai/page.tsx`
- `src/app/panel/ai/tahsilat-agent/page.tsx`
- `src/app/panel/ayarlar/bildirimler/page.tsx`
- `src/app/panel/ayarlar/kvkk/page.tsx`
- `src/app/panel/bildirimler/page.tsx`
- `src/app/panel/chat/page.tsx`
- `src/app/panel/crm/page.tsx`
- `src/app/panel/deneme/page.tsx`
- `src/app/panel/denetim-kaydi/page.tsx`
- `src/app/panel/ders-duzeltme/page.tsx`
- `src/app/panel/duyurular/page.tsx`
- `src/app/panel/enstrumanlar/page.tsx`
- `src/app/panel/evraklar/[documentId]/page.tsx`
- `src/app/panel/evraklar/page.tsx`
- `src/app/panel/hakedisler/page.tsx`
- `src/app/panel/hesabim/page.tsx`
- `src/app/panel/iletisim-merkezi/page.tsx`
- `src/app/panel/is-takip/[taskId]/page.tsx`
- `src/app/panel/is-takip/kanban/page.tsx`
- `src/app/panel/is-takip/liste/page.tsx`
- `src/app/panel/is-takip/page.tsx`
- `src/app/panel/is-takip/raporlar/page.tsx`
- `src/app/panel/is-takip/takvim/page.tsx`
- `src/app/panel/kurulum/page.tsx`
- `src/app/panel/maestron-ai/page.tsx`
- `src/app/panel/mufredat/page.tsx`
- `src/app/panel/odalar/page.tsx`
- `src/app/panel/odemeler/[studentId]/page.tsx`
- `src/app/panel/odemeler/page.tsx`
- `src/app/panel/odev-raporu/detay/page.tsx`
- `src/app/panel/odev-raporu/page.tsx`
- `src/app/panel/ogrenciler/[studentId]/page.tsx`
- `src/app/panel/ogrenciler/page.tsx`
- `src/app/panel/ogrenciler/yeni/page.tsx`
- `src/app/panel/ogretmenler/[teacherId]/geri-bildirim/page.tsx`
- `src/app/panel/ogretmenler/[teacherId]/hakedis/page.tsx`
- `src/app/panel/ogretmenler/[teacherId]/musaitlik/page.tsx`
- `src/app/panel/ogretmenler/[teacherId]/odemeler/page.tsx`
- `src/app/panel/ogretmenler/[teacherId]/page.tsx`
- `src/app/panel/ogretmenler/[teacherId]/performans/page.tsx`
- `src/app/panel/ogretmenler/page.tsx`
- `src/app/panel/ogretmenler/yeni/page.tsx`
- `src/app/panel/page.tsx`
- `src/app/panel/paketler/page.tsx`
- `src/app/panel/paketler/yeni/page.tsx`
- `src/app/panel/program/page.tsx`
- `src/app/panel/subeler/page.tsx`
- `src/app/panel/telafi/page.tsx`
- `src/app/panel/ucret-kurallari/page.tsx`
- `src/app/panel/veri-aktar/page.tsx`
- `src/app/panel/workflows/page.tsx`
- `src/app/panel/yoklama/page.tsx`

Not: kaynağın `/panel` dışındaki NeviiHub ürün yüzeyleri (`/ogretmen`, `/veli`, `/ogrenci`, ürün API'leri)
de legacy'dir ama `src/lib/services/tools.ts` vb. Control Center tarafından import ediliyor → kaynak
repo komple emekliye ayrılana kadar silinmemeli. Test domaininde yalnız hedef worktree deploy edilir;
kaynak kod hiçbir koşulda test build output'una girmez.

## 6. Doğrulama

(bkz. PROJECT_STATE "Güncel odak" — sonuçlar orada)

## 7. Nihai hesap modeli (2026-09-12, 2. karar) — açık konular

- **Hıdırcan Yağız'ın gerçek platform owner kimliği kodda/fixture'da TANIMLI DEĞİL.** HYPER_ADMIN yalnız
  `hyperAdminBootstrapUsers()` (env) veya `scripts/bootstrap-hyper-admin.ts` (db, env) ile oluşur; hiçbir
  e-posta varsayılmadı, hiçbir hesaba HYPER_ADMIN verilmedi. Invariant testi: `role-ownership-invariants.test.ts`.
- **`user_super` (super@notaplan.app):** eski kodda "Hıdırcan'ın platform kimliği" diye yorumlanmış demo hesap;
  yeni modelde Nilüfer Acar tenant'ında ikinci bir SUPER_ADMIN (hassas alan erişimi var). Yanlış hesaba yetki
  vermemek için rolüne DOKUNULMADI → owner: pasifleştirilsin mi / kaldırılsın mı?
- **`admin@` ilişkileri (yerel `data/*.json`, salt-okunur tarama):** yalnız geçmiş aktör referansları —
  `lessons.lessonProcessedBy` ×4, `studentAttendedBy` ×1, `opsMakeupFlagBy` ×2, `payments.receivedByUserId` ×3,
  `payments.adjustedBy` ×1, `student-contracts.createdBy/generatedBy` ×2+2, `document-instances.createdBy` ×4,
  `student-portal-access.invitedBy` ×2, `social-media-consents.history.byUserId` ×2, `notifications.targetUserId` ×4,
  `user-preferences` ×1, `email-change-tokens` ×1. Tek sahip/tek referans (owner FK) YOK → pasifleştirme güvenli;
  hiçbiri silinmedi/yeniden yazılmadı. Kod: demo görev seed'i (`seedDemoTasks`) sorumlu/oluşturanı Nilüfer'e taşındı.
- **Gerçek (test) DB için operasyon planı — UYGULANMADI:** (1) yedek; (2) `20260913140000_neviios_control_center`
  migration'ı; (3) salt-okunur doğrulama: `SELECT id, role, active FROM "User" WHERE email IN ('nilufer.acar@…','admin@…')`
  + admin@'e referans veren tabloların sayımı; (4) tek transaction:
  `UPDATE "User" SET role='SUPER_ADMIN' WHERE email='nilufer.acar@niluferacar.com.tr' AND "tenantId"='tenant_nilufer_acar';`
  `UPDATE "User" SET role='SCHOOL_ADMIN', active=false, "sessionsRevokedAt"=now() WHERE email='admin@niluferacar.com.tr';`
  `UPDATE "UserSession" SET "revokedAt"=now(), "revokeReason"='retired_duplicate_owner' WHERE "userId"=<admin id> AND "revokedAt" IS NULL;`
  (DELETE yok); (5) HYPER_ADMIN: gerçek e-postayla `AUTH_HYPER_ADMIN_EMAIL`/`_PASSWORD` + `bootstrap-hyper-admin.ts`;
  (6) sonra kod deploy. Kolon adları uygulama öncesi şemayla doğrulanmalı.

## 8. Öğretmen Hakedişleri — kurum bazlı erişim politikası (2026-09-12, 3. karar)

- **Ayar:** `access.teacherEarningsAccess` (enum, platformOnly, critical → `access.*` olduğu için
  PolicyVersion + `platform.setting.update` audit). Değerler: `owner_only` | `school_admin` (platform
  varsayılanı = birleşim öncesi davranış, diğer kurumlar değişmez) | `school_admin_and_branch_manager`.
  Nilüfer Acar owner varsayılanı: `school_admin_and_branch_manager`. Tek karar noktası:
  `src/lib/platform/teacher-earnings-access.ts` (`canAccessTeacherEarnings` / `assertTeacherEarningsAccess`).
- **Kural:** SUPER_ADMIN her zaman; SCHOOL_ADMIN politika `owner_only` değilse; BRANCH_MANAGER yalnız
  `unified` preset (efektif SCHOOL_ADMIN) + kurum `school_admin_and_branch_manager` ise; `branch_scoped`
  BRANCH_MANAGER fail-closed red (şube-filtreli hakediş yüzeyi YOK — uydurulmadı); HYPER_ADMIN red;
  TEACHER yalnız kendi hakedişi (değişmedi).
- **Uygulama noktaları (sunucu):** araçlar `createFeeRuleTool`, `updateFeeRuleTool`, `listTeacherPayoutsTool`
  (öğretmen dışı), `computeTeacherPayoutTool`, `createTeacherPayoutTool`, `updateTeacherPayoutPaymentMethodTool`,
  `markTeacherPayoutPaidTool` → server action'lar (`actionCreateFeeRule` … `actionMarkTeacherPayoutPaid`) ve
  `GET /api/v1/teachers/[teacherId]/payouts` bu araçlardan geçer. Sayfalar: `/panel/hakedisler`,
  `/panel/ogretmenler/[id]/hakedis`, `/panel/ogretmenler/[id]/odemeler`, `/panel/ucret-kurallari`,
  `/ogretmen-hakedis-yazdir/[id]`. Menü: sidebar "Öğretmen Hakedişleri" yalnız izin varsa.
- **Mevcut aksiyonlar (uydurma yok):** görüntüle (liste), hesapla (önizleme), oluştur, ödeme yöntemi güncelle,
  ödendi işaretle, ücret kuralı oluştur/güncelle, yazdır. Ayrı "approve/export/payment_execute" uç noktası
  YOK; "ödendi işaretle" gerçek ödeme/payout çağrısı yapmaz (yalnız kayıt).
- **Genel finans kısıtı değişmedi:** `requireStaffSensitiveAccess` (finans özeti, gider, bütçe, IBAN, avans,
  bordro, izin, personel) yalnız SUPER_ADMIN. Test: `teacher-earnings-access.test.ts`.
- **Hata düzeltmesi (bu tur):** kaynaktan yanlışlıkla kopyalanan 5 migration klasörü hedeften kaldırıldı
  (bkz. LESSONS_LEARNED 2026-09-12); §4'teki "alınmadı" ifadesi artık doğru.

## 9. 4. karar — `user_super` emekli + yerel tarayıcı UAT (2026-09-12)

- **`user_super` ilişkileri (salt-okunur):** kod: yalnız `users.ts` bootstrap kaydı; yerel veri: `data/notifications.json`
  `targetUserId` ×4 (geçmiş bildirim). Tek sahip/kritik ilişki YOK → `RETIRED_BOOTSTRAP_USER_IDS`'e eklendi, rol
  SCHOOL_ADMIN; kayıt ve bildirim geçmişi silinmedi. Testlerdeki "ikinci sahip" adımı kaldırıldı; demo-reset testindeki
  mock SUPER_ADMIN bağlamı Nilüfer'e taşındı.
- **Gerçek DB planı (UYGULANMADI):** §7'deki transaction'a ek:
  `UPDATE "User" SET role='SCHOOL_ADMIN', active=false, "sessionsRevokedAt"=now() WHERE email='super@notaplan.app';`
  + açık `UserSession` satırlarına `"revokedAt"=now(), "revokeReason"='retired_demo_account'`. Uygulama sonrası doğrulama:
  `SELECT count(*) FROM "User" WHERE "tenantId"='tenant_nilufer_acar' AND role='SUPER_ADMIN' AND active` = 1 ve
  `SELECT count(*) FROM "User" WHERE role='HYPER_ADMIN' AND active` = 1.
- **Tarayıcı UAT (Playwright, `next dev -p 3217`, `STORE_MODE=json VERCEL=1` → `/tmp/notaplan-data`, kullanıcının `./data`'sı
  kullanılmadı):** giriş: HYPER_ADMIN/SUPER_ADMIN(Nilüfer)/SCHOOL_ADMIN(Ezgi)/BRANCH_MANAGER(Nihal) ✓; admin@ ve super@ 401.
  API: `/api/v1/platform/roles` yalnız HYPER 200 (diğerleri 403); tahsilat HYPER 403, kurum rolleri 200; başka kurum config
  snapshot 403; hakediş API Nilüfer/Ezgi/Nihal 200, HYPER 403; `revoke_all` sonrası Nihal API 401 + refresh 401.
  Sayfa: kurum rolleri `/platform/*` → notFound (404 gövdesi); Ezgi/Nihal `/panel/finans-ozeti`, `/panel/personel(/bordrolar)`
  → `/panel` yönlendirmesi; Nilüfer bu sayfaları görür; HYPER `/panel/*` → `/platform`; emekli hesaplar → `/login`.
  Ezgi `/panel/hakedisler` gerçek gezinmeyle açıldı; menüde "Öğretmen Hakedişleri" var, Personel/Finans Özeti yok; ağ
  istekleri yalnız aynı origin (dış servis / ödeme / payout çağrısı YOK).
- **Gözlem:** App Router streaming nedeniyle sayfa içi `notFound()`/`redirect()` HTTP 200 + gövde işaretiyle döner (veri
  okunmadan önce kesilir, sızıntı yok). Gerçek 404/307 durum kodu isteniyorsa kontrol middleware'e taşınmalı (backlog).
- **Açık teknik borç:** `branch_scoped` BRANCH_MANAGER Hakediş erişimi kapalı (bkz. §8).

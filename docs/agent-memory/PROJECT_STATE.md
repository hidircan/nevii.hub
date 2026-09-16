# NeviiHub — Resume-From-Here State

Single low-token entry point for a fresh AI session (or human) to pick up
work on this repo without re-reading the whole history. Update the "Current
focus" and "Open work" sections whenever a work session ends; keep it short —
this file is meant to be read whole, cheaply, every session start.

Read order for a new session: this file → `docs/agent-memory/LESSONS_LEARNED.md`
→ whichever doc under `docs/contracts/` or `docs/roadmap/` is named in "Open
work" below.

## Product snapshot

NeviiHub (brand name; repo/internal name `notaplan`) — multi-tenant SaaS for
music schools. Next.js 16 App Router, React 19, TypeScript, Prisma/PostgreSQL
+ JSON/memory store parity. See root `CLAUDE.md` for architecture. Nearing
production launch — demo-only UI content is being removed from customer-facing
screens (login/welcome).

## Owner-approved policy decisions (FINAL, do not re-litigate)

- Telafi: max 2 rights per full education year (not per term). 30-day expiry
  from original missed lesson date.
- Payment windows: card 1–5 inclusive, havale/EFT/nakit 1–15 inclusive.
  Centrally enforced, not user-editable per student/package.
- KDV: all customer-facing prices inclusive, "Tüm eğitim ücretleri KDV
  dahildir.", never "+ KDV".
- Full detail + rationale: `docs/contracts/LEGAL_POLICY_TEXT_DISCREPANCY_REPORT.md`,
  `docs/roadmap/NEVIIHUB_ADMIN_CONTRACTS_POLICY_REMAINING_WORK.md`.

## Güncel odak (2026-09-16) — Sözleşme/ilk tahsilat düzeltmeleri (`test` dalı)

- **İlk tahsilat birleştirmesi artık AÇIK SEÇİM.** Kayıt ekranında onay kutusu ("takip eden ayın
  tam ücretini de ekle"); seçim `Payment.firstCollectionIncludesNextMonth`'a yazılır, sözleşme
  planı ders sayısından TÜRETMEZ, onu okur (iki ekranın ayı farklı sayması → bir ay eksik
  sözleşme tutarı hatasının kökü). Sözleşme ekranında da değiştirilebilir.
- **Küsurat aşağı yuvarlanır** (`computePeriodAmount`): 4.950 × 3/4 = 3.712 (eskiden 3.713).
- **Bitiş kuralı:** başlangıç ayı = 1. ay; "ay sonu" ve "başlangıçtan itibaren" tercihleri, ikisinde
  de taksit sayısı süre kadar (taşan günler son taksite eklenir).
- **Önizlemede taksit tutarları düzenlenebilir** (`installmentAmountOverrides`); toplam/kalan borç
  anında aynı satırlardan hesaplanır, kaydedilen ile ekrandaki ayrışmaz.
- **İlk tahsilat sözleşme ekranından düzenlenebilir:** `PATCH /api/v1/payments/:paymentId`.
- **İptal sonrası boş önizleme düzeltildi:** ön doldurma artık URL parametresine değil kayda bağlı
  (`src/lib/contract-prefill.ts`); bkz. LESSONS_LEARNED 2026-09-16.
- **Migration:** `20260916090000_first_collection_includes_next_month` test DB'ye (`vxzewyiwfshobjizzetw`)
  Supabase SQL aracıyla uygulandı; `_prisma_migrations`'a doğru checksum'la kaydedildi. Production
  (`uqkafczrplqitzumtrqy`, INACTIVE) ve boş `nxnjzpmmbdianywfvgaq` projesine DOKUNULMADI.

### Açık iş — sözleşme revizyon sistemi (AYRI İŞ, bu turda yapılmadı)

Bugün kullanıcı hatalı sözleşmeyi "iptal et + baştan oluştur" ile düzeltiyor. Küçük kolaylıklar
eklendi (kayıt verisinden otomatik ön doldurma + "bunu temel alarak yeniden oluştur"), ama gerçek
ihtiyaç **iptal etmeden revize**: taslak/revizyon statüsü, sürüm zinciri (`versionNumber`,
`supersededBy`), taksit Payment satırlarının güvenli yeniden üretimi (tahsil edilmiş satırlar
korunarak), PDF'in yeniden dondurulması ve audit. Kapsamı büyük olduğu için bilinçli ertelendi;
yarım bir revizyon akışı para/PDF tutarlılığını bozardı.

## Güncel odak (2026-09-14) — Mobil UAT portal erişimi + davet e-postası (`release/mobile-review` → `test`)

- **Kök hata:** `GET /api/v1/mobile/session` persona'yı yalnız JWT `studentId` ile çözüyordu; veli (GUARDIAN)
  hesabında `User.studentId` bilinçli boş → veli her zaman "aktif erişim yok". Artık `resolveActivePortalAccess`
  (yalnız `active` kayıt; invited/revoked asla). Materyal dosyası + öğretmen değerlendirmesi de JWT eşleşmesi
  yerine aktif erişime bakıyor. Testler: `mobile-uat-portal-access.test.ts`.
- **Davet fallback'i:** gönderim başarısızsa yalnız admin'e "Davet linkini kopyala" (link loglanmaz).
- **Test fixture'ları:** `scripts/uat-mobile-portal-fixtures.ts` → SQL, Supabase SQL aracıyla YALNIZ
  `vxzewyiwfshobjizzetw`'e uygulandı. Runbook: `docs/mobile/MOBILE_UAT_ACCESS_RUNBOOK.md`.
- **DİKKAT:** `~/Projects/nevii-hub/.env*` `DATABASE_URL` = PRODUCTION; test DB connection string yerelde YOK
  (Vercel Preview'da sensitive, çekilemez).
- **Açık owner aksiyonu:** `info@neviihub.com`, `nevii.production@gmail.com` Gmail hesabında doğrulanmış
  "Send mail as" takma adı değil — Gmail From'u hesap adresine çeviriyor.

## Güncel odak (2026-09-13) — Mobil P0: auth/persona contract + öğretmen portalı (`feature/mobile-p0`, commit YOK)

Worktree `~/Projects/neviihub-feature-mobile-p0`, base `origin/test` @ `4c1b599`. Belgeler: `docs/mobile/MOBILE_P0_RECOVERY_MANIFEST.md`,
`MOBILE_P0_HANDOFF.md` (Muse öğrenci/veli UI sınırı), `EAS_DEVICE_TEST_READINESS.md`.
- Mobil persona artık sunucudan: yeni `GET /api/v1/mobile/session` (loginRole + portalAccessType). HYPER_ADMIN,
  BRANCH_MANAGER (unified dahil), AI_AGENT, aktif erişimsiz STUDENT → fail-closed "desteklenmiyor". Veli = STUDENT+GUARDIAN.
- Logout route gövdede `refreshToken` kabul eder (mobil sunucu oturumunu kapatabilir). MQF'ten 0 hunk; MPR'a dokunulmadı.
- **Closeout (aynı gün, tek local commit `feat(mobile): close P0 API contracts and teacher readiness`, push YOK):**
  yeni salt-okunur `GET /api/v1/makeup` + `GET /api/v1/payments/:id/receipt` (`src/lib/services/mobile-read.ts`),
  öğretmen `app/(teacher)/telafi.tsx`; absence-notices domain'i yok → mobil stale çağrı kaldırıldı; mobil `PARENT`
  rolü tamamen kaldırıldı (veli = `personaOf(user) === "parent"`); icon/adaptive/splash kanonik `src/app/icon.png`'den.
  Kararlar: `docs/mobile/MOBILE_API_ROUTE_DECISIONS.md`.
- **Açık:** 10 yönetici mobil yolu backend'de yok (post-launch, `KNOWN_MISSING`); devamsızlık bildirimi özelliği domain
  kararı bekliyor (P1); EAS: `eas init` + test HTTPS URL + Apple/Google kayıtları owner aksiyonu; veli UAT için
  test ortamında GUARDIAN test hesabı. Paylaşımlı json test store'u erişim kayıtlarını testler arası taşır — testte
  SELF/GUARDIAN sonucunu sabit varsayma, `getActiveAccessType`'tan oku.
- **Muse entegrasyon (aynı gün, `feature/mobile-student-parent-p0` — rebase üstüne `4e0451c`, push YOK):**
  guardian read-only `app/(parent)/telafiler.tsx` (`useMakeupRequests`, quick-link kilitli), homework canonical
  contract testleri (`personaOf` SELF/GUARDIAN, legacy PARENT kilidi), absence/receipt contract testleri,
  FEATURE_UNAVAILABLE helper uyarlaması; mobil vitest 26/26 dosya 204/204 test yeşil.

## Güncel odak (2026-09-12, Kapı 3) — test DB migration + hesap/rol geçişi TAMAM; push/deploy YOK

Commit'ler (local, push YOK): `cc13cac` (önceki ürün işi), `00aa976` (Control Center + rol + Hakediş).
Test Supabase `neviihub-test` (`vxzewyiwfshobjizzetw`) — production'a dokunulmadı:
- Yedek: `pg_dump` 17 ile Git dışı yerel `~/Backups/neviihub-test/2026-09-12T153001Z-before-control-center-migration/`
  (roles/schema/data + sha256 doğrulandı).
- `prisma migrate deploy`: 6 additive migration uygulandı (2026-09-12 15:33 UTC); status "up to date".
  `_prisma_migrations`'daki tek rolled-back satır (`20260802152131_add_ai_audit_log`, 2026-09-06) tarihsel kurulumdan.
- Canonical servislerle (aktör `ops_kapi3_migration`, audit'li): `super@` → SCHOOL_ADMIN + pasif; `admin@` pasif;
  ikisinde `sessionsRevokedAt` dolu, açık oturum 0. Nilüfer tek aktif SUPER_ADMIN. Ezgi personel kaydı
  `user_manager_ezgi`'ye bağlı. Nihal: personel kaydı (bağlantısız) + gönderimsiz BRANCH_MANAGER daveti
  `inv_2c758lt6qf4w` (token saklanmadı → HYPER_ADMIN `/platform` üzerinden "yeniden gönder" ile bağlantı üretmeli).
- HYPER_ADMIN bootstrap: Hıdırcan Yağız kendi terminalinde tamamladı; doğrulandı — aktif HYPER_ADMIN = 1
  (`user_hyper_admin`, `tenant_platform`; kurum tenant'ında HYPER_ADMIN yok).
- **AÇIK BLOCKER (Kapı 5 öncesi):** Nihal hesabı davet kabulüyle oluşmalı (şu an giriş yapamaz).

## Güncel odak (2026-09-12, geç) — NeviiOS Control Center bu repoya birleştirildi (Seçenek 1)

Tek kanonik codebase = bu worktree. Commit/push/deploy YOK, migration UYGULANMADI,
uzak yazım/gerçek gönderim YOK; kaynak `~/Projects/neviios-control` salt-okunur
kullanıldı (hiçbir dosyası değişmedi/silinmedi). Tam manifest (rol/route tablosu,
taşınan modüller, legacy silme listesi): `docs/architecture/NEVIIOS_CONTROL_CENTER_MERGE_MANIFEST.md`.

- **Rol sözleşmesi:** HYPER_ADMIN = platform sahibi (`/platform/*`, tek cross-tenant);
  SUPER_ADMIN = kurum sahibi (personel/finans YALNIZ bu rol); SCHOOL_ADMIN = kurum
  yöneticisi; BRANCH_MANAGER (`unified` → efektif SCHOOL_ADMIN). Tek kaynak
  `auth/platform-access.ts` (rol bazlı, userId listesi yok) + `resolveEffectiveRole`.
- **Fixture (json/memory) — NİHAİ (2. karar):** Nilüfer `user_owner_nilufer` SUPER_ADMIN
  (kurum sahibi); Ezgi SCHOOL_ADMIN; Nihal `user_manager_nihal` BRANCH_MANAGER (unified →
  efektif SCHOOL_ADMIN); eski `admin@` EMEKLİ (`RETIRED_BOOTSTRAP_USER_IDS`: giriş kapalı,
  token/refresh 401, kayıt korunur); tek HYPER_ADMIN `user_hyper_admin` (e-posta yalnız env).
  `user_super` rolü owner kararı bekliyor. DB rolleri DEĞİŞTİRİLMEDİ — operasyon planı manifest §7.
- **Taşındı:** 163 CC dosyası (platform lib/ekran/API, session registry/validity,
  config snapshot, /sube, release/paket/log saklama) + 3-yollu birleşim (auth çekirdeği,
  middleware, handler, tools/actions, nav, layout; 12 çakışma elle). Route
  manifesti: 359 URL, duplicate sahip yok.
- **Migration (dosya, UYGULANMADI):** `20260913140000_neviios_control_center` —
  idempotent additive; `PasswordResetToken.createdBy` NULLABLE. **db modunda kod
  migration'dan önce deploy edilmemeli** (User.deletedAt vb. sorgulanıyor).
- **Doğrulama:** typecheck ✓ · lint 0 hata (27 `_input` uyarısı) · hedefli 15 dosya
  253/253 ✓ · prisma validate/generate ✓ · `next build` ✓ · `git diff --check` ✓ ·
  tam süit (4. karar sonrası) 3182/3185 — 1 test (izin bildirimi, tek aktif sahip) sonra düzeltildi ve
  izole doğrulandı; kalan 2 hata turdan önce de vardı — kalan 2 hata turdan önce de vardı (lesson-series
  "skipConflicts" tarih bağımlı; sidebar-branding logo byte testi = çalışma
  ağacındaki logo değişikliği). Rol sözleşmesine göre güncellenen testler:
  staff-onboarding, notification-preferences, store-mode-parity, platform-access,
  manager-staff-profiles, academic-term-dates, owner-manager-role-hierarchy, write-scope-actions.
- **4. karar (user_super emekli):** `user_super`/`super@notaplan.app` EMEKLİ (`RETIRED_BOOTSTRAP_USER_IDS`,
  rol SCHOOL_ADMIN, giriş kapalı, eski token/refresh 401). Nilüfer Acar tenant'ının TEK aktif SUPER_ADMIN'i
  Nilüfer. Tek HYPER_ADMIN `user_hyper_admin` (Hıdırcan Yağız; gerçek e-posta yalnız `AUTH_HYPER_ADMIN_EMAIL`).
  Tarayıcı UAT (yerel, izole `/tmp` store) PASS — ayrıntı manifest §9.
- **AÇIK TEKNİK BORÇ / ÜRÜN KARARI:** `branch_scoped` BRANCH_MANAGER için Hakediş KAPALI. Açmak için önce
  sunucu tarafında şube kapsamlı hakediş filtreleme (öğretmen/ders → şube eşleşmesi, `resolveBranchScope`)
  ve `/sube` altında ayrı yüzey gerekir; bu olmadan başka şube verisi sızar.
- **Hakediş politikası (3. karar):** `access.teacherEarningsAccess` (sürümlü/audit'li); Nilüfer Acar =
  SUPER_ADMIN + SCHOOL_ADMIN + BRANCH_MANAGER(unified); diğer kurumlar varsayılan `school_admin`
  (davranış değişmedi); branch_scoped BM ve HYPER_ADMIN red. Genel finans/personel yalnız SUPER_ADMIN.
  Ayrıntı: manifest §8. Yanlışlıkla kopyalanan 5 kaynak migration klasörü kaldırıldı.
- **Sonraki güvenli adım:** owner review → test DB'de rol verisi (HYPER_ADMIN
  bootstrap, admin@ SUPER_ADMIN) + migration → sonra kod. Kaynak legacy `/panel`
  temizliği ayrı tur (54 dosya listesi manifestte; 7 kullanıcı-diff'li dosya korunur).

## Önceki odak (2026-09-12) — P1 outbox aksiyonları + inbound listesi + Ezgi/Nihal personel bağı

Branch: `fix/admin-payment-attendance-sync-p0` (commit/push/deploy YOK,
migration UYGULANMADI, gerçek e-posta/SMS/WhatsApp YOK).
Dokunulmadı: HYPER_ADMIN/rol matrisi, JWT/portal rolleri, `.env.example`,
`src/lib/site-content.ts` (kullanıcı yasağı).

1. **Nihal revert (üst karar değişikliği).** Önceki turdaki
   `user_manager_nihal` SCHOOL_ADMIN bootstrap'ı KALDIRILDI
   (`src/lib/auth/users.ts`, `platform-access.ts` +
   `INSTITUTION_MANAGER_NIHAL_USER_ID` sabiti silindi). Nihal'in login
   kimliği merkezi auth'ta BRANCH_MANAGER'dır; NeviiHub'da duplicate
   kullanıcı/rol dönüşümü YOK. `platform-access` testi yeni karara göre
   çevrildi (negatif assertion: bootstrap yok + giriş yapılamaz).
2. **Ezgi/Nihal personel kayıtları.** `ensureManagerStaffProfiles`
   (`src/lib/staff.ts`): e-posta üzerinden bulur/oluşturur, VARSA portal
   kullanıcısına bağlar (Ezgi → `user_manager_ezgi`; Nihal → bağlantısız,
   kullanıcı ASLA oluşturulmaz). İdempotent (2. koşu duplicate üretmez),
   tenant-scoped. Yeni test `manager-staff-profiles` 5/5 ✓.
3. **Outbox UI/API.** 5 yeni route (`[id]/enqueue|dispatch|retry|cancel|
   approve-and-enqueue`, approve deseniyle aynı); kuyruk UI'da duruma göre
   butonlar (Onayla ve kuyruğa al / Kuyruğa al / Gönderimi dene / Yeniden
   kuyruğa al / İptal et) + dispatch sonuç şeridi; `queued/sending/
   cancelled` etiket+sekme; EMAIL kanal desteği. Yeni test
   `communication-outbox-actions` 8/8 ✓.
4. **Gelen WhatsApp (daraltılmış).** `listTenantConversations` (admin-only)
   + `listWhatsAppInboundTool` (tenant-scoped, telefon maskeli, son gelen
   mesajdan 120 karakter, en yeni 50, salt-okunur) + İletişim Merkezi'nde
   "Gelen WhatsApp konuşmaları" bölümü. Yanıt/operasyon YOK.
5. **Testlerin yakaladığı gerçek bug'lar (düzeltildi).** `service.ts`'teki
   `require("../email/config")` ESM'de patlıyordu → statik import;
   `e164.value` (olmayan alan) → `e164.e164` (2 yer, dispatch adresi
   `undefined` dönüyordu); `utils.ts` statusLabel'da çift `cancelled`
   anahtarı (P1 artığı) → tekilleştirildi.
6. **Doğrulama.** typecheck ✓ · lint 0 error (25 pre-existing `_input`
   warning) · `prisma validate` ✓ · `git diff --check` temiz · hedefli
   250+35+28+49+111 test ✓. Tam süit: 3020 geçti / 4 kaldı — sidebar-
   branding byte testi (çalışma ağacındaki logo değişikliği, pre-existing),
   seed-demo-schedule ×2 (sandbox `tsx` EPERM, ortamsal), lesson-series-
   tools "skipConflicts" ×1 (değişiklikler `git stash` ile kenara alınıp
   bazda koşuldu, aynı şekilde fails → pre-existing, bu işle ilgisiz).
   **Build BLOKE (ortamsal):** Turbopack child-IPC port
   binding sandbox'ta `EPERM`; `--no-turbopack` Next 16'da yok, escalated
   çalıştırma bu profilde kapalı. Kod derlemesi typecheck ile doğrulandı.

### Hâlâ owner kararı (bu turdan)
- Nihal personel kaydı `portalUserId`'siz duruyor (merkezi BRANCH_MANAGER
  kimliği NeviiHub'da bulunamaz) — bilinçli sınır; bağlama istenirse
  merkezi auth eşleşmesi owner ile netleştirilmeli.
- Build'in sandbox-dışı bir ortamda (`npm run build`) doğrulanması gerekli.

## Önceki odak (2026-09-11, geç tur) — Nihal Gedikli hesabı + kullanıcı e-posta değiştirme akışı

Branch: `fix/admin-payment-attendance-sync-p0` (commit/push/deploy YOK,
migration UYGULANMADI — yalnızca 1 migration DOSYASI eklendi:
`prisma/migrations/20260911140000_email_change_tokens/migration.sql`).
`.env.example` (9/9) ve `src/lib/site-content.ts` (1/1) diff'lerine
DOKUNULMADI. Önceki P0/P1 paketinin tam suite sonucu: 2990 geçti / 5 kaldı
(lesson ×2 + seed ×2 pre-existing/ortamsal + platform-access Nihal testi —
sonuncusu bu turda YENİ karara göre güncellendi).

1. **Nihal Gedikli hesabı (kullanıcı isteği).** `users.ts` bootstrap:
   `user_manager_nihal` / `nihal.gedikli@niluferacar.com.tr` / SCHOOL_ADMIN /
   aynı tenant; şifre `AUTH_NIHAL_PASSWORD` veya `demo-manager-nihal`. Ezgi
   ile AYNI yetki seti: `isInstitutionManager` Nihal'i de kapsar
   (`INSTITUTION_MANAGER_NIHAL_USER_ID`) → finans/personel özeti YOK.
   Eski "Nihal bootstrap'ta yoktur" testi yeni karara göre çevrildi.
2. **E-posta değiştirme (tüm roller, kendi hesabı).** `auth/email-change.ts`:
   istekte mevcut şifre + YENİ adrese 24s tek-kullanımlık doğrulama bağlantısı
   (`/hesap-eposta-dogrula`) + ESKİ adrese güvenlik bildirimi; onayda yarış
   kontrolü + audit. Token deposu: dosya + `EmailChangeToken` modeli
   (migration uygulanmadı). `updateUserEmail`: db gerçek yazma; json/dynamic
   kalıcı; bootstrap `emailOverrides` (süreç-ömürlü).
3. **UI:** panel `/panel/hesabim` + yeni `/ogretmen/hesabim` +
   `/ogrenci/hesabim` (aynı `AccountEmailChangeForm`).
4. **Doğrulama.** typecheck ✓ · lint 0 error · `account-email-change`
   9/9 + `platform-access` dahil ilgili 64/64 ✓ · `prisma validate` ✓ ·
   `git diff --check` temiz. Gerçek e-posta/SMS gönderilmedi.

### Hâlâ owner kararı (bu turdan)
- `AUTH_NIHAL_PASSWORD` prod secret'ı tanımlanmalı (yoksa demo şifre geçerli).
- E-posta değişikliği öğretmen `Teacher.email`/veli kayıt e-postasına
  DOKUNMAZ (giriş kimliği ayrıdır — bilinçli sınır).
- Bootstrap `emailOverrides` süreç-ömürlüdür (json/memory); kalıcı prod
  davranışı db modundadır.

## Güncel odak (2026-09-11) — P0 login dönüş + hero marka + detaylı personel onboarding

Branch: `fix/admin-payment-attendance-sync-p0` (main'e MERGE EDİLMEDİ,
production'a deploy EDİLMEDİ, hiçbir Supabase'e yazılmadı, migration
UYGULANMADI — yalnızca 1 migration DOSYASI eklendi:
`prisma/migrations/20260911120000_staff_portal_profile/migration.sql`).
Commit/push YOK. Önceki turun unstaged kirli dosyalarına (öz. `.env.example`,
`src/lib/site-content.ts`) DOKUNULMADI (diff'leri tur başıyla aynı: 9/9, 1/1).

1. **P0-1 Login → ana sayfa dönüş.** `src/app/login/page.tsx`: formun
   DIŞINDA ghost `← Ana sayfaya dön` Link (`href="/"`). Yalnız login
   sayfasında (ortak auth layout yok; şifre sıfırlama/aktivasyona yayılmaz).
2. **P0-2 Hero marka satırı.** `src/components/site/sections.tsx`
   `HeroSection`: başlığın üstünde logo (`BRAND.logoPath`) + `BRAND.shortName`
   (`NeviiHub`), `normal-case`, şeffaf PNG dostu (beyaz kutu/rounded YOK),
   responsive. `site-content.ts`'e DOKUNULMADI.
3. **P1 platform logo — OWNER KARARIYLA BU REPODA YAPILMADI.**
   Global NeviiHub/NeviiOS logo ayarı NeviiOS Control Center projesinde
   yapılacak. Bu repoda yeni global logo ayarı/storage/migration OLUŞTURULMADI;
   mevcut `BRAND`/logo kullanımı aynen bırakıldı (ara oluşturulan
   `src/lib/platform-brand.ts` AYNI TURDA silindi).
4. **P0-4/8 Personel onboarding.** Yeni nullable/additive alanlar:
   `city`, `district`, `emergencyContactRelationship`, `portalUserId`,
   `portalInvitedAt` (`types.ts` + `staff.ts` json/db parite + `validation.ts` +
   schema + migration dosyası, UYGULANMADI). Ad/Soyad formda ayrı, kanonik
   `name`'e birleşir (kolon yok). Kayıt formu A–E gruplu (`staff-manager.tsx`);
   detay/düzenleme yeni alanları korur. Portal rolü TEK seçenek
   `SCHOOL_ADMIN`; `SUPER_ADMIN`/`TEACHER`/`STUDENT`/`AI_AGENT` server-side
   reddedilir (kayıt korunur, uyarı döner). Davet mevcut
   `sendAccountInvitationEmail` altyapısıyla (SCHOOL_ADMIN metni eklendi);
   local'de SMTP yoksa console transport BLOKE döner (sahte başarı yok).
   Duplicate e-posta → yeni hesap AÇILMAZ (güvenliyse bağlanır, değilse
   dostça uyarı). Detayda `StaffPortalAccessCard`: erişim/rol/davet durumu,
   son davet, yeniden gönderme, aç/kapat, şifre sıfırlama.
5. **Doğrulama.** typecheck ✓ · lint 0 error (24 pre-existing + 0 yeni
   warning) · yeni `staff-onboarding.test.ts` 17/17 ✓ · ilgili paket
   (staff-module, staff-extended, brand-spelling, account-invitation) 64/64 ✓
   · `prisma validate` ✓ (`generate` yalnız local codegen) · `git diff --check`
   temiz · `npm run build` ORTAMSAL engelde takıldı (Google Fonts fetch —
   ağ yok; koddan bağımsız, bkz. "Hâlâ owner kararı"). Tam paket sonucu için
   bkz. aşağıdaki not.

### Hâlâ owner kararı (2026-09-11 turundan eklenenler)
- `20260911120000_staff_portal_profile` migration'ının gerçek DB'lere
  uygulanması (dosya hazır, uygulanmadı; rollback: 5× DROP COLUMN).
- Tam test paketi (2. koşu): 2952 geçti / 4 kaldı (3 dosya:
  lesson-move-resize-flow, lesson-series-tools, seed-demo-schedule).
  Kanıt: lesson ×2 stash'lenmiş BAZDA da aynı şekilde kaldı (pre-existing,
  bu turun regresyonu DEĞİL); seed ×2 `tsx` IPC pipe `EPERM` (sandbox ağ
  kısıtı — ortamsal). Personel/marka/davet dosyaları YEŞİL. (1. koşuda
  14 dosya/18 hata çıkmıştı — koşular arası dalgalanma, paket flake;
  dokunulan alanlar her koşuda yeşil.)
- `npm run build` bu ortamda Google Fonts'a erişemiyor (font fetch; önceden
  de vardı — build UAT'si ağ olan ortamda yapılmalı).
- Yeni `inviteStaffAccountTool`/`getStaffAccountStatusTool` AI tool registry
  (`services/index.ts`)'ye exposed EDİLMEDİ (bilinçli — web aksiyonları
  yeterli; AI'ya açmak ürün kararı ister).
- (Takip, aynı tur) Personel ekleme ayrı sayfaya taşındı: liste başlığında
  `+ Yeni personel ekle` butonu → `/panel/personel/yeni` (aynı yetki sınırı;
  `StaffCreateForm` bileşeni, başarıda detay/liste linkleri). `StaffManager`
  artık yalnız liste/düzenleme. İlgili paket 87/87 ✓ (6 dosya).

## Önceki odak (2026-09-10) — P0 sözleşme/tahsilat doğruluğu + P1 yoklama/kaynak/font/marka revizyonu

Branch: `fix/admin-payment-attendance-sync-p0` (main'e MERGE EDİLMEDİ,
production'a deploy EDİLMEDİ, hiçbir Supabase'e yazılmadı, migration
UYGULANMADI — yalnızca 1 migration DOSYASI eklendi). Commit/push YOK.

1. **P0-1 Ödeme Türü sütunu.** Sözleşme MADDE 4 tablosu + yönetici dökümü
   ödeme planı tablosunda `Ödeme Türü` sütunu (`taksitNYontem` placeholder'ları
   şemaya eklendi, hukuki cümleler DEĞİŞMEDİ). 1. satır GERÇEK ilk tahsilatın
   yöntemi (kayıt anı ödemesi reuse / renewal formu), ödenmemiş satırlar `—`
   (bekleyen kaydın taşıdığı planlanan yöntem BİLE gösterilmez — uydurma yok).
   Tek kaynak: yeni `src/lib/contract-payment-plan-view.ts`
   (durum-kapılı etiket + tahsil eden adı + öğretmen eşleşmesi).
2. **P0-2 İlk tahsilat tarihi.** Önizlemedeki "İlk Tahsilat Tarihi" artık plan/
   vade tarihi DEĞİL: ilk kayıtta kayıt anı ödemesinin `paidAt`i (yoksa
   "Henüz tahsil edilmedi" — ders başlangıcı asla yazılmaz), yenilemede formun
   tahsilat tarihi girdisi. Yenileme varsayılanı ders başlangıcı → BUGÜN
   (tahsilat bu formla AN yapılır). Vade (`taksit1Tarih`) ayrı kavram,
   değişmedi. Tarih formatı `formatDateTr` ile aynı.
3. **P0-3 Kısmi tahsilat notu.** DENETİM: form alanı `firstPaymentNote` +
   `firstPaymentAdjustmentReason` → `actionAddStudent` → `createStudentTool`
   → `Payment.paymentNote` + `paymentNote`/`autoSuggestedAmount`/
   `adjustmentReason`/`adjustedBy`/`adjustedAt` (3 store + Prisma'da ZATEN
   vardı). EKSİK OLAN GÖRÜNÜMDÜ: ödeme detayına planlanan/önerilen tutar +
   fark + kısmi gerekçe eklendi (modal + geçmiş tablosu); "Ref:" etiketi
   "Not:" oldu + ayrı "Kısmi tahsilat gerekçesi" satırı. Yeni migration YOK.
4. **P0-4 Tahsil eden adı.** `receivedByUserId` korunur (audit); görüntüleme
   öğretmen adından çözülür (`teacherId` bağı → e-posta eşleşmesi), yoksa
   e-posta TAHMİNİ fallback (e-posta aynen yazılmaz), pasifte
   "Pasif/silinmiş kullanıcı". Kapsam: Ödemeler profili + döküm + takvim
   özeti (`formatPaymentCollectionSummary` aynı metni kullanır).
5. **P1-5 Yoklama sadeleştirme.** Ay kutusundan `Sözleşme planı: NP-…` satırı
   + `(bilgi)` ders sayacı KALDIRILDI (yalnız görsel metin; tutar/ödenen/
   kalan/durum + tahsilat aksiyonları durur, veri/hesap değişmedi).
6. **P1-6 "Bizi nereden buldunuz?"** Kayıt formunda opsiyonel seçim + Diğer'de
   serbest metin; `Student.referralSource/referralSourceDetail` ile kalıcı
   (tip + validation + create/update tool + 3 store okuma/yazma + detay
   görünümü + düzenleme ekranı). 6 kanonik değer `REFERRAL_SOURCES`.
7. **P1-7 Gloock.** Kök neden: `layout.tsx` fontu YÜKLÜYORDU ama `theme.ts`
   `FontChoice`/`FONT_VALUES`/`normalizeFontChoice` "gloock"u tanımıyordu →
   cookie düşüyor, seçenek görünmüyordu. `gloock` eklendi (tip+liste+etiket),
   `globals.css` `[data-font="gloock"]` bloğu + önizleme stili eklendi.
   Inter/Noto/Playfair/Roboto bozulmadı.
8. **P1-8 Sözleşme Times.** Kök neden: `globals.css` `body * !important` +
   `h1,h2,h3 !important` kullanıcı fontunu sözleşmeye dayatıyordu.
   `CONTRACT_PRINT_CSS`'e `.contract-print-surface .contract-body(*)`
   `!important` Times sabitlemesi (ekran+baskı; yalnız sözleşme kapsamı).
9. **P1-9 Marka `NeviiHub`.** Sidebar/login/şifre-sıfırla/hesap-aktivasyon/ana
   sayfa marka öğelerindeki `uppercase` kaldırıldı (tr'de "NEVİİHUB"
   üretiyordu). Görünür "Nevii Hub" (boşluklu) yazımları düzeltildi
   (yardım, asistan `BRAND.assistantName`, e-posta fromName, WhatsApp,
   kurum fallback'leri, AI sistem promptları). Route slug/cookie/env/teknik
   adlar DEĞİŞMEDİ. `NEVİİHUB` literali kaynak kodda YOK (test kilitli).

Doğrulama: typecheck ✓ · lint 0 hata (yalnız pre-existing warning'ler) ✓ ·
**2936/2939 test** ✓ (3 hata tur-öncesi/çevresel: `seed-demo-schedule` x2 —
sandbox'ta `tsx` IPC pipe EPERM; `lesson-series-tools` x1 — pristine bazda da
kırık, stash ile doğrulandı) · prisma validate ✓ · `git diff --check` ✓ ·
production build BAŞLATILDI ama çevresel hata: `next/font/google` Google
Fonts'a erişemiyor (offline sandbox/proxy — hata tur-öncesi fontlarda da:
Playfair Display/Roboto Serif; bu turun değişikliğiyle ilgili DEĞİL).
Chromium/manual local test yapılmadı (tarayıcı aracı yok) — adımlar aşağıda.

`.env.example` ve `src/lib/site-content.ts` kirli bırakıldı — bu işe ait
değil, dokunulmadı (diff'leri tur öncesiyle aynı).

### Migration durumu (UYGLANMADI)
- YENİ: `prisma/migrations/20260910120000_student_referral_source/migration.sql`
  (`Student.referralSource TEXT`, `Student.referralSourceDetail TEXT`,
  IF NOT EXISTS, additive). Neden: P1-6 kalıcı alan DB kolonları gerektirir.
  Etki: yalnız yeni kolonlar (nullable); mevcut satırlar/backfill yok.
  Rollback: iki `DROP COLUMN` (uygulama kolonsuz DB'de undefined okur).
  Neden uygulanmadı: tura özel yasak (dış işlem/DB yazma yok) + local test
  json/memory modda koşuyor. `prisma/schema.prisma` güncellendi +
  `prisma generate` çalıştırıldı (yalnız local codegen) + `prisma validate` ✓.
- P0-3 için migration GEREKMEDİ: `paymentNote`/`autoSuggestedAmount`/
  `adjustmentReason` kolonları ZATEN mevcuttu (yalnız görünüm eklendi).

### Hâlâ owner kararı
UserBranchAccess/NeviiOS migration · Nihal için gerçek e-posta ile davet
· cutover'ın uygulanması · Chromium UAT · referral migration'ının gerçek
DB'lere uygulanması · yenilemede tahsilat-tarihi/gerekçe varsayılanı
(terminden farklı günde yenilemede gerekçe istenir — bilinçli politika,
bkz. rapor) · ay kutusundaki ders sayacı bilgisinin tamamen kaldırılması
(sadeleştirme kararı).

## Önceki odak (2026-09-09, devam) — sözleşme/tahsilat senkronu + dönem + döküm + yetki + tema

Branch: `fix/admin-payment-attendance-sync-p0` (main'e MERGE EDİLMEDİ,
production'a deploy EDİLMEDİ, hiçbir Supabase'e yazılmadı, migration
uygulanmadı). Claude'un `9ba8204` commit'i korundu.

1. **Faz 1 (tamamlandı).** Takvim planı sözleşme taksitinden okunuyor
   (`resolveContractPlanForMonth`). Tahsilat plan satırına yazılır;
   kısmi + kalan **eklenir** (2000+3950=5950). `monthly_plan` yalnız
   sözleşmesiz/legacy fallback. Migration yok.
2. **Faz 2.** Kurulum Merkezi Güz/Yaz tarihleri; çakışma/boş tarih
   sessiz varsayılana düşmez. Eylül geçişi kurum ayarına bağlı. DB
   sütunu yok — mevcut `termWeeklyClosedDays` Json'una additive.
3. **Faz 3.** `/ogrenci-dokum/[studentId]` yönetici dökümü (ödeme planı +
   yoklama statü metni). Veli portalına ekran açılmadı.
4. **Faz 4.** Nilüfer Acar `SCHOOL_ADMIN` (SUPER_ADMIN değil). Ezgi
   finans/personel özeti göremez. Nihal hesabı oluşturulmadı
   (`docs/operations/SCHOOL_ADMIN_INVITE_ACTIVATION.md`).
5. **Faz 5.** Marka `NeviiHub`, Gloock başlık + Inter gövde, belirgin
   kareli doku. Ham TTF yok.
6. **Faz 6.** Cutover runbook 10 kararla güncellendi; uygulanmadı.

Doğrulama: typecheck ✓ · lint 0 hata ✓ · **2889/2889 test** ✓ · prisma
validate ✓ · production build ✓. Chromium bu turda koşturulamadı
(tarayıcı aracı yok).

`.env.example` ve `src/lib/site-content.ts` kirli bırakıldı — bu işe ait değil.

### Hâlâ owner kararı
UserBranchAccess/NeviiOS migration · Nihal için gerçek e-posta ile davet
· cutover'ın uygulanması · Chromium UAT.

## Önceki odak (2026-09-09) — P0-1 / P0-2 + tahsilat audit

Branch: `fix/admin-payment-attendance-sync-p0` (main'e MERGE EDİLMEDİ,
production'a deploy EDİLMEDİ, hiçbir Supabase'e yazılmadı).

1. **P0-1 — 5.950 → 5.952 ÇİFT YUVARLAMA düzeltildi.** Dönem tutarı artık
   ders başı (yuvarlanmış) tutardan değil, onaylı AYLIK ÜCRETTEN tek
   yuvarlamayla oranlanır (`computePeriodAmount`, period-lesson-billing.ts).
   Aynı formülün BEŞ kopyası tek fonksiyona bağlandı. Motorun girdisi artık
   `perLessonNetFee` DEĞİL `monthlyFee` + `weeklyLessonCount` — yuvarlanmış
   snapshot geçirmek tip düzeyinde imkânsız. Yeni `money-invariants.test.ts`
   (28 test) "tam dönem = onaylı aylık ücret" değişmezini kilitler.
   Gerçek Chromium: Kasım/Aralık 2026 = **₺5.950** (eskiden ₺5.952).
2. **P0-2 — işaretlenen yoklama statüsü artık yenilemeden sonra KALIYOR.**
   Kök neden yazma değil OKUMAydı: `resolveLessonFinalStatus` gelecekteki her
   ders için, bayraklara bakmadan ÖNCE koşulsuz "planned" dönüyordu.
   `resolveLessonMarkedStatus` ile birleştirildi (tek kanonik kaynak, §B.4);
   Ders Programı / Yoklama Takvimi / Telafi / Yoklama Raporu artık ayrışamaz.
   Gerçek Chromium: 17 Eylül yeşil (Geldi), 24 Eylül sarı (Telafi), 1 Ekim
   kırmızı (İşlendi) — hard reload sonrası korunuyor; Yoklama Raporu aynı.
3. **Tahsilat notu + tahsilatı alan (§C).** `paymentNote`/`receivedByUserId`
   ZATEN vardı (tip + JSON store + Prisma); eksik olan arayüzdü. Takvimin iki
   tahsilat yoluna da not alanı eklendi; ödeme detayında görünüyor. Kullanıcı
   pasife alınırsa artık "Kayıtlı değil" değil "Pasif/silinmiş kullanıcı"
   yazar (audit izi kaybolmuyor). Yeni migration/model EKLENMEDİ.
4. `docs/operations/TEST_TO_PRODUCTION_DATA_CUTOVER.md` — plan yazıldı,
   hiçbir adımı uygulanmadı.

Doğrulama: typecheck ✓ · lint 0 hata ✓ · **2833/2833 test** ✓ · prisma
validate ✓ · production build ✓. (Turun başında kırık olan
`attendance-calendar-multi-lesson.test.ts` de düzeltildi — kök neden üründe
değil, testin yerel/UTC hafta günü karışımındaydı.)

### Bu turda KAPSAM DIŞI bırakılanlar (owner kararı bekliyor)
Kurulum Merkezi dönem (Güz/Yaz) tarih ayarları · veli/öğrenci yazdırılabilir
döküm · Nilüfer Acar/Ezgi/Nihal RBAC modeli · Kurumsal Altın tema + Gloock
font · UserBranchAccess/NeviiOS migration · Supabase Auth/social login.

**Not (§E ile çelişki):** demo seed'de `nilufer.acar` rolü `SUPER_ADMIN` ve
panelde "Tüm kurumlar" seçicisi görünüyor. Brief §E.1/E.2 yalnız Hıdırcan
Yağız'ın kurumlar arası erişimi olmasını istiyor. Tek kurum olduğu için
gerçek bir cross-tenant sızıntı gözlenmedi, ama rol ataması brief ile
çelişiyor — RBAC turunda ele alınmalı.

## Önceki odak (2026-09-05, geç oturum)

Yedi kalemlik ürün güncellemesi paketi — hepsi `localhost:3000`e karşı
GERÇEK Chromium'da doğrulandı (yalnız birim testi değil):

1. **Ders statü renkleri TERS ÇEVRİLDİ (owner talimatı)**: İşlendi=KIRMIZI,
   Telafi=SARI, Geldi=yeşil. Tek kaynak `ATTENDANCE_CALENDAR_COLORS`
   (`attendance-calendar.ts`); Tailwind tarafı `lesson-status-badge.tsx`,
   `lesson-ops-actions.tsx`, `program-studio.tsx` (tam kart dolgusu),
   `utils.ts statusColor`. **2026-09-02 P0-2E kararının bilinçli tersi** —
   yeniden "düzeltmeye" çalışmayın.
2. **TEK BİRLEŞİK SÖZLEŞME ÇIKTISI**: ana sözleşme → KVKK → fotoğraf/video,
   tek sayfada, aralarında sayfa sonu, her ek kendi başlığı/referansıyla
   (`<sözleşmeNo>-EK1/EK2`). Yeni modül `src/lib/contract-annexes.ts`;
   ekler sözleşme oluşturulurken `ContractDataSnapshot.annexes`e DONDURULUR,
   eski sözleşmeler için okuma anında aktif şablondan üretilir.
3. **Davet/şifre sonrası yönlendirme**: rol GÜVENİLİR sunucu verisinden
   (`getUserById`), oturum KORUNUR (`issueTokenPair`+`applyAuthCookies`),
   mobil derin bağlantı yalnız `MOBILE_APP_SCHEME` tanımlıysa üretilir.
   Bkz. `src/lib/auth/post-password-routing.ts`.
4. **Sözleşme adımından kayda dönüş**: Sözleşme Merkezi'nde
   "← Öğrenci Kaydını Düzenle"; öğrenci detayında "Sözleşme adımına dön"
   bandı + bölüm doğrudan düzenleme modunda açılır (`SectionEditCard`
   `defaultEditing`).
5. **`Student.lessonStartDate`** (yeni alan + Prisma migration
   `20260905120000_student_lesson_start_date`): kayıt tarihinden BAĞIMSIZ.
   İlk tahsilat artık `resolveLessonStartDay` üzerinden DERS BAŞLANGICINDAN
   sayar (canlı doğrulandı: 05.09 kayıt → 7 ders/₺3.500; 20.09 ders
   başlangıcı → 3 ders/₺1.500).
6. **Logo**: kök neden CSP (`img-src 'self' data: blob:`) — harici
   `https://` logo SESSİZCE engelleniyordu. `importSchoolLogoFromCurrentUrlTool`
   logoyu bir kez indirip `data:` URI olarak saklar (Kurulum'da düğme).
   Render artık sabit kutu değil TAVAN (`max-height:96px`, `height:auto`).
   Bu indirme SSRF yüzeyidir (yanıt saklanıp gösteriliyor) — tüm dış istekler
   `src/lib/net/safe-outbound-fetch.ts` üzerinden gider (https-only, DNS
   blok listesi, elle doğrulanan yönlendirme zinciri, gövde boyut sınırı).
7. **Giriş öncesi kurumsal site**: `src/lib/site-content.ts` (içerik) +
   `src/components/site/sections.tsx` (bölümler) + `src/app/page.tsx`
   (yalnız sıralar). Referans/fiyat/medya/iletişim UYDURMA VERİ İÇERMEZ.

Yol boyunca bulunan ve düzeltilen GERÇEK hata: `/ogrenci → /login → /ogrenci`
SONSUZ YÖNLENDİRME DÖNGÜSÜ (bkz. LESSONS_LEARNED 2026-09-05 girdisi).

Bilinen, bu turda DEĞİŞTİRİLMEYEN ve bu paketle İLGİSİZ tek test hatası:
`src/lib/__tests__/lesson-series-tools.test.ts > createLessonSeriesTool >
"skipConflicts=true ile yalnızca çakışmayanlar oluşur"` — `git stash` ile
kod değişiklikleri geri alınarak AYNI şekilde başarısız olduğu KANITLANDI
(tarihe bağlı seed/çakışma varsayımı). 2557/2558 test geçiyor.

Kurumun `kvkk` ve `parent_social_media_consent` AKTİF şablonları hâlâ eski
tek satırlık "stub" metinler — birleşik çıktı çalışıyor ama o iki bölüm
hukuken zayıf. Sözleşme Merkezi artık bunu AÇIKÇA uyarıyor ve tek tıkla
kurumsal kaynaktan TASLAK oluşturuyor; taslağı Evraklar → Şablon Yönetimi'nden
ETKİNLEŞTİRMEK kalan iş.

## Release-blocker sprint (2026-09-05, gece) — canlıya alım öncesi son tur

Owner'ın "release blocker" sprintinde yukarıdaki 7 kalemlik paket + migration
+ SSRF + auth yönlendirmesi tek tek KOD/VERİ üzerinden yeniden doğrulandı
(hafızaya değil koda güvenilerek). Sonuç: **2 P0 hâlâ BLOKLU**, gerisi PASS.
Tam kanıt/detay owner'a verilen "Canlıya Alım Hazırlık Raporu"nda — özet:

- KVKK/foto-video: yukarıdaki not DOĞRULANDI (kvkk 83 char, foto/video 164
  char, ikisi de `contract-annexes.ts`'nin 400-char stub eşiğini geçemiyor).
  Gerçek kaynak metin `2026-2027-ogrenci-kayit-sozlesmesi-v1.md`'de var ve
  `createContractTemplateDraftFromCanonicalSource` zaten TASLAK üretebiliyor
  — kalan tek iş insan onayı + aktivasyon, kod değişikliği DEĞİL.
- **YENİ DÜZELTME**: eski sözleşmelerin dondurulmuş harici (`https://`) logo
  URL'si CSP tarafından sessizce engelleniyordu, hiçbir fallback yoktu —
  `getContractHtmlTool` (tools.ts) artık bu durumda kurumun GÜNCEL `data:`
  logosuna (varsa) veya kurum adı metnine düşüyor, dondurulmuş veri
  DEĞİŞMİYOR. Bkz. LESSONS_LEARNED.md 2026-09-05 girdisi.
- `lessonStartDate` migration'ı gerçek LOKAL Postgres'e (`notaplan` db,
  localhost:5432, 78 öğrenci) `prisma migrate deploy` ile UYGULANDI — veri
  kaybı yok, `migrate status` temiz. `.env.local`'deki `DATABASE_URL` aslında
  UZAK bir Supabase pooler'ı (pgbouncer, 6543) — `migrate status/deploy` bu
  URL'de SESSİZCE ASILI KALIYOR (Prisma/PgBouncer bilinen uyumsuzluğu), bkz.
  LESSONS_LEARNED.md. Production'a uygulama HÂLÂ owner onayı bekliyor.
- SSRF (`safe-outbound-fetch.ts`) ve auth/mobil yönlendirme (`post-password-routing.ts`)
  bağımsız olarak yeniden doğrulandı, ikisi de PASS. Native mobil deep-link
  hâlâ config bekliyor (`MOBILE_APP_SCHEME` vb. tanımlı değil) — bu DÜRÜSTÇE
  "hazır değil" olarak raporlandı, sahte route YOK.
- Tam test suite: 2564/2565 geçti — tek hata bilinen/ilgisiz
  `lesson-series-tools.test.ts` kaydı (aşağıda zaten belgeli).

## Current focus (last updated: 2026-09-08, P0: optimistic statü + şifre sıfırlama + marka + tasarımlar)

1. **Statü renginin ~10 sn gecikmesi — ÇÖZÜLDÜ.** Kök neden: kart dolgusu
   `lessonCardStatusVisual(lesson)` ile SUNUCU prop'undan çiziliyordu;
   `LessonOpsActions` kendi içinde iyimserdi ama Ders Programı'na geri çağrı
   vermiyordu, dolayısıyla renk `router.refresh()` (server action +
   revalidation + tam-tenant okuma) turunu bekliyordu. Yeni
   `src/lib/lesson-ops-override.ts` (saf) + `onStatusChange`/`onPendingChange`
   bağlantısı. **Kanıt:** `/ops` yanıtı 3 sn geciktirildiğinde renk **84 ms'de,
   0 tamamlanmış sunucu yanıtıyla** değişti; `aria-busy` anında true.
2. **"Şifremi unuttum" — UI eklendi.** AUDIT: backend ZATEN tamdı ve
   güvenliydi (nötr anti-enumeration, e-posta 5/15dk + IP 20/15dk limit,
   sha256 hash'li tek kullanımlık 30 dk token, audit log). Eksik olan tek şey
   kullanıcının kodu isteyebileceği adımdı — `/api/v1/auth/forgot-password`
   UI'dan HİÇ çağrılmıyordu. Login'e bağlantı + sıfırlama sayfasına talep
   adımı eklendi. Yeni token/mail altyapısı KURULMADI.
   Tasarım/audit: `docs/security/PASSWORD_RESET_DESIGN.md`.
3. **Sidebar markası.** "NH" monogramı kaldırıldı; `BRAND.logoMarkPath`
   (= `/brand/logo.png`, `src/app/icon.png` ile **byte-identical**, sha256
   doğrulandı) + "Nevii Hub" metni. Collapsed modda yalnız ikon + aria-label.
   Favicon/PWA/login logosu DEĞİŞMEDİ.
4. **Şube dashboard + rol modeli: TASARIM** (kod YOK) —
   `docs/architecture/BRANCH_DASHBOARD_AND_ROLE_MODEL.md`. Kritik bulgu:
   `User` modelinde **hiçbir şube alanı yok**, yani bugün bir kullanıcıyı
   şubeye atamak imkânsız; `SCHOOL_ADMIN` tek kurum rolü. Öneri:
   `INSTITUTION_OWNER`/`BRANCH_MANAGER` + `UserBranchAccess` tablosu +
   dashboard'da tam-tenant okuması YASAK (şube/rol kapsamlı aggregate).
   9 madde **OWNER DECISIONS**'ta karar bekliyor.

Kapılar: typecheck temiz, lint 0 hata (24 eski uyarı), **2791/2791 test**
(+37 yeni), `prisma validate` temiz, `next build` temiz.

## Önceki odak (2026-09-08, P0 UAT: PDF/soğuk route/arama/UI)

Owner UAT'sindeki 8 bulgunun tamamı ölçümle kök nedene indirildi. Tam rapor:
`docs/performance/UAT_P0_2026_09_07_REPORT.md`. **Test Supabase'e bu turda
hiç bağlanılmadı**; ölçümler yerel production build + `STORE_MODE=json` +
gerçek Chromium ile yapıldı.

1. **PDF boş beyaz sayfa — ÇÖZÜLDÜ.** Kök neden koyu tema: baskı yüzeyi
   zemini `rgb(23,23,26)`, metin `rgba(245,241,232,.96)`. Yazdırmada arka plan
   VARSAYILAN OLARAK basılmaz → beyaz kağıda beyaz metin. Mürekkep oranı
   %0,39 → **%6,12**. Yeni `src/lib/contract-print-theme.ts` yüzeyde tüm
   `--color-*` değişkenlerini açık palete SABİTLER. Legal metne dokunulmadı.
2. **Tüm ekranlarda soğuk açılış — ÇÖZÜLDÜ.** Her route 7 font / **4.747 KB**
   indiriyordu; 4.311 KB'ı `next/font/local` ile servis edilen HAM TTF idi
   (JS yalnız 179 KB). İki aile `next/font/google`'a taşındı → **339 KB**
   (−%93), sayfa toplamı −%88. 8,1 MB TTF repodan silindi.
3. **Öğrenci araması — ÇÖZÜLDÜ.** Terim yalnız URL'deydi; her tuş
   `router.replace` → `force-dynamic` RSC turu → tam-tenant okuması. 6 harf =
   **6 gerçek RSC turu → 1**. Input geri bildirimi 34 ms → **max 20 ms**.
4. **Kart statü rengi — ÇÖZÜLDÜ.** `resolveLessonFinalStatus` gelecekteki her
   ders için koşulsuz "planned" dönüyordu. Yeni `resolveLessonMarkedStatus`
   yalnız Ders Programı kartında kullanılır; **Yoklama Takvimi'nin bilinçli
   davranışı (4 testle kilitli) DEĞİŞMEDİ**. Gerçek tarayıcıda beş statünün
   TAM dolgusu doğrulandı — **Telafi sarısı ilk kez canlı görüldü**.
5. **Tooltip — düzeltildi, canlı doğrulanamadı.** `group-focus-within` fare
   odağını da kapsıyordu; tıklanan kart odakta kalınca tooltip asılı kalıyordu.
   Kaldırıldı, `group-focus-visible` + Escape korundu. **Takılı durum
   otomasyonla yeniden üretilemedi — 10 sn insan doğrulaması gerekli.**
6. **Demo login — KALDIRILDI.** `login-form.tsx` ("use client") içinde 14
   hesabın açık metin parolası vardı, yani her ziyaretçinin JS paketindeydi.
   `password:` alanı 16 → 0; derlenmiş `.next/static` temiz.
   `docs/testing/TEST_ACCOUNT_CATALOG.md` (parolasız) eklendi.

**AÇIK GÜVENLİK MADDESİ (operatör):** `src/lib/auth/users.ts` hâlâ
`process.env.AUTH_* || "<sabit varsayılan>"` taşıyor; preview/prod'da bu
değişkenler tanımlı değilse bilinen parolalar geçerli olur. Eski demo
parolaları git geçmişinde kalmıştır — rotasyon gerekir.

Kapılar: typecheck temiz, lint 0 hata (24 eski uyarı), **2754/2754 test**
(+43 yeni), `prisma validate` temiz, `next build` temiz.

## Önceki odak (2026-09-07, P0 bildirim paralelleştirmesi)

Operatör onayıyla, §5.1'de "onay bekliyor" bırakılan iş yapıldı. Tam rapor:
`docs/performance/LESSON_MUTATION_P0_REPORT.md` **EK** bölümü.

- **Ders taşıma p95 ~%53 düştü** (ölçüldü, yapay RTT ile): 20 ms'de 565→273,
  40 ms'de 1073→496, 163 ms'de 4148→1862. Kazanç sorgu SAYISINDA değil
  DALGA sayısında — öğretmen/öğrenci+veli/yöneticiler artık paralel.
- **Statü yolu değişmedi** (beklendiği gibi): Geldi/Gelmedi bayrakları hiç
  bildirim üretmez; bildirim yalnız "İşlendi" dalındadır.
- **Yeni: yarışa dayanıklı idempotans, ŞEMA DEĞİŞİKLİĞİ OLMADAN.** `dedupeKey`
  verildiğinde satır id'si `sha256(tenant⊕hedef⊕kind⊕anahtar⊕gün)`'den türer;
  `Notification.id` birincil anahtar olduğu için ikinci satır yazılamaz.
- **Bulunan GERÇEK hata: tekilleştirme ÖLÜ KODDU.** 24 saatlik pencere
  `body.includes(dedupeKey)` ile bakıyordu ama ders bildirimlerinin gövdesi
  anahtarı HİÇ içermiyordu. Gerçek DB kanıtı (aynı senaryo, TRUNCATE'li):
  eski kod **105 yinelenen** bildirim yazıyordu, yeni kod **0**.
- `createMany(skipDuplicates)` denendi ve ÖLÇÜMLE geri alındı (Prisma onu
  BEGIN/INSERT/COMMIT gönderiyor → bildirim başına 3 gidiş-dönüş). Yerine
  `create` + yalnız `P2002` yakalama.
- `notifications/index.ts` artık `prisma`'yı STATİK import eder (25a59c1'deki
  Turbopack tuzağı + mutasyon başına 5 modül çözümlemesi).
- Sessiz `catch {}`'ler kaldırıldı: her bildirim sonucu `created/duplicate/
  skipped/failed` olarak döner, hatalar loglanır, teslim edilemeyen bildirim
  `lesson.reschedule.notification_failed` denetim kaydına yazılır. Bildirim
  hatası ders mutasyonunu ASLA başarısız yapmaz (zorunlu bildirim yok).

**Kalan TEK P0 performans blocker'ı kod dışı:** bölge uyuşmazlığı
(`iad1` ↔ `ap-south-1`, ~163 ms). **≤ 80 ms gecikmede her iki mutasyon da
P95 < 1 sn hedefini TUTUYOR**; 163 ms'de ikisi de tutmuyor.

Kapılar: typecheck temiz, lint 0 hata (24 eski uyarı), **2718/2718 test**,
`prisma validate` temiz, `next build` temiz.

## Önceki odak (2026-09-07, P0 mutation performansı)

Worktree `~/Projects/neviihub-vercel-test-environment`, branch
`infra/vercel-test-environment`. `main`'e DOKUNULMADI. **Test Supabase'e bu
turda HİÇBİR yazma yapılmadı** — mutasyon ölçümleri yerel tek kullanımlık
`notaplan_bench_p0` DB'sinde yapıldı (ölçüm sonrası silindi). Tam rapor:
`docs/performance/LESSON_MUTATION_P0_REPORT.md`.

Ders taşıma ve statü değiştirmenin KRİTİK YOLUNDAN tam-tenant `AppData`
okumaları TAMAMEN kaldırıldı:

- Taşıma **64 → 32** DB gidiş-dönüşü, statü **46 → 25** (3 tam okuma → 0).
- Yeni TEK kaynak: `src/lib/lesson-scope.ts` (`narrowLessonScope`/
  `mergeLessonScope`). db modu aynı dilimi filtrelenmiş Prisma
  `include`'larıyla üretir (`store-db.readLessonScope`); json/memory de AYNI
  dilimle çalışıp bütüne birleştirir — dilim yetersizse testler yakalar.
- `updateLessonSchedule` artık `AppData` değil `{lesson, previousStartAt}`
  döner ve doğrulama hatasını FIRLATMAZ (`LessonScheduleUpdateOutcome`).
- Kapalı gün kuralı tool'dan saf fonksiyona taşındı (`CLOSED_DAY`) — artık
  store'a giren her yolda uygulanıyor.
- **Gerçek veri kaybı hatası düzeltildi**: `notifications/index.ts`
  json/memory yazımları kilitsizdi; 12 eşzamanlı yazımdan 11'i kayboluyordu
  (test kilit kaldırılarak KANITLANDI). Artık `withFileLock` +
  `writeJsonFileAtomic`. Bu, önceki turda bildirim paralelleştirmesinin geri
  alınma sebebiydi — ön koşul artık kapalı.
- Ders mutasyonları `revalidateAll()` (17 yol + kök layout) yerine 9 ilgili
  yolu tazeler.

**Hedef (P95 < 1 sn) TUTMUYOR — dürüst durum:** yapay RTT ile ölçüldüğünde
her iki mutasyon da **≤ ~30 ms DB gecikmesinde hedefi TUTUYOR**, ama mevcut
preview'in **163 ms**'sinde (lambda `iad1` ↔ Supabase `ap-south-1`) taşıma
4.16 sn, statü 1.84 sn. Kalan iki darboğaz: (1) bildirimler taşımanın kalan
maliyetinin %75'i — paralelleştirme artık GÜVENLİ ama **onay bekliyor**,
(2) bölge uyuşmazlığı (kod dışı, insan kararı).

Kapılar: typecheck temiz, lint 0 hata (24 eski uyarı), **2699/2699 test**,
`prisma validate` temiz, `next build` temiz.

Ölçüm harness'ı: `scripts/bench-lesson-mutations.ts` — YAZMA yapar, bu yüzden
yalnız yerel tek kullanımlık DB'de çalışır (guard'lı).

## Önceki odak (2026-09-07, P0 UAT: performans + demo reset + renkler)

Worktree `~/Projects/neviihub-vercel-test-environment`, branch
`infra/vercel-test-environment`. `main`'e DOKUNULMADI. Owner UAT'sindeki üç
P0 bulgusu ölçümle kök nedene indirildi ve düzeltildi — tam rapor
`docs/performance/ADMIN_WEB_P0_BASELINE.md`.

1. **Yoklama Takvimi ~11.4 sn → ~1.6 sn.** Kök neden: istemci dönemin 10 ayını
   ARDIŞIK çekiyor, her istek de tenant'ın TÜM `AppData`'sını okuyordu. Yeni
   `getAttendanceCalendarTermTool` + `/api/v1/attendance-calendar/term` bir
   dönemi TEK istekte, TEK `readData()` ile döndürür. Tek ay uç noktası tekil
   tazeleme için KORUNDU. `readData()` içindeki 3 bağımsız sorgu paralel.
2. **Öğrenci değişimi**: bayat veri (önceki öğrencinin takvimi) artık
   gösterilmiyor; `useTransition` ile 100 ms altında görünür geri bildirim.
   Ölçülen p95 **1 565 ms** — 1.5 sn hedefinin 65 ms üstünde (kalan iş §7.6).
3. **Ders taşıma iyimser**: kart 80 ms'de yeni yerinde, başarısızlıkta güvenli
   geri alma. Mutasyon başına İKİ RSC render'ı → BİR (gereksiz
   `router.refresh()` kaldırıldı; `revalidatePath` zaten tazeliyor).
   Sunucu action'ı hâlâ ~5.1 sn — P95 < 1 sn hedefi TUTTURULAMADI.
4. **Demo reset UI'dan kaldırıldı**: panel özetinden tamamen, Kurulum
   Merkezi'nde yalnız yerel geliştirmede. `resetDemoTool` yerel geliştirme
   dışında fail-closed (`isLocalDevTooling()`, `src/lib/config.ts`).
   React #441'in gerçek nedeni bulundu ve düzeltildi: `seedDatabase`'in FK
   silme sırası (`MakeupRequest` → `Attendance`).
5. **Renkler TEK kaynaktan, TAM kart dolgusu**: Ders Programı'ndaki ayrı
   Tailwind renk haritası kaldırıldı; kart + gün kutusu artık
   `ATTENDANCE_CALENDAR_COLORS`/`lessonCardFillStyle` kullanır. İptal → koyu
   gri EKLENDİ. Tonlar ölçülen kontrasta göre AA'ya çekildi
   (green-600→700, red-600→700) ve metin rengi artık HESAPLANIYOR — bu, mevcut
   üç erişilebilirlik hatasını da düzeltti (planned 1.81:1, open 1.26:1).

Kapılar: typecheck temiz, lint 0 hata (23 eski uyarı), **2685/2685 test**,
`prisma validate` temiz, `next build` temiz.

Ölçüm harness'ı: `scripts/bench-admin-p0.ts` (salt okunur).
Test DB'de ölçüm sırasında değişen demo satırları raporun §10'unda listeli.

## Önceki odak (2026-09-06, test ortamı DB + migration + seed)

Worktree `~/Projects/neviihub-vercel-test-environment` (yerel branch
`infra/vercel-test-environment`, `origin/test` ile aynı). Bu turda test
ortamı veritabanı ayağa KALDIRILDI; `main`'e dokunulmadı (hâlâ `4ab2f3d`).

**Test Supabase (`vxzewyiwfshobjizzetw`) artık DOLU ve erişilebilir:**
70 tablo + `_prisma_migrations`, 65/65 migration kayıtlı, 132 tenantId
index'i, A/B/C/D telafi + Program Vitrini demo verisi seed'li, çift
çalıştırmada yinelenen kayıt 0. Yerel `npm run dev` bu DB'ye karşı
`ready:true · storeMode:db · reachable:true` döndürüyor.

Push'lanan iki commit (`origin/test`): `6460b02` (bağlantı/TLS + errorClass),
`d08da2a` (db-modu öğrenci/telafi yazımı + seed düzeltmeleri).

**Migration geçmişi borcu (AÇIK):** 65 migration'ın 32'si MySQL-dönemi DDL'i
ve PostgreSQL'de replay EDİLEMİYOR (`42601`). Test DB, operatör onayıyla
`migrate diff --from-empty --to-schema` baseline'ı + 65 ×
`migrate resolve --applied` ile kuruldu — repo geçmişi DEĞİŞTİRİLMEDİ.
Production da aynı sorunu yaşayacak; kalıcı çözüm tek bir `0_init`'e squash
(operatör kararı bekliyor).

### Open work (insan aksiyonu bekliyor)

1. **P0 — Vercel Preview `DATABASE_URL` parolası eski.** Rotasyon öncesi
   değeri taşıyor → `28P01`. `/api/v1/ready` artık
   `database.errorClass: "AUTHENTICATION"` ile bunu söylüyor (alan yalnız
   preview/test/local'de görünür). Güncel test Transaction Pooler URL'si
   (6543, `pgbouncer=true&connection_limit=1`) girilip Preview redeploy
   edilmeli. Doğru parola `.env.test.migrate`'teki ile aynı; yereldeki
   `.env.test` bu turda güncellendi ve doğrulandı.
2. **Vercel Deployment Protection test domain'ini de kapatıyor.**
   `ssoProtection = all_except_custom_domains`, ama projedeki TÜM
   deployment'lar `target: null` (Preview) olduğu için `test.neviihub.com`
   da SSO'ya 302 yapıyor — otomatik smoke test imkânsız. Seçenekler:
   korumayı test projesinde kapatmak, Protection Bypass for Automation
   token'ı üretmek, ya da test branch'ini Production target'ına almak.
3. Phase 6 domain smoke testi (1) ve (2) çözülmeden çalıştırılamadı.
   Yerelde test DB'ye karşı yapılan kısmi smoke: portallar fail-closed
   (307 → /login), kimlik doğrulamalı API'ler 401, health/ready yeşil.
4. `seed-attendance-demo.ts` AYNI `firstPaymentAdjustmentReason` boşluğunu
   taşıyor (db modunda patlar) — bu turda kapsam dışı bırakıldı.
5. Migration geçmişi squash kararı (yukarı bkz.).

## Önceki odak (2026-09-05, sürüm hazırlığı turu)

Üretim sürümü HAZIRLANDI, **PUSH/DEPLOY YAPILMADI** (bilinçli — aşağıya bkz.).
Çalışma ağacındaki tüm iş 8 mantıksal commit'e ayrıldı; kapılar yeşil.

Bu turda YAPILAN KOD DEĞİŞİKLİKLERİ (öncekilerin üstüne):

1. **Ek bölümler artık şablon ETKİNLEŞTİRMEsi beklemiyor.** `resolveAnnexBody`
   (`contract-annexes.ts`): kurumun aktif `kvkk`/`parent_social_media_consent`
   şablonu 400 karakterin altındaysa ya da yoksa doğrudan `canonicalTemplateBody`
   (kurumsal kaynak metni) kullanılır. Şablon kaydı DEĞİŞTİRİLMEZ; yalnız çıktı
   beslenir. Sözleşme Merkezi'ndeki uyarı artık ENGEL değil BİLGİ kutusu.
2. **`parentName` koşullu zorunlu.** `accountResponsibility` = SELF_MANAGED ise
   veli adı OPSİYONEL (öğrencinin kendi adıyla doldurulur), PARENT_MANAGED ise
   ZORUNLU. Kural istemci (kayıt formu + öğrenci düzenleme ekranı) ve sunucu
   (`studentSchema.refine`) tarafında AYNI Türkçe metinlerle uygulanır.
   Telefon kuralları zaten vardı, mesajları alan-odaklı hale getirildi.
3. **`DIRECT_URL` düzeltildi** (yalnız yerel `.env`/`.env.local`, commit'lenmez):
   6543 (transaction pooler) → 5432 (session pooler). `prisma migrate status`
   artık asılı kalmıyor. Gerekçe `.env.example`'a yazıldı.

DOĞRULAMA (hafızaya değil, çalıştırılan şeye dayanır):

- Gerçek Chromium (`localhost:3000`): muhatap PARENT→SELF→PARENT geçişlerinde
  `required` bayrakları tam beklendiği gibi, 0 konsol hatası.
- Çalışan dev server'da GERÇEK yeni sözleşme oluşturuldu
  (`contract_351dge2lgouc`): hem `/sozlesme-yazdir/...` sayfası hem
  `/api/v1/contracts/:id/html` çıktısında ana sözleşme → KVKK → fotoğraf/video
  sırası, EK1/EK2 referansları, sayfa sonları ve GERÇEK kurumsal metin doğrulandı
  — kurumun aktif KVKK/foto şablonları HÂLÂ stub olmasına rağmen.
- Kapılar: typecheck temiz, lint 0 hata (21 eski uyarı), `prisma validate` temiz,
  `next build` temiz, `npm test` 2576/2577 (tek hata bilinen/ilgisiz
  `lesson-series-tools.test.ts`).

## CANLIYA ALIM — BLOKE (2026-09-05, insan kararı bekliyor)

Push/deploy YAPILMADI. Nedenleri KODA/ORTAMA bakılarak doğrulandı:

- `origin/main...HEAD` = **0 / 170** — yerel `main`, origin'in 170 commit
  ÖNÜNDE. Canlı Vercel production (`notaplan.vercel.app`) hâlâ `4ab2f3d`
  build'ini çalıştırıyor.
- GitHub deposu (`hidircan/notaplan`) **PUBLIC** — push etmek aynı zamanda bir
  ifşa eylemidir, yalnız deploy tetikleyicisi değil.
- Supabase projesi `uqkafczrplqitzumtrqy` ("Maestron Project", hesaptaki TEK
  proje, `.env` dosyalarının işaret ettiği) **TAMAMEN BOŞ**: 0 tablo,
  `_prisma_migrations` yok, 65 migration'ın **0'ı** uygulanmış. Yani
  `lessonStartDate` migration'ı orada "tek sütun ekleme" değil, şemanın
  SIFIRDAN kurulmasıdır.
- `vercel env ls production` → "The specified token is not valid" (CLI login
  yok). Production ortam değişkenleri (`STORE_MODE`, `DATABASE_URL`,
  `JWT_SECRET`, SMTP…) OKUNAMADI, dolayısıyla doğrulanamadı.

Operatörden gereken kararlar: (a) 170 commit public repoya push edilsin mi,
(b) production Supabase şeması sıfırdan kurulsun mu ve yedek/geri dönüş yolu
ne, (c) Vercel CLI/token ile production env'in doğrulanması.

## Önceki odak (2026-09-05, erken oturum)

Enrollment-form P0 fixes on `/panel/ogrenciler/yeni` (owner-reported, all
verified in a real Chromium against `localhost:3000`, not just in tests):

1. Enstrüman / Ders süresi / Ödeme-iletişim muhatabı dropdowns could not be
   changed. Root cause was `<form onInput={recomputePreview}>` reverting every
   controlled `<select>` in the form before its `change` event landed — see
   the new entry at the end of `LESSONS_LEARNED.md`; the fix is dropping
   `onInput` and keeping only `onChange`.
2. "Sosyal medya paylaşım (fotoğraf/video) izni var" removed from the
   enrollment form — the same consent is already collected by the contract
   screen's Fotoğraf/Video Açık Rıza (Madde 19) flow, which is the only
   writer of `SocialMediaConsent` now. `actionAddStudent` no longer records a
   default `denied` decision the user never made; historical rows untouched.
3. `invitePortalEmail` in the Portal erişimi section was flipping between
   `value` and `defaultValue` when the recipient changed to "Öğrencinin
   kendisi" → React's "changing an uncontrolled input to be controlled"
   console error. Now always controlled by one `portalEmail` state.

Known pre-existing failure, NOT caused by the above and untouched:
`src/lib/__tests__/lesson-series-tools.test.ts > createLessonSeriesTool >
"skipConflicts=true ile yalnızca çakışmayanlar oluşur"` fails at `8562cf0`
too, with a freshly seeded store as well (date-dependent seed/conflict
assumption). 2525/2526 tests otherwise pass.

## Previous focus (last updated: 2026-08-31)

P0 hydration hotfix done: `contract-panel.tsx`'s local `formatDateTr` used
`toLocaleDateString("tr-TR")` with no explicit options — non-deterministic
zero-padding across Node SSR vs. browser, causing a real hydration
mismatch ("02.03.2027" vs "2.03.2027"). Fixed with one canonical
`formatDateTr` in `src/lib/timezone.ts` (explicit `2-digit` Intl options +
explicit `Europe/Istanbul` timeZone — spec-guaranteed deterministic).
Replaced all 12 repo-wide unsafe occurrences. See
`docs/contracts/CONTRACT_CENTER_HYDRATION_DATE_HOTFIX_REPORT.md`. Verified
via live curl against the actual dev server (real route, real data,
correct zero-padded output) and 11 new unit tests — but a literal
browser-console "no hydration warning" check could NOT be performed
(Chrome install needs sudo, unavailable here). Next session with a working
browser should do a 10-second manual check and can then honestly confirm
that last step.

Both deferred feature requests from the same user message are now DONE:

- **Welcome email**: found an already-built, parallel-session email
  infrastructure (`src/lib/email/*`, nodemailer-based, SMTP-or-console
  transport, never fakes delivery) already wired into both new
  student/parent AND new teacher invitation flows
  (`inviteStudentPortalAccessTool`/`inviteTeacherAccountTool` →
  `sendAccountInvitationEmail`). Rewrote that email's HTML/text to a warm,
  branded, "ailemize/ekibimize hoş geldiniz" template with the password-setup
  link (pre-existing, reused), an explicit web portal link, and a
  conditionally-shown mobile app-store links section (`APP_STORE_URL`/
  `PLAY_STORE_URL` env vars — omitted entirely, no broken links, since the
  app isn't published yet). 16 tests pass (11 pre-existing + 5 new).
- **CSV bulk historical-contract import**: built
  `src/lib/import/historical-contracts.ts` + two new tools
  (`previewHistoricalContractImportTool`/`commitHistoricalContractImportTool`)
  + wired into Veri Aktarım Merkezi via the same `CsvImportSection`
  component pattern as every other importer — replacing the earlier
  single-file `DocumentDirectUploadForm` section per the user's explicit
  "not like before" request. Columns mirror the contract-creation screen's
  fields. Each row becomes an archival `DocumentInstance`
  (`status: "uploaded"`) — deliberately bypasses `createContract()`'s live
  financial validation (inappropriate for historical data) and creates NO
  `StudentContract`/`Payment` rows. 14 tests pass, including a real 120-row
  end-to-end import proving the ">=100 rows" requirement.
- KVKK/social-media consent packaging was re-confirmed already correct
  (same Contract Center screen, separate texts per legal source Madde
  19/20 — not literally merged, which would contradict the source).

See `docs/imports/HISTORICAL_CONTRACT_IMPORT_REPORT.md` for the import
feature; the email work has no separate report (small enough to cover
here).

## Earlier pass (2026-08-30, late-night)

Large P0 "contract operability/DOCX/print" package. The DOCX workflow and
A4 print CSS (flagged as "large, not attempted" in the evening pass) are
now IMPLEMENTED — see below. Still open: real Puppeteer-based PDF page
numbers, "Ödeme Şekli" payment-table column fix (needs owner/legal sign-off
on a new draft), full ZIP+CSV bulk historical import, live browser
verification (Chrome install needs sudo, unavailable in this environment).

## Done this pass (2026-08-30 evening)

- Registration form (`src/components/new-student-form.tsx`): duration
  selector now offers full 1–12 (was missing 5/7/8/9/10/11); confirmed it's
  NOT a duplicate of the contract-panel duration field — it drives the
  post-save redirect (trial vs formal contract flow, `src/lib/actions.ts`
  ~line 808), so it was fixed in place, not removed. Öğrenci türü
  (`STUDENT_TYPES`) moved to its own card at the top of the form instead of
  buried under "Akademik bilgiler". Editable "Ödeme günü aralığı" replaced
  with read-only policy text (card 1–5, other 1–15).
- Money inputs: added `.no-spinner` global CSS utility
  (`src/app/globals.css`), applied to the two `type="number"` amount inputs
  in `src/components/student-package-pricing-fields.tsx`.
- Evraklar Merkezi blank-editor bug: root cause was `bodyHtml` being
  stripped when mapping templates for `<DocumentTemplateManager>` in
  `src/app/panel/evraklar/page.tsx`, and the click handler explicitly did
  `setBodyHtml("")`. Fixed to pass `bodyHtml` through and prefill it.
  **Also found and fixed a real bug while there**: `updateDocumentTemplateTool`
  mutates a template row in place (including an active/live template) — this
  violated the draft/activate policy. `document-template-manager.tsx` now
  detects `editingActive` and routes an edit of an active template through
  create-new(active:false)+archive instead of PATCH, with accurate Turkish
  copy explaining this. Added explicit Aktif/Arşiv-Taslak status badges.
- Login/welcome: `src/app/page.tsx` fully rewritten — removed all demo
  pricing/plans/"Demo panelini aç" content, now a clean feature-only welcome
  screen using the new `public/brand/logo.png` monogram. `src/lib/brand.ts`
  `logoPath`/`logoMarkPath` now point to it (was `null`). Login page shows
  the logo too. Demo login credentials in `login-form.tsx` untouched per
  instruction. Sidebar's bottom "Öğretmen portalı"/"Öğrenci portalı" links
  removed (`src/components/sidebar.tsx`).
- Veri Aktarım Merkezi: added a "5. Tarihi Sözleşme Aktarımı" section
  reusing the existing `DocumentDirectUploadForm` (single-file,
  student-linked, `student_enrollment_contract` kind, already has
  tenant/RBAC). This is the scoped version of the request — NOT the full
  ZIP+CSV bulk-matching pipeline from the P0 spec's Phase 8 (still open,
  see below).
- Verified already fixed by an earlier/parallel pass (no work needed):
  "Invalid or expired access token" → `src/lib/api/friendly-error.ts`
  already maps this to safe Turkish messages; form-state preservation on
  validation error → `new-student-form.tsx` already uses `useActionState`
  correctly (see its own top-of-file comment, P0-2 2026-08-29).
- Validation: `tsc --noEmit` clean, targeted eslint clean, `next build`
  clean (full route list generated incl. `/panel/veri-aktar`,
  `/panel/evraklar`), `prisma validate` clean. Full `npm test` run — check
  latest result before assuming pass (was running in background as of this
  write-up).

## Done this pass (2026-08-30 late-night)

- Duration data flow audited end-to-end: `Contract.durationMonths` is
  already the single persisted source of truth (not the registration
  form's `intendedDurationMonths`, which is only a redirect hint/prefill —
  by design, not a bug). Added 6 new e2e tests (5/7/8/9/10/11 months) in
  `contracts.test.ts`, all pass.
  See `docs/contracts/REGISTRATION_DURATION_DATA_FLOW_REPORT.md`.
- **Real bug found+fixed**: contracts shorter than 12 months rendered
  visibly empty installment table rows (blank date + bare " TL"). Fixed via
  `stripUnusedInstallmentRows()` in `src/lib/documents/index.ts`, wired
  through `createDocumentInstance`/`createContract`. Test-proven.
- **Real bug found+fixed**: editing an *active* generic document template
  (same fix area as the evening pass's blank-editor fix, different bug)
  mutated it in place via PATCH — violated draft/activate separation.
  `document-template-manager.tsx` now routes active-template edits through
  create-draft+archive instead. See LESSONS_LEARNED.md 2026-08-30 entry #2.
- DOCX-first template workflow implemented: `mammoth` dependency added;
  `DocumentTemplate` schema extended (additive migration
  `20260830230000_document_template_docx_source`, NOT applied) with
  `sourceFileData`/`sourceFileName`/`sourceMimeType`/`sourceUploadedAt`/
  `sourceUploadedById`; `POST /api/v1/documents/templates/docx-upload`
  (`uploadDocumentTemplateDocxTool`) always creates `active:false` drafts,
  rejects `.doc` with the exact required message, magic-byte validated;
  `GET /api/v1/documents/templates/[templateId]/source-file`
  (`getDocumentTemplateSourceFileTool`) serves the original bytes back
  unmodified. UI wired into `document-template-manager.tsx`. **Not yet
  tried with a real .docx file in a live browser** — only statically
  verified (typecheck/build/lint clean).
- Print CSS overhaul on `/sozlesme-yazdir/[contractId]/page.tsx`: Times New
  Roman, 8pt (print) / 10.5pt (screen), table borders/header shading,
  signature table print-safe. Real "Sayfa X / Y" page numbers are NOT
  achievable via CSS in any mainstream browser's print engine (verified,
  documented) — needs a Puppeteer-based PDF pipeline, flagged as a P1
  infra decision, not silently faked.
- Found (not fixed — legal-text risk): active contract template's payment
  table is missing an "Ödeme Şekli" column that the source .md itself has
  (`2026-2027-ogrenci-kayit-sozlesmesi-v1.md` line 49). Documented in
  `CONTRACT_PRINT_DESIGN_REPORT.md` §5, needs owner/legal sign-off before
  a new draft is created.
- Form-state preservation and student portal contract access both
  re-audited and confirmed still correct (no code changes needed).
- Playwright/Chrome could not be installed in this environment (`sudo`
  required, non-interactive) — visual/live-browser verification for print
  CSS and DOCX upload was NOT possible; disclosed honestly in reports
  instead of skipped silently.

## Open work (large, still not attempted)

- [ ] **Per-lesson period billing + admin attendance-risk report** (owner
      request, 2026-09-02): read-only audit + spec written to
      `docs/implementation-plans/per-lesson-billing-and-attendance-risk-scope.md`
      — no code changed. Key findings: existing uncommitted
      `src/lib/period-lesson-billing.ts` derives per-lesson fee FROM the
      monthly fee (opposite direction from the new requirement, which wants
      per-lesson fee as the primary field) and is wired into only one screen
      (attendance calendar panel), not the 4 required surfaces; "billable
      lesson" has no single definition today (trial/closed-day/makeup-source/
      freeze not excluded); first-payment flow currently REJECTS any manual
      amount that doesn't match the calculated fee (no override+audit path
      yet) but its double-write-prevention (`reuseFirstPaymentId`) is already
      solid and should be reused as-is. Attendance side: `lesson-ops.ts`'s
      "İşlendi"/"Telafi" flags have no reason capture today (makeup's
      `MakeupRequest.reason` is hardcoded, not real user input);
      `notifyAdmins()`/`listAdminUserIdsForTenant()` already give tenant+
      role-scoped admin notification for free but its dedupe is a 24h window,
      not monthly; `LessonOpsBadges`' current colors are inverted vs. the
      requested scheme (İşlendi is reddish today, should be yellow; Telafi is
      yellow today, should be red). Owner decisions needed before
      implementation: same-day-cancellation dependency, new "free lesson"/
      "per-lesson primary fee" concepts need DECISIONS.md entries.
- [ ] Puppeteer-based (or similar) PDF pipeline for real page-number
      footers — infra decision (bundle size, serverless cold start).
- [ ] "Ödeme Şekli" column fix to the active contract template's payment
      table — needs owner/legal approval, then apply via the safe
      new-draft flow (never in-place).
- [ ] Live verification: a real .docx upload/download round-trip in an
      actual browser; visual print-preview check of the new CSS across
      multiple contract durations. Blocked in this environment; do in one
      with a working browser.
- [ ] Full historical contract bulk import: ZIP + CSV manifest, hash dedup,
      student-match review queue, import report. Current state only covers
      the simple single-file-per-student case (see "Done" above) — the CSV
      manifest / matching-queue / audit-report machinery does not exist.
- [ ] Same-day cancellation: schema/types exist (additive, unapplied
      migration `20260829180000_attendance_cancellation_notice`), server
      enforcement logic and 6-option Turkish UI dropdown NOT yet built — see
      lesson #1 in LESSONS_LEARNED.md before touching this.
- [ ] Human-readable template names elsewhere (confirm no `dtpl_...` raw id
      leaks as a *primary* label anywhere outside diagnostics/audit — only
      spot-checked `document-template-manager.tsx` this pass, which already
      showed `t.name` not the id).

## Known safe invariants (verified, don't re-check every session)

- Multi-store parity (json/memory/db) required for any store-layer change.
- `ServiceResult<T>` (`ok`/`fail`) — never throw for expected failures.
- Tool Layer (`src/lib/services/tools.ts`) is the only DB-touching layer.
- Draft templates never auto-activate anywhere in the codebase (verified).

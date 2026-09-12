# NeviiHub — NeviiOS Control Center

> **2026-09-12 birleşim notu:** Bu belge NeviiOS worktree'sinden taşındı. Kanonik rol sözleşmesi
> ve kurum sahibi fixture'ı için `docs/architecture/NEVIIOS_CONTROL_CENTER_MERGE_MANIFEST.md` esastır
> (ör. aşağıdaki "Nilüfer = SUPER_ADMIN" örnekleri yerine kurum sahibi `admin@` hesabıdır).

Bu belge NeviiHub çok kiracılı kontrol merkezini ve **HYPER_ADMIN** bootstrap
yolunu açıklar. Mevcut ürün adı (NotaPlan / Maestron) bu iş kapsamında
toplu olarak değiştirilmez.

## Roller

| Rol | Anlam | `/platform` | Başka kurum |
|-----|--------|-------------|-------------|
| **HYPER_ADMIN** | NeviiHub platform sahibi | Evet | Evet, yalnız açık hedef tenant ile |
| **SUPER_ADMIN** | Bir kurumun sahibi | 403 | Hayır |
| **SCHOOL_ADMIN** | Kurum müdürü (legacy kurum geneli yönetici) | 403 | Hayır |
| **BRANCH_MANAGER** | Şube müdürü — yalnız `UserBranchAccess` ile atandığı şube(ler); V1 izin seti tur 2'de | 403 | Hayır |
| **TEACHER / STUDENT** | Kendi kapsamı | 403 | Hayır |

HYPER_ADMIN bir kurumun öğretmeni, velisi veya sahibi gibi davranmaz.
Kurum üzerinde işlem için `/platform/kurumlar/[tenantId]` veya platform
API'sinde `tenantId` zorunludur. JWT'deki `tenantId` platform sentetik
tenant'ıdır (`tenant_platform`) ve hedef kurum sayılmaz.

## HYPER_ADMIN bootstrap

Public kayıt ve panelden rol yükseltme **yoktur**. İlk hesap yalnız:

1. **Geliştirme / test (`json` / `memory`, non-production)**  
   `hyper@nevii-hub.test` / `demo-hyper-admin` (veya `AUTH_HYPER_ADMIN_EMAIL` /
   `AUTH_HYPER_ADMIN_PASSWORD` override). Login gövdesi `z.string().email()`
   ister; `hyper@localhost` geçersizdir.

2. **Production (`STORE_MODE=db`)**  
   Env: `AUTH_HYPER_ADMIN_EMAIL` + en az 16 karakter `AUTH_HYPER_ADMIN_PASSWORD`.  
   Ardından:

   ```bash
   STORE_MODE=db npx tsx scripts/bootstrap-hyper-admin.ts
   ```

   Betik aynı e-postayı başka bir rolden **yükseltmez**.

UI üzerinden HYPER_ADMIN oluşturma/silme ekranı **yoktur**.

## Ayar çözümleme

Sıra (yüksek öncelik sonda):

1. Platform varsayılanı  
2. Paket/plan varsayılanı  
3. Kurum ayarı  
4. Şube override  
5. Kullanıcı tercihi (yalnız `userPreference` işaretli anahtarlar)

Her ayar `key`, `category`, `type`, `defaultValue`, `effectiveValue`,
`sourceScope`, doğrulama şeması ve audit alanları taşır.

## Feature flag

Kapalı modül yalnız menüden gizlenmez; `createHomeworkTool`,
`createPaymentTool`, `createAnnouncementTool`, `createTaskTool`,
`submitTeacherFeedbackTool` gibi mutasyonlar backend'de `FORBIDDEN`
döner. Zorunlu (`required`) bayraklar kapatılamaz. Kritik değişiklik
onay + audit ister.

## Entegrasyon güvenliği

- Secret API cevaplarında, listelerde ve loglarda gösterilmez.
- Düz metin JSON store'a yazılmaz.
- `PLATFORM_ENCRYPTION_KEY` yoksa secret persist edilmez; env secret
  yaklaşımı korunur. Sahte şifreleme iddiası yoktur.
- Görünen tek ipucu: varsa son dört karakter.

## SUPER_ADMIN kurum ekranları

`/platform` yoktur. Kendi tenant'ı için:

- `/panel/ayarlar/kurum`
- `/panel/ayarlar/ozellikler`
- `/panel/ayarlar/entegrasyonlar`

---

## NeviiOS V1 modül haritası (2026-09-11)

| Modül | Ekran | API | Veri | Sunucu etkisi |
|---|---|---|---|---|
| Platform owner korumalı yüzey | `/platform/**` | `/api/v1/platform/**` (`hyperAdminOnly`) | — | Middleware (oturum) + her sayfada `requireHyperAdminPage` (404) + handler 403 + servis `requireHyperAdmin` |
| Kurum portföyü / detay | `/platform/kurumlar`, `/[tenantId]` | `tenants`, `tenants/[id]` | `Tenant` (+ lifecycle alanları) | Yaşam döngüsü giriş + refresh'i keser |
| Provisioning | `/platform/kurumlar/yeni` → "Kurumu kur" | `POST tenants`, `POST tenants/[id]/provision` | `Tenant`, `School`, `Branch`, `ProvisioningRun`, `OwnerInvitation` | Idempotency anahtarı, slug tekilliği, DB transaction; ayar adımı hatasında taslağa döner |
| Kullanıcı / rol / etki önizleme | `/[id]/kullanicilar` | `members`, `members/role?preview=1`, `invitations` | `User.role`, `OwnerInvitation.role/branchIds` | Atanabilir: SUPER_ADMIN, SCHOOL_ADMIN, BRANCH_MANAGER. Son kurum sahibi düşürülemez. Refresh her seferinde güncel rolü basar |
| Şube erişimi | `/[id]/kullanicilar` | `members/branch-access` (POST/DELETE) | `UserBranchAccess` | `resolveBranchScope` fail-closed; `/sube` portalı; BRANCH_MANAGER tüm kurum geneli API ve panel aksiyonlarında reddedilir |
| Paket / entitlement / eklenti / limit | `/[id]/paket` | `tenants/[id]` (planKey), `settings` (`subscription.*`) | `Tenant.planKey`, `SettingOverride` | Paket-dışı modül flag ile açılamaz; limit yalnız yeni kayıt/davet engeller |
| Modül aç/kapa | `/[id]/ozellikler`, `/panel/ayarlar/ozellikler` | `features` | `FeatureFlagOverride` | Tool katmanında `assertFeatureEnabled` |
| Appearance policy | `/[id]/gorunum` | `settings` (`appearance.*`, `locale.availableLanguages`) | `SettingOverride` | Root layout + `actionSetThemeProfile/actionSetFont` politikayı zorlar |
| Platform logosu | `/platform/marka` | `platform/branding/logo` (PUT/DELETE), public `branding/platform-logo` | `SettingOverride(platform,*,platform.logo)` | PNG/JPEG/WebP + imza + ≤200KB; SVG yok; `public/`a yazılmaz; favicon build-time |
| Kurum marka/portal | `/[id]/gorunum` | `settings` (`institution.*`) | `SettingOverride` | Kurum logosu platform logosundan bağımsız |
| Öğrenci kayıt formu | `/[id]/formlar` | `settings` (`forms.studentRegistration`) | `SettingOverride` | `createStudentTool` zorunluluk / gizli alan / rol / varsayılan / koşul uygular |
| Dönem / finans / sözleşme | `/[id]/politikalar` | `settings` (`policy.*`) | `SettingOverride` | `snapshotPolicy` (içerik parmak izi, derin kopya) |
| Davet / e-posta / giriş / iletişim | `/[id]/politikalar` | `settings` (`communication.*`, `auth.*`), `templates/preview` | `SettingOverride` | Davet TTL + parola min. uzunluk kabulde uygulanır; önizleme gönderim yapmaz |
| Audit timeline | `/platform/denetim`, `/[id]/denetim` | `audit` | `PlatformAuditEvent` | Önceki/yeni değer, hedef tenant, aktör, requestId; secret redakte |
| Destek erişimi | `/[id]/destek` | `support`, `support/view` | `SupportAccessSession` | Impersonation değil; ≤4 saat, gerekçe ≥15 karakter, salt-okur; aç/kapa/görüntüle audit |

## Ayrım kuralı: paket ≠ entitlement ≠ feature flag ≠ permission

```
kullanabilir = entitled(paket | eklenti | platform override)
            AND flag açık (kurum override yoksa açık)
            AND rol izni (src/lib/auth/rbac.ts)
            AND tenant / şube kapsamı (ALS + resolveBranchScope)
```

`subscription.entitlementOverrides[flag] = false` paket modülünü de geri alır.
Kurum rolleri `platformOnly` ayarları (paket, görünüm, kurum türü, giriş
politikası) yalnız okur.

## Kurum rolleri ve kapsam

- **HYPER_ADMIN** (platform sahibi): kurum paneline girmez, panel server
  action'larını çağıramaz (tek kurum seçse bile), kurum adına ödeme/öğrenci
  işlemi yapmaz. Kurum operasyon verisini yalnız destek oturumu içinde görür.
- **SUPER_ADMIN** (kurum sahibi = INSTITUTION_OWNER): yalnız kendi kurumu;
  "Tüm kurumlar" seçemez; refresh token'da tenant uyuşmazlığı istisnası yoktur.
- **SCHOOL_ADMIN**: geriye uyumlu kurum geneli yönetici. Geçiş stratejisi:
  mevcut hesaplar değişmez; yeni şube bazlı personel BRANCH_MANAGER olarak
  davet edilir; ürün kararıyla SCHOOL_ADMIN hesapları tek tek NeviiOS rol
  ekranından (etki önizlemeli) dönüştürülür.
- **BRANCH_MANAGER**: legacy `rbac.ts` izin listesi boş kalır (kurum geneli
  API'ler 403). Tur 2'de permission matrix üzerinden şube kapsamlı V1 seti
  açıldı (aşağıya bakın); tek yüzeyi `/sube` + `/api/v1/sube/*`.

## Migration'lar (UYGULANMADI)

| Migration | İçerik | Rollback (veri kaybı!) |
|---|---|---|
| `20260826120000_platform_control_center` | `Tenant.planKey`, `SettingOverride`, `FeatureFlagOverride`, `PlatformAuditEvent`, `IntegrationConnection` | `DROP TABLE` ile tüm ayar/bayrak/audit/entegrasyon kaydı; `DROP COLUMN "planKey"` paket atamalarını siler |
| `20260826140000_tenant_provisioning` | `Tenant` yaşam döngüsü/profil kolonları, `OwnerInvitation`, `ProvisioningRun` | `DROP COLUMN` kurum profil/yaşam döngüsü bilgisini siler; askıdaki kurumlar varsayılan `active`e döner |
| `20260911120000_neviios_branch_access_support` | `OwnerInvitation.role/branchIds` (nullable), `UserBranchAccess`, `SupportAccessSession` | `DROP TABLE` şube atamalarını ve destek geçmişini siler; `DROP COLUMN` bekleyen davetleri kurum sahibi davetine çevirir |

Uygulama akışı (yalnız onaylı staging): `npx prisma validate` →
`npx prisma generate` → `npx prisma migrate status` → `npx prisma migrate deploy`.

## STORE_MODE davranışı

- `db`: platform store Prisma hatasında **JSON'a sessizce düşmez** (fail-closed).
- `json`/`memory`: kullanıcı yazımı (rol değişikliği, davet kabulü, kurulum)
  bilinçli olarak reddedilir; davet kabulü denemesi daveti yakmaz.

## NeviiHub web entegrasyonu için contract

1. **Rol dalı**: web ürünü `BRANCH_MANAGER` rolünü tanımalı; `homePathForRole`
   `/sube` döner. Panel ekranları bu role açılmamalı.
2. **Şube kapsamı**: şube bazlı her okuma `resolveBranchScope(ctx)` +
   `inBranchScope` ile süzülmeli; boş kapsam = 403.
3. **Görünüm**: kurum politikası `getAppearancePolicy(tenantId)`; kişisel tercih
   yalnız `light_and_dark` ve `fixedTheme=none` iken uygulanır.
4. **Platform logosu**: `GET /api/v1/branding/platform-logo` (302 → build-time
   fallback). Kurum logosu `institution.logoUrl` ayarından okunur.
5. **Öğrenci formu**: kayıt ekranı `getStudentFormConfig(tenantId)` ile
   alanları göstermeli; sunucu zaten `createStudentTool`da uygular.
6. **Snapshot**: sözleşme/tahsilat kaydı oluşturan kod `snapshotPolicy(key,
   value)` sonucunu kayda gömmeli (model alanı web tarafında eklenecek).
7. **Marka**: kullanıcıya görünen platform adı `NeviiHub`; global ürün markası
   (`src/lib/brand.ts`, şu an Maestron) bu çalışma kapsamında değiştirilmedi.

## Manuel yerel test

```bash
STORE_MODE=json npm run dev
# Platform sahibi: hyper@nevii-hub.test / demo-hyper-admin  → /platform
# Kurum sahibi:   nilufer.acar@niluferacar.com.tr / demo-owner-nilufer → /panel
```

1. Kurum sahibiyle `/platform` → 403 ekranı; `/platform/kurumlar` → 404.
2. Platform sahibiyle `/platform/kurumlar/tenant_nilufer_acar/paket` → paket,
   limit kullanımı; `subscription.limitOverrides` = `{"students": 1}` →
   panelden öğrenci eklemek "Paket limiti doldu" verir, mevcutlar kalır.
3. `/formlar` → "Doğum tarihi" zorunlu → panelde doğum tarihsiz öğrenci
   eklenemez.
4. `/gorunum` → `appearance.mode = dark_only` → kurum kullanıcısında tema
   Obsidyen'e kilitlenir.
5. `/kullanicilar` → Ezgi'yi "Şube Müdürü"ne çek → etki önizlemesi (json'da
   yazım db-only uyarısı); şube kutucukları atama/kaldırma yapar.
6. `/destek` → gerekçeyle 15 dk aç → "Kurum verisini görüntüle" → `/denetim`
   `platform.support.*` olaylarını gösterir.
7. `/platform/marka` → PNG yükle → sol menü logosu değişir; "Varsayılana dön".

---

## Tur 2 (2026-09-12) — kanonik rol standardı ve kurumsal tamamlama

### Kanonik roller (owner kararı)

| Rol | Anlam |
|---|---|
| HYPER_ADMIN | Platform Sahibi / NeviiOS sahibi (şimdilik yalnız Hıdırcan Yağız). `/platform/**` tamamı. |
| SUPER_ADMIN | Kurum Sahibi — yalnız kendi tenant'ı; `/platform` ve global ayar yok. |
| BRANCH_MANAGER | Yalnız açıkça atanmış şube(ler); atama yoksa fail-closed. |
| SCHOOL_ADMIN | Legacy/geçiş kurum yöneticisi; otomatik BRANCH_MANAGER olmaz. |
| STAFF / TEACHER / STUDENT / PARENT | Operasyon/portal rolleri; platform izni taşıyamaz. PARENT = STUDENT girişi + GUARDIAN erişimi; STAFF V1'de giriş rolü değildir. |

### Oturum geçerliliği (yeni merkezi kontrol)

`src/lib/auth/session-validity.ts` — `authenticateRequest` (API, access ve
refresh-cookie yolları), `getSessionContext` (sayfalar) ve refresh route aynı
kontrolü kullanır: kullanıcı pasif/silinmiş mi, `sessionsRevokedAt` sonrası mı
üretildi, rol/tenant token'dakiyle aynı mı (refresh yolu rolü güncel kayıttan
yeniden basar). 5 sn süreç içi önbellek; aynı süreçte yazım anında etkilidir.

- Pasifleştirme / soft delete → giriş reddedilir, açık oturumlar hemen kesilir.
- Şifre değişimi (`/api/v1/account/change-password`, db) → diğer tüm oturumlar
  düşer, mevcut oturum yeni token çiftiyle devam eder. Şifre yanıt/audit'e yazılmaz.
- Başlangıç açığı kapatıldı: `authenticateRequest` access cookie yokken refresh
  token'daki (eski) rolü doğrudan kullanıyordu.

### Logo ve marka

- Canonical görünür logo: `/brand/icon.png` (`public/brand/icon.png`). Silinmiş
  `maestron-*` referanslarının tamamı kaldırıldı; `BRAND.name = "NeviiHub"`.
- Global platform logosu ayarı yoksa `/api/v1/branding/platform-logo` →
  302 `/brand/icon.png`. Favicon `src/app/icon.png` (build-time) ayrı kalır.
- `public/brand/logo.svg` dokunulmadı, aktif logo olarak kullanılmıyor.
- `lang="tr"` + CSS `uppercase` "NeviiHub"ı "NEVİİHUB" yapıyordu; marka metinlerinden kaldırıldı ve testle kilitlendi.
- **Hedef storage (uygulanmadı):** private Supabase Storage bucket
  (`platform-branding`), server proxy ile erişim (`/api/v1/branding/platform-logo`
  sözleşmesi değişmez), yükleme öncesi MIME + uzantı + dosya imzası + ≤200KB,
  audit, fallback `/brand/icon.png`. Bu turda bucket/secret/remote upload yok;
  local modda bayt içeriği `SettingOverride(platform,*,platform.logo)`'da.

### Header: kullanıcı menüsü ve global arama

- Sağ üst menü: baş harf avatarı, ad-soyad, e-posta, rol etiketi, Profilim
  (`/platform/profil`), Şifre değiştir, Görünüm tercihlerim, tema modu (Açık/Koyu),
  font (policy izin veriyorsa), dil (Türkçe; diğer diller çeviri altyapısı
  gelince — sahte dil değişimi yok), Oturumu kapat. Klavye (↑/↓, Escape + odak
  iadesi), dışarı tıklama, dar ekran genişliği.
- Arama (⌘K / Ctrl+K): `/api/v1/platform/search?q=` — yalnız HYPER_ADMIN;
  sayfalar (registry), kurumlar, şubeler, kullanıcılar (≥3 karakter, e-posta
  maskeli, telefon yok), paketler, modüller, ayarlar. Tam metin indeksi yok;
  mevcut veri üzerinde eşleşme.

### Navigasyon

Platform menüsü `SCREEN_REGISTRY` + `resolveGrants` ile üretilir (sunucu kontrolüyle
aynı kaynak). "Yeni kurum" menüde yok (`hiddenInNav`); Kurumlar ekranında
"Yeni kurum oluştur" aksiyonu. `/platform/kurumlar/yeni` route'u korunur ve
HYPER_ADMIN dışına 404.

### Kullanıcı yönetimi (`/platform/kullanicilar`)

Liste: ad, e-posta, kurum, şube, rol (+özel rol sayısı), durum, son giriş (db).
Filtreler sunucuda: arama, kurum, rol, şube, durum (aktif/pasif/silinmiş), davet
durumu. Çekmece: pasifleştir, soft delete, yeniden aktifleştir, portal erişimi
(öğrenci/veli), şifre sıfırlama bağlantısı (1 saat, tek kullanım, gönderim yok),
kalıcı silme (yalnız taslak). Davetler: yeniden gönder (eskisi iptal), iptal.

Kurallar: varsayılan soft delete; ilişkiler korunur; kullanıcı kendini silemez;
son aktif HYPER_ADMIN ve kurumun son aktif kurum sahibi korunur; HYPER_ADMIN'i
yalnız HYPER_ADMIN yönetir; hard delete yalnız hiç giriş yapmamış, öğretmen/öğrenci
bağlantısı ve audit izi olmayan kullanıcıda ve db modunda.

### Rol / permission matrix

`src/lib/platform/permission-matrix.ts`: kaynak (27) × aksiyon (read/create/update/
delete/approve/export/invite/manage/configure) × kapsam (platform ⊇ tenant ⊇ branch ⊇
assigned ⊇ own). Sistem rolleri salt-okur (`/platform/roller`); kurum özel rolleri
`/platform/kurumlar/[id]/roller` — platform kapsamı ve platform-only kaynaklar
(paket, entitlement, feature flag, destek erişimi, platform markası, mobil policy)
yasak; anahtar sistem rol adıyla çakışamaz; kayıt etki önizlemesi (etkilenen
kullanıcı/şube, eklenen/kaldırılan izin, açılan/kapanan ekran, kritik risk) +
onay + audit. Ekran yetkisi serbest route ile değil `SCREEN_REGISTRY` üzerinden.

**Kapsam notu:** NeviiOS menüleri/API'leri, `/sube` ve BRANCH_MANAGER tool kapıları
matrix resolver'ı kullanır. Legacy panel araçları hâlâ `requireRole` + `rbac.ts`
ile korunur; özel roller legacy panel araçlarına ek yetki vermez.

### BRANCH_MANAGER V1 izin seti (yalnız atanmış şubeler)

| Kaynak | Aksiyon | Uygulama noktası |
|---|---|---|
| Öğrenci | read, temel update (telefon, veli, seviye, hedef sınav, notlar, dönem, iletişim tercihi) | `updateStudentProfileTool` — ad/kimlik/ücret/şube taşıma reddedilir |
| Ders programı | read, create, update | `createLessonTool` (derslik + öğrenci şubesi), `updateLessonScheduleTool` |
| Yoklama | read, create, update | `markAttendanceTool` |
| Telafi | read, create, update | `createMakeupLessonTool`, `confirmMakeupLessonTool` |
| Öğretmen | read | `/sube` özeti |
| Duyuru | read, create, update | `createAnnouncementTool` — yalnız `audienceType: branch` + kendi şubesi |

Verilmeyenler: finans özeti, tahsilat, sözleşme/ödeme policy, personel, kullanıcı
silme, rol matrisi, paket/entitlement/feature flag, kurum/platform ayarları, audit,
destek erişimi, export, tenantlar arası erişim. Kurum geneli API ve panel server
action'ları 403 kalır. Kapı: `assertBranchOperation` = matrix grant + aktif
UserBranchAccess + hedef kaydın şubesi.

### Mobil platform policy

Ayarlar (`mobile.*`, platformOnly): genel, iOS, Android, öğrenci/veli, öğretmen,
yönetici portalı, bakım mesajı, minimum sürüm (semver), push politikası.
Efektif karar: `entitlement(mobileApp) AND feature flag AND mobile.appEnabled AND
platform AND rol portalı AND tenant`. Store API'si, build, gerçek push yok;
push `providerConfigured:false, active:false` döner.

**Mobil sözleşme (contractVersion 1):**

```
GET /api/v1/mobile/policy?platform=ios|android&appVersion=x.y.z
Authorization: Bearer <access token>
→ { allowed, reasons[], platform, maintenance{active,message},
    minVersion{ios,android}, updateRequired, push{policy,providerConfigured,active,note},
    contractVersion: 1 }
```

### Paket ve limit policy

| Paket | Aktif öğrenci | Operasyon kullanıcısı | Şube | Fiyat |
|---|---:|---:|---:|---|
| Starter | 100 | 3 | 1 | Yayınlanmadı |
| Core | 300 | 10 | 2 | Yayınlanmadı |
| Pro | 750 | 25 | 5 | Yayınlanmadı |
| Scale | 2.000 | 75 | 15 | Yayınlanmadı |
| Enterprise | özel | özel | özel | Özel teklif |

`standard`/`professional` legacy anahtarlar mevcut kurumlar için korunur, yeni
kurumda seçilemez. Operasyon kullanıcısı = kurum sahibi/yönetici/şube müdürü/öğretmen
(öğrenci/veli portal hesapları sayılmaz). Limit aşımı veri silmez; yalnız yeni
öğrenci kaydı, yeni davet ve yeni şube durur. Limit override süreli + gerekçeli:
`{"students": {"value": 500, "reason": "…", "expiresAt": "ISO"}}`; süresi dolan
override yok sayılır; her değişiklik audit + sürüm.

### Kritik politika: Taslak → Etki önizleme → Yayınla → Audit → Geri al

Kapsam: `appearance.*`, `platform.logo`, `features.overrides` (modül politikası),
`subscription.*`, `forms.studentRegistration`, `mobile.*`, `policy.*`.
Her yayın (doğrudan kayıt dahil) yeni `PolicyVersion`; önceki `superseded`.
Geri alma eski kaydı silmez — hedef sürümün değerini kopyalayan yeni sürüm
(`rollbackOfVersion`) + gerekçe (≥10 karakter) + `platform.policy.rollback` audit.
Ekran: `/platform/kurumlar/[id]/surumler`, logo için `/platform/marka`.
API: `GET|POST /api/v1/platform/policies?scope=<tenantId|platform>` (op: draft,
preview, publish, discard, rollback). Şube override'ları sürümlenmez.

### Tur 2 migration (UYGULANMADI)

`20260912120000_neviios_round2` — `User.displayName/deletedAt/lastLoginAt/
sessionsRevokedAt` (nullable), `PolicyVersion`, `TenantCustomRole`,
`UserRoleAssignment`, `PasswordResetToken`. Rollback (veri kaybı!): DROP TABLE
sürüm geçmişini/özel rolleri/sıfırlama bağlantılarını siler; `DROP COLUMN
"deletedAt"` silinmiş kullanıcıları yeniden görünür yapar, `DROP COLUMN
"sessionsRevokedAt"` iptal edilmiş oturumları yeniden geçerli kılabilir —
rollback öncesi silinmiş kullanıcıları `active=false` yapın ve yedek alın.

### Tur 2 API sözleşmeleri (NeviiHub web / mobil)

| Uç | Kim | Amaç |
|---|---|---|
| `GET /api/v1/mobile/policy` | kurum rolleri (Bearer) | Mobil efektif policy |
| `GET /api/v1/branding/platform-logo` | public | Global platform logosu (302 fallback `/brand/icon.png`) |
| `GET/POST /api/v1/sube/[overview\|attendance\|students\|lessons\|lesson-schedule\|makeups\|makeup-confirm\|announcements]` | BRANCH_MANAGER | Şube operasyonları |
| `POST /api/v1/password-reset` | public (token) | Yönetici başlatmalı şifre sıfırlama tamamlama |
| `POST /api/v1/account/change-password` | oturum | Şifre değişimi + diğer oturumları düşürme |
| `GET/POST /api/v1/platform/{users,search,policies}`, `/tenants/[id]/roles` | HYPER_ADMIN | NeviiOS yönetimi |

Web tarafı ayrıca: panel `UserMenu` hızlı tema seçimi politika dışı profil
gönderirse sunucu yok sayar (render politikayı uygular) — web menüsü de
`isProfileAllowed` ile seçenekleri kapatmalı.

### Tur 2 manuel test

```bash
npm run build
JWT_SECRET=<16+ karakter> AUTH_HYPER_ADMIN_EMAIL=hyper@nevii-hub.test \
AUTH_HYPER_ADMIN_PASSWORD=<16+ karakter> STORE_MODE=json npx next start -p 3107
```

1. Platform sahibiyle giriş → sol üst logo `/brand/icon.png`, menüde "Yeni kurum" yok; Kurumlar → "Yeni kurum oluştur".
2. ⌘K → "nil" yaz → kurum + şube; "nilufer" → kullanıcı (e-posta maskeli).
3. Sağ üst avatar → menü; ↑/↓ ve Escape; Koyu tema; Profilim → şifre formu.
4. Kullanıcılar → Ezgi → Pasifleştir (gerekçe) → Ezgi ile giriş denemesi reddedilir; "Silinmiş/Pasif" filtreleri.
5. Nilüfer'i pasifleştirmeyi dene (Süper Admin ikinciyi pasifleştirdikten sonra) → "son aktif kurum sahibi".
6. Kurum → Kullanıcı & Rol → admin@ hesabına Erzene şube erişimi; Özel Roller → rapor rolü oluştur, etki önizlemesi.
7. Kurum → Mobil → iOS önizlemesi "Paket mobil uygulamayı içermiyor"; Paket & Limit → `subscription.addons=["mobileApp"]` → mobil ayarları aç → önizleme "izinli".
8. Kurum → Sürümler → `appearance.mode` taslağı `"dark_only"` → önizle → yayınla → geçmişte "Bu sürüme dön".
9. Platform markası → logo yükle → ikinci logo → geçmişte ilk sürüme dön.

---

## Tur 3 (2026-09-11) — rol, release, canlı operasyon, paket fiyatlama, senkron

### Owner kararı: roller

| Rol | Kapsam | Personel | Finans özeti | `/platform` |
|---|---|---|---|---|
| HYPER_ADMIN | Tüm NeviiOS | — (kurum paneline girmez) | — | Evet |
| SUPER_ADMIN | Yalnız kendi kurumu | **Evet** | **Evet** | 403/404 |
| SCHOOL_ADMIN | Kurum geneli operasyon | Hayır | Hayır | 403/404 |
| BRANCH_MANAGER | Preset'e göre (aşağıda) | Hayır | Hayır | 403/404 |

**Yönetici izin preset'i** (`access.managerPreset`, kurum ayarı, platformOnly,
kritik → sürüm + audit): `unified` = BRANCH_MANAGER efektif olarak SCHOOL_ADMIN
izin setini kullanır; `branch_scoped` = tur 2 davranışı (yalnız atanmış şube,
`/sube`). Çözüm: açık kurum ayarı → owner varsayılanı (`OWNER_UNIFIED_MANAGER_TENANTS`
= Nilüfer Acar / `DEFAULT_TENANT_ID` → `unified`) → platform varsayılanı
(`branch_scoped`). Okuma hatası → `branch_scoped` (dar olan, fail-closed).

Uygulama noktası TEK: efektif rol oturum bağlamı kurulurken çözülür
(`authenticateRequest` + `getSessionContext` → `resolveEffectiveRole`).
`ServiceContext.role` = efektif rol, `loginRole` = token'daki rol (etiket/audit).
Böylece `rbac.ts`, tool `requireRole`, `canAccessStudent`, panel layout, server
action kapısı ve matris resolver'ı aynı kararı verir. JWT ve `User.role`
değişmez; rol adları silinmez/birleşmez. Ayrıştırmak = preset'i
`branch_scoped` yapmak (Roller ekranı → önizleme → gerekçe → onay).

**Personel + finans özeti kısıtı (sunucu kanıtı):**

| Katman | Nokta |
|---|---|
| Servis/tool | `requireStaffSensitiveAccess` = yalnız SUPER_ADMIN → personel, özlük, bordro, izin, avans, IBAN, gider, tekrarlayan gider, bütçe, `getFinanceSummaryTool`; global aramadaki personel sonuçları |
| API | `/api/v1/people/reveal-staff-iban` (tool 403), tüm finans/personel uçları tool üzerinden |
| Server action | `actions.ts` personel/bordro/gider aksiyonları aynı tool'ları çağırır |
| Route | `/panel/personel`, `/bordrolar`, `/izinler`, `/[staffId]`, `/panel/finans-ozeti` → `session.role !== "SUPER_ADMIN"` redirect |
| Menü / ⌘K | `panel-nav.ts`, `command-palette.tsx` → `roles: ["SUPER_ADMIN"]` |
| Permission resolver | Matris: SCHOOL_ADMIN (ve unified BRANCH_MANAGER) `staff` / `finance_summary` grant'i yok; özel rol bu kaynakları alamaz (`OWNER_ONLY_RESOURCES`) |
| Bildirim | İzin bildirimleri (`leave_new_request`, `leave_pending_approval`) yalnız SUPER_ADMIN'e |

### Rol matrisi (`/platform/roller`)

`GET/POST /api/v1/platform/roles` (HYPER_ADMIN): rol başına kullanıcı sayısı +
listesi (e-posta maskeli), efektif grant'ler, erişilen ekranlar
(`SCREEN_REGISTRY`, panel ekranları dahil), modül ↔ izin ilişkisi
(`FEATURE_RESOURCE_MAP`). Kurum seçilince: sistem rolü değiştirme (mevcut
`members/role` önizleme + onay + audit; db-only yazım), özel rol atama/kaldırma,
özel role registry kimliğiyle ekran ekle/çıkar (`screen_toggle` → ekranın
`requires` grant'i → `saveCustomRole` önizleme + onay + audit, önceki/yeni değer),
yönetici preset'i (önizleme: etkilenen kullanıcılar, açılan/kapanan ekranlar →
gerekçe → onay → `platform.role.preset_change` + `platform.setting.update` +
PolicyVersion). Platform ekranı ve platform kapsamı kurum rolüne verilemez;
HYPER_ADMIN ve diğer sistem rollerinin grant'leri kodda sabittir (UI düzenleyemez).

### Canlı operasyon (`/platform/operasyon/aktif-oturumlar`)

- Girişte `UserSession` satırı açılır; kimliği (`sid`) JWT'ye gömülür, refresh
  boyunca korunur, refresh ömrü uzatır. Çıkış satırı kapatır.
- `isSessionClaimValid` sid'i kontrol eder: kayıt yok/iptal/başka kullanıcı →
  red (fail-closed). 5 sn önbellek; aynı süreçte iptal anında etkili.
  sid'siz (tur 3 öncesi) token'lar yalnız kullanıcı düzeyi kontrole tabidir.
- Tekil sonlandırma (`revoke`) ve tüm oturumlar (`revoke_all` = kullanıcı
  düzeyi kesme anı + satırları kapat; hesap aktif kalır). Pasifleştirme de
  satırları kapatır. Kendi oturum(lar)ınız buradan kapatılamaz.
- Presence: süreç içi Map (son görülme, son ekran = middleware'in eklediği
  `x-neviios-path` başlığı — sorgu dizesi asla, son işlem = API metodu+yolu);
  en fazla 5 dk'da bir satıra yazılır. Audit tablosuna presence yazılmaz.
  Cihaz: "Chrome · macOS" özeti; ham user-agent/IP saklanmaz.
- Pasifleştir/aktifleştir, davet iptal/yeniden gönder, şifre sıfırlama mevcut
  `/api/v1/platform/users` işlemleridir (soft delete varsayılan; son aktif
  HYPER_ADMIN ve son aktif kurum sahibi korunur; hard delete yalnız db'de,
  hiç giriş/oturum/kurum AuditLog aktörlüğü/platform audit izi yoksa).

### Release & operasyon merkezi

`/platform/release-merkezi`, `/platform/surumler`, `/platform/deploymentlar`;
`GET/POST /api/v1/platform/releases`.

- **Commit ≠ release ≠ deployment.** Commit Git'te yaşar (yalnız SHA/branch/PR
  referansı). Release (`ReleaseManifest`) bilinçli yayın kararıdır. Deployment
  (`DeploymentRecord`) bir commit'in bir ortama dağıtımıdır; release'e opsiyonel bağlanır.
- Kaynak etiketi zorunlu: `manual` | `signed_ci_event` | `provider`. V1'de
  GitHub/Vercel API çağrısı veya webhook kaydı YOK. Çalışan sürüm yalnız
  sağlayıcı runtime env'inden (`VERCEL_GIT_COMMIT_SHA` vb.); yoksa "bilinmiyor".
- Migration durumu: repo klasörleri + (yalnız db) `_prisma_migrations`
  salt-okur sorgusu. Ekran migration uygulamaz.

**İmzalı CI olayı (tasarım + alıcı hazır, kapalı):**
`POST /api/v1/platform/releases/events`, başlık
`x-neviios-signature: t=<unix>,v1=<hex(HMAC-SHA256(RELEASE_EVENT_SECRET, "<t>.<rawBody>"))>`,
5 dk tolerans, `eventId` ile tekrar koruması. `RELEASE_EVENT_SECRET` yoksa 503.
Olay tipleri: `release.created { eventId, release: ReleaseManifestInput }`,
`deployment.reported { eventId, deployment }`. Önerilen GitHub Action adımı:

```bash
BODY=$(jq -nc --arg sha "$GITHUB_SHA" --arg ref "$GITHUB_REF_NAME" \
  '{type:"deployment.reported",eventId:"gh-\(env.GITHUB_RUN_ID)",deployment:{product:"neviihub",environment:"preview",commitSha:$sha,branch:$ref,status:"ready"}}')
T=$(date +%s); SIG=$(printf '%s.%s' "$T" "$BODY" | openssl dgst -sha256 -hmac "$RELEASE_EVENT_SECRET" -hex | cut -d' ' -f2)
curl -fsS -X POST "$NEVIIOS_URL/api/v1/platform/releases/events" -H "x-neviios-signature: t=$T,v1=$SIG" --data "$BODY"
```

**Vercel adaptör sözleşmesi:** `DeploymentProviderStatus { provider, configured,
lastSyncAt, note }`; gerçek adaptör server-side token ile deployment listesini
okuyup `source: "provider"` kaydı yazar. V1 `configured: false`.

### Log retention (`/platform/operasyon/log-politikasi`)

| Kategori | Depo | Politika |
|---|---|---|
| Finans/sözleşme/tahsilat audit | AuditLog | **Asla silinmez** (kritik) |
| Rol/izin audit | PlatformAuditEvent | **Asla** |
| Destek erişimi | PlatformAuditEvent + SupportAccessSession | **Asla** |
| Platform ayar/paket/release audit (temizlik raporları dahil) | PlatformAuditEvent | **Asla** |
| Güvenlik/giriş olayları | AuditLog (auth.*, csrf, authz.denied) | 365 gün → sil |
| Oturum/presence | UserSession (kapalı) + PasswordResetToken (kullanılmış/dolmuş) | 30 gün → sil |
| API telemetrisi | AuditLog (`auth.success`, `auth.refresh_success`) | 30 gün → say (özet audit'e) → sil |
| Hata logları | AuditLog (`api.error`) | 90 gün → say → sil |
| Debug | yalnız stdout (`AUDIT_LOG_DEBUG=1`) | kalıcı değil |

Silme yalnız allowlist'teki aksiyonlarla (`action IN (...)`); bilinmeyen
aksiyon kritik sayılır. Süreler `retention.days` platform ayarı (7–3650 gün;
kritik kategori anahtarı şemada yok). İş: dry-run varsayılan, rapor
(kategori başına etkilenen/silinen + aksiyon sayımı) ve her çalıştırmada
kalıcı audit (`platform.retention.dry_run` / `.cleanup`). Panelden gerçek
silme onay ister. Zamanlanmış iş sözleşmesi `SCHEDULED_JOBS`
(`0 3 * * *`, `POST /api/v1/platform/jobs/retention`, `Bearer $RETENTION_CRON_SECRET`,
secret yoksa 503, `?apply=1` olmadan dry-run). Gerçek cron kurulmadı.

**Büyük tablolar:** `AuditLog` için aylık range partition (`createdAt`),
`(tenantId, action, createdAt)` indeksi korunur + `createdAt` BRIN; telemetri
partition'ı `DROP PARTITION` ile düşer (satır bazlı DELETE yerine). Kritik
kategoriler ayrı tabloya (ör. `FinanceAuditLog`) taşınırsa retention işi o
tabloya hiç dokunmaz. Arşiv: silinmeden önce Parquet/JSONL olarak private
object storage'a yazılır (V1'de yok). Mevcut `auth.success` her kimlik
doğrulamalı istekte AuditLog'a yazıyor — hacim büyürse örneklemeye veya
yalnız metrik sayacına indirilmelidir.

### Paket, modül ve fiyat motoru (`/platform/paketler`)

Katalog = platform kapsamında tek sürümlü belge (`PolicyVersion`, anahtar
`commercial.catalog`). Düzenleme taslakta birikir (internal fiyat);
önizleme → onay → yayın (kullanıcıya görünen) → geri alma (yeni sürüm).
Her taslak değişikliği `platform.catalog.*` audit'i (önceki/yeni değer).

- Paket: ad, açıklama, durum (aktif/pasif), limitler (öğrenci/operasyon
  kullanıcısı/şube; null = özel), dahil modüller, fiyatlama (liste/özel teklif),
  temel aylık/yıllık fiyat (TRY kuruş), fiyat yayında mı.
- Modül: ad, açıklama, aktif, aylık/yıllık ek fiyat, kullanım limiti + birim,
  eklenti olarak satılabilir mi; "pakette dahil mi" paket tanımından.
- Fiyat: `temel + dahil aktif modüller + seçili eklentiler ± (yüzde/tutar
  indirimi | toplam override)`; tam sayı kuruş; KDV hesaplanmaz ("KDV hariç").
  Dahil modül eklenti olamaz; pasif/satılamaz modül eklenti olamaz.
- Yerleşik 7 paket (starter…enterprise + legacy standard/professional) silinemez,
  yalnız pasifleştirilir; legacy paketlere yeni abonelik yok. Aktif aboneliği
  olan özel paket silinemez (önce pasifleştir + kurumları taşı); yayın
  önizlemesi de aktif aboneliği olan paketin kaldırılmasını engeller.
- **Abonelik snapshot'ı** (`subscription.snapshot`, kurum ayarı): paket
  atamasında (kurulum veya paket değişimi) yayındaki katalogdan kopya. Limit
  ve paket modülleri önce snapshot'tan çözülür → katalog değişiklikleri yalnız
  yeni aboneliklere uygulanır. Snapshot'ı olmayan eski kurumlar koddaki
  yerleşik tanımla çözülür (davranış değişmez).
- Public fiyat listesi: `GET /api/v1/catalog/plans` — yalnız yayındaki katalog,
  yalnız aktif + legacy olmayan paketler, fiyatı yayınlanmamışsa "Yayınlanmadı".

### NeviiOS ↔ NeviiHub senkron ilkesi

- NeviiOS config/policy'nin **tek sahibi**; NeviiHub günlük operasyon verisinin
  **tek sahibi**. Çift yönlü tam DB senkronu yok: NeviiHub config'i okur (pull).
- `configVersion` = platform + kurum kapsamındaki sürümlenen politika
  anahtarlarının en yüksek sürümlerinin toplamı (her yayın/geri alma artırır,
  monoton). `etag` = içeriğin SHA-256 özeti (sürümlenmeyen ayarları da yakalar).
- Kritik değişiklik: taslak → etki önizleme → yayın → audit → geri al; geri
  alma eski kaydı silmez, önceki değeri kullanan yeni sürüm üretir.

### NeviiHub'ın tükettiği API sözleşmeleri

| Uç | Kim | İçerik |
|---|---|---|
| `GET /api/v1/config/snapshot` (`If-None-Match` → 304, `ETag`, `X-Config-Version`) | kurum rolleri (tenant JWT'den); HYPER `?tenantId=` | `ConfigSnapshot` (aşağıda) |
| `GET /api/v1/mobile/policy?platform=&appVersion=` | kurum rolleri | `MobilePolicyDecision` (+ `configVersion`, additive) |
| `GET /api/v1/branding/platform-logo` | public | 302 → `/brand/icon.png` fallback |
| `GET /api/v1/catalog/plans` | public | yayınlanmış paket/fiyat listesi |

```ts
type ConfigSnapshot = {
  contractVersion: 1; tenantId: string; configVersion: number; etag: string; generatedAt: string;
  appearance: { mode; fixedTheme; fontPolicy };                       // appearance policy
  branding: { platform: { name; logoUrl; fallbackLogoUrl };           // platform branding
              institution: { name; logoUrl; colorPrimary; colorAccent; loginMessage } };
  mobile: { appEnabled; iosEnabled; androidEnabled; studentPortalEnabled; teacherPortalEnabled;
            adminPortalEnabled; maintenanceMessage; minVersion: { ios; android };
            pushPolicy: "disabled" | "allowed"; pushProviderConfigured: false };
  features: { key; enabled; entitled; source }[];                     // feature/entitlement
  subscription: { planKey; limits: { students; users; branches } };
  forms: { studentRegistration: StudentFormConfig };                  // form config
  access: { managerPreset: "unified" | "branch_scoped" };
  viewer: { userId; role /* efektif */; loginRole; permissions: string[];
            screens: { id; path }[] } | null;                         // user/role/scope
};
```

NeviiHub kuralları: rol kararını `viewer.role` (efektif) ile verir, etikette
`loginRole` gösterir; `configVersion` artınca önbelleği tazeler; config'i
yerelde değiştirmez.

### Tur 3 migration (UYGULANMADI)

`20260913120000_neviios_round3` (zaman damgası, tur 2 migration'ından sonra sıralansın diye ileri tarihli) — yalnız `CREATE TABLE IF NOT EXISTS`:
`UserSession`, `PlatformRelease`, `PlatformDeployment` (ALTER/DROP yok).
Katalog, retention politikası ve preset mevcut `SettingOverride` +
`PolicyVersion` tablolarını kullanır. Rollback: tabloları düşürmek oturum,
release ve deployment geçmişini siler; **kod geri alınmadan `UserSession`
düşürülürse sid taşıyan açık token'lar fail-closed reddedilir** (kullanıcılar
yeniden giriş yapar). Deploy sırası: migration → kod.

### Tur 3 manuel test

```bash
npm run build
VERCEL=1 STORE_MODE=json JWT_SECRET=<16+> AUTH_HYPER_ADMIN_EMAIL=hyper@nevii-hub.test \
AUTH_HYPER_ADMIN_PASSWORD=<16+> npx next start -p 3137   # veri: /tmp/notaplan-data
```

1. Ezgi (`ezgi.guclu@…`/`demo-manager-ezgi`) ve Nihal (`nihal.gedikli@…`/`demo-manager-nihal`)
   → `/panel`, öğrenci/ödeme/program/yoklama/telafi açılır; `/panel/personel`,
   `/panel/finans-ozeti` → `/panel`'e döner; menüde görünmez; Nihal `/sube` → `/panel`.
2. Nilüfer → personel ve finans özeti açılır.
3. Platform sahibi → Roller → kurum seç → "Şube Müdürü: 1 kullanıcı, efektif:
   Kurum Yöneticisi"; preset'i "Ayrık" yap → önizleme → gerekçe → onay.
4. Canlı operasyon → Ezgi "1 açık" → Sonlandır → Ezgi'nin sonraki isteği 401.
5. Paketler → Core fiyatı gir → public listede "Yayınlanmadı" → Önizle ve yayınla → fiyat görünür.
6. Log saklama → Dry-run → rapor; Onayla ve temizle yalnız kapalı eski oturumları siler.
7. Release merkezi → çalışan sürüm "bilinmiyor" (yerel) / Vercel env; Sürümler → elle kayıt.

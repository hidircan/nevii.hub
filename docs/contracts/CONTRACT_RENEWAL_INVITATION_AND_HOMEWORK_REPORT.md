---
title: "Sözleşme İş Kuralları + Hesap Daveti + Ödev — Teslim Raporu"
date: "2026-08-29"
branch: "main"
worktree: "canonical (worktree KULLANILMADI)"
---

# Sözleşme Trial/Formal Eşiği + Hesap Daveti (E-posta) + Üretim Hazırlığı — Teslim Raporu

Bu rapor `main` dalında (canonical checkout, `/Users/hidircanyagiz/Projects/notaplan`)
yapılan işi belgeler. Görev talebi 18 madde istiyordu; bu oturum **büyük ölçüde
zaten tamamlanmış bir öncekiyle AYNI GÜN yapılmış** iş üzerine inşa edildi — bkz. §1.

---

## 1. Mevcut sözleşme uygulamasının denetimi (Faz 0)

Çalışmaya başlamadan önce repo denetlendi ve **AYNI GÜN, bu oturumdan önce**
çalışmış başka bir arka plan oturumunun zaten şunları eklediği tespit edildi
(hâlâ commit edilmemiş, çalışma ağacında):

- Versiyonlu `StudentContract` modeli + yenileme zinciri + fiyat garantisi/immutable
  snapshot + admin/öğrenci-veli UI + PDF/yazdır/ıslak-imza/imzalı-tarama akışı +
  27 test (`src/lib/__tests__/contracts.test.ts`).
- Ödeve ses dosyası eki (mp3/m4a/aac/wav/ogg) + 12 test.
- Ödev son teslim tarihi güncelleme (öğretmen, audit'li) + 8 test.
- Tam rapor: `docs/contracts/CONTRACT_RENEWAL_AND_HOMEWORK_FEATURE_REPORT.md`
  (§1–§17, korunmuş — bu rapor onu TEKRARLAMAZ, yalnızca referans verir).

**Boşluk analizi** (bu oturumun asıl işi buradan başladı):

| Gereksinim | Önceki durum | Bu oturumda |
|---|---|---|
| 1-2 ay trial ≠ formal sözleşme | YOK — her süre (1-12 ay) aynı şekilde DocumentInstance/PDF üretiyordu | ✅ Eklendi (§2) |
| Hesap daveti (öğretmen/öğrenci/veli), düz metin şifre YOK | YOK — yalnızca "admin'e geçici şifre göster, elden ilet" (task #34) | ✅ Eklendi (§3), eski yol FALLBACK olarak korundu |
| `docs/launch/ADMIN_WEB_PRODUCTION_READINESS.md` | YOK | ✅ Eklendi (§5) |
| Yeni öğrenci kaydı formuna "Kayıt ve Ödeme Planı" TAM entegrasyonu | Kasıtlı olarak AYRI bırakılmış (önceki rapor §7/§16.5) | Değişmedi — bkz. §7, kasıtlı bir tasarım kararı, bu oturumda yeniden değerlendirilmedi |

**DOCX kaynağı:** Kullanıcı onayıyla (`AskUserQuestion`), `docs/contracts/student-enrollment-contract-template.md`
tek otoriter hukuki kaynak olarak kabul edildi — DOCX dosyası bu oturumda ayrıca
aranmadı (önceki oturum zaten bulup dönüştürmüştü, bkz. önceki rapor §1).

## 2. Sözleşme iş kuralları — trial (1-2 ay) vs. formal (3-12 ay)

`src/lib/contracts.ts`, yeni `isFormalContractDuration(durationMonths) => durationMonths >= 3`:

- **1-2 ay:** `StudentContract.status = "recorded"` (yeni durum), `documentInstanceId`/
  `templateVersion` **NULL** — formal PDF/DocumentInstance ASLA üretilmez. Taksit/ödeme
  planı YİNE DE oluşturulur (gerçek `Payment` satırları, mevcut motorlar üzerinden —
  değişmedi). Sözleşme numarası yine de üretilir (`buildDocumentReference("trial_enrollment_record", ...)`,
  mevcut deterministik referans üreticisi yeniden kullanıldı) — izlenebilirlik için,
  hukuki belge OLMADAN.
- **3-12 ay:** Değişmedi — `status="generated"`, tam `DocumentInstance`/PDF/yazdır/
  ıslak-imza/imzalı-tarama akışı.
- **Yenileme/uzatma:** AYNI eşik yeni sözleşmenin süresine (önceki sözleşmenin
  değil) uygulanır — +1/+2 ay uzatma = trial (formal belge YOK), +3/+4/+6/+12 =
  yeni formal sözleşme versiyonu. Önceki sözleşme (trial veya formal fark etmez)
  her zaman `superseded` olur, İÇERİĞİ değişmez.
- **Yazdırma/ıslak-imza/imzalı-tarama tool'ları** (`printStudentContractTool`,
  `markStudentContractWetSignaturePendingTool`, `uploadStudentContractSignedScanTool`,
  `getContractHtmlTool`, `getContractSignedFileTool`) trial kayıtlarda YENİ bir
  `TrialContractHasNoDocumentError` ile `VALIDATION_ERROR` döner — "sözleşmeymiş
  gibi" davranılmaz.
- **Admin UI** (`src/components/contract-panel.tsx`): süre seçilirken canlı
  "Tanışma Paketi — Sözleşme gerekmiyor" / "Resmi Sözleşme Gerekli" rozeti, buton
  metni ("Tanışma Kaydını Oluştur" vs "Sözleşmeyi Oluştur"), trial satırlarda
  "Görüntüle/Yazdır" linki yerine "Tanışma paketi — resmi sözleşme belgesi yok."
  notu, yazdır/ıslak-imza/imzalı-yükle aksiyonları zaten `status` koşuluna bağlı
  olduğundan trial satırlarda kendiliğinden görünmez.
- **Öğrenci/veli portalı** (`/ogrenci/sozlesmelerim`, `/veli/sozlesmelerim` →
  aynı sayfaya yönlenir): trial kayıtlarda PDF linki yerine aynı açıklayıcı not.

**Schema/migration:** `prisma/schema.prisma` — `documentInstanceId`/`templateVersion`
nullable yapıldı; yeni `"recorded"` durumu (untyped `String` kolon, migration
gerektirmedi). Yeni migration:
`prisma/migrations/20260828210000_contract_trial_optional_document/migration.sql`
(`ALTER COLUMN ... DROP NOT NULL` × 2) — `prisma validate`/`generate` yeşil,
**hiçbir hedefe deploy edilmedi** (bkz. §15).

## 3. Hesap daveti (öğretmen/öğrenci/veli) — GERÇEK e-posta akışı

**Kural (görev talebi): mevcut şifre sıfırlama/davet altyapısı yeniden kullanılmalı,
tekrar edilmemeli.** Bu oturum YENİ bir token tablosu/mekanizması EKLEMEDİ:

- `src/lib/auth/password-reset.ts` — `createPasswordResetToken` artık opsiyonel
  `ttlMs` parametresi alıyor (varsayılan 30 dk, değişmedi — geriye dönük uyumlu).
  Davet, AYNI fonksiyonu 7 günlük TTL ile çağırır (`src/lib/auth/invitation.ts`).
  Token: 8 haneli, elle-yazılabilir, sha256 hash'li, tek kullanımlık — hiç
  değişmedi.
- `POST /api/v1/auth/accept-invitation` (yeni route) — `POST /api/v1/auth/reset-password`
  ile **AYNI** `consumePasswordResetToken`/`updatePasswordHash` çağrısını yapar;
  tek farkı, kabul sonrası `activatePendingPortalAccessForUser` ile o kullanıcının
  bekleyen (`invited`) `StudentPortalAccess` satırlarını `active` yapması (veli/
  öğrenci portalı için — öğretmen davetinde no-op).
- `src/lib/student-portal-access.ts`'teki **önceden `@deprecated` işaretli**
  `inviteStudentPortalAccess`/`activateStudentPortalAccess` primitifleri (task #34'te
  "gerçek bir e-posta davet akışı eklenirse kullanılmak üzere KORUNUYOR" notuyla
  bırakılmıştı) artık GERÇEKTEN kullanılıyor — tam olarak öngörüldüğü gibi.
- `src/lib/email/*` (yeni) — `src/lib/sms/config.ts`/`transport.ts` ile AYNI desen
  (sağlayıcı seçimi, "configured" kontrolü, test-injection noktası). SMTP
  yapılandırılmamışsa (bu ortamda YAPILMADI) "console" sağlayıcıya düşer: e-postayı
  LOGLAR, `{delivered:false, blocked:true, reason:"EMAIL_PROVIDER_NOT_CONFIGURED"}`
  döner — **ASLA sahte başarı göstermez** (görev kuralı, testle doğrulandı).
  SMTP dalı `nodemailer` ile (yeni bağımlılık, standart/protokol-seviyesi bir iş
  için elle SMTP yazmak yerine) — bu ortamda gerçek kimlik bilgisi olmadığı için
  UÇTAN UCA canlı bir sunucuya karşı TEST EDİLEMEDİ (bkz. §12 blocker).
- **Yeni tool'lar:** `inviteStudentPortalAccessTool` (öğrenci/veli, mevcut
  `provisionStudentPortalAccessTool`'un yanına — admin ikisinden birini seçer),
  `inviteTeacherAccountTool`. İkisi de yalnızca `SCHOOL_ADMIN`/`SUPER_ADMIN`,
  e-posta başına saatte 5 davetle rate-limited (`isRateLimited`, mevcut primitif),
  her gönderim `audit()`'lenir.
- **UI:** `src/components/student-profile-editor.tsx` (Öğrenci Portalı erişimi
  widget'ına "Yöntem: E-posta ile davet / Anında erişim" seçici eklendi — eski
  davranış KALDIRILMADI, yedek olarak durur) ve `src/components/teacher-profile-editor.tsx`
  (yeni "Öğretmen Portalı erişimi" widget'ı). Yeni public sayfa:
  `/hesap-aktivasyon` (`src/app/hesap-aktivasyon/page.tsx` +
  `src/components/accept-invitation-form.tsx`) — token'ı query'den alır, yeni
  şifre formunu gösterir, `/login`'e yönlendirir.
- **Rol asla yükseltilemez:** `accept-invitation` şeması yalnızca `{token, newPassword}`
  kabul eder; gövdeye eklenen fazladan `role` alanı zod tarafından sessizce
  atılır — testle doğrulandı (`account-invitation.test.ts`, "rol davet kabulünde
  ASLA yükseltilemez").
- **Supabase/paralel auth sistemi:** Denetlendi — Supabase yalnızca dosya
  depolama (`src/lib/storage/supabase-adapter.ts`) için kullanılıyor,
  `supabase.auth`/`signInWithPassword` HİÇBİR YERDE yok. JWT-çerez tabanlı auth
  (`src/lib/auth/*`) TEK sistem — paralel bir Supabase Auth EKLENMEDİ.

## 4. Ödev özellikleri (Faz 5)

**Bu oturumda dokunulmadı** — ses eki ve son tarih güncelleme önceki, aynı günkü
oturumda tamamlandı (bkz. §1 tablosu, ilgili rapor §9-10). Bu oturum yalnızca
regresyon açısından yeniden doğruladı: `homework-audio-attachment.test.ts` (12/12)
ve `homework-due-date-update.test.ts` (8/8) tam test paketinin parçası olarak
YİNE geçti (bkz. §16).

## 5. Üretim hazırlığı raporu

`docs/launch/ADMIN_WEB_PRODUCTION_READINESS.md` (yeni) — release blocker'lar,
gerekli env değişkenleri, backup/restore prosedürü (mevcut `DEVOPS_GUIDE.md`/
`DATABASE_ARCHITECTURE.md`'ye referansla, TEKRARLANMADAN), migration checklist,
rollback, seed/demo politikası, davet/e-posta test planı, veri-kaybı-önleme planı,
izleme/alarm planı, admin portal kabul kontrol listesi, aşamalı yayın planı.
Ayrıca **mevcut iki dokümandaki güncel-olmayan iki iddia** doğrulanıp düzeltme
notu eklendi: `PRODUCTION_AUDIT.md`'nin "CI/test yok" iddiası (Temmuz tarihli,
artık yanlış — `.github/workflows/ci.yml` ve 200+ test dosyası var) ve
`DEVOPS_GUIDE.md`'nin MySQL/MariaDB varsayımı (repo Postgres'e geçmiş,
`prisma/schema.prisma` `provider = "postgresql"`).

## 6. Trial vs formal iş kuralı (özet — Faz 1A/1B/D)

- 1-2 ay → trial, formal PDF YOK, ödeme planı kaydedilir.
- 3-12 ay → formal, tam PDF/yazdır/imza akışı.
- Fiyat garantisi/immutable snapshot: değişmedi (önceki oturum), trial kayıtlar
  için de AYNI şekilde geçerli (snapshot her iki türde de alınır).
- Yenileme zinciri: değişmedi, eşik yeni sürenin kendisine uygulanır.

## 7. İlk kayıt sözleşmesi akışı

Değişmedi (önceki oturum, bkz. onun raporu §3) — bu oturum yalnızca trial dalını
ekledi. **Kasıtlı olarak yeniden değerlendirilmedi:** yeni öğrenci kaydı formu
(`/panel/ogrenciler/yeni`) ile sözleşme oluşturma TEK bir akışa birleştirilmedi
— önceki oturumun bilinçli tasarım kararı (risk/kapsam gerekçesiyle, mevcut
~330 satırlık `actionAddStudent`'a dokunmama) bu oturumda da geçerli kabul
edildi. Kurum isterse ayrı bir iş kalemi.

## 8. Renewal/uzatma akışı

Değişmedi — bkz. §2 (eşik uygulaması) ve önceki rapor §4 (zincir mekaniği).

## 9. Fiyat garantisi ve immutable snapshot politikası

Değişmedi — önceki rapor §3/§5. Trial kayıtlar da `contractDataSnapshot` alır
(§2).

## 10. Admin öğrenci-detay sözleşme yönetimi

Değişmedi (önceki oturum, `src/components/contract-panel.tsx`) — bu oturum
trial/formal farkını gösterecek şekilde GENİŞLETTİ (§2).

## 11. Öğrenci/veli sözleşme erişimi

Değişmedi (önceki oturum) — trial-kayıt mesajı eklendi (§2).

## 12. PDF/yazdırma/ıslak-imza/imzalı-tarama akışı

Değişmedi formal sözleşmeler için — trial kayıtlarda bu akışın TAMAMEN devre
dışı olduğu açıkça uygulandı ve test edildi (§2).

## 13. Ödeme planı davranışı

Değişmedi — taksitler gerçek `Payment` satırları olarak oluşturulur, trial/formal
farketmeksizin (§2).

## 14. Karşılama e-postası / davet / auth kaynak kararı

Bkz. §3. **Kaynak-of-truth kararı:** JWT-çerez auth TEK sistem, mevcut şifre
sıfırlama token altyapısı davete GENİŞLETİLEREK yeniden kullanıldı — paralel bir
sistem KURULMADI.

## 15. SMTP/üretim teslimat engeli

**BLOCKED.** Bu ortamda `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS` yapılandırılmamış.
Kod, bu durumu açıkça `blocked:true` olarak raporlar — asla sahte teslimat
göstermez (testle doğrulandı, `account-invitation.test.ts`). Gerçek kimlik
bilgisi eklenene kadar davet e-postaları GÖNDERİLMEYECEK; admin UI'daki "Anında
erişim" yedek yöntemi hâlâ çalışır durumda tutuldu, kaldırılmadı. Ayrıntı ve
gerekli env değişkenleri: `docs/launch/ADMIN_WEB_PRODUCTION_READINESS.md` §2-3.

## 16. Homework özellikleri

Bkz. §4 — bu oturumda değişiklik yok, regresyonla yeniden doğrulandı.

## 17. Üretim hazırlığı engelleri ve yayın planı

Bkz. `docs/launch/ADMIN_WEB_PRODUCTION_READINESS.md` (tam liste). Özet: (1) üç
bekleyen migration hiçbir hedefe deploy edilmedi, (2) SMTP yok, (3) `APP_BASE_URL`
prod'da set edilmemiş durumda (varsayılan `localhost:3000`'e düşer — kırık link
riski), (4) restore hiç denenmemiş (mevcut, önceden bilinen boşluk).

## 18. Schema/migration durumu

**HİÇBİR migration uygulanmadı** (`prisma migrate deploy`/`db push` ÇALIŞTIRILMADI).

```
$ npx prisma migrate status
Following migrations have not yet been applied:
20260827150458_add_password_reset_token
20260828160000_student_contracts
20260828210000_contract_trial_optional_document
```

`npx prisma validate` → geçti. `npx prisma generate` → geçti (Prisma Client v7.9.1).

---

## Değişen/eklenen dosyalar (bu oturum)

**Yeni:**
- `prisma/migrations/20260828210000_contract_trial_optional_document/migration.sql`
- `src/lib/email/{config,index,transport,types}.ts`
- `src/lib/auth/invitation.ts`
- `src/app/api/v1/auth/accept-invitation/route.ts`
- `src/app/hesap-aktivasyon/page.tsx`
- `src/components/accept-invitation-form.tsx`
- `src/lib/__tests__/account-invitation.test.ts`
- `docs/launch/ADMIN_WEB_PRODUCTION_READINESS.md`
- `docs/contracts/CONTRACT_RENEWAL_INVITATION_AND_HOMEWORK_REPORT.md` (bu dosya)

**Değiştirilen:**
- `prisma/schema.prisma` (`StudentContract.documentInstanceId`/`templateVersion` nullable)
- `src/lib/types.ts` (`ContractStatus` "recorded" eklendi, `StudentContract` alanları opsiyonel)
- `src/lib/contracts.ts` (`isFormalContractDuration`, trial dalı, `TrialContractHasNoDocumentError`)
- `src/lib/services/tools.ts` (`inviteStudentPortalAccessTool`, `inviteTeacherAccountTool`, mevcut sözleşme tool'larında trial guard'ları, preview-plan `isFormal` alanı)
- `src/lib/actions.ts` (`actionInviteStudentPortalAccess`, `actionInviteTeacherAccount`)
- `src/lib/auth/password-reset.ts` (`createPasswordResetToken` opsiyonel `ttlMs`)
- `src/components/contract-panel.tsx`, `src/components/student-profile-editor.tsx`, `src/components/teacher-profile-editor.tsx`
- `src/app/ogrenci/sozlesmelerim/page.tsx`
- `src/lib/__tests__/contracts.test.ts` (yeni trial describe bloğu + varsayılan test girdisi 3 aya çekildi + it.each'e 2 ay eklendi)
- `.env.example` (SMTP/EMAIL_*/APP_BASE_URL eklendi)
- `package.json`/`package-lock.json` (`nodemailer`, `@types/nodemailer`)

**Dokunulmadı:** `src/lib/actions.ts` `actionAddStudent` (bkz. §7), mobil uygulama
(`apps/mobile/**` — yalnızca regresyon kontrolü), ödev ses/son-tarih kaynak kodu
(§4), diğer worktree'ler.

## Test/typecheck/lint/build sonuçları (bu oturumda ÇALIŞTIRILDI)

- `npx prisma validate` → **geçti.**
- `npx prisma generate` → **geçti** (v7.9.1).
- `npm run typecheck` (kök) → **0 hata.**
- `npm run lint` (kök, tam paket) → **çıkış kodu 0.** Repo genelinde ÖNCEDEN VAR
  OLAN büyük bir lint borcu var (132.461 sorun, 15.372 hata — önceki oturumun
  raporunda da AYNI sayı/desen belgelenmiş, `react-hooks/set-state-in-effect`
  ağırlıklı) — bu oturumda dokunulan/eklenen HİÇBİR dosyada hata/uyarı YOK
  (doğrulandı: scoped `eslint --fix` her dosya grubunda 0 hata, yalnızca
  ÖNCEDEN VAR OLAN birkaç uyarı, dosya/satır numarasıyla karşılaştırıldı).
- Odaklı yeni/güncellenmiş testler:
  - `src/lib/__tests__/contracts.test.ts` → **33/33 geçti** (27 önceki + 6 yeni:
    1/2 aylık trial no-doc, HTML/yazdırma/imzalı-yükleme trial reddi, +1/+2/+3/+4/+6/+12
    yenileme eşiği).
  - `src/lib/__tests__/account-invitation.test.ts` → **11/11 geçti** (SMTP-yok
    BLOKE, düz metin şifre yok, RBAC, rate limit, tek-kullanımlık, süre aşımı,
    rol yükseltilemez, StudentPortalAccess aktivasyonu).
  - Birlikte + `password-reset.test.ts` + `change-password-route.test.ts` +
    `auth-teacher-login.test.ts` → **75/75 geçti** (RBAC/erişim/parola
    değişikliklerinin mevcut auth matrisini bozmadığı ayrıca doğrulandı).
- `npm test` (kök, tam paket, 216 dosya) → **2154/2161 test geçti (209/216 dosya),
  7 başarısız.** TAMAMI ÖNCEDEN VAR OLAN, İLGİSİZ — doğrulama:
  1. Her 7 dosya da `git status` içinde YOK (yani ne bu oturumda, ne bugünkü
     ÖNCEKİ oturumda değiştirilmiş — HEAD ile birebir aynı).
  2. Her biri TEK BAŞINA çalıştırıldığında da (tam paketten TAMAMEN izole) YİNE
     başarısız — sıra/çapraz-test kirlenmesi DEĞİL.
  3. 5/7'si (`find-person-schedule`, `homework-attachment`, `lesson-scheduling`,
     `lesson-series-tools`, `lesson-update`) önceki oturumun raporunda ZATEN
     "önceden var olan, ilgisiz" olarak belgelenmiş, BİREBİR AYNI liste.
  4. Kalan 2'si (`program-academic-term`, `teacher-contract-reminder-tick`) bu
     oturumda YENİ görülüyor; `teacher-contract-reminder-tick.test.ts`
     canlı `new Date()`/göreli gün hesabı (`ymdDaysFromNow`) kullanıyor —
     oturum sırasında takvim günü değişti (2026-08-28 → 2026-08-29, sistem
     saati), sınır-değer testinin (31 gün) bu geçişe duyarlı olması muhtemel
     kök neden. İkisi de sözleşme/davet/ödev/RBAC koduna bağımlı DEĞİL (ders
     programlama, akademik dönem, öğretmen İŞ sözleşmesi hatırlatması — bu
     görevdeki öğrenci KAYIT sözleşmesiyle KARIŞTIRILMAMALI, farklı bir alan).
  - Odaklı ilgili küme (`contracts.test.ts`, `account-invitation.test.ts`,
    `password-reset.test.ts`, `homework-audio-attachment.test.ts`,
    `homework-due-date-update.test.ts`, `homework-visibility.test.ts`,
    `document-instances.test.ts`, `social-media-consent.test.ts`,
    `student-portal-access*.test.ts`, `rbac-student-role.test.ts`,
    `access-control-matrix.test.ts`) — tamamı tam paketin parçası olarak geçti.
- `npm run build` (kök) → **başarılı** (çıkış kodu 0), tüm yeni rotalar
  (`/api/v1/auth/accept-invitation`, `/hesap-aktivasyon`) rota haritasında
  doğru derlendi, hata/uyarı yok.
- `npm --prefix apps/mobile run typecheck` → **0 hata.**
- `npm --prefix apps/mobile test` → **77/77 geçti (12 dosya)** — önceki
  oturumla BİREBİR aynı sayı, regresyon yok.
- `npx expo export --platform ios` (mobil) → **başarılı** (`dist/` altına iOS
  bundle + 42 asset, hata yok).
- `git diff --check` → **temiz.**

**Sonuç:** bu oturum kapsamındaki ÜÇ eklemenin (trial/formal eşiği, hesap
daveti, üretim hazırlığı dokümanı) tüm yeni/güncellenmiş testleri (33+11=44/44,
artı 75/75 birleşik regresyon) geçti; kök test paketindeki 7 başarısız test
kapsam dışı, önceden var olan ve bu oturumda düzeltilmedi — release'e alınmasını
engellememelidir (etkiledikleri alan: ders programlama/akademik dönem/öğretmen
iş sözleşmesi hatırlatması, bu görevin kapsamı OLAN öğrenci kayıt sözleşmesi/
davet/ödev'i ETKİLEMEZ).

## Onay ve kapsam teyidi

- ✅ **Hiçbir şey stage edilmedi** (`git add` çalıştırılmadı).
- ✅ **Hiçbir commit oluşturulmadı.**
- ✅ **Hiçbir push yapılmadı.**
- ✅ **Hiçbir deploy/yayına alma işlemi yapılmadı.**
- ✅ **Hiçbir shared/staging/production migration uygulanmadı**
  (`prisma migrate deploy`/`db push`/`db reset` ÇALIŞTIRILMADI — yalnızca
  `validate`/`generate`/`status`, salt-okunur).
- ✅ **Başka bir worktree'ye DOKUNULMADI** — tüm çalışma canonical `main`
  checkout'unda yapıldı.
- ✅ Bu oturumdan ÖNCE zaten mevcut olan, ilgisiz uncommitted çalışmalar
  (mobil uygulama iskeleti, marka geçişi, kimlik doğrulama/profil fotoğrafı,
  ders programlama/akademik dönem gibi başka alanlar) bu oturumda oluşturulmadı,
  değiştirilmedi, incelenmedi — yalnızca yukarıda listelenen dosyalar bu
  çalışmaya aittir.

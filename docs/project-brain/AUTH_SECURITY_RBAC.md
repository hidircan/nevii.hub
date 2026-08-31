# AUTH_SECURITY_RBAC.md — pointer

Kaynak: `../../CLAUDE.md` §Auth & RBAC (DOĞRULANDI) + `src/lib/auth/*`.

## Özet — DOĞRULANDI
- JWT access/refresh cookie, `src/middleware.ts` (route guard) + her istekte
  `src/lib/auth/*` (`authenticateRequest`, `assertPermission`).
- Roller: `SUPER_ADMIN | SCHOOL_ADMIN | TEACHER | PARENT | AI_AGENT`
  (`src/lib/auth/types.ts`). `SUPER_ADMIN` rol kapılarını by-design atlar.
- Entity-seviye erişim (örn. bu PARENT bu öğrenciyi görebilir mi) ayrı katman:
  `src/lib/services/context.ts` (`canAccessStudent`/`canAccessTeacher`) —
  rol tek başına yeterli değil.
- Kiracı kimliği YALNIZ JWT/session'dan gelir, client input'tan asla.
  `AsyncLocalStorage` (`src/lib/tenant-context.ts`) request boyunca taşır.
- `/sozlesme-yazdir/[contractId]` yetkilendirmesi URL gizliliğine değil, her
  istekte `canAccessStudent`'a dayanır (doğru IDOR savunması) —
  `docs/roadmap/NEVIIHUB_ADMIN_CONTRACTS_POLICY_REMAINING_WORK.md`'de
  DOĞRULANDI olarak işaretli.

## Portal Erişim Yönetimi (2026-08-31 — DOĞRULANDI, bu oturumda uygulandı)
- Öğrenci/öğretmen detay ekranlarında admin-only "Portal Erişimi" kartı:
  erişim aç/kapat, davet gönder/yeniden gönder, admin-tetikli şifre
  sıfırlama. Tüm yeni araçlar (`src/lib/services/tools.ts`):
  `getStudentPortalAccessTool`, `revokeStudentPortalAccessTool`,
  `reactivateStudentPortalAccessTool`, `sendStudentPortalPasswordResetTool`,
  `getTeacherAccountStatusTool`, `setTeacherAccountActiveTool`,
  `sendTeacherPasswordResetTool` — hepsi `requireRole(ctx, ["SCHOOL_ADMIN",
  "SUPER_ADMIN"])` ile korunuyor, hepsi `audit()` ile iz bırakıyor.
- Öğrenci erişimi: `StudentPortalAccess.status` "revoked"/"active" —
  `hasActiveStudentAccess` her istekte async kontrol edilir (JWT'de
  cache'lenmez), iptal bir sonraki istekte hemen etkilidir.
- Öğretmen (ve json/memory modunda BOOTSTRAP kullanıcı) erişimi: `User.active`
  — **DÜZELTİLEN HATA:** `authenticateUser`'ın json/memory dalı bu alanı
  daha önce hiç kontrol etmiyordu (yalnızca `db` modu doğruydu); artık her
  iki modda da erişimi kapalı bir kullanıcı giriş yapamaz. Detay:
  `DECISIONS.md` "Portal Erişim Yönetimi" bölümü.
- Admin-tetikli şifre sıfırlama, MEVCUT `createPasswordResetToken`/
  `consumePasswordResetToken` altyapısını (30 dk TTL) kullanır — yeni bir
  token sistemi eklenmedi. Ham token asla admin'e/loglara döndürülmez.
- Aynı e-posta çakışması: öğrenci tarafında aynı velinin ikinci çocuğa
  erişimi BİLİNÇLİ serbest; farklı role/farklı öğretmene bağlı e-posta
  davet/erişimi ENGELLENİR, hesap eşlemesi bozulmadan net hata döner
  (`inviteStudentPortalAccessTool`, `inviteTeacherAccountTool`,
  `provisionStudentPortalAccessTool`).
- Kapsam: web admin paneli + backend. `apps/mobile/`'a DOKUNULMADI (görev
  talebi gereği).

## Bilinmeyen / doğrulanmamış
Rate limiting, CSRF token stratejisi ve dosya-yükleme validasyonunun kapsamlı
denetimi bu ilk taramada yapılmadı — `security-rbac-review` skill'i
kullanılırken kod okunarak doğrulanmalı, varsayılmamalı.

## İlgili skill
`security-rbac-review`

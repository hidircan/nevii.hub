# Mobil UAT — portal erişimi ve davet e-postası runbook'u

Kapsam: yalnız **test** ortamı (`test.neviihub.com`, Supabase `neviihub-test` /
`vxzewyiwfshobjizzetw`). Production'a hiçbir adım uygulanmaz.

## Erişim kuralı (kod sözleşmesi)

- `User.active` + `Student.active` **tek başına portal erişimi değildir**. STUDENT
  rolünde her karar `StudentPortalAccess(tenantId, userId, studentId, status=active)`
  ile verilir (`canAccessStudent` → `hasActiveStudentAccess`).
- `invited` erişim yalnız davet kabulünde (`POST /api/v1/auth/accept-invitation`)
  `active` olur; login onu aktive etmez. `revoked` bir sonraki istekte reddedilir.
- Mobil persona `GET /api/v1/mobile/session` → `resolveActivePortalAccess`: JWT
  studentId'sine ait aktif kayıt, yoksa en eski aktif kayıt; `SELF` → öğrenci,
  `GUARDIAN` → veli. Veli hesabında `User.studentId` boştur — öğrenci bu uçtan gelir.
- Öğretmen değerlendirmesi ve materyal indirme artık JWT studentId eşleşmesine değil
  aktif erişime bakar.

## UAT fixture'ları (test-only, idempotent)

`scripts/uat-mobile-portal-fixtures.ts` — gerçek `hashPassword` ile SQL üretir; SQL
yalnız `vxzewyiwfshobjizzetw` projesine (Supabase SQL aracı) uygulanır.

```bash
# Şifreler/e-postalar yalnız env'den; repo DIŞINDA 0600 dosyaya yazılır.
UAT_SELF_EMAIL=… UAT_SELF_PASSWORD=… UAT_GUARDIAN_EMAIL=… UAT_GUARDIAN_PASSWORD=… \
  npx tsx scripts/uat-mobile-portal-fixtures.ts --out /güvenli/yol/uat.sql
```

Oluşturulanlar (tenant `tenant_nilufer_acar`, öğretmen `t1`, şube `erzene`):
`Mobile UAT Self Student` (SELF, active) ve `Mobile UAT Guardian` →
`Mobile UAT Guardian Student` (GUARDIAN, active); her biri için 4 gelecek ders + 1 ödev.
Tekrar çalıştırmak kopya üretmez, ders tarihlerini yeniler. E-posta fixture dışı bir
kullanıcıya aitse transaction durur.

## Davet e-postası

- Sağlayıcı: SMTP (`nodemailer`). Değişkenler: `EMAIL_PROVIDER=smtp`, `SMTP_HOST`,
  `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`, `EMAIL_FROM`, `EMAIL_FROM_NAME`,
  link tabanı `APP_BASE_URL`. Vercel'de yalnız **Preview (git branch: test)** kapsamında.
- Gönderim başarısızsa UI başarı göstermez; erişim `invited` kalır ve yalnız
  SCHOOL_ADMIN/SUPER_ADMIN'e **"Davet linkini kopyala"** gösterilir. Link yalnız o admin
  oturumunun belleğindedir; loglanmaz, audit'e yazılmaz.
- `info@neviihub.com`: mevcut Gmail SMTP hesabında doğrulanmış "Send mail as" takma adı
  değilse Gmail From'u hesap adresine çevirir — gönderim yine teslim edilir.

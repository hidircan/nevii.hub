---
name: security-rbac-review
description: Auth, JWT/session, RBAC, tenant isolation, CSRF, rate limit, PII, token, input validation, file upload ve erişim kontrolünü denetler.
---

## Ne zaman kullanılır
Auth/RBAC/tenant/PII/dosya-yükleme etkisi olan HERHANGİ bir değişiklikte —
bunlar varsayılan olarak Seviye 2-3'tür.

## İlk okunacak minimum proje-beyni dokümanları
`docs/project-brain/AUTH_SECURITY_RBAC.md` → `../../CLAUDE.md` §Auth & RBAC.

## İncelenecek minimum kod alanları
`src/middleware.ts`, `src/lib/auth/*`, `src/lib/tenant-context.ts`,
`src/lib/services/context.ts` (`canAccessStudent`/`canAccessTeacher`),
değişen route/tool'un kendisi.

## Güvenlik/iş kuralı kontrolleri
- Kiracı kimliği client input'tan DEĞİL, yalnız JWT/session'dan mı geliyor?
- Rol kontrolü YETERLİ mi, yoksa entity-seviye erişim (`canAccessX`) de mi
  gerekiyor?
- `SUPER_ADMIN`'in merge-view'de yazma işlemi bloklanıyor mu (kurum
  selector kuralı)?
- IDOR: yetkilendirme gizlilik/tahmin-edilemezlik değil, sunucu tarafı
  kontrol ile mi sağlanıyor?
- PII (T.C. kimlik, iletişim bilgisi) loglanıyor/expose ediliyor mu?

## Hangi testler
Auth/RBAC ilgili mevcut testler + yeni yetki dalı için hedeflenmiş test
(örn. yetkisiz rol/tenant erişim denemesi).

## Çıktı formatı
Bulgu tablosu: `| Kontrol | Durum (DOĞRULANDI/RİSKLİ/BİLİNMİYOR) | Kanıt |`.

## CEO onayı gereken işlemler
Yetki modelinde genişletme (örn. yeni rol, yeni bypass) her zaman CEO
onayı ister — geri alması güvenlik riski taşır.

## Sık yapılan hatalar
- Rol kontrolünü yeterli sanıp entity-level kontrolü atlamak.
- Kiracı kimliğini query param/body'den okumak.
- Secret/token değerini rapora, loga veya teste yazmak (kesinlikle yasak —
  sadece "tanımlı/eksik/doğrulanamadı" raporlanır).

---
name: api-data-change
description: API route, service, Prisma, store, transaction, validation, migration ve tenant scope değişikliklerini güvenli ele alır.
---

## Ne zaman kullanılır
`src/lib/services/tools.ts`, `src/lib/store*.ts`, `prisma/schema.prisma`,
herhangi bir `/api/v1/*` route veya `src/lib/agent/registry.ts` değişikliğinde.

## İlk okunacak minimum proje-beyni dokümanları
`docs/project-brain/API_AND_DATA.md` → `../../DATABASE_ARCHITECTURE.md`
(ilgili bölüm).

## İncelenecek minimum kod alanları
Değişen tool fonksiyonu + `TOOL_REGISTRY` kaydı (zod schema + requiredRoles)
+ etkilenen store dosyaları (json/db/memory — ÜÇÜNÜN de mirror edilmesi
gerekir).

## Güvenlik/iş kuralı kontrolleri
- Tenant filtresi her okuma/yazmada var mı?
- `ServiceResult` deseni korunuyor mu (throw yok)?
- Migration additive mi, geriye dönük uyumlu mu?
- Yeni AI-çağrılabilir yetenek tool+registry üzerinden mi ekleniyor (bespoke
  DB erişimi yok)?

## Hangi testler
Değişen store/tool'un mevcut testleri + üç store modu için parite testi
(en azından json+memory; db mümkünse). `npx prisma validate`.

## Çıktı formatı
Değişen dosyalar + hangi store modlarının test edildiği + migration
durumu (uygulandı mı, sadece dosya mı oluşturuldu).

## CEO onayı gereken işlemler
`prisma migrate deploy`, `db push`, `db reset` — HER ZAMAN, hedef ortam adı
açıkça belirtilerek. Production'a asla agent oturumundan onaysız.

## Sık yapılan hatalar
- Tek store modunu düzeltip diğer ikisini unutmak (parite kırılır, sessizce).
- `src/lib/services/tools.ts` dışında DB'ye doğrudan erişen kod yazmak.
- Mevcut commit edilmemiş büyük tools.ts değişikliğinin üstüne kontrolsüz
  yazmak — önce `git diff` ile mevcut hali gör.

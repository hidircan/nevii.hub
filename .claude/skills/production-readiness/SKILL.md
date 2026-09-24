---
name: production-readiness
description: Environment variable isimleri, Vercel, observability, health endpoint, build, migration, backup, rollout ve rollback risklerini inceler.
---

## Ne zaman kullanılır
Deploy/env/production-etki değerlendirmesi istendiğinde, veya bir değişiklik
production'a çıkmadan önce Seviye 3 kontrolü olarak.

## İlk okunacak minimum proje-beyni dokümanları
`docs/project-brain/PRODUCTION_READINESS.md` →
`../launch/ADMIN_WEB_PRODUCTION_READINESS.md` §0 (stale doc düzeltmeleri) →
`../../DEVOPS_GUIDE.md` ilgili bölüm.

## İncelenecek minimum kod alanları
`vercel.json`, `.env.example` (değişken İSİMLERİ, değerleri değil),
`prisma/schema.prisma` migration durumu, `next.config.ts`.

## Güvenlik/iş kuralı kontrolleri
- Secret DEĞERİ hiçbir çıktıya/rapora/loga yazılmıyor — sadece
  "tanımlı/eksik/doğrulanamadı" raporlanır.
- Migration `prisma migrate status` ile hedef ortama karşı kontrol edildi mi
  (deploy edilmeden önce)?
- Rollback yolu belirtildi mi?

## Hangi testler
`npx prisma validate`, `npm run build` (bu ajan sandbox'ında bazen OS
kısıtlaması nedeniyle başarısız olabilir — PRODUCTION_AUDIT.md'de bilinen
durum, kullanıcı terminalinde doğrulanmalı).

## Çıktı formatı
Risk tablosu: `| Alan | Durum | Etki | Öneri |` + rollback notu.

## CEO onayı gereken işlemler
`vercel env` değişikliği, production deploy, `prisma migrate deploy` —
HER ZAMAN, hedef ortam adı açıkça belirtilerek.

## Sık yapılan hatalar
- Sandbox'taki bir build hatasını (OS kısıtlaması) kod hatası sanmak —
  önce bilinen sandbox kısıtlarını (PRODUCTION_AUDIT.md) kontrol et.
- Env değişken değerini (secret) raporlamak — sadece isim/durum.

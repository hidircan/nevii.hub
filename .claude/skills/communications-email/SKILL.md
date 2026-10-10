---
name: communications-email
description: E-posta, SMTP, invitation, password reset, SMS, WhatsApp ve notification akışlarını ele alır. Plain-text şifre, secret sızıntısı, yanlış alıcı, yanlış tenant, kırık production URL, sahte başarı sonucu ve rate-limit risklerini özellikle kontrol eder.
---

## Ne zaman kullanılır
`src/lib/email*`, davet/parola-sıfırlama, `src/lib/notifications/*`,
`src/lib/whatsapp/*`, SMS akışlarında herhangi bir değişiklik.

## İlk okunacak minimum proje-beyni dokümanları
`docs/project-brain/COMMUNICATIONS.md` + kök talimatın "E-posta ve davet
akışı için zorunlu kontrol" bölümü (9 maddelik liste).

## İncelenecek minimum kod alanları
`src/lib/email*`, `src/lib/auth/invitation*`, ilgili API route/action/
service, ilgili testler.

## Güvenlik/iş kuralı kontrolleri (kök talimattan, 9 madde)
SMTP secret'ları asla gösterilmez · gerçekten gönderilmeden başarı
dönülmez · token tahmin edilemez/süreli/tek kullanımlık/tenant+kullanıcı
bağlı/mümkünse hashli/tekrar gönderimde doğru yönetilir · link doğru
domain üretir (localhost sızıntısı yok) · parola düz metin gönderilmez ·
alıcı seçimi (öğrenci/veli/öğretmen) iş kuralına uygun · hata durumunda
güvenli TR geri bildirim.

## Hangi testler
İlgili gönderim akışının mevcut testleri + yeni şablon/mantık için
hedeflenmiş test. Gerçek e-posta/SMS/WhatsApp GÖNDERİLMEZ (test ortamında
console/mock transport kullanılır).

## Çıktı formatı
Kontrol listesi sonucu (9 madde, her biri geçti/geçmedi/uygulanamaz) +
değişen dosyalar.

## CEO onayı gereken işlemler
Gerçek e-posta/SMS/WhatsApp gönderimi (test dışı) — HER ZAMAN CEO onayı.

## Sık yapılan hatalar
- "Gönderildi" mesajını gerçek gönderim doğrulanmadan dönmek.
- Şablon HTML'inde marka adını güncellerken teknik e-posta adresini
  (örn. mevcut production gönderen adresi) araştırmadan değiştirmek.

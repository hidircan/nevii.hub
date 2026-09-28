# UAT — İK / İşe Alım Modülü (2026-09-28)

Dal: `feat/ik-recruitment` · Migration: `20260928150000_recruitment` (yalnız yeni tablolar, additive).
Tasarım: `docs/implementation-plans/2026-09-28-ik-recruitment.md`.

## Doğrulama durumu
- typecheck temiz · lint 0 hata · `prisma validate` geçerli · `next build` geçti.
- `recruitment.test.ts` 20/20. Tam paket: 3828 geçti; kalan kırmızılar temiz HEAD'de de aynı (tarih bağımlı
  csv-import-lessons, teacher-branch-availability, program-academic-term, lesson-series-tools, lesson-open-hours,
  makeup-manual-plan, staff-onboarding) — bu dal yeni kırmızı eklemedi.
- Yerel uçtan uca (json store, Playwright): ilan oluştur → kariyer sayfası → gerçek PDF CV yükle (14 alan doldu) →
  başvuru → panel özet/havuz/filtre → görüşme planla → puan kartı → e-posta önizleme → pano → yazdır → CSV.
- Bağımsız inceleme (Sentinel) bulguları düzeltildi: AI CV okuma yalnız aday onayıyla; form üzerinden e-posta
  spam sınırları + ad alanında URL yasağı; anonimleştirme görüşme/değerlendirme metinlerini de siler (db/json
  paritesi `Prisma.DbNull`); kariyer sayfası varsayılan kapalı, ilk ilan yayınında açılır; işe alım aktarımı
  atomik; json'da CV ayrı dosyada; tekrar başvuru yanıtı e-posta varlığını sızdırmaz.

## Test ortamında (test.neviihub.com) adımlar — kurum sahibi / yönetici ile
1. Sol menü → **İnsan Kaynakları** → Özet açılıyor mu?
2. **İlanlar → Yeni ilan**: "Piyano Öğretmeni" · Öğretmen · Piyano · "Örnek metinle doldur" → **Kaydet ve yayınla**.
3. İlan kartındaki **LinkedIn** bağlantısını kopyala → gizli pencerede aç. Kariyer sayfası + ilan detayı görünüyor mu?
4. Başvuru formunda PDF/DOCX CV yükle → alanlar "CV'den" rozetiyle doluyor mu? (AI kutusu işaretsiz = yalnız kural tabanlı.)
5. KVKK onayı → **Başvuruyu gönder** → "Başvurunuz alındı" ekranı.
6. Panel → **Aday havuzu**: aday listede, kaynak "LinkedIn". Enstrüman = Piyano, Min. deneyim filtreleri çalışıyor mu?
7. Adayı aç → **Görüşme planla** (davet işaretli) → zaman çizelgesinde e-posta satırı. SMTP yoksa
   "gönderilemedi — SMTP yapılandırılmamış" yazmalı (sahte başarı yok).
8. **Değerlendir** → 1–5 puanla → yıldız ortalaması başlıkta.
9. Havuzda aday seç → **Olumlu / Olumsuz** → önizle → gönder; aşama güncellendi mi?
10. **Yazdır / PDF** ve **Excel (CSV)** — filtreyle aynı adaylar mı?
11. **Süreç panosu**: kartı sürükleyip başka sütuna bırak.
12. Adayda **İşe al / aktar** → Öğretmen kaydı açıldı mı, aday "İşe alındı" oldu mu?
13. **Ayarlar**: bildirim e-postası ekle, KVKK metnini değiştir → sürüm v2 oldu mu?

## Bilinen sınırlar
- E-posta gerçek teslimi test ortamında SMTP'ye bağlı (test'te bilinçli olarak kapalı olabilir).
- Hız sınırları sunucu örneği başına bellek içi (projedeki mevcut `rate-limit.ts` ile aynı sınır); captcha yok.
- CV'ler DB'de `bytea` (4 MB sınırı). Taranmış görüntü PDF'lerde metin çıkmaz → aday formu elle doldurur.
- Takvim (Google/Outlook) entegrasyonu ve aday self-servis portalı kapsam dışı.

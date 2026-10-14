# UAT — Rapor portalı (2026-10-14)

**Önkoşul:** migration `20261014120000_feedback_invites` canlıya KODDAN ÖNCE (owner onayı, session pooler 5432).

## Öğretmen (telefon)
1. `neviihub.com/gelisim` → giriş → "Raporu bekleyen dersler" (son 14 gün) ve 4 haftalık bekleyenler görünür.
2. Bekleyen derse dokun → ders seçili gelir; puanla, 3 zorunlu notu yaz, gönder → "Rapor gönderildi" → listeden düşer.
3. Formu yarıda bırak, sayfayı yenile → "taslak geri yüklendi" (veliye özel not taslakta tutulmaz).
4. "4 haftalık" sekmesi → gönder. Başka öğretmenin öğrenci adresini elle aç → "size atanmamış" ekranı, form yok.
5. Çoklu branş öğrencisi: ikinci branş öğretmeni rapor yazar → Raporlar'da O öğretmenin adıyla görünür.

## Yönetici
6. Her gönderimde bildirim gelir; bildirime tıklayınca `/panel/raporlar` açılır.
7. Menü → Raporlar: 3 sekme, öğretmen/öğrenci/tarih filtresi, sayfalama, "raporu bekleyen ders" kartı.
8. "Bağlantı oluştur" → öğrenci seç → link + Kopyala + WhatsApp ile paylaş (mesajı siz gönderirsiniz) → İptal et.

## Öğrenci/veli
9. Kişiye özel link → maskeli ad ("Zeynep A."), öğretmen kartları → her öğretmen bir kez; hepsi bitince teşekkür.
10. İptal edilen / 14 günü geçen link → Türkçe nedenli mesaj.
11. `neviihub.com/degerlendir` → giriş → mevcut öğretmen değerlendirmesi; birden çok öğretmende her kart doğru öğretmene yazar.

# UAT — 2026-09-26 (7. tur): deneme dersleri, Günlük Özet widget'ları, öğretmen seçici

Ön koşul: `20260926090000_trial_result_notes` migration'ı test DB'ye uygulanmış olmalı (additive, 3 kolon).

## Günlük Özet
1. Nilüfer / Ezgi / Nihal ile giriş → varsayılan şube eskisi gibi mi? (Nihal Evka 3, Ezgi Erzene)
2. "Deneme dersleri" kartı: Bugün / Önümüzdeki 7 gün / Takip bekleyen grupları; saat, aday, enstrüman, öğretmen, şube,
   hazırlık notu, durum veya aksiyon rozeti ("Durum güncellenmedi", "Kayda dönüştürülmedi", "Sonuç notu bekliyor").
3. Karttaki bir satıra tıkla → Deneme Dersleri sayfası açılır ve o denemenin düzenleme penceresi açık gelir.
4. Şube seçiciyi değiştir → deneme kartı da süzülür.
5. "Düzeni düzenle" → "+ Widget ekle…" kategorili liste (Ana ekranlar / Finans / Operasyonlar / Yapay Zeka / Sistem).
   Telafi Merkezi + KVKK Ayarları ekle → Kaydet. Telafi sayı gösterir, KVKK yalnız kısayol. X ile kaldır → Kaydet.
6. Ezgi (SCHOOL_ADMIN) listesinde Personel / Finans Özeti / Hakedişler YOK; Nilüfer'de var.
7. Eski kayıtlı düzen ve kayıtlı görünümler bozulmadan açılıyor; sürükle/boyutlandır çalışıyor.
8. Bir kullanıcının eklediği widget başka kullanıcıda görünmüyor.

## Deneme dersleri
1. Liste varsayılanı "Tümü". Arama (ad/telefon/öğretmen/not), durum, şube, öğretmen, tarih aralığı, sıralama,
   sayfa başına kayıt, sayfa geçişi. 3. sayfadayken filtre değiştir → 1. sayfaya döner. Telefon genişliğinde kart görünümü.
2. Planlarken "Hazırlık notu" gir → listede "Hazırlık:" görünür. Gelecek denemede "Düzenle": tarih/saat/öğretmen/şube değiştir.
   Öğretmenin başka dersi/denemesi olan saate al → açık Türkçe hata. Müsaitlik dışı saat → onay kutusu çıkar.
3. Geçmiş deneme → "Sonuç notu": plan ve hazırlık notu kilitli, sonuç notu kaydedilir; hazırlık notu değişmez.
4. Dönüşmüş denemede plan kilitli; dönüşüm bağlantısı ve öğrenci ilişkisi korunur. Denetim Kaydı'nda "deneme dersini düzenledi".

## Öğretmen seçici (ders planlama)
1. Gülce Özalp: Program → Ders ekle → öğrenci seç. Pınar Çelik listede "öğrencinin öğretmeni (uygun değil)" ve altında
   "Pınar Çelik Evka 3 şubesinde ders vermiyor…" uyarısı; öğretmen alanı boş kalır (Ebru'ya sessizce geçmez).
2. Öğretmenler ekranında Pınar'a Evka 3 ek şubesi eklenirse (owner kararı) → Pınar varsayılan önerilir.
3. Mine Öztopçu: aynı davranış, atanmış öğretmen verisi **Olcay Özdemir** (bkz. rapor — "Turgay" değil).
4. Seri ders paneli için 1–3 tekrar.

# UAT — 2026-09-23 · 4. tur (A–N) · test.neviihub.com

Ön koşul: Kurum sahibi (Nilüfer Acar) **Ayarlar → Güvenlik**'te kritik işlem şifresini belirlemiş olmalı.
Hesaplar: kurum sahibi (SUPER_ADMIN), Ezgi Güçlü (SCHOOL_ADMIN), Nihal Gedikli (BRANCH_MANAGER → efektif SCHOOL_ADMIN), bir öğretmen.
Her adımda beklenen sonuç ✅ ile yazılıdır.

## 1. Günlük Özet — sürükle / boyutlandır (A)
1. `/panel` → sağ üstte **Düzeni düzenle**. ✅ Üstte sabit "Düzenleme modu" çubuğu; her kartın üstünde tutamak + başlık, sağ kenarında dikey tutamak.
2. Bir kartı başlığındaki tutamaktan tutup başka kartın üstüne sürükleyin. ✅ Kartlar canlı yer değiştirir, zıplama yok; içerik tıklanmaz.
3. Bir kartın sağ kenarını sağa/sola sürükleyin. ✅ Genişlik 4–12 kolon arasında ızgaraya oturur; başlıkta `8/12` gibi değer.
4. Klavye: tutamağa Tab ile gelin → ↑/↓ sıra, ←/→ genişlik. ✅
5. Göz ikonuyla bir bölümü gizleyin → çubuğun altında "Gizli bölümler: + …" ile geri ekleyin. ✅
6. **İptal** → ✅ açılıştaki düzen geri gelir, hiçbir şey kaydedilmez.
7. Tekrar düzenleyin → **Kaydet** → sayfayı yenileyin / çıkış-giriş yapın. ✅ Düzen kullanıcıya özel korunur (Ezgi'nin düzeni Nihal'i etkilemez).
8. **Varsayılana dön** → Kaydet. ✅ Rol varsayılanı. Kaydetmeden sayfadan çıkmaya çalışırsanız tarayıcı uyarısı.
9. Şube seçiciyi değiştirin. ✅ Kart içerikleri şubeye göre değişir, yerleşim aynı kalır. SCHOOL_ADMIN'de "Hakediş" kartı yok.
10. Telefon genişliği (<1280px): ✅ yalnız sıralama (↑/↓ düğmeleri), kenar tutamağı yok.

## 2. Öğrenciyi oluşturan kullanıcı (B, F, J)
1. Ezgi ile yeni öğrenci oluşturun.
2. `/panel/ogrenciler` → **Sütunlar** → "Öğrenci no" ve "Kaydı oluşturan"ı ekleyin. ✅ Yeni öğrencide "Ezgi Güçlü"; eski kayıtlarda "Bilinmiyor (eski kayıt)".
3. **Filtreler → Kaydı oluşturan → Ezgi Güçlü**. ✅ Yalnız Ezgi'nin açtıkları; çip "Oluşturan: Ezgi Güçlü".
4. Arama kutusuna öğrenci numarasını yazın. ✅ Numara ile bulunur.
5. Öğrenci detayı üst satırı: ✅ "Kaydı oluşturan: Ezgi Güçlü".
6. Kurum sahibi hesabında zil: ✅ "Deniz Ak öğrencisi, Ezgi Güçlü tarafından oluşturuldu." — teknik `Detay: /panel/...` metni görünmez; tıklayınca öğrenci detayına gider.

## 3. Ders süresi (C)
1. Öğrenci → Genel bilgiler → Kayıt bilgileri **Düzenle**. ✅ "Ders süresi" seçimi görüntülemedekiyle aynı yerde.
2. 30 → 40 dk kaydedin. ✅ Görünümde 40 dk; paketli öğrencide Ödemeler → "Beklenen net aylık tutar" 40 dk fiyatına güncellenir; Değişiklik geçmişinde "Ders süresi (dk): 30 → 40".
3. Ödemeler → Ödeme profili **Düzenle**. ✅ Ders süresi salt-okunur ("Genel bilgiler … bölümünden değiştirilir"); ödeme profili kaydı süreyi değiştirmez.
4. Ders süresi hiç girilmemiş bir öğrencide Sözleşmeler → yeni sözleşme. ✅ "Ders süresi (dk)" alanı + uyarı; seçince "öğrenci kaydına işlendi" notu ve genel bilgilerde aynı değer.
5. Yeni ders planlayın. ✅ Varsayılan süre öğrencinin süresi. Mevcut planlı dersler değişmez.

## 4. Silme yetkisi — Ezgi/Nihal (D)
1. Ezgi ile öğrenci detayı. ✅ "Öğrenciyi sil" görünür (eskiden yalnız kurum sahibi).
2. Yanlış kritik şifre → ✅ "Kritik işlem şifresi yanlış; işlem yapılmadı…", Denetim Kaydı'nda "(reddedildi)".
3. Kendi giriş şifrenizi deneyin → ✅ reddedilir.
4. Doğru kritik şifre + ad teyidi + gerekçe → geri alınabilir silme. ✅ Öğrenciler → "Silinen öğrenciler (n)" bağlantısı Ezgi'de de görünür; detaydan **Geri al**.
5. Nihal ile 1–4 tekrarı. ✅ Aynı davranış.
6. 10'dan fazla yanlış şifre denemesi (15 dk) → ✅ "çok kez denendi, 15 dakika bekleyin".
7. Öğretmen hesabıyla: ✅ silme butonu yok; sunucu da reddeder.

## 5. Toplu seçim / toplu işlem (E)
1. Öğrenciler listesinde satır kutucuklarıyla 3 öğrenci seçin. ✅ Altta yapışkan çubuk "3 öğrenci seçildi". Başlık kutucuğu sayfadakilerin tümünü seçer; "Listedeki N öğrencinin tümünü seç" bağlantısı filtre sonucunun tamamını seçer.
2. **Şube** → hedef şube → etki özeti + geri alınabilirlik + etkilenecek isimler → Uygula. ✅ "3 öğrenci güncellendi"; zaten o şubede olanlar gerekçesiyle "atlandı".
3. **Öğretmen**: enstrümanını öğretmeyen öğretmene atama → ✅ ilgili öğrenci atlanır, sebebi yazılır.
4. **Enstrüman**, **Paket** (ders süresi olmayan öğrenci atlanır ve sebebi yazılır). ✅
5. **Pasife al** → Arşiv görünümünden seçip **Aktifleştir**. ✅
6. **Silinenlere taşı** → gerekçe + kritik şifre zorunlu. ✅ Silinen öğrenciler görünümünde seçip **Geri al**.
7. Her öğrencinin detayındaki Değişiklik geçmişi ve Denetim Kaydı: ✅ "Ezgi Güçlü, … için toplu güncelleme yaptı" + alan farkı; ayrıca tek özet satırı "N öğrenci (şube değişikliği)".

## 6. Personel detayına giriş (G)
`/panel/personel` → personel adına tıklayın. ✅ Detay sayfası açılır.

## 7. Performans ay navigasyonu (G)
1. Personel → Performans. ✅ Önceki ay / ay seçici / sonraki ay; içinde bulunulan ayda "sonraki ay" pasif.
2. İki ay geriye gidin → sonraki ay ile ileri gelin. ✅ Çalışır. **Bu aya dön** görünür ve çalışır.
3. URL'ye gelecek bir ay yazın (`?yearMonth=2027-01`). ✅ İçinde bulunulan aya sabitlenir.

## 8. Deneme → kayda dönüşüm (H)
1. `/panel/deneme` → deneme planlayın. ✅ Plan sonrası "Bu deneme öğrencisi kayda dönüştürülsün mü?" diyaloğu. **Daha sonra** → satır "Dönüşmeyen" sekmesinde.
2. Durumu **Katıldı** yapın. ✅ Aynı soru tekrar gelir. **Evet, kayıt formunu aç**.
3. ✅ Yeni öğrenci formu mor "Deneme dersinden kayıt" bandıyla, ad/telefon/enstrüman/öğretmen/şube/not dolu. Kaydı tamamlayın.
4. ✅ Deneme satırında "Kayda dönüştü → Öğrenci adı · dönüştüren · tarih"; öğrenci detayında "Denemeden dönüştü · …" rozeti; listede "Kaydı oluşturan" hücresinde "Denemeden · dönüştüren: …".
5. Aynı denemeyi tekrar dönüştürmeyi deneyin (`/panel/ogrenciler/yeni?deneme=<id>`). ✅ "zaten öğrenciye dönüştürülmüş" + öğrenciye bağlantı; ikinci kayıt oluşmaz.
6. Bildirim: ✅ "… deneme öğrencisi, … tarafından kayda dönüştürüldü."

## 9. Deneme dersleri görünürlük / renk / rapor (I)
1. Ders programı haftalık görünüm: ✅ denemeler mor kesikli çerçeveli, çizgili zemin, "DENEME" etiketli; normal ders statü renklerinden ayrık. Şube/öğretmen filtresine uyar; tıklayınca Deneme Dersleri'ne gider. Gün görünümünde de listelenir.
2. `/panel/deneme` sekmeleri Yaklaşan / Geçmiş / Dönüşmeyen / Tümü. ✅ Geçmiş denemeler görünür; "Planlayan" sütununda personel adı; başlıkta dönüşüm oranı.
3. Personel performans: ✅ "Planladığı deneme dersi" ve "Kayda dönüştürdüğü deneme" kartları.
4. Ayarlar → Performans Ağırlıkları: ✅ "Planlanan deneme dersi" satırı; toplam 100 kuralıyla değiştirilebilir; puana yansır.

## 10. Bildirim metni (J)
Madde 2.6 ve 8.6. ✅ Kullanıcı dostu cümle, zilde ve Bildirimler ekranında teknik yol yok.

## 11. Hakediş revize / ödeme geri düzenleme (K)
1. Öğretmen → Hakediş → dönemi getir → hakediş oluştur. **Dökümü revize et**. ✅ Süre / saatlik ücret / tutar hücreleri düzenlenebilir; "Yeni toplam" canlı.
2. Bir satırda süreyi değiştirin, başka satırda tutarı elle yazın → **Revizyonu kaydet** → gerekçe → Onayla. ✅ Özet kartı "Orijinal hesap X → revize Y · fark ±Z · kim · tarih · gerekçe"; satırlarda "Revize" rozeti ve üstü çizili eski değer.
3. **Hakedişi öde**. Sonra tekrar revize: ✅ uyarı + **kritik işlem şifresi** zorunlu.
4. **Revizyonu geri al** → ✅ orijinal hesaba döner.
5. **Ödendi işaretini geri al** (gerekçe + kritik şifre) → ✅ "bekliyor"a döner; yeniden revize edilip ödenebilir.
6. Sayfa altında "Hakediş değişiklik geçmişi"; öğretmen portalında ve Aylık döküm baskısında revize tutar. ✅

## 12. Denetim Kaydı insan dostu (L)
1. `/panel/denetim-kaydi`. ✅ Sütunlar: Zaman · Kişi (ad + Türkçe rol) · Ne yapıldı (Türkçe cümle + alan farkı) · Sonuç. Ham kullanıcı kimliği / `student.profile_update` gibi kod metin olarak görünmez (üzerine gelince teknik kod ipucu).
2. "Kişi" filtresi isimle, "Kayıt türü" Türkçe. ✅ Her istekte yazılan teknik telemetri (auth.success) listede yok.
3. Öğrenci Genel bilgiler ve Ödemeler sekmelerinin altında "Değişiklik geçmişi" / "Ödeme değişiklik geçmişi". ✅ Ödeme revizyonunda "Ödenen tutar: 1 → 7.000".

## 13. Ders silmede kritik şifre (M)
1. Statüsü olmayan ders → detay → **Sil**. ✅ Diyalogda üç seçenek açıklaması (İptal et / Programdan sil / Tamamen sil); "Programdan sil" çalışır.
2. Yoklaması girilmiş dersi silmeyi deneyin. ✅ "normal silmeyle silinemez…" ve diyalog "Tamamen sil" moduna geçer: gerekçe + kritik şifre.
3. Yanlış şifre → ✅ reddedilir, Denetim Kaydı'nda reddedildi. Doğru şifre → ✅ ders ve yoklaması silinir; Denetim Kaydı'nda "statüsü girilmiş dersi kritik şifreyle tamamen sildi".
4. Tahsilat veya telafi bağlı ders → ✅ kritik şifreyle de silinmez, nerede çözüleceği yazılır.
5. Ezgi ve Nihal ile aynı kural. ✅

## 14. Tek aktif oturum ve devralma (N)
1. Tarayıcı A'da Ezgi ile giriş yapın, panelde gezinin.
2. Tarayıcı B'de (başka cihaz/gizli pencere) aynı hesapla giriş. ✅ Diyalog: "Bu kullanıcı şu anda başka bir cihazda aktif. Devam ederseniz mevcut oturum kapatılacaktır." + cihaz özeti + son etkinlik.
3. **Vazgeç** → ✅ giriş yapılmaz, A etkilenmez.
4. Tekrar giriş → **Devam et ve diğer oturumu kapat**. ✅ B girer.
5. Tarayıcı A (en geç ~30 sn içinde veya sekmeye dönüldüğünde): ✅ "Oturumunuz başka bir cihazda açıldı" diyaloğu → **Giriş ekranına git** → login ekranında sarı bilgi bandı.
6. Denetim Kaydı: ✅ "Ezgi Güçlü, başka cihazdaki oturumunu kapatıp yeni cihazdan giriş yaptı."
7. A'yı 30 dk'dan uzun süre kapalı bırakıp B'den giriş: ✅ soru sorulmadan girer (eski oturum sessizce kapatılır).

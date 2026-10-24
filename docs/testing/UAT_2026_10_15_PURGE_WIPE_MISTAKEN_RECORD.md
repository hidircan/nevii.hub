# UAT — 2026-10-15: "Yanlış oluşturuldu — her şeyi sil" (finansal kayıtlar dahil)

Dal: `feat/purge-wipe-mistaken-record`. Migration YOK. PR #38'in kalıcı silmesine EK, ayrı mod. Finans kuralının
("ödeme satırları silinmez") bilinçli, owner onaylı tek istisnasıdır: kişinin KENDİ tahsilat/borç/sözleşme/hakediş
satırları silinir. Yalnız **kurum sahibi** (SUPER_ADMIN) görür; kurum yöneticisi standart modu kullanır.
Gerçek öğrenci/öğretmen üzerinde deneme YAPMAYIN — deneme kaydı açın.

## A. Öğrenci — tahsilatlı deneme kaydı
1. "UAT Tam Silme" öğrencisi açın; bir borç girip **tahsil edin**, bir borç daha ödenmemiş bırakın, bir ders ekleyin.
2. Öğrenciyi sil (geri alınabilir) → Silinenler → **Kalıcı sil**.
3. "Silme türü"nde **Yanlış oluşturuldu — her şeyi sil** seçin. Beklenen: önizleme yeniden yüklenir, kırmızı
   "Finansal kayıtlar da silinecek" kutusunda *Tahsil edilen* ve *Ödenmemiş borç* AYRI satırda, adet + tutarla.
4. Gerekçe + ad + "anladım" + **finansal onay kutusu** + kritik şifre → "Her şeyi kalıcı olarak sil".
   Finansal kutu işaretlenmeden düğme kapalıdır.
5. Beklenen: öğrenci hiçbir listede yok; Ödemeler/tahsilat raporunda bu tutarlar yok; makbuz linki açılmaz.

## B. Engeller (öğrenci)
- Öğrencinin dersi bir öğretmenin **aktif hakedişine** girmişse: "<Öğretmen> — <dönem> hakedişi … N dersini içeriyor".
  Çözüm: Hakedişler'de o hakedişi iptal edin (ödendiyse önce ödemesini geri alın) → silin → dönemi yeniden hesaplatın.
- Sağlayıcıda **tahsil edilmiş online ödeme** varsa tam silme yapılamaz (gerçek para): iade + standart kalıcı silme.
- Ortak veli hesabı (başka çocuğu da olan) kapatılmaz, yalnız bu öğrenciye erişimi kalkar. Grup dersinin diğer üyeleri kalır.

## C. Öğretmen
1. Ders/öğrenci geçmişi OLMAYAN deneme öğretmeni; bir hakediş kaydı (ödenmiş olabilir) olsun. Pasife al → Listeden kaldır.
2. Kaldırılanlar → Kalıcı sil → "Yanlış oluşturuldu — her şeyi sil": "Hakediş: N kayıt · tutar (M ödenmiş)" görünür.
3. Onaylayın → öğretmen, hakedişleri, ücret kuralları silinir.
4. Ders/seri/telafi, öğrenci ataması veya değerlendirme/ödev kaydı olan öğretmende engel + çözüm ekranı yazar
   (öğrencilerin geçmişi öğretmen silmesiyle silinmez).

## D. Kurum yöneticisi
Kurum yöneticisiyle girin: "Silme türü" seçimi görünmez; yalnız standart kalıcı silme vardır.

Denetim kaydı: `student.purge_wipe` / `teacher.purge_wipe` — numara, mod, silinen adetler, finansal tutarlar, aktör.
Ad ve gerekçe metni tutulmaz.

# UAT — 2026-10-14 dört düzeltme

Önkoşul: dört PR birleşip canlıya alındıktan sonra (migration YOK). Her adımda sayfayı yenileyip (F5) sonucu tekrar
kontrol edin. Gerçek veli/öğretmene e-posta gitmesini istemiyorsanız 3. ve 4. bölümde yalnız kendi adreslerinizi kullanın.

## 1. İleri ay tahsilatı (yoklama takvimi)
1. Yeni **sözleşmesiz** öğrenci kaydı: kayıt ayı Ekim, "takip eden ayı da ekle" işaretli, iki ayın toplamını tahsil edin.
   → Takvim: Ekim ve Kasım kutularında her ay **kendi tutarı** "ödendi", kalan 0; tahsilat tarihi her iki ayda gerçek gün.
   → Ödemeler: tek tahsilat satırı, tutar = toplam. Kasım kutusunda "Yeni tahsilat" kapalı gelir.
2. Sözleşmesiz başka bir öğrencide Ekim kutusuna **iki aylık** ücret girip Kaydet.
   → Ekim ve Kasım "ödendi"; Ödemeler'de toplam tahsilat girilen tutar; Kasım için ayrıca borç oluşmaz (ertesi gün de).
3. Aynı Kaydet'e iki kez basın (çift tık) → ikinci tahsilat yazılmaz.
4. Kayıt bitişi Ekim olan öğrencide Ekim kutusuna iki aylık tutar → "kayıt bitişi" nedenli açık hata, hiçbir şey yazılmaz.
5. **Sözleşmeli** birleşik ilk tahsilatlı bir öğrencide (ör. "Eylül + Ekim") Eylül ve Ekim kutuları artık her ayın
   **kendi** tutarını gösterir (eskiden ikisinde de toplam görünüyordu); Öğrenci dökümü toplamı tek kez sayar.
6. Eski kayıtlı (2026-10-14 öncesi) sözleşmesiz "takip eden ay" öğrencisi: ikinci ay kutusunda
   "Bu ay kayıt ilk tahsilatına dahil — ayrıca tahsilat gerekmez" yazısı görünür; o kutudan tahsilat reddedilir.

## 2. Öğretmenin öğrencileri
1. Öğretmenler listesinde bir öğretmenin öğrenci sayısını not edin; detay → Öğrenciler sekmesi sayısı **aynı** olmalı.
2. Listede yalnız aktif öğrenciler; "Pasif" rozeti hiç görünmez. Bir öğrenciyi pasife alın → sayfa yenilenince listeden
   ve sayaçtan düşer; öğrencinin ders/ödeme geçmişi değişmez.
3. Çok branşlı bir öğrencide, branşı kapatılan öğretmenin listesinde öğrenci görünmez; diğer öğretmende görünür.

## 3. Öğretmen portal e-postası (yalnız kurum sahibi)
1. Kurum yöneticisi (Ezgi) ile Öğretmenler → Bilgiler → Portal Erişimi: "Portal e-postasını değiştir" düğmesi **yok**;
   iletişim e-postası ile portal giriş e-postası ayrı satırlarda.
2. Kurum sahibi (Nilüfer) ile aynı ekran: "Portal e-postasını değiştir" → yeni adres → eski/yeni ve etkisi görünür →
   onay kutusu → "Değişikliği başlat".
   - Aktif hesap: "Bekleyen yeni giriş adresi …" yazar; giriş eski adresle sürer. Yeni adrese gelen bağlantı açılınca
     öğretmen yeni adresle girer; eski adres ve eski sıfırlama bağlantıları çalışmaz; açık oturumları kapanır.
   - Bekleyen davet: davet ve giriş adresi hemen yeni adres olur; "Davet gönder" ile yeni davet ayrıca gönderilir.
3. Başka bir hesaba ait adres girin → "kullanılamıyor" hatası, hiçbir şey değişmez.
4. Öğretmen olarak /ogretmen/hesabim: e-posta değiştirme formu yok, yol tarifi var.

**Turgay (veri düzeltmesi, ayrı onay):** canlıda iletişim e-postası `hidircan.data@gmail.com`, giriş e-postası hâlâ
`turgay.hosbas@niluferacar.com.tr` (hesap aktif). Yayından sonra kurum sahibi 3.2'deki akışla yeni adresi girer;
doğrulama bağlantısı `hidircan.data@gmail.com`'a gider (gerçek e-posta — sizin onayınızla). DB'ye elle yazım gerekmez.

## 4. NeviiOS (info@neviihub.com)
Hesap canlı DB'de YOK — önce kurtarma (owner onayı, owner makinesi, canlı DB bağlantısıyla):
1. `STORE_MODE=db DATABASE_URL=<canlı, session 5432> npx tsx scripts/recover-hyper-admin.ts --email info@neviihub.com --target-ref wsbucznpujcfzhitzrbl`
   → kuru çalıştırma "koşullar uygun" demeli. Sonra aynı komut `--apply` ile.
2. neviihub.com/platform/giris → "Şifremi unuttum" → info@neviihub.com. (Gerçek e-posta — onayınızla.)
   E-posta gelmezse: Cloudflare Email Routing'de info@ yönlendirmesini ve Vercel logunda `forgot-password` satırını
   (`"reason":"requested"`, istek kimliği) kontrol edin; yedek: `--apply --prompt-password` (gizli giriş, değer kaydedilmez).
3. Bağlantıdan yeni şifre → doğrudan /platform açılır. Çıkış yapıp yeni şifreyle tekrar girin.
4. Kurum sahibi hesabıyla /platform/giris'ten giriş denenir → platform açılmaz.

# UAT — 2026-10-15: Öğrenci/öğretmen kalıcı silme + Öğrenciler arama dropdown'u

Dal: `feat/permanent-delete-and-student-search`. **Önkoşul:** migration `20261015090000_person_purged_at`
(Student/Teacher'a 2 nullable `purgedAt` kolonu) canlıda KODDAN ÖNCE uygulanır (session pooler 5432, owner onayıyla).
Kritik işlem şifresi tanımlı olmalı (Ayarlar → Güvenlik). Gerçek öğrenci/öğretmen üzerinde deneme YAPMAYIN —
önce bir deneme kaydı açın.

## A. Öğrenci — ilişkisiz deneme kaydı
1. Öğrenciler → Yeni Öğrenci: "UAT Silme Bir" adında öğrenci açın (ders/ödeme eklemeyin).
2. Öğrenci sayfası → "Öğrenciyi sil" (geri alınabilir) → gerekçe + ad + kritik şifre.
3. Öğrenciler → "Silinen öğrenciler (N)" → satırda **Kalıcı sil**.
4. Beklenen: önizleme yüklenene kadar "Kalıcı olarak sil" kapalı; "korunması gereken geçmişi yok… tamamen silinir".
5. Gerekçe + adı aynen yaz + "anladım" kutusu + kritik şifre → Kalıcı olarak sil → Silinenler'den kaybolur.

## B. Öğrenci — ilişkili deneme kaydı (ders, yoklama, ödenmemiş borç)
1. "UAT Silme İki" açın; 1 geçmiş ders + yoklama ("Geldi"), 1 gelecek ders, ödenmemiş bir borç satırı ekleyin.
2. Silin (geri alınabilir) → Silinenler → Kalıcı sil.
3. Beklenen önizleme: "Ders kaydı 2 (1 tanesi gelecek tarihli)", "Yoklama kaydı 1", "Ödeme/borç satırı 1";
   Etkiler: gelecek dersin programda boşalacağı, öğretmenin henüz oluşturulmamış hakedişinde geçmiş dersin sayılmayacağı.
4. Onaylayın → öğrenci, dersleri, yoklaması ve borç satırı yok; öğretmen ve oda programı yerinde.

## C. Tahsilatı olan öğrenci → anonimleştirme
1. "UAT Silme Üç" açın, bir borç girip **tahsil edin**. Silin (geri alınabilir) → Kalıcı sil.
2. Beklenen: "korunması gereken geçmişi var… anonimleştirilir (Silinmiş öğrenci (Ö-…))"; Korunacak: ödeme 1.
3. Onaylayın → Silinenler'den kalkar. Ödemeler/makbuzda tahsilat duruyor, ad "Silinmiş öğrenci (Ö-…)".
4. Doğrudan öğrenci adresine gidin: "kalıcı silindi" notu; geri alma yok.

## D. Önizlemeden sonra veri değişirse
1. Silinmiş bir deneme öğrencisinde Kalıcı sil'i açın, formu doldurun ama GÖNDERMEYİN.
2. Başka sekmede aynı öğrencinin sayfasını açıp "Bu öğrenci için görev oluştur" ile bir görev açın.
3. İlk sekmede Kalıcı olarak sil → "Önizlemeden sonra kayıtlar değişti; hiçbir şey silinmedi" + yenilenmiş önizleme
   ("Silinmeyecek, yalnız bağlantısı kaldırılacak: Görev 1" görünür), ad ve onay kutusu sıfırlanmış. Yeniden onaylayınca silinir.

## E. Paylaşılan veli hesabı
1. Aynı veli e-postasıyla iki deneme öğrencisine portal daveti verin.
2. Birini silip Kalıcı sil'i açın → "Giriş hesapları: başka öğrenci/rol için de kullanılıyor — hesap SİLİNMEZ".
3. Onaylayın → veli diğer öğrenciyle portala girebiliyor.

## F. Öğretmen
1. Deneme öğretmeni açın, pasife alın, "Listeden kaldır". Öğretmenler → "Listeden kaldırılan öğretmenler" → Kalıcı sil.
2. Ders/hakediş geçmişi yoksa "tamamen silinir"; varsa "anonimleştirilir" ve geçmiş dersler "Silinmiş öğretmen (…)" görünür.
3. Aktif öğrencisi veya gelecek dersi olan öğretmende engel + çözüm ekranı yazar; öğretmen kendiliğinden değiştirilmez.

## G. Öğrenciler arama dropdown'u
1. Öğrenciler ekranında arama kutusuna tıklayın (hiçbir şey yazmadan) → liste açılır; alt satır "Filtrelere uyan N öğrenci".
2. Listenin sonuna kaydırın → 50'den sonraki öğrenciler de yüklenir (tablonun 10'luk sayfasıyla sınırlı değil).
3. "ış", "ŞULE" gibi Türkçe yazın → liste ve tablo aynı anda süzülür.
4. ↓/↑ ile gezinin, Enter ile seçin → tablo yalnız o öğrenciyi gösterir, adres `?studentId=…`. Detaya gitmez.
5. X (Temizle) → seçim ve arama kalkar, filtreli tam listeye dönülür. Escape ve dışarı tıklama listeyi kapatır.
6. Filtreler → Şube/Öğretmen/Durum seçin → dropdown yalnız o filtrelere uyanları gösterir.
7. Silinenler görünümünde arama yalnız silinen öğrencileri listeler.
8. Yoklama Takvimi'ndeki öğrenci seçici eskisi gibi çalışır ("cagla" → Çağla, Enter → takvim açılır).

Bilinen sınır: /panel telefon genişliğinde (375px) kenar menü daralmadığı için içerik alanı çok dar — önceden var olan
düzen sorunu, bu işle ilgisiz; dropdown tablet ve üstünde taşmasız doğrulandı.

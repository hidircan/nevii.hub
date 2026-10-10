# UAT — 2026-09-30: Öğretmen hakediş defteri (yeniden tasarım) + deneme dersi düzeltmeleri

Migration: `20260930090000_teacher_payout_ledger` (additive). `TeacherPayout` kaydına iptal alanları, `lineSnapshot`,
`payments`, `adjustments` ve `version` eklendi. `TeacherFeeRule` kaydına devre dışı bırakma izi eklendi. Yeni tablo:
`TeacherPayoutExclusion`. `TrialLesson` kaydına `parentName` eklendi. Eski satırlara dokunulmadı: `payments` boş olan
eski bir "paid" kayıt, tüm tutarı tek ödemede ödenmiş sayılır.

## Owner kararları (2026-09-30, "hepsi varsayılan")
1. **Politika değişikliği, ödenmemiş kayıtlar:** Önce etki önizlemesi gösterilir. Onaylanınca ödemesiz kayıtlar yeniden
   hesaplanır; satır düzeltmeleri korunur.
2. **Politika değişikliği, ödenmiş kayıtlar:** Kayıt değişmez. Farkı ekranda görünür; yönetici tek tıkla "hesap farkı"
   düzeltmesi ekler.
3. **Ödenmiş kaydı revize etmek:** Döküm yeniden yazılmaz; fark +/− düzeltme kaydı olur. "Ödendi işaretini geri al"
   yalnız yanlış işaretleme içindir (ters kayıt ve kritik şifre).
4. **Silme:** Ödemesiz kayıt iptal edilir. İptal edilmiş ve hiç ödeme almamış kayıt, güvenli silme kapısıyla (kritik
   şifre ve gerekçe) kalıcı silinebilir. Ödenmiş kayıt iptal edilemez.
5. **Kısmi ödeme:** Bir hakedişe birden çok ödeme girilebilir; durum Bekliyor / Kısmi ödendi / Ödendi olarak türetilir.
   Hatalı ödeme ters kayıtla geri alınır. Kalan bakiyeyi aşan ödeme reddedilir.
6. **30/40/50 dışı süreler:** Artık bloklamaz. Tutar en yakın üst tarifeden orantılı hesaplanır ve satır
   "Süre istisnası" rozeti alır.
7. **Hariç tutma ve ücret kuralı:**
   - Ders, gerekçeyle ve geri alınabilir şekilde hakedişten hariç tutulur. Ders, takvim, yoklama ve ödeme verisi değişmez.
   - Hiç kullanılmamış ücret kuralı silinir; kullanılmış kural seçilen tarihten itibaren devre dışı kalır.

## Eylül kilidi nasıl çözüldü
Kilit tamamen kalktı. İptal edilen kayıtlar hiçbir hesaba girmez. Politika değişince ödemesiz kayıtlar önizleme ve
onayla yeniden hesaplanır. Ödemeli kayıtların tutarı değişmez; yalnız aradaki fark gösterilir.

## Değişen ekranlar
- **`/panel/hakedisler`:**
  - Tabloda net hakediş, ödenen ve kalan (fazla ödeme dahil) sütunları var; kayıtla güncel hesap arasındaki fark
    satırda görünür.
  - Politika kartı: seçim → "Etkisini göster" → öğretmen bazında önce/sonra tablosu → "Onayla ve uygula".
- **Öğretmen → Hakediş:**
  - Özet satırı: döküm, düzeltmeler, net, ödenen, kalan.
  - Uyarılar: fark, eksik kural, süre istisnası, iptal edilmiş kayıt.
  - İşlemler: oluştur, ödeme ekle, düzeltme ekle, revize et (yalnız ödemesizse), iptal et.
  - Ders kalemleri: kaynak rozetleri (programda yok, artık işlendi değil, test/demo verisi, süre istisnası),
    "Programda aç" bağlantısı ve "Hariç tut".
  - Ödeme ve düzeltme defteri; her satırda ters kayıt veya geri alma.
- **Ücret Kuralları (öğretmen hakediş sekmesi):** Her kurala "Kaldır" eklendi (devre dışı bırak veya kalıcı sil).
- **Öğretmen portalı, ödeme geçmişi, yazdırma:**
  - İptal edilmiş kayıt görünmez.
  - Tutarlar net / ödenen / kalan olarak gösterilir.
  - Ödeme geçmişi artık gerçekleşen ödeme satırlarını listeliyor (kısmi ödemeler ayrı satır).
- **Deneme dersi:**
  - Enstrüman listesi kurum kataloğundan geliyor (Elektro Gitar dahil, yeni öğrenci formuyla aynı liste).
  - Oluşturma ve düzenlemede opsiyonel "Veli adı" alanı var; öğrenciye dönüşümde veli adını ön dolduruyor.

## UAT senaryoları
1. **Eylül kilidi:** `/panel/hakedisler` → Eylül → politikayı veya tutarları değiştir → "Etkisini göster". Ödemesiz
   kayıtlar "yeniden hesaplanır", ödemeli kayıtlar "değişmez, fark önerilir" görünmeli → "Onayla ve uygula".
   Tablodaki tutarlar güncellenmeli.
2. **Kısmi ödeme:** Bir öğretmende önce kısmi, sonra kalan tutarda ödeme gir. Durum Kısmi ödendi, ardından Ödendi
   olmalı. Kalandan büyük bir tutar reddedilmeli. Bir ödemeye ters kayıt yap (şifreyle); bakiye geri açılmalı ve satır
   üstü çizili kalmalı.
3. **Test dersi:** Test dersi olan öğretmende satırdaki "Hariç tut" + gerekçe → kayıt ödemesizse tutar düşmeli; ders
   Ders Programı ve yoklamada aynen kalmalı. "Tekrar dahil et" ile geri alınabilmeli.
4. **İptal ve yeniden oluşturma:** Ödemesiz bir kaydı iptal et → yeniden oluştur → aynı dönem güncel hesapla gelmeli.
   Ödemeli kayıtta "Kaydı iptal et" butonu görünmemeli.
5. **Ödenmiş kayıtta fark:** Ödenmiş bir ayda politika tutarını değiştir → öğretmen ekranında "Kayıt, güncel hesaptan
   X farklı" uyarısı → "Farkı düzeltme olarak ekle" (şifre) → Net ve Kalan artmalı. Portal ve yazdırma aynı rakamı
   göstermeli.
6. **Ücret kuralı ve süre:** Kullanılan bir kuralda "Kaldır" → "Kalıcı sil" reddedilmeli; "devre dışı" (tarihli)
   çalışmalı. Sabit ücret politikasında 45 dk'lık bir ders "Süre istisnası" rozetiyle orantılı tutarda gelmeli;
   hakediş yine oluşturulabilmeli.
7. **Deneme dersi:** Branş listesinde Elektro Gitar görünmeli. Veli adı girilen denemeden öğrenci kaydı açınca veli
   adı dolu gelmeli.

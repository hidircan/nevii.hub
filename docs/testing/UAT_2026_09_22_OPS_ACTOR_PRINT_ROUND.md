# UAT — 2026-09-22 Ops ikinci tur: actor, hakediş, performans ağırlıkları, baskı standardı

Branch: `fix/schedule-contract-ux-round`. Migration: `20260922120000_ops_actor_weights_threshold`
(additive; yerel DB'de uygulandı, test DB'de owner onayıyla `prisma migrate deploy`).

Her adımda beklenen sonuç tutmazsa ekran görüntüsüyle bildirin.

## A — Sözleşmeler statü doğruluğu
1. Öğrenci → Sözleşmeler. Güncel sözleşmeyi "İptal et" ile iptal edin.
   - Beklenen: iptal edilen kart "Geçmiş sözleşmeler" başlığı altında, soluk; "Güncel" rozeti yok, "İptal et" düğmesi yok.
2. Yeni sözleşme oluşturun.
   - Beklenen: yeni kayıt en üstte, çerçeveli ve "Güncel" rozetli; eski iptal altta pasif.
3. Güncel sözleşmeyi tekrar iptal edip yeniden oluşturun → aynı düzen korunur, iki rozet asla aynı kartta çakışmaz.

## B — Günlük Özet kayıtlı görünümler
1. Panel → "Düzeni düzenle". Bölümleri sürükleyin, boyut seçin, bir bölümü gizleyin.
2. "Görünüm adı" = "Sabah", "Görünümü kaydet". Düzeni değiştirip "Farklı adla kaydet" = "Finans".
3. "Kayıtlı görünüm" listesinden Sabah ↔ Finans arasında geçin → düzen anında değişir; sayfayı yenileyin → seçim kalır.
4. Geniş ekranda dar kutular üst satırdaki boşluğu doldurur (büyük boşluk kalmaz).
5. "Varsayılana dön" → rol varsayılanı gelir, kayıtlı görünümler listede durur.
6. SCHOOL_ADMIN ile giriş → Hakediş bölümü hiç görünmez, kayıtlı görünümde olsa bile.

## C — Öğretmen hakediş / ödeme / raporlar
1. Öğretmen → Hakediş. "Ödeme yöntemi eşiği" kartında "(PRODUCT_BACKLOG §3.4)" yazısı yok; haftalık saat eşiği girip "Eşiği kaydet" → yeşil onay, varsayılan yöntem güncellenir.
2. Ders satırında "Kaynak ders" → sayfa değişmeden tarih · öğretmen · şube · süre bilgisi açılır/kapanır.
3. "Hakediş oluştur" → yeşil onay mesajı kalır, düğme kaybolur, "Hakedişi öde" çıkar. Aynı dönemi yeniden açınca hata yok.
4. "Hakedişi öde" → "Bu dönemin hakedişi ödendi" rozeti; Ödeme Geçmişi sekmesinde kayıt görünür.
5. Ödeme Geçmişi sekmesinde bekleyen kayıt ve "Ödendi olarak işaretle" düğmesi YOK; yalnız ödenmiş kayıtlar.
6. "Aylık döküm" ve "Yıllık döküm" → kenarlıklı tablolar, sağa hizalı sayılar, toplam satırı; yıllıkta "Aylık özet" tablosu.
   Künyede raporu alan kişinin ADI (kimlik değil) ve tarih+saat. "snapshot" / "backlog" metni yok.
7. Ödeme Geçmişi → "Geçmişi yazdır" → aynı standart, ödenen toplam satırı.
8. Öğretmen genel/Program sekmelerinde "Günlük limit" kartı yok.

## D — Performans ağırlıkları
1. SUPER_ADMIN → menü "Performans Ağırlıkları". Öğretmen ve personel tabloları, toplam göstergesi.
2. Bir metriği 0 yapın → "Pasif"; toplam 100 değilken kaydet → Türkçe hata. 100'e tamamlayıp kaydet → onay.
3. Öğretmen → Performans: bileşen ağırlıkları yeni değerleri gösterir; "Planlanan Dersten Yeni Kayıt" kartı var (varsayılan %5).
4. Personel → Performans: "Performans puanı" ve "Planladığı ders" kartları.
5. SCHOOL_ADMIN ile `/panel/ayarlar/performans` → panele yönlendirilir; menüde görünmez.

## E — Telafi geçmişi
1. Telafi → sonuçlanan talepler tablosu: Ara, Durum (Türkçe), İşlemi yapan, Karar tarihi aralığı filtreleri; sayfa boyutu ve sayfalama.
2. "İşlemi yapan" sütunu ad soyad gösterir; otomatik sonuçlananlarda "Sistem".

## F — Actor bilgisi
1. Yeni öğrenci kaydı açın → öğrenci detay başlık kartında "Kaydı oluşturan: <ad soyad>".
2. Yeni öğretmen kaydı açın → öğretmen detayında aynı satır.
3. Ders/seri planlayın → personel performansında "Planladığı ders" artar.
4. Eski kayıtlarda satır görünmez (backfill: `npx tsx scripts/backfill-created-by.ts`, önce dry-run).

## G — Bildirimler
1. Yeni öğrenci kaydı sonrası yönetici bildirimi: "<Öğrenci> için öğrenci kaydı <Ad Soyad> tarafından oluşturuldu." — `/panel/...` metni yok, tıklayınca öğrenciye gider.
2. Tahsilat bildirimi: "<Öğrenci> için <tutar> tahsilat <Ad Soyad> tarafından alındı."
3. Tür (Türkçe), başlangıç/bitiş tarihi, metin filtresi; sayfa boyutu ve sayfalama; filtre boşsa "Bu filtreye uyan bildirim yok."

## H — Ödemeler
1. "Ödemeyi alan" sütunu ad soyad.
2. Vade aralığı, tahsil tarihi aralığı, min/max tutar ("2.000" gibi noktalı yazım dahil) ve sıralama birlikte çalışır; "Aksiyon gerekli" açıkken de tarih filtresi uygulanır.
3. Öğrenci ödeme detayı → Yazdır: özet tablo, sözleşme planı (toplam satırlı), ödeme hareketleri (Tutar/Ödenen/Kalan sütunları + toplam), raporu alan adı, tarih+saat; teknik fonksiyon adı yok.

## I — Ortak baskı standardı
Hakediş (aylık/yıllık), ödeme geçmişi, öğretmen performansı, öğrenci ödeme dökümü, öğrenci ödeme+yoklama dökümü:
kurum · raporu alan (ad soyad) · rapor tarihi (tarih + saat) · kenarlıklı tablo · sağa hizalı sayılar · toplam satırı · çok sayfada başlık tekrarı.
Sözleşme, makbuz ve evrak baskıları hukuki belge olduğundan bu künyeyi almaz (değiştirilmedi).

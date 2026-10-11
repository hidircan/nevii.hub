# Admin Mobile UAT — `release/mobile-review` (TR/EN dahil)

Önkoşul: test kullanıcısı + backend ayakta; dil değiştirici Hesabım içinden (kalıcılık: SecureStore `neviihub_locale`).

## A. Dil geçişi (her portalda)

1. Hesabım → dil seçici → English: sekme başlıkları, liste boş-durumları, form etiketleri, hata kartları İngilizce olur.
2. Türkçe'ye dön: aynı yüzeyler Türkçe olur; yeniden başlatınca seçim korunur.
3. Bilinmeyen sunucu statü kodu ham haliyle görünür (çevrilmiş gibi davranılmaz).

## B. Admin turu

1. Özet: sayaçlar + hızlı işlemler + dikkat listesi + öğretmen performansı açılır.
2. Program → gün değiştir → öğretmen filtresi → ders detayı: yoklama bayrakları (Katıldı/Gelmedi/İzinli/Telafi/İşlendi), iptal onayı, gerekçe akışı, öğretmen/şube/oda değişimi.
3. Kişiler: öğrenci/öğretmen/veli sekmeleri, sunucu araması (`q`), "daha fazla göster" sayfalama.
4. Öğrenci detayı: program/devam/müfredat/ödev/ödeme/evrak/onam/veli arama/portal erişimi (davet–iptal–yeniden açma).
5. Öğretmen detayı: performans v2, program özeti, görev metrikleri, müsaitlik onayı/reddi, hakediş oluşturma + ödendi işaretleme, geri bildirim ilerletme.
6. İşlemler: yoklama (öğrenci ara → işaretle → statü değişim onayı), telafi merkezi (onay/iptal + karar notu zorunlu), tahsilat (vaka ilerletme), izinler (onay/red), finans özeti, silme talepleri (onay/red/işlendi), duyuru oluşturma (alıcı sayacı + onay), iş-takip (segment + KPI + detay + yorum), ödev raporu, öğretmen performansı, otomasyon açma/kapama, katalog sekmeleri.

## C. Regresyon (öğrenci/veli/öğretmen)

- Giriş → sekme turu → ödev teslim (öğrenci) / salt-görünüm (veli) → telafi listesi → ödeme akışı (gerçek checkout, sahte başarı yok) → bildirimler → Hesabım bağlantıları.
- Öğretmen: bugün/orarian görünüm, ödev CRUD, öğrenci müfredat/gelişim, iş-takip, telafi salt-okunur, hakediş salt-okunur.

## D. Olumsuz testler (reddedilemez)

- Yetkisiz derin bağlantı (başka öğrencinin sözleşmesi/telafisi) → güvenli "bulunamadı", veri sızmaz.
- Uçak modu: ağ hatası kartı; finans/tahsilat/yoklama işlemlerinde sahte başarı yok.
- Geçersiz statü geçişi: sunucu `needsConfirmation` → onay diyaloğu; sessiz üzerine yazma yok.

## E. Kabul kriteri

- Yukarıdaki adımlarda çökme yok, ölü CTA yok, yer tutucu ekran yok (iki belgelenmiş placeholder: admin Yaklaşan dersler, admin Öğretmenler — web-only veri, bilinçli).
- TR ve EN'de metin taşması/eksik çeviri yok (eksik anahtar derlemede yakalanır).

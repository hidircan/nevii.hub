# Çoklu Öğrencili Veli — cihaz UAT rehberi (test.neviihub)

- Tarih: 2026-09-20 · Branch: `release/mobile-review`.
- Amaç: aynı veli hesabına bağlı birden fazla aktif öğrencide seçim,
  geçiş ve erişim-iptali davranışlarını gerçek veriyle doğrulamak.

## 1. Kurulum (web, admin)

1. test.neviihub'a admin olarak giriş yap.
2. İki aktif öğrenci hazırla (ör. `Öğrenci A`, `Öğrenci B`) — farklı
   öğretmen/şube olursa geçişte veri karışması daha net görülür.
3. Ortak veli e-postasıyla portal hesabı aç (yoksa).
4. Her iki öğrenci için **ayrı** `StudentPortalAccess` kaydı oluştur:
   `accessType=GUARDIAN`, `status=active` (davet → aktifleştir).
   `invited`/`revoked` kayıtlar mobilde listelenmez (sunucu filtresi).
5. Her öğrenciye geçmiş + gelecek ders, en az bir ödeme ve (varsa) bir
   telafi kaydı bırak — geçişte ekranların tamamen değiştiğini gösterir.

## 2. Senaryo

| # | Adım | Beklenen |
|---|---|---|
| 1 | Veli girişi (mobil) | İki aktif çocuk varken `/select-child` açılır; tek çocuk olsaydı doğrudan ana sayfa |
| 2 | Picker listesi | Tüm aktif çocuklar (ad, fotoğraf, branş/öğretmen); limit yok, liste sanallaştırılmış |
| 3 | Öğrenci A'yı seç | Ana sayfa A'nın verisiyle açılır; "Takip edilen öğrenci: A" bandı görünür |
| 4 | Ders/ödeme/sözleşme/yoklama/materyal/müfredat/profil gez | Hepsi A'ya ait |
| 5 | Switcher'dan B'ye geç | TÜM ekranlar B'ye döner; A'ya ait tek satır görünmez (ara durumda skeleton) |
| 6 | Web'den B erişimini iptal et (revoke) | — |
| 7 | Mobilde pull-to-refresh / arka plan → ön plan | B düşer; tek çocuk kalırsa doğrudan A'ya dönülür; SecureStore bayat tercihi silinir |
| 8 | Web'den A erişimini de iptal et | — |
| 9 | Mobilde yenile | "Öğrenci bilgisi bulunamadı" güvenli boş durumu (teknik hata değil) |
| 10 | SELF öğrenci girişi | Picker/switcher HİÇ görünmez |

## 3. Başarısız olursa

- Picker açılmıyorsa: `/api/v1/mobile/my-children` yanıtındaki `children`
  sayısını kontrol et (sunucu active-only döner).
- Eski öğrenci verisi flaşlanıyorsa: URL'ler `selectedId`'den kurulur —
  hangi ekranın sabit ID kullandığını raporla (beklenen: skeleton).
- İptal düşmüyorsa: `StudentPortalAccess.status` gerçekten `revoked` mu;
  `assertStudentAccess` her istekte doğrular (JWT-cache yok).

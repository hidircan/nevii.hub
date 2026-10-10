# UAT — Operasyon Turu (2026-09-20) · `test.neviihub.com`

**Kapsam:** A–M turu (çalışma günü tek kaynağı, sözleşme akışı, dashboard,
öğrenci bilgi mimarisi, evrak/veri kalıcılığı) + owner kararları 1–5.
**Dal:** `fix/schedule-contract-ux-round` · **Taban:** `d250853`

## Ön koşullar (uygulandı)

| # | Adım | Durum |
|---|---|---|
| 1 | 4 migration `neviihub-test` (`vxzewyiwfshobjizzetw`) üzerinde uygulandı | ✅ |
| 2 | `_prisma_migrations`'a doğru checksum'larla kaydedildi | ✅ |
| 3 | Migration öncesi/sonrası satır sayıları birebir aynı (veri kaybı yok) | ✅ |
| 4 | 52 evrak `draft` → `issued` taşındı; kalan `draft` = 0 | ✅ |
| 5 | Nihal → **Evka 3**, Ezgi → **Erzene** varsayılan şube atandı | ✅ |
| 6 | Production Supabase (`uqkafczrplqitzumtrqy`) ve boş `nxnjzpmmbdianywfvgaq` projesine **dokunulmadı** | ✅ |

**Migration öncesi → sonrası (test DB):**
`Student 151→151 · StudentContract 52→52 · DocumentInstance 52→52 ·
Payment 585→585 · Lesson 48→48 · LessonSeries 3→3 · UserPreference 4→4`
Yetim taksit 0 · Kayıp sözleşme nüshası 0 · Boş belge 0.

> Deploy edildikten sonra test edin. Her adımda **beklenen** yazılıdır;
> farklı bir şey görürseniz adım numarasıyla bildirin.

---

## A · Çalışma günü — zorla aç / zorla kapat

Ekran: **Ayarlar → Çalışma Günleri** (sol menüde yeni)

| # | Adım | Beklenen |
|---|---|---|
| A1 | Gelecek bir **Pazartesi** tarihi seç | "İstisnasız hali: Pazartesi (Güz dönemi kapalı) — kurumun haftalık kapalı günü. Bu güne şu an ders planlanamaz." |
| A2 | Ders Programı'nda o haftaya git | Pazartesi **sütunu hiç yok** |
| A3 | O Pazartesi'ye ders oluşturmayı dene (öğrenci detayı → Program) | Türkçe hata: neden + "Ayarlar → Çalışma Günleri ekranından günü *Zorla açık* olarak işaretleyin" |
| A4 | Çalışma Günleri'nde aynı güne **Zorla aç** (açıklama: "Bayram telafi günü") | Yeşil onay; "Zorla açık günler" listesinde görünür |
| A5 | Ders Programı'na dön | Pazartesi sütunu **görünür**, başlıkta sarı **"Zorla açık"** rozeti |
| A6 | O güne ders oluştur | **Başarılı** |
| A7 | Aynı günü Yoklama Takvimi'nde aç | **Açık** (siyah "kapalı" değil); yoklama girilebilir |
| A8 | Var olan bir dersi o Pazartesi'ye **taşı** | **Başarılı** (eski sürümde taşıma ayrı bir kuralla engelleniyordu) |
| A9 | Normalde açık bir **Perşembe**'yi **Zorla kapat** | Programda sütun kaybolur; ders oluşturma reddedilir; neden "yönetici bu günü kapattı" |
| A10 | Yeni öğrenci kaydında ders günü olarak o kapalı Perşembe'yi seç | İlk tahsilat ders sayısı **o gün sayılmadan** hesaplanır |
| A11 | İstisnayı **Kaldır** | Gün normal kuralına döner (Perşembe açık, Pazartesi kapalı) |
| A12 | "Önümüzdeki 60 gün" listesi | Her satırda gerçek neden + "Ders planlanabilir/planlanamaz" rozeti |

**Katı kural kontrolü (owner kararı #2):** A3/A9'da *hiçbir* ekrandan
Pazartesi'ye ders girilememeli. Tek kaçış yolu A4'teki "Zorla aç".

---

## B · Sözleşme oluşturma sonrası

Ekran: Öğrenci → **Sözleşmeler**

| # | Adım | Beklenen |
|---|---|---|
| B1 | Yeni sözleşme oluştur | Form kapanır, **scroll etmeden** yeşil başarı paneli görünür (otomatik kaydırılır) |
| B2 | Panel içeriği | Sözleşme no + versiyon, program, tarih aralığı, aylık/toplam tutar, taksit sayısı |
| B3 | CTA'lar | *Sözleşmeyi Görüntüle / PDF* · *Ödeme Planını Gör* · *Öğrenciye Dön* · **Ders programını oluştur** |
| B4 | "Sözleşmeyi Görüntüle / PDF" | Yeni sekmede güncel sözleşme görünümü açılır |
| B5 | Telefonda (dar ekran) tekrarla | CTA'lar tam genişlikte alt alta, taşma yok |
| B6 | "Kapat" | Panel kapanır, sözleşme listesi görünür |

---

## C · Günlük Özet (dashboard)

Ekran: `/panel`

| # | Adım | Beklenen |
|---|---|---|
| C1 | **Nihal** ile gir | Panel **Evka 3** ile açılır (başlıkta "… · Evka 3"), şube şeridinde Evka 3'te ★ |
| C2 | **Ezgi** ile gir | Panel **Erzene** ile açılır, Erzene'de ★ |
| C3 | Nihal, şeritten "Erzene" seç | Sayfa Erzene'ye döner, URL'de `?sube=erzene`; "Varsayılanım yap" butonu belirir |
| C4 | "Varsayılanım yap"a **basmadan** çıkıp gir | Yine **Evka 3** (tek seferlik bakış varsayılanı ezmez) |
| C5 | Evka 3 seçiliyken Erzene'nin gecikmiş tahsilatı | **Görünmez** |
| C6 | "Tüm şubeler" seç | İki şube de sayılır; "Şube yoğunluğu" iki satır |
| C7 | **Nilüfer** ile gir | En altta **"Bu ay öğretmen hakedişleri (yalnız kurum sahibi)"** bloğu görünür |
| C8 | Ezgi/Nihal ile aynı yere bak | Hakediş bloğu **görünmez** |
| C9 | "Aksiyon gerekli" bölümü | Yalnız yapılacak işler; gecikmiş tahsilat **en üstte** |
| C10 | "Bilgi:" şeridi | Yaklaşan vade / yakında bitecek sözleşme burada — uyarı rengi **yok** |
| C11 | Bir aksiyon kartına tıkla | İlgili ekrana (ödemeler / yoklama / öğrenciler filtreli) gider |
| C12 | Bugünün programı | Saat–öğrenci–enstrüman–öğretmen–şube–oda tek satırda; saati geçmiş statüsüzler "Yoklama bekliyor" |

---

## D · Öğrenciler — sözleşme filtreleri

Ekran: `/panel/ogrenciler`

| # | Adım | Beklenen |
|---|---|---|
| D1 | "Sözleşme" hızlı filtre şeridi | 5 chip: Aktif sözleşmeli · Yakında bitecek (30 gün) · Süresi geçmiş · Sözleşmesi yok · İptal/yenilenmiş — her birinde sayı |
| D2 | "Sözleşmesi yok"a tıkla | Liste daralır, üstte kaldırılabilir chip, sayaç güncellenir |
| D3 | Filtreler → **Sözleşme başlangıcı** | "Şu tarihten sonra / önce" tarih alanları + Türkçe açıklama |
| D4 | Filtreler → **Sözleşme bitişi** → bir tarih gir | Liste daralır; chip olarak görünür; ✕ ile kalkar |
| D5 | "Filtreleri Temizle" | Tümü sıfırlanır |
| D6 | Sütunlar → **Sözleşme** sütununu ekle | Durum rozeti + bitiş tarihi görünür |

## H · Sayfa başına kayıt

| # | Adım | Beklenen |
|---|---|---|
| H1 | Tablo altında "Sayfa başına" | **10 / 20 / 50 / 100** |
| H2 | 100 seç | 100 kayıt listelenir, URL'de `?per=100` |
| H3 | Sayfayı yenile / geri-ileri | 100 korunur |
| H4 | 10'a geri dön | URL'den `per` düşer |

## I · Sıralama

| # | Adım | Beklenen |
|---|---|---|
| I1 | Sıralama seçicisi | 8 seçenek (isim, kayıt tarihi, sözleşme bitişi/başlangıcı, ücret) |
| I2 | "İsim (A → Z)" | Türkçe sıra doğru: **Ali · Çetin · İlker** (İ sonda değil) |
| I3 | "Sözleşme bitişi (en yakın önce)" | En yakın biten üstte; **sözleşmesi olmayanlar en sonda** |
| I4 | "Kayıt tarihi (yeniden eskiye)" | En yeni öğrenci üstte |

---

## E/F · Evraklar

Ekran: `/panel/evraklar`

| # | Adım | Beklenen |
|---|---|---|
| E1 | Bir sözleşme satırında **"Sözleşmeyi görüntüle"** | Öğrenci ekranıyla **aynı** güncel görünüm (`/sozlesme-yazdir/...`) — eski jenerik evrak şablonu **değil** |
| E2 | Aynı satırda **"Arşiv nüshası"** | Belge detayı; "Arşiv nüshası (üretildiği andaki hali)" başlığı ve ne olduğunun açıklaması |
| E3 | Belge detayında "Sözleşmeyi görüntüle / yazdır" | Yine kanonik görünüm |
| F1 | Durum sütunu | **"Düzenlendi"** — "Taslak" **yazmıyor** (migration sonrası 52 belgenin hepsi) |
| F2 | Durum üzerine gel (tooltip) | "Belge üretildi ve arşivde kalıcı olarak saklanıyor." |
| F3 | Liste üstü yeşil şerit | Belgelerin kalıcı olduğu, şablon güncellemesinin geçmişi değiştirmediği yazılı |
| F4 | Liste altı not | "Arşivle belgeyi **silmez**…" |
| F5 | Öğrenci seçici | Tek öğrencinin evrakları süzülür |
| F6 | Tür / Durum / Şube chip'leri + tarih aralığı | Hepsi birlikte çalışır |
| F7 | Sütun başlıklarına tıkla (Referans, Tür, Kişi, Durum, Oluşturulma) | Sıralama yön değiştirir (ok ikonu döner), URL'de `?sort=&dir=` |

---

## J · Öğrenci detayı

Ekran: `/panel/ogrenciler/<id>`

| # | Adım | Beklenen |
|---|---|---|
| J1 | Üst sekme şeridi | **Özet · Bilgiler · Program & Yoklama · Ödemeler · Sözleşmeler · Gelişim · Evraklar** |
| J2 | Bir sekmeye tıkla | Adres değişir (`/bilgiler` vb.), **gerçek ekran açılır** — sayfa kaydırması değil |
| J3 | Sekmede sayfayı yenile | Aynı sekmede kalır (paylaşılabilir adres) |
| J4 | Kimlik başlığı | Her sekmede üstte sabit: ad, durum, tür rozetleri, öğretmen, kayıt tarihi, "Pasife Al" |
| J5 | Özet → "Aksiyon gerekli" | Gecikmiş tahsilat / sözleşme eksik / süresi doldu / açık telafi kartları; tıklayınca ilgili sekme |
| J6 | Özet → dört rakam | Toplam tahakkuk · Tahsil edilen · Kalan borç · Gecikmiş |
| J7 | Bilgiler sekmesi | Temel Bilgiler + İletişim + Dönem/İzinler + Portal Erişimi; her biri düzenlenebilir |
| J8 | Program & Yoklama | Yaklaşan/geçmiş ders, yoklama listesi, yıllık takvim, telafiler — tek ekranda |
| J9 | Sözleşme Merkezi → "Öğrenci Kaydını Düzenle" | **Bilgiler** sekmesi düzenleme modunda açılır (eski `#genel` çapası yok) |
| J10 | Sayfa yükleme hızı | Gözle görülür biçimde daha hızlı (her sekme yalnız kendi verisini çeker) |

---

## K · Tekrarlı veri girişi + sözleşmeden ders programı

| # | Adım | Beklenen |
|---|---|---|
| K1 | `/panel/ogrenciler/yeni` → "Ders günü ve saati" | **Tek bileşen** (gün + saat birlikte), Sözleşme Merkezi'ndekiyle aynı |
| K2 | "Salı 15:00" ve "Perşembe 16:00" ekle | Seçilen slotlar listelenir; altında "Bu bilgi kaydedilir…" açıklaması |
| K3 | Haftalık ders sıklığı 2 seç, 2 farklı gün ver | İlk tahsilat önizlemesi o günlerin **gerçek sayısına** göre hesaplanır |
| K4 | Kaydet → Sözleşme Merkezi | "Ders günü/saati" alanı **ön-dolu** gelir |
| K5 | Saat doğruluğu | **15:00** yazar (eski sürümde 12:00 yazıyordu — UTC hatası) |
| K6 | Sözleşmeyi oluştur → "Ders programını oluştur" | Gün/saat **tekrar sorulmaz**; yalnız öğretmen ve oda seçilir |
| K7 | **Önizle** | Kaç ders oluşacak, kaçı kapalı güne denk gelip atlanacak, kaç çakışma var |
| K8 | "Oluşturulamayacak tarihleri göster" | Tarih + Türkçe neden listesi |
| K9 | **Dersler oluştur** | "N ders oluşturuldu…" + Ders Programı'nda görünür |
| K10 | Kapalı bir güne denk gelen tarih | Sessizce üretilmez; önizlemede "atlanacak" diye yazar |

---

## L · KVKK / Fotoğraf-Video belgeleri

| # | Adım | Beklenen |
|---|---|---|
| L1 | Sözleşme Merkezi'nin en altı | "KVKK ve Fotoğraf/Video Belgeleri — ayrı arşiv nüshası" bloğu **artık burada YOK** |
| L2 | Öğrenci → **Evraklar** sekmesi en altı | Kapalı (collapsed) bir bölüm: "KVKK ve Fotoğraf/Video — ayrı arşiv nüshası oluştur" |
| L3 | Bölümü aç | Üç soru cevaplı: *Sözleşmenin parçası mı?* (evet, normal akışta gerek yok) · *Burası ne işe yarar?* (bağımsız arşiv belgesi) · *Ne zaman üretilir?* (butona basınca) |
| L4 | "İkisini birlikte oluştur" | Belgeler üretilir ve listede görünür |
| L5 | İzin kaydı olmayan öğrencide dene | Belge üretilmez, nedeni yazılır |

---

## Sözleşme iptali — ders etkisi (owner kararı #3)

| # | Adım | Beklenen |
|---|---|---|
| X1 | K9'daki gibi sözleşmeden ders üretilmiş bir öğrencide "İptal et" | Onay penceresi açılır (tek tıkla iptal **olmaz**) |
| X2 | Pencere başlığı | "SZL-… iptal edilecek" + "Sözleşme **silinmez**, arşivde kalır" |
| X3 | Ders etkisi | "Bu sözleşmeden üretilmiş **N gelecek ders** var." |
| X4 | Seçenekler | ○ **Dersler kalsın (önerilen)** — varsayılan seçili · ○ N gelecek dersi de iptal et |
| X5 | İçlerinde "İşlendi"/"Telafi" işaretli ders varsa | "… ders kuralları gereği korunur" + nedeni yazılır |
| X6 | "Dersler kalsın" ile onayla | Sözleşme iptal olur, **dersler programda kalır**; üstte özet mesaj |
| X7 | "Dersleri de iptal et" ile onayla | Sözleşme + uygun dersler iptal; korunanların sayısı mesajda |
| X8 | Vazgeç / ESC / dışarı tıkla | Hiçbir şey olmaz |
| X9 | Ders üretilmemiş sözleşmede | "Bu sözleşmeden üretilmiş gelecek ders yok; ders programı etkilenmeyecek." |

---

## G · Veri kalıcılığı

| # | Adım | Beklenen |
|---|---|---|
| G1 | Sunucuda `npm run verify:durability` (test DATABASE_URL ile) | **0 kritik bulgu** |
| G2 | `STORE_MODE=json` ile çalıştır | `[KRİTİK] runtime: … /tmp … SİLİNİR` uyarısı, exit 1 |
| G3 | `npx prisma migrate status` | "up to date" |
| G4 | `docs/operations/DATA_DURABILITY_AND_GO_LIVE.md` §6 | Kontrol listesi sırayla işaretlenebilir |

---

## Kabul kriteri

- A3/A9 **hiçbir** ekrandan aşılamıyor (katı kural).
- F1'de **hiçbir** belgede "Taslak" yazmıyor.
- E1 ve öğrenci ekranı **aynı** sözleşme görünümünü açıyor.
- C1/C2 doğru şubeyle açılıyor, C8'de hakediş bloğu gizli.
- K5'te saat doğru.
- X1'de tek tıkla iptal **olmuyor**.

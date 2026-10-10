# UAT — 2026-09-22 Operasyon / UX / Güvenlik turu

Hedef ortam: **https://test.neviihub.com**  
Dal: `fix/schedule-contract-ux-round` → `test` (deploy sonrası)

Her madde için: geç / kal / not.

---

## A) Öğrenciler — filtre + arama

1. `/panel/ogrenciler` aç.
2. "Aktif sözleşmeli" (veya başka sözleşme) filtresini seç.
3. Arama kutusuna hızlıca öğrenci adı yaz (en az 6–8 karakter, duraksamadan).
4. **Beklenen:** karakter silinmez, imleç zıplamaz, yazı anında görünür; liste local filtreyle güncellenir.
5. Filtreyi değiştirirken yazmaya devam et — metin korunmalı (debounce yarışı yok).
6. "Filtreleri Temizle" — arama kutusu da boşalmalı.

## B) Günlük özet — kişiselleştirilebilir düzen

1. `/panel` aç.
2. "Düzeni düzenle" (veya eşdeğeri) ile bir bölümü gizle, birini yeniden sırala, boyut değiştir.
3. Sayfayı yenile / çıkış yapıp aynı kullanıcıyla gir.
4. **Beklenen:** son düzen aynı; başka kullanıcıda (Nihal vs Ezgi) düzen karışmaz.
5. "Varsayılana dön" — rol varsayılanına döner.
6. SUPER_ADMIN olmayan hesapta hakediş bloğu asla görünmez.

## C) Telafi Merkezi — aksiyon bekleyenler

1. `/panel/telafi` — açık talep olan kart bul.
2. **Beklenen:** tek "Görev oluştur" (küçük/sakin); şube adı bir kez.
3. Görev linki `/panel/is-takip/liste?...&returnTo=/panel/telafi` çalışır.

## D) Devamsızlık riski taşıma

1. `/panel/ogrenciler` — tepede "Devamsızlık riski" kartı **yok**.
2. `/panel/yoklama-raporu` — risk özeti var (yüksek/orta), öğrenci adına tıklanınca öğrenci detayına gider.

## E) Öğretmen detay IA

1. `/panel/ogretmenler/[id]` — sekme navigasyonu (Özet / Bilgiler / …).
2. Her sekmeye tıklayınca **yalnız o içerik**; uzun tek sayfa + #anchor yok.
3. Eski derin linkler (`/musaitlik`, `/performans`, `/hakedis`, `/odemeler`, `/geri-bildirim`) çalışır.
4. Geri → öğretmen listesi.

## F) Ödemeler → Tahsilat takibi geri

1. `/panel/odemeler` → "Tahsilat takibini aç".
2. Üstteki Geri: **Ödemelere dön** (AI Özet değil).
3. Öğrenci ödemeleri sayfasından aç → geri o öğrenci ödemelerine.

## G) Global arama

1. Üst arama / ⌘K aç, bir şey yaz.
2. Escape → kapanır, sorgu temizlenir.
3. Boş alana (scrim) tıkla → kapanır.
4. Tetikleyiciye tekrar bas → kapanır.

## H) Personel performans (Nilüfer / SUPER_ADMIN)

1. `/panel/personel` → bir personel → Performans.
2. Metrikler gerçek veriye dayanır (görev tamamlama, zamanında/erken/geç, tahsilat sayıları).
3. SCHOOL_ADMIN / TEACHER bu ekranı göremez (personel zaten SUPER_ADMIN).

## I) Boş şablona sıfırla — güvenlik

1. test.neviihub.com `/panel/kurulum` — **"Boş şablona sıfırla" butonu YOK**.
2. Yerine ortamda kapalı olduğuna dair bilgilendirme metni olabilir.
3. (Negatif) API/action çağrısı yapılamıyorsa FORBIDDEN — production/test'te store silinmez.

## J) Sözleşme — ilk tahsilat tutarı

1. Öğrenci kaydında ilk tahsilatı bilerek **1 TL** gir (veya mevcut 1 TL kaydı bul).
2. Sözleşme ekranı "Kayıttan gelen bilgiler → İlk tahsilat → Düzenle" → **7000 TL** kaydet.
3. **Beklenen:** kart, önizleme ve yenileme sonrası her yerde **7000 TL**; 1 TL yapışmaz.
4. Sayfayı hard-refresh ile doğrula.

---

## Regresyon smoke

- Öğrenci detay sekmeleri hâlâ çalışıyor.
- Öğretmen listesi / oluşturma bozulmadı.
- Ödemeler tablosu ve tahsilat işaretleme çalışıyor.

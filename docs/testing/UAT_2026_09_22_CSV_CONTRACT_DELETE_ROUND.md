# UAT — 2026-09-22 CSV ilk sözleşme, tek şablon, güvenli öğrenci silme, sözleşmesiz kayıt

Branch: `fix/schedule-contract-ux-round`. Migration: `20260922180000_student_soft_delete_critical_password`
(yalnız alan ekler). Onarım: `scripts/repair-csv-students-contract-ready.ts`.

Ön koşul: test ortamında migration uygulanmış ve onarım scripti `--apply` ile çalıştırılmış olmalı
(bkz. `docs/operations/RUNBOOK_2026_09_22_CSV_CONTRACT_DELETE.md`).

## A — CSV öğrencisi, ilk sözleşme
1. Veri Aktarım Merkezi → Öğrenci CSV ile yeni bir öğrenci yükleyin (ya da sözleşmesi olmayan eski bir CSV öğrencisini açın).
   - Beklenen: öğrenci detayında öğrenci numarası (S…) var; "Sözleşme bekliyor" uyarısı sarı, hata kırmızısı değil.
2. Sözleşme Merkezi → yeni sözleşme. Süre 3+ ay. "İlk tahsilat (ilk sözleşme)" bölümünde tutarı **1** girin.
3. "Ödeme Planını Önizle".
   - Beklenen: tablo DOLU — "Tahsilat türü" (İlk tahsilat / Dönem ücreti) ve "Kapsanan dönem" sütunlarında değer var; 1. satır **1 TL**.
4. İlk tahsilat alanını **7000** yapın (veya tablodaki 1. satırı 7000 yapın; iki alan aynı değeri gösterir).
   - Beklenen: 1. satır, "İlk Tahsilat Tutarı" kutusu ve toplam anında 7000'e göre güncellenir.
5. Sözleşmeyi oluşturun.
   - Beklenen: hata yok ("1. taksitle aynı değil" reddi YOK). Ödemeler ekranında 1. taksit 7000 TL, tahsil edildi.
6. Sayfayı yenileyin → Sözleşme Merkezi'ndeki "Kayıttan gelen bilgiler" kartında ilk tahsilat 7000 TL görünür; "Düzelt" ile değiştirilebilir.
7. "Sözleşmeyi Görüntüle / PDF" → HİZMET BEDELİ sütununda "İlk tahsilat — …", "Dönem ücreti — …" yazar; çıplak "EĞİTİM" yok.
8. Aynı adımları uygulamadan oluşturulmuş normal bir öğrenciyle tekrarlayın → bölüm başlıkları, tablo düzeni ve etiketler aynı.

## B — Tek kanonik sözleşme görünümü
1. Aynı sözleşmeyi Öğrenci detayı → Güncel sözleşme, Sözleşme Merkezi ve Evraklar ekranından açın → hepsi aynı `/sozlesme-yazdir/…` sayfasına gider, içerik aynıdır.

## C — Güvenli öğrenci silme (yalnız kurum sahibi)
1. SCHOOL_ADMIN ile öğrenci detayı → "Öğrenciyi sil" düğmesi görünmez.
2. SUPER_ADMIN ile, kritik işlem şifresi belirlenmeden "Öğrenciyi sil" → 1. adımda "Kritik işlem şifresi belirlenmemiş" uyarısı ve Ayarlar → Güvenlik bağlantısı; "Devam et" pasif.
3. Ayarlar → Güvenlik → şifre belirleyin (en az 8 karakter, iki kez). Değiştirirken mevcut şifre istenir.
4. Ödemesi olan bir öğrencide "Öğrenciyi sil" → etki özeti: sözleşme, ödeme, tahsil edilen, açık borç, ders, evrak sayıları. "Kalıcı silme" seçeneği pasif ve nedeni yazıyor.
5. Geri alınabilir silme → 2. adım: gerekçe + öğrencinin adı + kritik şifre.
   - Yanlış şifre → "Kritik işlem şifresi yanlış. Öğrenci silinmedi."
   - Yanlış ad → "Onay için öğrencinin adını aynen yazın: …"
6. Doğru bilgilerle sil → öğrenci listesinden kaybolur; kurum sahibi listede "Silinen öğrenciler (N)" bağlantısını görür.
7. Silinen öğrenciyi açın → kırmızı bant (kim, ne zaman, gerekçe) + "Silmeyi geri al". Geri al → öğrenci pasif olarak döner.
8. Hiç kaydı olmayan deneme öğrencisinde "Kalıcı silme" seçilebilir; uyarı "GERİ ALINAMAZ" yazar; silince listeye yönlenir.
9. Audit log'da `student.delete_soft|hard|restore` satırları (başarılı ve reddedilen denemeler dahil).

## D — Sözleşmesiz kayıt
1. Öğrenciler → Yeni Öğrenci. Formun sonunda iki düğme: "Kaydet ve sözleşme oluştur" / "Sadece öğrenci kaydını oluştur".
2. "Sadece öğrenci kaydını oluştur" → öğrenci detayına gider (Sözleşme Merkezi'ne değil); "Sözleşme bekliyor" sarı uyarısı.
3. Öğrenciler listesi → Sözleşme filtresi: "Sözleşme bekliyor" bu öğrenciyi gösterir; tanışma paketi (1–2 ay) öğrenciler "Sözleşmesiz (tanışma)".
4. Sonra Sözleşme Merkezi'nden sözleşme oluşturun → A'daki gibi dolu önizleme ve normal şablon.
5. Ders planlama sözleşme istemez (mevcut ürün kuralı): sözleşmesiz öğrenciye ders planlanabilir.

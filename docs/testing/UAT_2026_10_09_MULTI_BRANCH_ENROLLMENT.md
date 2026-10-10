# UAT 2026-10-09 — Çoklu branş kaydı + grup başvurusu ders süresi

Dal: `feat/multi-branch-enrollment` → PR (main). Test ÇALIŞTIRILMADI; yalnız statik kontrol (typecheck, lint).

## Model (kısa)
- Branş kaydı = mevcut `Student.enrollments[]` (kalıcı `id`). Ana/yedek ayrımı YOK; tüm branşlar aynı formdan düzenlenir
  (Özet → "Branş kayıtları": tür, öğretmen, süre, haftalık ders, paket/ücret/indirim, ödeme yöntemi/günü, kayıt ve ders
  başlangıcı, ders gün/saati, sözleşme süresi; "Sonlandır" bitiş tarihi + gerekçe).
- İç ayrıntı: ilk branşın koşulları eski ekranlar bozulmasın diye öğrenci satırında, diğerlerininki kendi kaydında; tek
  okuma kapısı `enrollmentTerms` (student-enrollments.ts). Bir branş diğerinin ücretini/türünü ASLA miras almaz.
- Açık bağ: `Lesson/LessonSeries/StudentContract.enrollmentId` (vardı) + YENİ `Payment.enrollmentId`.
  Yeni kayıtlar her zaman açık bağla yazılır; ders/seri yazımı branşı tek eşleşmeden çözer, belirsizse reddeder.
- NULL (eski) bağ: öğrencinin TEK branşı varsa ona aittir; birden fazlaysa "Branş belirtilmemiş" — tahmin yok,
  "Branşa bağla" ile açıkça bağlanır. İkinci branş eklenmeden ÖNCE bağsız kayıtlar mevcut tek branşa bağlanır.

## Yayın sırası (ZORUNLU)
1. Migration `20261009120000_payment_enrollment_link` (yalnız nullable kolon + indeks, veri değiştirmez) **kod deploy'undan
   ÖNCE** hedef DB'ye uygulanmalı — kod `Payment.enrollmentId` okur/yazar; kolon yoksa ödeme okumaları P2022 ile kırılır.
2. Kod deploy (merge).
3. (Önerilen, zorunlu değil) Backfill — önce kuru çalıştırma, raporu inceleyin, sonra `--apply`:
   `STORE_MODE=db npx tsx scripts/backfill-enrollment-links.ts --report backfill.json`
   `STORE_MODE=db npx tsx scripts/backfill-enrollment-links.ts --apply`
   Uygulama backfill olmadan da doğru çalışır (okuma anında aynı kural); backfill açık bağları kalıcı yazar ve belirsiz
   kayıtları listeler. Belirsizler uygulamada "Branşa bağla" ile çözülür.

## Bilinen sınırlar
- Öğrenciler listesindeki sözleşme filtresi öğrenci başına tek güncel sözleşmeye bakar (çok branşlıda en yüksek sürüm).
- Aynı enstrümanda iki aktif branş + bunların öğretmeni olmayan bir öğretmenle seri planlama reddedilir (tekil ders
  planlamada branş seçilebilir).
- Ek branş eklerken ilk tahsilat ayrıca alınmaz; o branşın ilk sözleşmesinde "İlk tahsilat" bölümünden girilir
  (sözleşmesiz branşta Yoklama Takvimi ay kutusundan tahsil edilir).

## Owner test listesi
1. Tek branşlı mevcut öğrenci: Özet/Ödemeler/Sözleşme/Program ekranları eskisi gibi; branş seçici görünmez.
2. Özet → "Branş kaydı ekle": Piyano + farklı öğretmen + Hobi türü + kendi ücreti → kayıt; Keman kaydı değişmedi.
3. Bir branşı "Düzenle" ile ücret/tür değiştir → diğer branşın değerleri aynı kaldı.
4. Sözleşme Merkezi: Keman ve Piyano sekmeleri; her birinde ayrı İLK sözleşme oluşur (biri diğerini engellemez).
   Başlık/PDF adı: "Ad Soyad — Keman — Öğrenci Sözleşmesi — 2026/2027".
5. Keman taksitini tahsil et → Piyano borcu değişmedi; Ödemeler sekmesindeki "Branş bazında finans" tablosu doğru.
6. Program → Yoklama Takvimi: branş çipleri; Keman ay kutusundan tahsilat yalnız Keman planına yazıldı.
7. Keman dersinde Telafi → yalnız Keman telafi hakkı azaldı (Telafi Merkezi'nde branş satırları ayrı).
8. Öğretmen hakedişi: her ders kendi öğretmen/süresiyle bir kez görünür.
9. Piyano branşını "Sonlandır" → öğrenci aktif kaldı, Keman aktif; açık ders/sözleşme varsa uyarı göründü.
10. Ödemeler (genel liste) ve makbuz: çok branşlı öğrencinin satırında branş adı.
11. Grup başvurusu: grup seçince "Ders süresi: X + Y dakika", "Keman: X dk + Solfej: Y dk", "N ders Keman + M ders
    Solfej" ve aylık ücretli grupta "N aylık toplam ücret"; dahil solfejsiz grupta yalnız ana süre; grup değişince anında güncellenir.

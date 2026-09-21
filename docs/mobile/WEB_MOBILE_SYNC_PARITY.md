# Web ↔ Mobil senkron ve parite matrisi (tüm personalar)

- Tarih: 2026-09-20 · Branch: `release/mobile-review`.
- İlke: mobilde client-only yetkilendirme, sahte veri ve istemci-tarafı
  finans hesabı YOK. Öğrenci/veli/öğretmen mobilde okur; admin mobilde
  P0/P1 saha operasyonunu yürütür (geri kalan web'de).
- Mobilin kullandığı TÜM `/api/v1` yollarının backend karşılığı var
  (KNOWN_MISSING boş — `api-contract.test.ts` kilitli).

## 1. Senkron noktaları (mobil tazeleme)

| Veri | focus | foreground | pull-to-refresh | yeniden açılış | Kaynak uç |
|---|---|---|---|---|---|
| Devam raporu + sayaçlar | ✅ | ✅ | ✅ | ✅ | `attendance-ledger` (+ legacy `attendance-summary` ana sayfa kartı) |
| Telafi listesi/detayı | ✅ | ✅ | ✅ (liste) | ✅ | `makeup-ledger` |
| Ödemeler + detay | ✅ | ✅ | ✅ (liste) | ✅ | `payment-ledger` (+ `payments/:id/receipt`) |
| Çocuk listesi (erişim iptali) | ✅ (picker) | ✅ (ana sayfa) | ✅ (ana sayfa) | ✅ | `mobile/my-children` |
| Sözleşmeler | ✅ | ✅ | ✅ | ✅ | `students/:id/contracts` |
| Bildirimler | ✅ | ✅ | ✅ | ✅ | `notifications` (+ push) |

Cache kuralı: liste seçim/URL değişince skeleton'a döner; eski öğrencinin
satırı gösterilmez. Dosya URL'leri loglanmaz, kalıcı cache'e yazılmaz.

## 2. Statü eşleşmesi (backend ↔ mobil TR etiket)

| Backend | Mobil etiket | Not |
|---|---|---|
| `lessonProcessed` | İşlendi | Hakediş kaynağı (aynen) |
| `studentAttended` | Geldi | |
| `opsMakeupFlag` | Telafi | Raporda; ders kartında "Telafi bekliyor" (mevcut rozet) |
| `studentAbsent` / `no_show` | Gelmedi | |
| `studentExcused` | İzinli | Backend'de ayrı "Mazeretli" state YOK — uydurulmadı |
| `cancelled` | İptal edildi | |
| `in_progress` | Devam ediyor | |
| sonuçlanmamış geçmiş | Henüz sonuçlanmadı | "Yoklama bekliyor" jargonu kaldırıldı |
| gelecek | Planlandı | Sonuç uydurulmaz |

Ödeme statüleri (`paid/pending/overdue/partial/voided`) ve telafi statüleri
(`pending/suggested/awaiting_info/confirmed/completed/expired/cancelled`)
birebir eşlenir; bilinmeyen değer olduğu gibi gösterilir.

## 3. Finans paritesi

- `payment-ledger.outstanding` === `balance.outstanding` (aynı formül, test kilitli).
- Ay özetleri + CSV toplamları sunucuda hesaplanır; istemci toplamaz.
- Tutarlar tam sayı TL; ay gruplama `dueDate` (YYYY-MM) üzerinden.
- Fiyatlandırma/tahsilat kurallarına dokunulmadı.

## 4. Öğretmen paritesi (mobil salt-okunur + dar yazmalar)

| Web (ogretmen/*) | Mobil (teacher) | Not |
|---|---|---|
| Program (gün/hafta) | ✅ Bugün/program | Aynı schedule ucu |
| Yoklama işleme (ops) | ❌ Bilinçli YOK | Mobil öğretmen salt-okunur (`teacher-read-only.test.ts`); web akışı korunur |
| Ödev oluşturma/detay | ✅ | `homework:write` |
| Materyal yönetimi | ✅ | `materials:write` |
| Müsaitlik önerisi | ✅ Salt-görünüm + öneri | Onay admin'de |
| Performans/hakediş | ✅ Özet | Hesap sunucuda |
| İş takibi | ✅ | tasks uçları |
| Bildirim tercihleri | ✅ | Aynı preference ucu |
| Push | ✅ 1s/15dk (1g YOK) | Sweep test kilitli |

## 5. Admin paritesi (P0/P1/P2 scope)

| Web (panel/*) | Mobil (admin) | Not |
|---|---|---|
| Bugün özeti | ✅ Özet sekmesi | `dashboard/summary` |
| Program + ders detay | ✅ | `lessons?from&to` + reassign |
| Yoklama işleme | ✅ 5 bayrak + gerekçe + iptal | ops `confirmSwitch` + cancel (idempotent) |
| Kişiler (öğrenci/personel) | ✅ Arama + sayfalama + detay | Sunucu `q/limit/offset`; tap-to-call |
| Portal erişimi | ✅ Liste + davet/iptal/yeniden-açma | Auditli, idempotent reactivate |
| Finans özeti + tahsilat | ✅ Özet + vaka takibi | `payments/summary`; tahsilat `pay` (idempotent) |
| Duyuru gönderimi | ✅ Hedef + önizleme + yayın | Audience paritesi (8 tip) |
| Telafi/izin/müsaitlik onayı | ✅ | Not + stale CONFLICT |
| İş takibi | ✅ Liste + detay + KPI | `tasks/kpi` route'u eklendi |
| Ödev raporu / öğretmen performansı | ✅ | `homework/report` + performance |
| Bordro/gider/kurulum ayarları | ❌ Web-only | Mobilde sahte form YOK, yönlendirme notu var |
| Hakediş ödeme işaretleme | ✅ | `mark-paid` + audit |

## 6. Bilinen farklar / açık noktalar

- "Mazeretli" ayrı filtresi yok (backend state'i yok) — `excused` İzinli altında.
- Ödeme→ders kırılımı yalnız `lessonId`'li kalemlerde (paket/taksit ödemelerde
  ders satırı doğal olarak boş).
- Telafi `decisionNote` ve ders operasyon notları öğrenci/veli yüzeyine kapalı
  (rol-bazlı; öğretmen/admin görür).
- Export biçimi CSV (TR-Excel uyumlu); PDF raporu backend'de yok — uydurulmadı.

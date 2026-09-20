# Web ↔ Mobil senkron ve parite matrisi (öğrenci/veli)

- Tarih: 2026-09-20 · Branch: `release/mobile-review`.
- İlke: yazma web'de (admin/öğretmen), okuma mobilde; mobilde client-only
  yetkilendirme, sahte veri ve istemci-tarafı finans hesabı YOK.

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

## 4. Bilinen farklar / açık noktalar

- "Mazeretli" ayrı filtresi yok (backend state'i yok) — `excused` İzinli altında.
- Ödeme→ders kırılımı yalnız `lessonId`'li kalemlerde (paket/taksit ödemelerde
  ders satırı doğal olarak boş).
- Telafi `decisionNote` ve ders operasyon notları öğrenci/veli yüzeyine kapalı
  (rol-bazlı; öğretmen/admin görür).
- Export biçimi CSV (TR-Excel uyumlu); PDF raporu backend'de yok — uydurulmadı.

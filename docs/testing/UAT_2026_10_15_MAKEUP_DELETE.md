# UAT 2026-10-15 — Telafi ↔ ders silme tutarsızlığı

## Kök neden
- Ders başına tek yoklama (`Attendance.lessonId @unique`), yoklama başına tek telafi talebi (`MakeupRequest.attendanceId @unique`).
- Telafi → "Geri al" (veya hak iptali) talebi `cancelled` yapar, yoklama satırı FK çapası olarak kalır.
- Yeniden "Telafi": saf katman aynı yoklamaya İKİNCİ talep kuruyordu; db yazıcısı (`persistLessonOpsResult`) ilk eşleşen
  (kapanmış) talebi görüp "zaten var" deyip hiçbir şey yazmıyordu → ders "Telafi", Telafi Merkezi'nde açık talep yok.
- Silme (`lessonHardBlockReason`) kapanmış talebi de "bağlı telafi var" sayıyordu → görünmeyen bağ silmeyi engelliyordu.

## Düzeltme
- Tek kural `makeup-deadline.ts`: `isPassiveMakeup` / `makeupLinksOfLesson` (aktif = açık/planlı/gerçekleşmiş; pasif =
  iptal/süresi dolmuş ve canlı telafi dersi yok). Silme önizlemesi, normal/kritik silme ve yeniden Telafi bunu kullanır.
- Yeniden Telafi kapanmış talebi YENİDEN AÇAR (`reopenMakeupRequest`, changeLog `reopened`); db'de aynı Serializable
  transaction + kota kilidi + koşullu `updateMany` (çift istek ikinci kez açamaz).
- Kritik "Tamamen sil": pasif talep(ler) + yoklama + ders tek transaction'da silinir; (tenant, öğrenci) advisory lock ile
  eşzamanlı yeniden Telafi'ye karşı yeniden kontrol. Aktif telafi varsa durum + tarih + "Telafi Merkezi" yönlendirmesiyle ret.
- Migration YOK. Veri onarımı GEREKMİYOR: bozuk kayıt (Telafi işaretli + yalnız iptal talep) "Tamamen sil" ile silinir,
  ya da "Geri al" → "Telafi" ile talep yeniden açılır.

## Canlı kayıt — SALT-OKUNUR teşhis (owner çalıştırır; bu oturumdan canlı DB erişimi yoktu)
Supabase SQL Editor (prod `wsbucznpujcfzhitzrbl`). Yalnız SELECT; hiçbir satır değişmez.

```sql
BEGIN TRANSACTION READ ONLY;

-- 1) Örnek: öğrencinin 19 Eylül (İstanbul) dersleri ve telafi/yoklama bağları
SELECT l.id AS lesson_id, l."tenantId", l."startAt", l.status, l.type, l."opsMakeupFlag",
       (SELECT count(*) FROM "Attendance" a WHERE a."lessonId" = l.id) AS attendance_rows,
       (SELECT json_agg(json_build_object('id', m.id, 'status', m.status, 'confirmedLessonId', m."confirmedLessonId",
                                          'decidedAt', m."decidedAt"))
          FROM "MakeupRequest" m WHERE m."sourceLessonId" = l.id) AS makeup_requests
FROM "Lesson" l
JOIN "Student" s ON s.id = l."studentId" AND s."tenantId" = l."tenantId"
WHERE s.name ILIKE 'Zehra%Çiçek%'
  AND l."startAt" >= TIMESTAMPTZ '2026-09-19 00:00 Europe/Istanbul'
  AND l."startAt" <  TIMESTAMPTZ '2026-09-20 00:00 Europe/Istanbul';

-- 2) Aynı durumdaki tüm dersler: Telafi işaretli ama açık talebi yok (yalnız kimlik/durum)
SELECT l."tenantId", l.id AS lesson_id, l."startAt", m.id AS request_id, m.status AS request_status
FROM "Lesson" l
JOIN "MakeupRequest" m ON m."sourceLessonId" = l.id AND m."tenantId" = l."tenantId"
WHERE l."opsMakeupFlag" = true
  AND NOT EXISTS (SELECT 1 FROM "MakeupRequest" x
                  WHERE x."sourceLessonId" = l.id AND x."tenantId" = l."tenantId"
                    AND x.status NOT IN ('cancelled', 'expired'))
ORDER BY l."startAt";

ROLLBACK;
```
Beklenen (1): `opsMakeupFlag = true`, 1 yoklama satırı, tek talep `status = cancelled`. Farklıysa (ör. `confirmed` /
`completed`) bu gerçek bir telafidir — silmeyin, sonucu paylaşın.

## UAT (deploy sonrası, canlı)
1. Ders Programı → örnek ders → "Hatalı oluşturuldu — programdan sil" → gerekçe + kritik şifre → "korunan" mesajı sonrası
   pencere "Tamamen sil" moduna geçer → onay. Ders, yoklaması ve iptal edilmiş eski telafi izi silinir; denetim kaydında
   `lesson.delete_protected` (`removedMakeupRequestIds`).
2. Sentetik eşdeğer (test öğrencisi): ders → Telafi → Geri al → Telafi → Telafi Merkezi'nde talep "bekliyor" görünür
   (eskiden görünmüyordu) → aynı dersi silmeyi dene → "geçerli bir telafi var (planlanmayı bekliyor…)" reddi.
3. Telafi Merkezi'nden talebi iptal et → "Tamamen sil" başarılı.

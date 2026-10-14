# UAT — Telafi yaşam döngüsü + "Geldi" notu (2026-10-14)

**Önkoşul:** migration `20261014160000_makeup_lifecycle_note` canlıya KODDAN ÖNCE (owner onayı, session pooler 5432).
Eklemeli: `Lesson.studentAttendanceNote` (null), `MakeupRequest.changeLog` (JSONB, varsayılan `[]`), 1 indeks.
**Geri dönüş:** kod geri alındıktan sonra 3 nesneyi ters sırada DROP edin (indeks → `changeLog` → `studentAttendanceNote`).

## Durum-geçiş tablosu
| Olay | Talep durumu | Kaynak ders | Telafi dersi | Yoklama | Hakediş/ücret |
|---|---|---|---|---|---|
| Planlanmamış talebin son yerel günü bitti (ertesi gün 00:00, kurum saat dilimi) | `expired`, neden "Telafi planlama süresi doldu" | "İşlendi" (aynı gerekçe) | yok | **"Geldi" olmaz**, gerçekleşmiş telafi üretilmez | Mevcut "İşlendi" kuralı (`isLessonProcessedForPayout`) aynen; yeni finansal kural YOK |
| Planlanmış talep, eski son gün geçti | değişmez (`confirmed`) | değişmez | korunur | — | — |
| Yönetici son günü uzatır | `expired` → açık (`pending`) | "İşlendi" kapanışı geri alınır (yalnız bu gerekçeyse) | yok | — | — |
| Plan revize (tarih/saat/öğretmen/oda) | `confirmed` | — | aynı ders güncellenir (ikinci ders açılmaz) | — | — |
| "Planı sil" | açık (`pending`), hak korunur | korunur | iptal edilir, slot boşalır | — | — |
| "Telafi hakkını iptal et" | `cancelled` (ayrı onay) | korunur | planlıysa iptal | — | — |
| Yoklaması/finansal etkisi olan telafi | yukarıdakiler **açık onay + gerekçe** ister; veri silinmez | — | iptal/ters işlem | iz kalır | audit + `changeLog` |

Her uzatma/revizyon/silme/iptal `MakeupRequest.changeLog` içine (kim, ne zaman, eski → yeni) yazılır.

## Adımlar (yönetici)
1. Süresi geçmiş, planlanmamış bir telafi → Telafi Merkezi'nde "Süresi doldu"; kaynak ders Yoklama/Program'da **İşlendi — Telafi planlama süresi doldu**; "Geldi" değil.
2. Aynı derste hakediş özetine bak → ders mevcut "İşlendi" kuralıyla sayılır (değişiklik yok).
3. Son günü **dün** bir talepte tam sınır: bugün 00:00'dan önce açık, sonra `expired`.
4. Süresi dolan talepte "Son günü uzat" → yeni gün gelecekte → talep açılır, kaynak ders "İşlendi" kapanışı kalkar → Planla.
5. Planlanmış talepte eski son günün geçmesi talebi KAPATMAZ.
6. "Planı sil" → onay penceresi sonucu söyler (ders iptal, slot boşalır, hak ve kaynak ders korunur) → onayla → talep tekrar planlanabilir.
7. "Telafi hakkını iptal et" → ayrı onay → hak kapanır, kaynak ders silinmez.
8. Yoklaması işaretli telafide Planı sil/revize → "düzeltme onayı + gerekçe" ister; onaysız reddedilir.
9. Aynı hakka iki sekmeden aynı anda plan → ikincisi Türkçe nedenli reddedilir.
10. Başka kurumun talep id'siyle istek → bulunamadı; öğretmen/veli rolü → yetki hatası.

## "Geldi" notu
11. Ders/telafi yoklamasında **Geldi** → isteğe bağlı not alanı; boş notla kayıt çalışır.
12. Not yaz → kaydet → sayfayı yenile → görünür. Düzenle → görünür. Boşalt → temizlenir.
13. Geldi → Gelmedi/Mazeretli → tekrar Geldi: not statü değişiminde sessizce silinmez.
14. Mobil (Yoklama + Ders detayı): "Geldi notu (isteğe bağlı)" alanı; aynı API (`/api/v1/lessons/<id>/ops`, `attendanceNote`).
15. Not eklemek hakediş/ücreti değiştirmez.

## Deploy öncesi finansal etki (OWNER karar verir)
Süre kapatma bugüne kadar yalnız okuma anında türetiliyordu; DB'de bu talepler hâlâ `pending/suggested/awaiting_info`.
Deploy sonrası ilk okumada **geçmişte** süresi dolmuş her planlanmamış talebin kaynak dersi tek seferde "İşlendi" olur.
"İşlendi" = ders fiilen verildi sayılır (`isLessonProcessedForPayout`): öğretmen hakedişine girer (Telafi bayrağı dersleri girmiyordu).
Kayıtlı hakedişlerin ders kalemleri `lineSnapshot` ile donmuştur; etki esas olarak henüz kaydedilmemiş dönemlerin canlı hesabıdır.
Eski (snapshot'sız) kayıtlı hakedişler dersten yeniden hesaplanabilir — owner bu kayıtlara bakmalı.

Salt-okunur sayım (hiçbir şey yazmaz; Supabase SQL editöründe):
```sql
SELECT m."tenantId", count(*) AS kapanacak_talep,
       count(*) FILTER (WHERE EXISTS (
         SELECT 1 FROM "TeacherPayout" p
         WHERE p."teacherId" = l."teacherId" AND p.status <> 'cancelled'
           AND l."startAt" >= p."periodStart" AND l."startAt" <= p."periodEnd")) AS kayitli_hakedise_dusen
FROM "MakeupRequest" m
JOIN "Lesson" l ON l.id = m."sourceLessonId"
WHERE m.status IN ('pending','suggested','awaiting_info')
  AND m."confirmedLessonId" IS NULL
  AND m."expiresAt" < now() - interval '1 day'
  AND l.status <> 'cancelled'
  AND l."studentAttended" IS NOT TRUE
GROUP BY 1;
```
Seçenek: yalnız deploy SONRASI dolan süreleri kapatmak (geçmişe dokunmadan) istenirse kod tek bir kesme tarihi eklenerek
değiştirilir — owner kararı beklenir; varsayılan şu an geçmişi de kapatır.

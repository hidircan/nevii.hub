---
name: scheduling-attendance-makeup
description: Ders, program, öğretmen/oda uygunluğu, yoklama, telafi, kota, SLA ve ders statülerini ele alır.
---

## Ne zaman kullanılır
`src/lib/makeup-quota.ts`, `src/lib/attendance-calendar.ts`, ders programı/
yoklama/telafi ile ilgili herhangi bir değişiklik.

## İlk okunacak minimum proje-beyni dokümanları
`docs/project-brain/SCHEDULING_ATTENDANCE_MAKEUP.md` →
`docs/agent-memory/LESSONS_LEARNED.md` kural #1-3, #8 (ZORUNLU, bu alanda en
çok tekrarlanan hata sınıfı burada).

## İncelenecek minimum kod alanları
`src/lib/makeup-quota.ts` (⚠️ şu an commit edilmemiş değişikliğin içinde —
önce `git diff` ile mevcut hali gör), `resolveLessonAcademicPeriod`,
`store-db.ts`'deki `pg_advisory_xact_lock` kullanımı (concurrency).

## Güvenlik/iş kuralı kontrolleri
- Aynı-gün iptal HİÇBİR ZAMAN `markedAt`/yoklama timestamp'inden
  türetilmiyor mu?
- Kota yıl bazında mı (dönem değil)?
- 30 günlük süre orijinal kaçırılan ders tarihinden mi hesaplanıyor?
- Concurrency: eşzamanlı iki kota talebi çifte-hak yaratmıyor mu (db modunda
  advisory lock, json/memory'de fileParallelism:false varsayımı bozulmuyor
  mu)?

## Hangi testler
`makeup-quota` testleri + concurrency/race-condition testi (varsa) + üç
store modu paritesi.

## Çıktı formatı
Kural bazlı doğrulama: hangi LESSONS_LEARNED kuralının etkilendiği + test
sonucu.

## CEO onayı gereken işlemler
Kota sayısı/süre gibi politika değerlerini değiştirmek — bunlar
DECISIONS.md'de FINAL olarak kayıtlı, CEO onayı olmadan değiştirilmez.

## Sık yapılan hatalar
- Aynı-gün iptali heuristic'le tespit etmeye çalışmak (denendi, geri
  alındı — LESSONS_LEARNED #1).
- Kota hesabını dönem bazlı yapmak (yıl bazlı olmalı).
- Store paritesini bozmak (tek moda fix uygulamak).

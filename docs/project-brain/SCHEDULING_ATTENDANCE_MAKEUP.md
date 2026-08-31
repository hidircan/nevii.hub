# SCHEDULING_ATTENDANCE_MAKEUP.md — pointer

Kaynak: `docs/agent-memory/LESSONS_LEARNED.md` kural #1-3, #8 +
`../policies/NILUFER_ACAR_PAYMENT_MAKEUP_POLICY_IMPLEMENTATION_REPORT.md`.

## Değişmez kurallar — DOĞRULANDI
1. Aynı-gün iptal (telafi hakkı doğurur mu) ASLA `markedAt`/yoklama
   timestamp'inden türetilmez — daha önce denendi ve geri alındı. Doğru yol:
   ayrı kayıtlı iptal-bildirim olayı (actor, kaynak, zaman, sebep).
2. Telafi kotası eğitim yılına (`academicYearStart`) bağlı, döneme (Güz/Yaz)
   değil — `resolveLessonAcademicPeriod`'un sadece yıl kısmını kullan.
3. Telafi süresi: orijinal kaçırılan ders tarihinden 30 takvim günü (kurum
   saat dilimi), onay/talep/sözleşme tarihinden DEĞİL.
8. Store paritesi zorunlu — `store-db.ts` kota kontrolünde
   `pg_advisory_xact_lock` kullanıyor; json/memory testlerde
   `fileParallelism: false` ile tek-thread güvenliği sağlanıyor.

## ⚠️ Şu an commit edilmemiş değişiklik
`src/lib/makeup-quota.ts` şu anki uncommitted diff'in içinde (+88/-satır) —
bu alanda çalışmadan önce `git diff -- src/lib/makeup-quota.ts` ile neyin
değiştiğini gör, üstüne çakışma riskini değerlendir.

## Açık iş
Aynı-gün iptal: şema/tipler var (additive, uygulanmamış migration
`20260829180000_attendance_cancellation_notice`), sunucu mantığı ve 6
seçenekli Türkçe UI dropdown YOK — bkz. TASK_BOARD.md.

## İlgili skill
`scheduling-attendance-makeup`

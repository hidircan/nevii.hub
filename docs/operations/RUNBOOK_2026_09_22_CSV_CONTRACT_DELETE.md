# Runbook — 2026-09-22 CSV sözleşme onarımı + öğrenci silme migration'ı

Hedef: **yalnız test/staging** (`neviihub-test`, ref `vxzewyiwfshobjizzetw`). Production'a bu
runbook ile dokunulmaz; production için ayrı, hedefi adıyla belirten owner onayı gerekir.

## Bekleyen migration'lar (bu branch)
| Migration | Etki |
|---|---|
| `20260922120000_ops_actor_weights_threshold` | `Student/Teacher/Lesson.createdByUserId`, `Teacher.weeklyHoursThreshold`, `School.performanceWeights` — ADD COLUMN IF NOT EXISTS, NULL |
| `20260922180000_student_soft_delete_critical_password` | `Student.deletedAt/deletedByUserId/deletionReason`, `School.criticalActionPasswordHash/SetAt/SetBy` — ADD COLUMN IF NOT EXISTS, NULL |

İkisi de yalnız kolon ekler: DROP, DELETE, UPDATE, NOT NULL, index, tip değişikliği YOK. Mevcut satırlar
dokunulmadan kalır; kilit süresi kolon başına metadata güncellemesi kadar kısadır (varsayılan değer yok).

## Güvenlik kontrol listesi (sırayla, hepsi ✓ olmadan ilerleme)
1. `git rev-parse HEAD` — deploy edilecek commit'le aynı.
2. `DATABASE_URL`'i test projesinin **session pooler (5432)** adresine ayarlayın (6543 transaction pooler `migrate` sırasında asılı kalır).
3. `npm run preflight:test-db` → `[OK] Hedef TEST Supabase projesi` görünmeli. Görünmüyorsa DUR.
4. Yedek: Supabase Dashboard → Database → Backups'ta son yedeğin tarihi bugün mü? Değilse elle yedek alın.
5. Önce sayım (aşağıdaki SQL) → çıktıyı kaydedin.
6. `npx prisma migrate status` → yalnız yukarıdaki iki migration bekliyor olmalı. Başka bekleyen varsa DUR.
7. `npx prisma migrate deploy`
8. `npx prisma migrate status` → "Database schema is up to date!"
9. Sonra sayım → öncekiyle birebir aynı olmalı.
10. Onarım scripti: önce dry-run, çıktıyı okuyun, sonra `--apply`, sonra tekrar dry-run (0 bekleniyor).

```bash
export DATABASE_URL="<test session pooler 5432 URL>"   # değeri buraya yazmayın
npm run preflight:test-db
npx prisma migrate status
npx prisma migrate deploy
npx prisma migrate status
STORE_MODE=db npx tsx scripts/repair-csv-students-contract-ready.ts            # dry-run
STORE_MODE=db npx tsx scripts/repair-csv-students-contract-ready.ts --apply
STORE_MODE=db npx tsx scripts/repair-csv-students-contract-ready.ts            # 0 beklenir
STORE_MODE=db npx tsx scripts/backfill-created-by.ts                           # isteğe bağlı, dry-run
```

## Sayım SQL'i (önce/sonra)
```sql
select (select count(*) from "Student")          as students,
       (select count(*) from "Payment")          as payments,
       (select count(*) from "StudentContract")  as contracts,
       (select count(*) from "Lesson")           as lessons,
       (select count(*) from "DocumentInstance") as documents,
       (select count(*) from "Student" where "derivedPerLessonAmount" is null) as students_without_per_lesson;
```
Onarım sonrası yalnız `students_without_per_lesson` düşer (aylık ücreti veya haftalık dersi 0 olanlar kalır);
diğer sayılar değişmez.

## Onarım scripti ne yapar / ne yapmaz
- Yapar (yalnız BOŞ alanlarda): `derivedPerLessonAmount` = aylık ücret ÷ (haftalık × 4),
  `accountResponsibility` (veli telefonu varsa veli), `monthlyFeeManualOverride=false`.
- Yapmaz: Payment, StudentContract, DocumentInstance, ilk tahsilat üretmez; dolu alanı ezmez.
  İlk tahsilatı olmayan öğrenci raporda işaretlenir; tahsilat ilk sözleşme adımında girilir.
- `displayId` eksikse raporlar; atamak için `scripts/backfill-display-ids.ts`.

## Geri alma
Kolonlar NULL ve kod onlara bağımlı değilse okunmaz; geri almak için önceki deploy'a dönmek yeterlidir.
Kolon düşürmek GEREKMEZ ve bu runbook'ta yapılmaz.

## Deploy sonrası
- Ayarlar → Güvenlik'ten kurum sahibi kritik işlem şifresini belirler (yoksa öğrenci silme kapalıdır).
- UAT: `docs/testing/UAT_2026_09_22_CSV_CONTRACT_DELETE_ROUND.md`.

/**
 * Student/Teacher.createdByUserId geriye dönük doldurma — AuditLog'dan.
 *
 * Kaynak: `student.create` / `teacher.create` audit satırlarının `actorUserId`'si
 * (yalnız outcome=success). Audit zinciri DEĞİŞTİRİLMEZ; yalnız boş
 * `createdByUserId` alanları doldurulur (idempotent). Audit kaydı olmayan eski
 * kayıtlar boş kalır — UI onlarda "Kaydı oluşturan" satırını göstermez.
 * Dersler için ders-başı audit satırı yok; eski dersler boş kalır.
 *
 * Yalnız DB modu. Varsayılan DRY RUN; yazmak için --apply.
 *   npx tsx scripts/backfill-created-by.ts            # rapor
 *   npx tsx scripts/backfill-created-by.ts --apply    # yaz
 *
 * Production veritabanında bir ajan oturumu çalıştırmaz; insan onayı gerekir.
 */
import "dotenv/config";
import { isDbMode } from "../src/lib/config";

async function main() {
  if (!isDbMode) {
    console.log("Yalnız STORE_MODE=db için. JSON/memory verisinde audit kaynağı yok — çıkılıyor.");
    return;
  }
  const apply = process.argv.includes("--apply");
  const { prisma } = await import("../src/lib/db");
  console.log(apply ? "APPLY — boş createdByUserId alanları yazılacak" : "DRY RUN — yazma yok");

  for (const [action, model] of [
    ["student.create", "student"],
    ["teacher.create", "teacher"],
  ] as const) {
    const logs = await prisma.auditLog.findMany({
      where: { action, outcome: "success" },
      select: { tenantId: true, entityId: true, actorUserId: true },
      orderBy: { createdAt: "asc" },
    });
    let matched = 0;
    for (const log of logs) {
      const where = { id: log.entityId, tenantId: log.tenantId, createdByUserId: null };
      const count =
        model === "student" ? await prisma.student.count({ where }) : await prisma.teacher.count({ where });
      if (count === 0) continue;
      matched += 1;
      if (!apply) continue;
      const data = { createdByUserId: log.actorUserId };
      if (model === "student") await prisma.student.updateMany({ where, data });
      else await prisma.teacher.updateMany({ where, data });
    }
    console.log(`${model}: ${logs.length} audit satırı, ${matched} kayıt ${apply ? "dolduruldu" : "doldurulabilir"}.`);
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Faz 12 — mevcut (displayId'siz) Student/Teacher/StaffMember kayıtlarına
 * insan-okunur numara atar. İdempotent: yalnızca `displayId` boş olan
 * kayıtlara dokunur, ikinci çalıştırmada hiçbir şey değişmez. Kayıtlar
 * `createdAt`'e göre artan sırayla işlenir (en eski kayıt en küçük numarayı
 * alır) — tenant-kapsamlı sayaç `src/lib/entity-sequence.ts`'ten.
 *
 * DB modu: TÜM tenant'lar üzerinde döner (production çok-tenantlı olabilir).
 * JSON modu: tek bir `data/store.json` (tek "tenant") üzerinde çalışır.
 * Memory modu: kasıtlı olarak DESTEKLENMEZ — bu script AYRI bir process'te
 * çalışır ve `STORE_MODE=memory`'nin verisi zaten yalnızca ÇALIŞAN uygulama
 * process'inin belleğinde yaşar (kalıcı değildir); ayrı bir process'ten
 * "backfill" yapmanın hiçbir kalıcı etkisi olmaz.
 *
 * Kullanım: npx tsx scripts/backfill-display-ids.ts
 */
import "dotenv/config";
import { isDbMode } from "../src/lib/config";
import { allocateSequenceValue, allocateSequenceValueDb, allocateSequenceValueFile, formatDisplayId } from "../src/lib/entity-sequence";

async function backfillDb() {
  const { prisma } = await import("../src/lib/db");
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });

  for (const tenant of tenants) {
    const students = await prisma.student.findMany({
      where: { tenantId: tenant.id, displayId: null },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    for (const s of students) {
      const displayId = formatDisplayId("student", await allocateSequenceValueDb(tenant.id, "student"));
      await prisma.student.update({ where: { id: s.id }, data: { displayId } });
    }

    const teachers = await prisma.teacher.findMany({
      where: { tenantId: tenant.id, displayId: null },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    for (const t of teachers) {
      const displayId = formatDisplayId("teacher", await allocateSequenceValueDb(tenant.id, "teacher"));
      await prisma.teacher.update({ where: { id: t.id }, data: { displayId } });
    }

    const staff = await prisma.staffMember.findMany({
      where: { tenantId: tenant.id, displayId: null },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    for (const p of staff) {
      const displayId = formatDisplayId("staff", await allocateSequenceValueDb(tenant.id, "staff"));
      await prisma.staffMember.update({ where: { id: p.id }, data: { displayId } });
    }

    console.log(
      `[${tenant.name}] öğrenci: ${students.length}, öğretmen: ${teachers.length}, personel: ${staff.length} — displayId atandı.`
    );
  }
}

async function backfillJson() {
  const { runWithTenantAsync } = await import("../src/lib/tenant-context");
  const { DEFAULT_TENANT_ID } = await import("../src/lib/auth/config");
  // Dispatcher (`../src/lib/store`) yalnızca isimli, kapsamı sınırlı mutasyon
  // fonksiyonları açığa çıkarır — genel bir `writeData` yok (kasıtlı; ayrık
  // patch tipleri displayId gibi kullanıcı tarafından set edilemeyen
  // alanların normal yoldan yazılmasını engeller). Backfill BİLEREK bu
  // sınırın dışında, doğrudan store-json.ts'in kendi ilkellerini kullanır.
  const { readData, writeData } = await import("../src/lib/store-json");
  const { listStaff } = await import("../src/lib/staff");

  await runWithTenantAsync(DEFAULT_TENANT_ID, async () => {
    const data = await readData();
    let entitySequences = data.entitySequences ?? [];
    let assignedStudents = 0;
    let assignedTeachers = 0;

    const students = [...data.students]
      .filter((s) => !s.displayId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const studentUpdates = new Map<string, string>();
    for (const s of students) {
      const result = allocateSequenceValue(entitySequences, DEFAULT_TENANT_ID, "student");
      entitySequences = result.records;
      studentUpdates.set(s.id, formatDisplayId("student", result.assigned));
      assignedStudents += 1;
    }

    const teachers = [...data.teachers]
      .filter((t) => !t.displayId)
      .sort((a, b) => a.name.localeCompare(b.name)); // Teacher.createdAt yoksa isimle sırala (deterministik, güvenli).
    const teacherUpdates = new Map<string, string>();
    for (const t of teachers) {
      const result = allocateSequenceValue(entitySequences, DEFAULT_TENANT_ID, "teacher");
      entitySequences = result.records;
      teacherUpdates.set(t.id, formatDisplayId("teacher", result.assigned));
      assignedTeachers += 1;
    }

    const next = {
      ...data,
      entitySequences,
      students: data.students.map((s) => (studentUpdates.has(s.id) ? { ...s, displayId: studentUpdates.get(s.id) } : s)),
      teachers: data.teachers.map((t) => (teacherUpdates.has(t.id) ? { ...t, displayId: teacherUpdates.get(t.id) } : t)),
    };
    await writeData(next);

    const { backfillStaffDisplayId } = await import("../src/lib/staff");
    const allStaff = await listStaff(DEFAULT_TENANT_ID);
    const staffWithoutId = allStaff.filter((p) => !p.displayId);
    let assignedStaff = 0;
    for (const p of staffWithoutId) {
      const displayId = formatDisplayId("staff", await allocateSequenceValueFile(DEFAULT_TENANT_ID, "staff"));
      await backfillStaffDisplayId(DEFAULT_TENANT_ID, p.id, displayId);
      assignedStaff += 1;
    }

    console.log(
      `Öğrenci: ${assignedStudents}, öğretmen: ${assignedTeachers}, personel: ${assignedStaff} — displayId atandı.`
    );
  });
}

async function main() {
  if (isDbMode) {
    await backfillDb();
  } else if (process.env.STORE_MODE === "memory") {
    console.log(
      "STORE_MODE=memory — bu mod kalıcı değil (yalnızca çalışan uygulama process'inin belleğinde yaşar); " +
        "ayrı bir process'ten backfill yapmanın kalıcı bir etkisi olmaz. Atlanıyor."
    );
    return;
  } else {
    await backfillJson();
  }
  console.log("Tamamlandı.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Gerçek çoklu-kurum (multi-tenant) db-modu demosu için seed betiği.
 *
 * Nevii Hub Demo Akademi (mevcut DEFAULT_TENANT_ID) ve Nevii Hub Test Kampüs
 * (yeni, tamamen ayrı bir tenant) adında iki izole kurum oluşturur — hiçbir
 * kimlik (branch/teacher/student/room/lesson/…) paylaşılmaz. Ardından
 * `listTenants`/`readData`/`mergeAppData`'yı GERÇEK, canlı veriye karşı
 * çalıştırıp sonucu konsola yazdırır (yalnızca sentetik/mock veri değil).
 *
 * Kullanım: STORE_MODE=db npx tsx scripts/seed-multi-tenant.ts
 * (DATABASE_URL .env.local'dan `dotenv/config` ile okunur.)
 *
 * YALNIZCA yerel geliştirme/demo amaçlıdır — production'da asla otomatik
 * çalıştırılmamalıdır (bkz. README "Multi-Tenant Demo" bölümü).
 */
import "dotenv/config";
import { createSeedData } from "../src/lib/seed";
import { seedDatabase, readData as readDataDb, listTenants as listTenantsDb } from "../src/lib/store-db";
import { runWithTenantAsync } from "../src/lib/tenant-context";
import { mergeAppData } from "../src/lib/institution/merge";
import { DEFAULT_TENANT_ID } from "../src/lib/auth/config";
import type { AppData } from "../src/lib/types";

const TEST_KAMPUS_TENANT_ID = "tenant_test_kampus";

/** Bir AppData'nın tüm iç kimliklerini bir önekle yeniden adlandırır — iki
 * kurumun aynı kimlikleri paylaşmaması için (bkz. Prisma şemasında id'lerin
 * tenant-bazlı değil GLOBAL olarak benzersiz olması gerektiği alanlar). */
function remapIds(data: AppData, prefix: string): AppData {
  const p = (id: string) => `${prefix}${id}`;
  const branches = data.settings.branches.map((b) => ({ ...b, id: p(b.id) }));
  const teachers = data.teachers.map((t) => ({ ...t, id: p(t.id), branchId: p(t.branchId) }));
  const rooms = data.rooms.map((r) => ({ ...r, id: p(r.id), branchId: p(r.branchId) }));
  const students = data.students.map((s) => ({
    ...s,
    id: p(s.id),
    branchId: p(s.branchId),
    teacherId: p(s.teacherId),
  }));
  const lessons = data.lessons.map((l) => ({
    ...l,
    id: p(l.id),
    studentId: p(l.studentId),
    teacherId: p(l.teacherId),
    roomId: p(l.roomId),
    branchId: p(l.branchId),
  }));
  const attendances = data.attendances.map((a) => ({
    ...a,
    id: p(a.id),
    lessonId: p(a.lessonId),
    studentId: p(a.studentId),
  }));
  const makeupRequests = data.makeupRequests.map((m) => ({
    ...m,
    id: p(m.id),
    studentId: p(m.studentId),
    teacherId: p(m.teacherId),
    branchId: p(m.branchId),
    sourceLessonId: p(m.sourceLessonId),
    attendanceId: p(m.attendanceId),
    confirmedLessonId: m.confirmedLessonId ? p(m.confirmedLessonId) : undefined,
  }));
  const payments = data.payments.map((pay) => ({ ...pay, id: p(pay.id), studentId: p(pay.studentId) }));
  const teacherFeeRules = data.teacherFeeRules.map((r) => ({
    ...r,
    id: p(r.id),
    teacherId: p(r.teacherId),
    branchId: r.branchId ? p(r.branchId) : undefined,
  }));

  return {
    ...data,
    settings: { ...data.settings, branches },
    teachers,
    students,
    rooms,
    lessons,
    attendances,
    makeupRequests,
    payments,
    teacherFeeRules,
    lessonSeries: [],
    teacherPayouts: [],
  };
}

async function main() {
  if (process.env.STORE_MODE !== "db") {
    throw new Error("Bu betik yalnızca STORE_MODE=db ile çalışır. Örnek: STORE_MODE=db npx tsx scripts/seed-multi-tenant.ts");
  }

  console.log("== 1/3 Kurum A: Nevii Hub Demo Akademi (tenant:", DEFAULT_TENANT_ID, ") ==");
  const demoAkademi = createSeedData();
  demoAkademi.settings.tenantId = DEFAULT_TENANT_ID;
  demoAkademi.settings.name = "Nevii Hub Demo Akademi";
  demoAkademi.settings.shortName = "Demo Akademi";
  await seedDatabase(demoAkademi);
  console.log("   ✓ seed edildi:", demoAkademi.students.length, "öğrenci,", demoAkademi.teachers.length, "öğretmen,", demoAkademi.lessons.length, "ders");

  console.log("== 2/3 Kurum B: Nevii Hub Test Kampüs (tenant:", TEST_KAMPUS_TENANT_ID, ") ==");
  const testKampusBase = createSeedData();
  const testKampus = remapIds(testKampusBase, "tk_");
  testKampus.settings.tenantId = TEST_KAMPUS_TENANT_ID;
  testKampus.settings.name = "Nevii Hub Test Kampüs";
  testKampus.settings.shortName = "Test Kampüs";
  testKampus.settings.city = "Ankara";
  await seedDatabase(testKampus);
  console.log("   ✓ seed edildi:", testKampus.students.length, "öğrenci,", testKampus.teachers.length, "öğretmen,", testKampus.lessons.length, "ders");

  console.log("== 3/3 Canlı doğrulama: listTenants / readData / mergeAppData ==");
  const tenants = await runWithTenantAsync(DEFAULT_TENANT_ID, () => listTenantsDb());
  console.log("listTenants() ->", tenants);
  if (tenants.length < 2) throw new Error("Beklenen: en az 2 kurum, bulunan: " + tenants.length);

  const dataA = await runWithTenantAsync(DEFAULT_TENANT_ID, () => readDataDb());
  const dataB = await runWithTenantAsync(TEST_KAMPUS_TENANT_ID, () => readDataDb());

  const sharedStudentIds = dataA.students.filter((s) => dataB.students.some((b) => b.id === s.id));
  const sharedBranchIds = dataA.settings.branches.filter((b) =>
    dataB.settings.branches.some((bb) => bb.id === b.id)
  );
  if (sharedStudentIds.length > 0 || sharedBranchIds.length > 0) {
    throw new Error("İzolasyon ihlali: kurumlar arasında paylaşılan id bulundu!");
  }
  console.log(
    `İzolasyon doğrulandı: A=${dataA.students.length} öğrenci/${dataA.settings.branches.length} şube, ` +
      `B=${dataB.students.length} öğrenci/${dataB.settings.branches.length} şube, hiçbir id paylaşılmıyor.`
  );

  const merged = mergeAppData([dataA, dataB]);
  console.log(
    `mergeAppData() -> ${merged.students.length} öğrenci (${dataA.students.length}+${dataB.students.length}), ` +
      `${merged.settings.branches.length} şube (${dataA.settings.branches.length}+${dataB.settings.branches.length})`
  );
  if (merged.students.length !== dataA.students.length + dataB.students.length) {
    throw new Error("mergeAppData öğrenci sayısı beklenenle uyuşmuyor!");
  }

  console.log("\n✅ Çoklu-kurum db-modu doğrulaması BAŞARILI — canlı, izole, birleştirilebilir iki kurum kanıtlandı.");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Seed/doğrulama başarısız:", err);
  process.exit(1);
});

/**
 * Karma Öğrenci Portalı — yerel `notaplan` Postgres'i (STORE_MODE=db) için
 * hedefli demo/smoke-test verisi. YALNIZCA yerel geliştirme amaçlıdır,
 * production'da ASLA çalıştırılmamalıdır.
 *
 * 1) Mevcut tenant demo veri setini (createSeedData → readData auto-seed)
 *    tetikler (branch/teacher/student/payment vb. zaten var olan zengin set).
 * 2) Üzerine, Karma Öğrenci Portalı senaryolarını kapsayan hedefli veri ekler:
 *    - Çok çocuklu bir guardian (aynı kullanıcı, iki farklı öğrenciye erişim)
 *    - Self-managed bir öğrenci (SELF accessType + accountResponsibility)
 *    - Revoked bir erişim (hemen engellenmesi test edilecek)
 *    - PARENT_MANAGED / SELF_MANAGED karışık accountResponsibility örnekleri
 *
 * Kullanım: npx tsx scripts/seed-hybrid-portal-demo.ts
 */
process.env.STORE_MODE = "db";

import "dotenv/config";
import { assertNotProductionRuntime, assertSeedTarget } from "../src/lib/env/test-target-guard";

async function main() {
  // Demo/QA seed — production ortamında KOŞULSUZ reddedilir (fail-closed).
  assertNotProductionRuntime();
  assertSeedTarget();
  const { DEFAULT_TENANT_ID } = await import("../src/lib/auth/config");
  const { runWithTenantAsync } = await import("../src/lib/tenant-context");
  const { getPrisma } = await import("../src/lib/db");
  const { uid } = await import("../src/lib/utils");
  const { hashPasswordSync } = await import("../src/lib/auth/password");

  const prisma = getPrisma();

  await runWithTenantAsync(DEFAULT_TENANT_ID, async () => {
    const { readData } = await import("../src/lib/store-db");
    // Tenant boşsa (School yok) bu, tüm zengin demo veri setini seed eder
    // (branch/teacher/student/payment...) — bkz. store-db.ts readData().
    const data = await readData();
    console.log(`Tenant hazır: ${data.students.length} öğrenci, ${data.teachers.length} öğretmen mevcut.`);
  });

  const tid = DEFAULT_TENANT_ID;

  // ---- Karma Öğrenci Portalı'na özgü ek veri ----

  // accountResponsibility çeşitliliği: s1 PARENT_MANAGED (varsayılan, dokunmuyoruz),
  // s5 SELF_MANAGED olarak işaretlenir (öğrenci kendi muhatabı).
  await prisma.student.updateMany({
    where: { id: "s5", tenantId: tid },
    data: { accountResponsibility: "SELF_MANAGED" },
  });

  async function upsertUser(params: { id: string; email: string; role: string }) {
    const existing = await prisma.user.findFirst({ where: { tenantId: tid, email: params.email } });
    if (existing) return existing;
    return prisma.user.create({
      data: {
        id: params.id,
        tenantId: tid,
        email: params.email,
        passwordHash: hashPasswordSync("demo-hybrid-portal-2026"),
        role: params.role,
        active: true,
      },
    });
  }

  async function upsertAccess(params: {
    userId: string;
    studentId: string;
    accessType: "GUARDIAN" | "SELF";
    status: "active" | "revoked" | "invited";
  }) {
    const id = `spa_demo_${params.userId}_${params.studentId}`;
    await prisma.studentPortalAccess.upsert({
      where: { tenantId_userId_studentId: { tenantId: tid, userId: params.userId, studentId: params.studentId } },
      create: {
        id,
        tenantId: tid,
        userId: params.userId,
        studentId: params.studentId,
        accessType: params.accessType,
        status: params.status,
        invitedBy: "seed-script",
        activatedAt: params.status === "active" ? new Date() : null,
        revokedAt: params.status === "revoked" ? new Date() : null,
      },
      update: {
        accessType: params.accessType,
        status: params.status,
        activatedAt: params.status === "active" ? new Date() : null,
        revokedAt: params.status === "revoked" ? new Date() : null,
      },
    });
  }

  // Çok çocuklu guardian — s1 ve s4'e aktif GUARDIAN erişimi.
  const guardianMulti = await upsertUser({
    id: uid("user_demo"),
    email: "guardian.multi@demo.notaplan.local",
    role: "STUDENT",
  });
  await upsertAccess({ userId: guardianMulti.id, studentId: "s1", accessType: "GUARDIAN", status: "active" });
  await upsertAccess({ userId: guardianMulti.id, studentId: "s4", accessType: "GUARDIAN", status: "active" });

  // Self-managed öğrenci — s5'e SELF erişimi.
  const selfS5 = await upsertUser({
    id: uid("user_demo"),
    email: "self.s5@demo.notaplan.local",
    role: "STUDENT",
  });
  await upsertAccess({ userId: selfS5.id, studentId: "s5", accessType: "SELF", status: "active" });

  // Revoked erişim — s1'e daha önce GUARDIAN erişimi verilmiş AMA iptal edilmiş.
  const revokedGuardian = await upsertUser({
    id: uid("user_demo"),
    email: "revoked.guardian@demo.notaplan.local",
    role: "STUDENT",
  });
  await upsertAccess({ userId: revokedGuardian.id, studentId: "s1", accessType: "GUARDIAN", status: "revoked" });

  console.log("\nSeed edilen kullanıcılar:");
  console.log("  guardian_multi:", guardianMulti.id, guardianMulti.email, "-> s1, s4 (GUARDIAN, active)");
  console.log("  self_s5:       ", selfS5.id, selfS5.email, "-> s5 (SELF, active)");
  console.log("  revoked:       ", revokedGuardian.id, revokedGuardian.email, "-> s1 (GUARDIAN, REVOKED)");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

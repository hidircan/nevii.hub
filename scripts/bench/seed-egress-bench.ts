/**
 * DB egress bench'i için SENTETİK veri — test ortamıyla AYNI mertebede hacim
 * (2026-09-30 test DB sayımı: 228 öğrenci · 2 051 ders · 1 222 ödeme · 114 sözleşme ·
 * ~596 bildirim · ~79 KB data-URI kurum logosu). Gerçek kişi verisi KULLANILMAZ:
 * demo seed çoğaltılır, isimler sentetik.
 *
 * YAZMA yapar → yalnız yerel tek kullanımlık DB (guard aşağıda).
 *   STORE_MODE=db DATABASE_URL=postgresql://<user>@127.0.0.1:5432/neviihub_egress_bench \
 *     npx tsx scripts/bench/seed-egress-bench.ts
 *
 * İkinci kurum (`tenant_bench_other`) izolasyon kontrolü içindir: adları "BTENANT"
 * ile başlar; A kurumunun hiçbir ekranında görünmemelidir.
 */
import { addDays, addMinutes } from "date-fns";
import { createSeedData } from "../../src/lib/seed";
import { DEFAULT_TENANT_ID } from "../../src/lib/auth/config";
import type { AppData, Lesson, Payment, Student, Attendance, MakeupRequest } from "../../src/lib/types";

export const OTHER_TENANT_ID = "tenant_bench_other";

export function assertDisposableLocalTarget(url: string | undefined): void {
  if (!url) throw new Error("DATABASE_URL gerekli");
  const u = new URL(url);
  const localHost = u.hostname === "127.0.0.1" || u.hostname === "localhost" || u.hostname === "::1";
  const disposableName = /bench|disposable|throwaway/i.test(u.pathname);
  if (!localHost || !disposableName) {
    throw new Error(
      `Bu betik YAZMA yapar; yalnız yerel tek kullanımlık DB'ye izin verilir (host=127.0.0.1/localhost VE ` +
        `db adı 'bench'/'disposable' içermeli). Verilen: ${u.hostname}${u.pathname}`
    );
  }
}

/** Deterministik PRNG (mulberry32) — koşular arası aynı veri. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NOW = new Date("2026-09-30T09:00:00+03:00");
const TERM_START = new Date("2026-08-10T00:00:00+03:00");
const TERM_END = new Date("2027-06-30T23:59:00+03:00");

function iso(d: Date): string {
  return d.toISOString();
}

/** A kurumu: demo seed'i test hacmine ölçekler. */
function buildTenantA(): AppData {
  const r = rng(20260930);
  const base = createSeedData();
  base.settings.tenantId = DEFAULT_TENANT_ID;

  // 228 öğrenci: demo öğrencileri + sentetik kopyalar.
  const students: Student[] = [...base.students];
  for (let i = students.length; i < 228; i++) {
    const src = base.students[i % base.students.length]!;
    students.push({
      ...src,
      id: `sb_${i}`,
      displayId: undefined,
      name: `Bench Öğrenci ${i}`,
      email: `bench${i}@example.invalid`,
      phone: `0500 000 ${String(i).padStart(4, "0")}`,
      parentName: `Bench Veli ${i}`,
      parentPhone: `0500 111 ${String(i).padStart(4, "0")}`,
      createdAt: iso(addDays(TERM_START, -Math.floor(r() * 60))),
    } as Student);
  }

  // 2 051 ders: 45 öğrenci × haftalık, 2026-08-10 → 2027-06-30.
  const lessons: Lesson[] = [];
  const weekly = students.slice(0, 45);
  const roomsByBranch = new Map<string, string[]>();
  for (const room of base.rooms) roomsByBranch.set(room.branchId, [...(roomsByBranch.get(room.branchId) ?? []), room.id]);
  weekly.forEach((s, idx) => {
    const weekday = idx % 6; // Pzt..Cmt
    const hour = 10 + (idx % 8);
    const rooms = roomsByBranch.get(s.branchId) ?? [base.rooms[0]!.id];
    let d = addDays(TERM_START, weekday);
    d.setHours(hour, 0, 0, 0);
    let n = 0;
    while (d <= TERM_END && lessons.length < 2051) {
      const past = d < NOW;
      lessons.push({
        id: `lb_${idx}_${n}`,
        studentId: s.id,
        teacherId: s.teacherId,
        roomId: rooms[n % rooms.length]!,
        branchId: s.branchId,
        instrument: s.instruments[0] ?? "Piyano",
        startAt: iso(d),
        endAt: iso(addMinutes(d, 40)),
        type: "regular",
        status: past ? (r() < 0.9 ? "completed" : "no_show") : "scheduled",
      } as Lesson);
      d = addDays(d, 7);
      n++;
    }
  });

  // Yoklama: geçmiş derslerin bir kısmı (≈127) + telafi talepleri (20).
  const attendances: Attendance[] = [];
  const makeupRequests: MakeupRequest[] = [];
  for (const l of lessons) {
    if (new Date(l.startAt) >= NOW || attendances.length >= 127) continue;
    if (r() > 0.4) continue;
    const absent = l.status === "no_show" || (makeupRequests.length < 20 && r() < 0.12);
    const a: Attendance = {
      id: `ab_${l.id}`,
      lessonId: l.id,
      studentId: l.studentId,
      status: absent ? "absent" : "present",
      markedAt: iso(addMinutes(new Date(l.startAt), 5)),
      createsMakeupCredit: absent,
    } as Attendance;
    attendances.push(a);
    if (absent && makeupRequests.length < 20) {
      makeupRequests.push({
        id: `mb_${l.id}`,
        studentId: l.studentId,
        teacherId: l.teacherId,
        branchId: l.branchId,
        instrument: l.instrument,
        sourceLessonId: l.id,
        attendanceId: a.id,
        status: "pending",
        reason: "Bench — hasta",
        expiresAt: iso(addDays(new Date(l.startAt), 30)),
        suggestedSlots: [],
        createdAt: iso(addMinutes(new Date(l.startAt), 10)),
        policyNote: "Bench telafi politikası",
      } as unknown as MakeupRequest);
    }
  }

  // 1 222 ödeme: 114 öğrenci × Eylül–Haziran taksit (10) + 82 ek (kayıt/manuel).
  const payments: Payment[] = [];
  const payers = students.slice(0, 114);
  payers.forEach((s, idx) => {
    for (let m = 0; m < 10; m++) {
      const due = new Date(Date.UTC(2026, 8 + m, 5, 9));
      const past = due < NOW;
      const paid = past && r() < 0.85;
      payments.push({
        id: `pb_${idx}_${m}`,
        studentId: s.id,
        amount: s.monthlyFee || 3200,
        paidAmount: paid ? s.monthlyFee || 3200 : 0,
        status: paid ? "paid" : past ? "overdue" : "pending",
        dueDate: iso(due),
        paidAt: paid ? iso(addDays(due, -1)) : undefined,
        description: `Bench taksit ${m + 1}/10`,
        method: paid ? "Havale" : undefined,
        source: "manual",
      } as Payment);
    }
  });
  for (let i = 0; payments.length < 1222; i++) {
    const s = students[(i * 7) % students.length]!;
    const due = addDays(TERM_START, i % 50);
    payments.push({
      id: `pbx_${i}`,
      studentId: s.id,
      amount: 1500,
      paidAmount: 1500,
      status: "paid",
      dueDate: iso(due),
      paidAt: iso(due),
      description: `Bench kayıt ödemesi ${i}`,
      method: "Nakit",
      source: "manual",
    } as Payment);
  }

  return {
    ...base,
    students,
    lessons,
    attendances,
    makeupRequests,
    payments,
    teacherPayouts: [],
  };
}

/** B kurumu: küçük demo verisi, TÜM kimlikler "b_" önekli (PK'ler global benzersiz). */
function buildTenantB(): AppData {
  const base = createSeedData();
  const p = (id: string | undefined) => (id ? `b_${id}` : id);
  const branchIds = new Set(base.settings.branches.map((b) => b.id));
  const pb = (id: string) => (branchIds.has(id) ? `b_${id}` : id);
  return {
    ...base,
    settings: {
      ...base.settings,
      tenantId: OTHER_TENANT_ID,
      name: "BTENANT Kurumu",
      shortName: "BTENANT",
      branches: base.settings.branches.map((b) => ({ ...b, id: pb(b.id) as typeof b.id, name: `BTENANT ${b.name}` })),
    },
    teachers: base.teachers.map((t) => ({ ...t, id: p(t.id)!, name: `BTENANT ${t.name}`, branchId: pb(t.branchId) as typeof t.branchId, displayId: undefined })),
    students: base.students.map((s) => ({ ...s, id: p(s.id)!, name: `BTENANT ${s.name}`, teacherId: p(s.teacherId)!, branchId: pb(s.branchId) as typeof s.branchId, displayId: undefined })),
    rooms: base.rooms.map((rm) => ({ ...rm, id: p(rm.id)!, name: `BTENANT ${rm.name}`, branchId: pb(rm.branchId) as typeof rm.branchId })),
    lessons: base.lessons.map((l) => ({ ...l, id: p(l.id)!, studentId: p(l.studentId)!, teacherId: p(l.teacherId)!, roomId: p(l.roomId)!, branchId: pb(l.branchId) as typeof l.branchId, makeupRequestId: p(l.makeupRequestId) })),
    attendances: base.attendances.map((a) => ({ ...a, id: p(a.id)!, lessonId: p(a.lessonId)!, studentId: p(a.studentId)! })),
    makeupRequests: base.makeupRequests.map((m) => ({ ...m, id: p(m.id)!, studentId: p(m.studentId)!, teacherId: p(m.teacherId)!, branchId: pb(m.branchId) as typeof m.branchId, sourceLessonId: p(m.sourceLessonId)!, attendanceId: p(m.attendanceId)!, confirmedLessonId: p(m.confirmedLessonId), suggestedSlots: [] })),
    payments: base.payments.map((x) => ({ ...x, id: p(x.id)!, studentId: p(x.studentId)!, lessonId: p(x.lessonId), description: `BTENANT ${x.description}` })),
    teacherFeeRules: base.teacherFeeRules.map((f) => ({ ...f, id: p(f.id)!, teacherId: p(f.teacherId)!, branchId: f.branchId ? (pb(f.branchId) as typeof f.branchId) : undefined })),
    teacherPayouts: [],
    packages: (base.packages ?? []).map((pk) => ({ ...pk, id: p(pk.id)!, title: `BTENANT ${pk.title}` })),
  };
}

async function main() {
  assertDisposableLocalTarget(process.env.DATABASE_URL);
  if (process.env.STORE_MODE !== "db") throw new Error("STORE_MODE=db olmalı");
  const { runWithTenantAsync } = await import("../../src/lib/tenant-context");
  const store = await import("../../src/lib/store-db");
  const { prisma } = await import("../../src/lib/db");

  const a = buildTenantA();
  const b = buildTenantB();
  await runWithTenantAsync(DEFAULT_TENANT_ID, () => store.seedDatabase(a));
  await runWithTenantAsync(OTHER_TENANT_ID, () => store.seedDatabase(b));

  // Platform tenant (listPlatformTenants onu hariç tutar; gerçek DB'de de var).
  await prisma.tenant.upsert({
    where: { id: "tenant_platform" },
    create: { id: "tenant_platform", name: "Platform", slug: "tenant_platform", active: true },
    update: {},
  });

  // ~79 KB data-URI logo (test DB'deki School.logoUrl ortalaması 79 467 bayt).
  const r = rng(7);
  const bytes = Buffer.alloc(59_000);
  for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(r() * 256);
  const logo = `data:image/png;base64,${bytes.toString("base64")}`;
  await prisma.school.update({ where: { tenantId: DEFAULT_TENANT_ID }, data: { logoUrl: logo } });

  const tid = DEFAULT_TENANT_ID;
  // Geçmiş tamamlanmış derslerin çoğu İşlendi, bir kısmı yalnız Geldi (hakediş karışımı).
  const past = await prisma.lesson.findMany({
    where: { tenantId: tid, startAt: { lt: NOW }, status: "completed" },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  const processed = past.filter((_, i) => i % 3 !== 0).map((l) => l.id);
  const attendedOnly = past.filter((_, i) => i % 3 === 0).map((l) => l.id);
  await prisma.lesson.updateMany({ where: { id: { in: processed } }, data: { lessonProcessed: true, lessonProcessedAt: NOW } });
  await prisma.lesson.updateMany({ where: { id: { in: attendedOnly } }, data: { studentAttended: true, studentAttendedAt: NOW } });

  // 114 sözleşme (~39 KB contractDataSnapshot, test ortalaması 39 241 bayt) + taksitleri bağla.
  const school = await prisma.school.findFirstOrThrow({ where: { tenantId: tid }, select: { id: true } });
  const payers = a.students.slice(0, 114);
  for (let idx = 0; idx < payers.length; idx++) {
    const s = payers[idx]!;
    const id = `scb_${idx}`;
    await prisma.studentContract.create({
      data: {
        id,
        tenantId: tid,
        studentId: s.id,
        contractNumber: `BENCH-${idx}`,
        versionNumber: 1,
        contractType: "initial",
        status: "signed",
        contractDataSnapshot: { html: "x".repeat(38_900), studentName: s.name, logoUrl: "" },
        programmeName: "Bench Programı",
        enrollmentStartDate: new Date("2026-09-01T00:00:00Z"),
        enrollmentEndDate: new Date("2027-06-30T00:00:00Z"),
        durationMonths: 10,
        monthlyAmount: s.monthlyFee || 3200,
        installmentCount: 10,
        totalContractAmount: (s.monthlyFee || 3200) * 10,
        signatoryFullName: s.parentName ?? s.name,
        createdBy: "user_owner_nilufer",
        generatedBy: "user_owner_nilufer",
      },
    });
    for (let m = 0; m < 10; m++) {
      await prisma.payment.update({ where: { id: `pb_${idx}_${m}` }, data: { contractId: id, installmentSequence: m + 1 } });
    }
  }

  // Öğrenci portalı ölçümü için s1'in kendi (SELF) aktif portal erişimi.
  await prisma.studentPortalAccess.create({
    data: { id: "spa_bench_s1", tenantId: tid, userId: "user_student_s1", studentId: "s1", accessType: "SELF", status: "active", activatedAt: NOW },
  });

  // ~596 bildirim (sahip kullanıcıya).
  await prisma.notification.createMany({
    data: Array.from({ length: 596 }, (_, i) => ({
      id: `nb_${i}`,
      tenantId: tid,
      targetUserId: "user_owner_nilufer",
      kind: "lesson_reminder",
      title: `Bench bildirim ${i}`,
      body: `Bench bildirim gövdesi ${i} — ders hatırlatması`,
      readAt: i % 4 === 0 ? null : NOW,
      createdAt: addMinutes(NOW, -i * 30),
    })),
  });

  // Kayıtlı hakediş: Ağustos 2026 (aktif) + bir iptal edilmiş kayıt (kayıtlı/iptal farkı ekranda görünsün).
  await prisma.teacherPayout.createMany({
    data: [
      { id: "tpb_1", tenantId: tid, teacherId: "t1", schoolId: school.id, periodStart: new Date("2026-08-01"), periodEnd: new Date("2026-08-31"), totalMinutes: 320, totalAmount: 3680, status: "pending", version: 1 },
      { id: "tpb_2", tenantId: tid, teacherId: "t2", schoolId: school.id, periodStart: new Date("2026-08-01"), periodEnd: new Date("2026-08-31"), totalMinutes: 160, totalAmount: 1840, status: "cancelled", cancelledAt: NOW, cancelReason: "Bench iptal", version: 1 },
    ],
  });

  const counts = await Promise.all([
    prisma.student.count({ where: { tenantId: tid } }),
    prisma.lesson.count({ where: { tenantId: tid } }),
    prisma.payment.count({ where: { tenantId: tid } }),
    prisma.attendance.count({ where: { tenantId: tid } }),
    prisma.makeupRequest.count({ where: { tenantId: tid } }),
    prisma.notification.count({ where: { tenantId: tid } }),
    prisma.studentContract.count({ where: { tenantId: tid } }),
    prisma.student.count({ where: { tenantId: OTHER_TENANT_ID } }),
  ]);
  console.log(
    `A: ${counts[0]} öğrenci · ${counts[1]} ders · ${counts[2]} ödeme · ${counts[3]} yoklama · ${counts[4]} telafi · ` +
      `${counts[5]} bildirim · ${counts[6]} sözleşme | B: ${counts[7]} öğrenci`
  );
  await prisma.$disconnect();
}

if (process.argv[1] && /seed-egress-bench/.test(process.argv[1])) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

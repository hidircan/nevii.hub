/**
 * DB egress (2026-09-30) — tam `readData()` yerine hedefli okumalar. Bu dosya dar dilimlerin
 * tam veriden türetilenle BİREBİR aynı olduğunu ve finans/yoklama semantiğinin değişmediğini kilitler.
 * db kolu (Prisma ile üretim + iki kurum izolasyonu + bildirim sayfalaması) yerel PostgreSQL'de
 * `scripts/bench/verify-db-slices.ts` ile doğrulanır; testler json modunda koşar.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import {
  cancelTeacherPayoutTool,
  createTeacherPayoutTool,
  getAttendanceCalendarTermTool,
  setDayOverrideTool,
  setLessonOpsFlagTool,
} from "../services/tools";
import {
  readDashboardData,
  readData,
  readLessonScope,
  readLessonWindow,
  readPaymentsPageData,
  readPayoutWindow,
  readReferenceData,
  readStudentById,
  readStudentListData,
  readStudentScope,
} from "../store";
import { writeData } from "../store-json";
import { runWithTenantAsync } from "../tenant-context";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import {
  narrowToDashboard,
  narrowToLessonWindow,
  narrowToPaymentsPage,
  narrowToPayoutWindow,
  narrowToStudentScope,
  toPaymentStatusRows,
  toReferenceData,
} from "../reference-data";
import { computeTeacherEarningsForPeriod, computeTeacherEarningsWithRevisions, payoutDrift } from "../teacher-payout";
import { buildPayoutOverviewRows, passiveTeacherOpenPayouts } from "../payout-overview";
import { computeTeacherPayoutOverview } from "../teacher-payout-overview";
import { buildDashboardSummary } from "../dashboard/daily-summary";
import { computeSetupProgress } from "../setup-progress";
import { computeStudentPaymentSummary, sortPaymentsForProfile } from "../payment-profile";
import { resolveLessonFinalStatus } from "../lesson-live-status";
import { createNotification, listNotificationsPageForUser, markNotificationRead, NOTIFICATIONS_FILE } from "../notifications";
import type { AppData, Attendance, Lesson, MakeupRequest, Payment } from "../types";

const DIR = resolveDataDir(path.join(process.cwd(), "data"));

function ctx(overrides?: Partial<ServiceContext>): ServiceContext {
  return { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web", ...overrides };
}

beforeEach(async () => {
  await fs.rm(path.join(DIR, "store.json"), { force: true });
  await fs.rm(path.join(DIR, "closed-days.json"), { force: true });
  await fs.rm(NOTIFICATIONS_FILE, { force: true });
});

function lesson(id: string, studentId: string, start: string, patch: Partial<Lesson> = {}): Lesson {
  const s = new Date(start);
  return {
    id,
    studentId,
    teacherId: "t1",
    roomId: "r1",
    branchId: "erzene",
    instrument: "Piyano",
    startAt: s.toISOString(),
    endAt: new Date(s.getTime() + 40 * 60_000).toISOString(),
    type: "regular",
    status: "scheduled",
    ...patch,
  } as Lesson;
}

function payment(id: string, studentId: string, patch: Partial<Payment>): Payment {
  return {
    id,
    studentId,
    amount: 3200,
    paidAmount: 0,
    status: "pending",
    dueDate: "2026-09-05T09:00:00.000Z",
    description: `Taksit ${id}`,
    source: "manual",
    ...patch,
  } as Payment;
}

/** İki öğrenciye ders/yoklama/telafi/ödeme satırları ekler (s1 ve s2 aynı öğretmen). */
async function seedTwoStudents(): Promise<AppData> {
  const data = await readData();
  const lessons = [
    lesson("x1", "s1", "2026-09-08T11:15:00Z", { status: "completed" }),
    lesson("x2", "s1", "2026-09-15T11:15:00Z"),
    lesson("y1", "s2", "2026-09-08T12:15:00Z"),
  ];
  const attendances: Attendance[] = [
    { id: "ax2", lessonId: "x2", studentId: "s1", status: "absent", markedAt: "2026-09-15T11:20:00Z", createsMakeupCredit: true } as Attendance,
    { id: "ay1", lessonId: "y1", studentId: "s2", status: "present", markedAt: "2026-09-08T12:20:00Z", createsMakeupCredit: false } as Attendance,
  ];
  const makeupRequests = [
    {
      id: "mx2",
      studentId: "s1",
      teacherId: "t1",
      branchId: "erzene",
      instrument: "Piyano",
      sourceLessonId: "x2",
      attendanceId: "ax2",
      status: "pending",
      reason: "Hasta",
      expiresAt: "2099-10-15T00:00:00Z",
      suggestedSlots: [],
      createdAt: "2026-09-15T11:30:00Z",
      policyNote: "test",
    } as unknown as MakeupRequest,
  ];
  const payments = [
    payment("px1", "s1", { status: "paid", paidAmount: 3200, paidAt: "2026-09-04T09:00:00Z", method: "Havale" }),
    payment("px2", "s1", { status: "overdue", dueDate: "2026-09-05T09:00:00Z" }),
    payment("px3", "s1", { status: "partial", paidAmount: 1000, dueDate: "2026-10-05T09:00:00Z" }),
    payment("py1", "s2", { status: "paid", paidAmount: 3200, paidAt: "2026-09-04T09:00:00Z" }),
  ];
  const next: AppData = {
    ...data,
    lessons: [...data.lessons, ...lessons],
    attendances: [...data.attendances, ...attendances],
    makeupRequests: [...data.makeupRequests, ...makeupRequests],
    payments: [...data.payments, ...payments],
  };
  await writeData(next);
  return readData();
}

describe("DB egress dilimleri — tam okumayla aynı sonuç", () => {
  it("referans / öğrenci / ders penceresi / öğrenci listesi dilimleri tam veriden türetilenle birebir aynı", async () => {
    const full = await seedTwoStudents();
    expect(await readReferenceData()).toEqual(toReferenceData(full));
    for (const s of full.students.slice(0, 12)) {
      expect(await readStudentScope(s.id)).toEqual(narrowToStudentScope(full, s.id));
      expect(await readStudentById(s.id)).toEqual(s);
    }
    const from = new Date("2026-09-01T00:00:00Z");
    const to = new Date("2026-10-10T00:00:00Z");
    expect(await readLessonWindow(from.toISOString(), to.toISOString())).toEqual(narrowToLessonWindow(full, from, to));
    expect(await readStudentListData()).toEqual({ ...toReferenceData(full), payments: toPaymentStatusRows(full.payments) });
    expect(await readPaymentsPageData()).toEqual(narrowToPaymentsPage(full));
  });

  it("Ödemeler dilimi tüm ödemeleri ve ödemeye bağlı dersi taşır, bağsız dersleri taşımaz", async () => {
    const data = await seedTwoStudents();
    await writeData({
      ...data,
      payments: [...data.payments, payment("plesson", "s1", { lessonId: "x1", source: "lesson_ops", amount: 800 })],
    });
    const full = await readData();
    const page = await readPaymentsPageData();
    expect(page.payments).toEqual(full.payments);
    expect(page.lessons.map((l) => l.id)).toEqual(["x1"]);
  });

  it("öğrenci dilimi öğrencinin TÜM ders/yoklama/telafi/ödeme satırlarını içerir, başkasınınkini içermez", async () => {
    const full = await seedTwoStudents();
    const scope = await readStudentScope("s1");
    const own = <T extends { studentId: string }>(rows: T[]) => rows.filter((r) => r.studentId === "s1").map((r) => (r as { id?: string }).id);
    expect(scope.students.map((s) => s.id)).toEqual(["s1"]);
    expect(scope.lessons.map((l) => l.id)).toEqual(own(full.lessons));
    expect(scope.lessons.map((l) => l.id)).toEqual(expect.arrayContaining(["x1", "x2"]));
    expect(scope.attendances.map((a) => a.id)).toEqual(own(full.attendances));
    expect(scope.makeupRequests.map((m) => m.id)).toEqual(own(full.makeupRequests));
    expect(scope.payments.map((p) => p.id)).toEqual(own(full.payments));
    for (const rows of [scope.lessons, scope.attendances, scope.makeupRequests, scope.payments]) {
      expect(rows.every((r) => r.studentId === "s1")).toBe(true);
    }
    // Ders penceresi sınır anını dahil eder (Ders Programı haftası kaybetmez).
    const edge = await readLessonWindow("2026-09-01T00:00:00.000Z", "2026-09-08T11:15:00.000Z");
    expect(edge.lessons.map((l) => l.id)).toEqual(expect.arrayContaining(["x1"]));

    const unknown = await readStudentScope("olmayan-ogrenci");
    expect(unknown.students).toEqual([]);
    expect(unknown.lessons).toEqual([]);
    expect(unknown.payments).toEqual([]);
  });

  it("boş kimlikle tek öğrenci okuması undefined döner (db'de filtresiz ilk satır riski yok)", async () => {
    await readData();
    expect(await readStudentById("")).toBeUndefined();
    expect(await readStudentById("olmayan-ogrenci")).toBeUndefined();
    await expect(readStudentScope("")).rejects.toThrow(/studentId gerekli/);
  });

  it("dilimler kurum korumasını taşır: başka kurum bağlamında okuma reddedilir", async () => {
    await readData();
    const reads: Array<() => Promise<unknown>> = [
      () => readStudentScope("s1"),
      () => readReferenceData(),
      () => readStudentById("s1"),
      () => readStudentListData(),
      () => readLessonWindow("2026-09-01T00:00:00Z", "2026-09-30T00:00:00Z"),
    ];
    for (const read of reads) {
      await expect(runWithTenantAsync("tenant_baska_kurum", read)).rejects.toThrow(/Cross-tenant/);
    }
  });

  it("ders mutasyonu dilimi logoyu taşımaz, diğer tüm kurum ayarları aynıdır", async () => {
    const full = await seedTwoStudents();
    const scope = await readLessonScope("x2");
    expect(scope).not.toBeNull();
    expect(scope!.settings).toEqual({ ...full.settings, logoUrl: "" });
    expect((await readReferenceData()).settings).toEqual({ ...full.settings, logoUrl: "" });
  });
});

describe("finans semantiği dilimlerle değişmez", () => {
  it("Eylül'de Geldi işaretlenen dersler hakedişe girer; Yoklama Takvimi (öğrenci dilimi) aynı dersleri gösterir", async () => {
    await seedTwoStudents();
    for (const lessonId of ["x1", "x2"]) {
      expect((await setLessonOpsFlagTool(ctx(), { lessonId, flag: "attended", confirmSwitch: true })).ok).toBe(true);
    }
    const full = await readData();
    const earnings = computeTeacherEarningsForPeriod(full, "t1", "2026-09-01", "2026-09-30");
    expect(earnings.lines.map((l) => l.lessonId)).toEqual(expect.arrayContaining(["x1", "x2"]));
    expect(earnings.totalAmount).toBeGreaterThan(0);

    const term = await getAttendanceCalendarTermTool(ctx(), { studentId: "s1", term: "guz", anchorYear: 2026 });
    expect(term.ok).toBe(true);
    if (!term.ok) return;
    const september = term.data.months.find((m) => m.year === 2026 && m.month === 9)!;
    const shown = september.days.flatMap((d) => d.lessons);
    for (const id of ["x1", "x2"]) {
      const l = full.lessons.find((x) => x.id === id)!;
      expect(shown.find((s) => s.lessonId === id)?.opsStatus).toBe(resolveLessonFinalStatus(l));
    }
    // Başka öğrencinin dersi bu öğrencinin takvimine girmez.
    expect(shown.some((s) => s.lessonId === "y1")).toBe(false);
  });

  it("kayıtlı hakediş ile iptal edilen kayıt ayrımı korunur", async () => {
    await seedTwoStudents();
    for (const lessonId of ["x1", "x2"]) {
      await setLessonOpsFlagTool(ctx(), { lessonId, flag: "attended", confirmSwitch: true });
    }
    const live = computeTeacherEarningsForPeriod(await readData(), "t1", "2026-09-01", "2026-09-30");
    const created = await createTeacherPayoutTool(ctx(), { teacherId: "t1", periodStart: "2026-09-01", periodEnd: "2026-09-30" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const saved = buildPayoutOverviewRows(await readData(), "2026-09-01", "2026-09-30").find((r) => r.teacher.id === "t1")!;
    expect(saved).toMatchObject({ hasRecord: true, status: "pending", calculated: live.totalAmount });

    const cancelled = await cancelTeacherPayoutTool(ctx(), { payoutId: created.data.payout.id, reason: "Test iptali — yeniden hesap" });
    expect(cancelled.ok).toBe(true);
    const after = await readData();
    expect(after.teacherPayouts.find((p) => p.id === created.data.payout.id)?.status).toBe("cancelled");
    const row = buildPayoutOverviewRows(after, "2026-09-01", "2026-09-30").find((r) => r.teacher.id === "t1")!;
    expect(row).toMatchObject({ hasRecord: false, calculated: live.totalAmount, totalAmount: live.totalAmount });
  });

  it("öğrenci bakiyesi ve Öğrenciler listesi ödeme alanları dilimden ve tam veriden aynı", async () => {
    const full = await seedTwoStudents();
    const scope = await readStudentScope("s1");
    const fromScope = computeStudentPaymentSummary(sortPaymentsForProfile(scope.payments), []);
    const fromFull = computeStudentPaymentSummary(
      sortPaymentsForProfile(full.payments.filter((p) => p.studentId === "s1")),
      []
    );
    expect(fromScope).toEqual(fromFull);
    expect(fromScope.overdueRemaining).toBeGreaterThanOrEqual(3200);

    const list = await readStudentListData();
    // 2026-10-18 — liste ödemeleri özettir (öğrenci/durum/sözleşme başına kalan); borç sonucu ham satırlarla aynı.
    expect(list.payments).toEqual(toPaymentStatusRows(full.payments));
  });
});

describe("hakediş penceresi ve Panel özeti dilimleri — finans sonucu tam veriyle aynı", () => {
  const day = (ymd: string, delta: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + delta * 86_400_000);
  const SEP = { start: "2026-09-01", end: "2026-09-30" };
  const sepWindow = () => readPayoutWindow(day(SEP.start, -2).toISOString(), day(SEP.end, 3).toISOString());

  it("Eylül'de Geldi dersleri pencereli hakediş hesabına girer; satırlar/toplamlar tam veriyle birebir aynı", async () => {
    await seedTwoStudents();
    for (const lessonId of ["x1", "x2"]) {
      expect((await setLessonOpsFlagTool(ctx(), { lessonId, flag: "attended", confirmSwitch: true })).ok).toBe(true);
    }
    const full = await readData();
    const win = await sepWindow();
    expect(win).toEqual(narrowToPayoutWindow(full, day(SEP.start, -2), day(SEP.end, 3)));
    expect(buildPayoutOverviewRows(win, SEP.start, SEP.end)).toEqual(buildPayoutOverviewRows(full, SEP.start, SEP.end));
    const lines = computeTeacherEarningsWithRevisions(win, "t1", SEP.start, SEP.end).lines.map((l) => l.lessonId);
    expect(lines).toEqual(expect.arrayContaining(["x1", "x2"]));
    // Pencere dışındaki ay dersleri hesaba sızmaz, pencere içindekiler eksilmez.
    expect(computeTeacherEarningsForPeriod(win, "t1", SEP.start, SEP.end)).toEqual(
      computeTeacherEarningsForPeriod(full, "t1", SEP.start, SEP.end)
    );
  });

  it("kayıtlı hakediş donmuş satırla, iptal edilen kayıt canlı hesapla gösterilir; fark (drift) dilimde de aynı", async () => {
    await seedTwoStudents();
    await setLessonOpsFlagTool(ctx(), { lessonId: "x1", flag: "attended", confirmSwitch: true });
    const created = await createTeacherPayoutTool(ctx(), { teacherId: "t1", periodStart: SEP.start, periodEnd: SEP.end });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    // Kayıttan SONRA ikinci ders de Geldi → canlı hesap kayıttan farklılaşır. 2026-10-04'ten beri yoklama aracı
    // ödenmemiş kaydı otomatik yeniden hesapladığı için fark, dilim eşliğini sınamak üzere doğrudan veriyle kurulur.
    {
      const d = await readData();
      await writeData({ ...d, lessons: d.lessons.map((l) => (l.id === "x2" ? { ...l, studentAttended: true } : l)) });
    }
    let full = await readData();
    let win = await sepWindow();
    const payout = full.teacherPayouts.find((p) => p.id === created.data.payout.id)!;
    expect(payoutDrift(win, payout)).toBe(payoutDrift(full, payout));
    expect(payoutDrift(win, payout)).toBeGreaterThan(0);
    expect(buildPayoutOverviewRows(win, SEP.start, SEP.end)).toEqual(buildPayoutOverviewRows(full, SEP.start, SEP.end));
    expect(passiveTeacherOpenPayouts(win)).toEqual(passiveTeacherOpenPayouts(full));

    expect((await cancelTeacherPayoutTool(ctx(), { payoutId: payout.id, reason: "Test iptali — yeniden hesap" })).ok).toBe(true);
    full = await readData();
    win = await sepWindow();
    const row = buildPayoutOverviewRows(win, SEP.start, SEP.end).find((r) => r.teacher.id === "t1")!;
    expect(row.hasRecord).toBe(false);
    expect(buildPayoutOverviewRows(win, SEP.start, SEP.end)).toEqual(buildPayoutOverviewRows(full, SEP.start, SEP.end));
  });

  it("Panel özeti: tahsilat/açık/gecikmiş toplamları, bugünün dersleri, ay hakediş özeti ve kurulum ilerlemesi tam veriyle aynı", async () => {
    await seedTwoStudents();
    await setLessonOpsFlagTool(ctx(), { lessonId: "x1", flag: "attended", confirmSwitch: true });
    const today = "2026-09-15";
    const now = new Date("2026-09-15T08:00:00Z");
    const full = await readData();
    const dash = await readDashboardData(day("2026-09-01", -2).toISOString(), day(today, 3).toISOString(), now.toISOString());
    expect(dash).toEqual(narrowToDashboard(full, day("2026-09-01", -2), day(today, 3), now));
    for (const branchId of ["all", ...full.settings.branches.map((b) => b.id)]) {
      const scope = { branchId, today, now };
      expect(buildDashboardSummary(dash, scope, new Map(), [], new Set())).toEqual(
        buildDashboardSummary(full, scope, new Map(), [], new Set())
      );
    }
    const summary = buildDashboardSummary(dash, { branchId: "all", today, now }, new Map(), [], new Set());
    expect(summary.money.overdueTotal).toBeGreaterThanOrEqual(3200);
    expect(summary.todayLessons.map((l) => l.id)).toContain("x2");
    expect(computeTeacherPayoutOverview(dash, "2026-09-01", today)).toEqual(computeTeacherPayoutOverview(full, "2026-09-01", today));
    expect(computeSetupProgress(dash, now)).toEqual(computeSetupProgress(full, now));
    expect(dash.payments).toHaveLength(full.payments.length);
  });
});

describe("çalışma günü istisnası (zorla açık gün)", () => {
  it("normalde kapalı pazartesi zorla açılınca takvim açık gösterir, ders penceresi istisnayı taşır, yoklama işlenir", async () => {
    const data = await readData();
    // 2026-09-14 Pazartesi — güz döneminde haftalık kapalı gün.
    await writeData({ ...data, lessons: [...data.lessons, lesson("mon1", "s1", "2026-09-14T11:15:00Z")] });
    const before = await getAttendanceCalendarTermTool(ctx(), { studentId: "s1", term: "guz", anchorYear: 2026 });
    expect(before.ok).toBe(true);
    if (!before.ok) return;
    const closedDay = before.data.months.find((m) => m.month === 9)!.days.find((d) => d.date === "2026-09-14")!;
    expect(closedDay.status).toBe("closed");

    expect((await setDayOverrideTool(ctx(), { date: "2026-09-14", isOpen: true, name: "Zorla açık" })).ok).toBe(true);
    const after = await getAttendanceCalendarTermTool(ctx(), { studentId: "s1", term: "guz", anchorYear: 2026 });
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    const openDay = after.data.months.find((m) => m.month === 9)!.days.find((d) => d.date === "2026-09-14")!;
    expect(openDay.status).toBe("open");
    expect(openDay.lessons.map((l) => l.lessonId)).toContain("mon1");

    const window = await readLessonWindow("2026-09-13T00:00:00Z", "2026-09-16T00:00:00Z");
    expect(window.closedDayOverrides.some((o) => o.date === "2026-09-14" && o.isOpen)).toBe(true);
    expect(window.lessons.map((l) => l.id)).toContain("mon1");

    // Ders mutasyonu dilimi (readLessonScope) da istisnayı görür → kapalı gün hatası yok.
    expect((await setLessonOpsFlagTool(ctx(), { lessonId: "mon1", flag: "attended" })).ok).toBe(true);
  });
});

describe("bildirim sayfalaması", () => {
  it("sayfalar tüm bildirimleri createdAt desc + id desc sırasıyla bir kez verir; okunmamış sayısı toplamdır", async () => {
    for (let i = 0; i < 23; i++) {
      await createNotification({ tenantId: DEFAULT_TENANT_ID, targetUserId: "u1", kind: `test_${i}`, title: `B${i}`, body: `Gövde ${i}` });
    }
    await createNotification({ tenantId: DEFAULT_TENANT_ID, targetUserId: "baska", kind: "test_x", title: "X", body: "başka kullanıcı" });
    const recipient = { tenantId: DEFAULT_TENANT_ID, userId: "u1" };
    const seen: { id: string; createdAt: string }[] = [];
    let cursor: string | undefined;
    for (let guard = 0; guard < 10; guard++) {
      const page = await listNotificationsPageForUser(recipient, { cursor, limit: 10 });
      expect(page.unreadCount).toBe(23);
      seen.push(...page.notifications.map((n) => ({ id: n.id, createdAt: n.createdAt })));
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    expect(new Set(seen.map((n) => n.id)).size).toBe(23);
    const sorted = [...seen].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    expect(seen).toEqual(sorted);

    await markNotificationRead(recipient, seen[0]!.id);
    expect((await listNotificationsPageForUser(recipient, { limit: 5 })).unreadCount).toBe(22);
  });
});

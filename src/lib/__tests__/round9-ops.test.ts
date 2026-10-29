/**
 * 9. tur (2026-09-28) — program hücresi, kapsamlar (ödeme/hakediş), tek tahsilat
 * tanımı, güvenli geri dönüş, paket/iş silme, oda düzenleme, iptal/telafi kaynağı,
 * öğretmen yoklama raporu. Kök nedenler ilgili modüllerin başındaki yorumlarda.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { DEFAULT_TENANT_ID } from "../auth/config";
import { readData } from "../store";
import {
  cancelLessonTool,
  deletePackageTool,
  deleteTaskTool,
  getPackageDeletionImpactTool,
  restoreDeletedTaskTool,
  setCriticalActionPasswordTool,
  setLessonDisruptionTool,
  updateRoomTool,
  createPackageTool,
} from "../services/tools";
import { createTask, listTasks, TASKS_FILE, getTask } from "../tasks";
import { CRITICAL_ACTION_PASSWORD_FILE } from "../critical-action-password";
import {
  assignLanes,
  compactStudentName,
  lessonHoverCardLines,
  studentInitials,
  weekCardNameLines,
} from "@/components/program-studio";
import { computePaymentScopeTotals, scopePayments } from "../payment-scope";
import { collectedAmountOf } from "../payment-profile";
import { buildPayoutOverviewRows, passiveTeacherOpenPayouts, rowsInPayoutScope, sumPayoutRows } from "../payout-overview";
import { resolveSafeReturnTo, returnToLabel, withReturnTo } from "../safe-return-to";
import { computePackageDeletionImpact, deletePackageData } from "../packages";
import { validateRoomRevision } from "../room-revision";
import { applyLessonOpsFlag } from "../lesson-ops";
import { buildTeacherAttendanceReport, teacherAttendanceDetail } from "../teacher-attendance-report";
import type { ServiceContext } from "../services/context";
import type { AppData, Lesson, MakeupRequest, Payment, Student } from "../types";

const auditCalls: { action: string; outcome: string; meta?: Record<string, unknown> }[] = [];
vi.mock("../audit/log", () => ({
  recordAuditLog: vi.fn(async (input: { action: string; outcome: string; meta?: Record<string, unknown> }) => {
    auditCalls.push({ action: input.action, outcome: input.outcome, meta: input.meta });
    return { id: "audit", persisted: true };
  }),
}));

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");
const PASSWORD = "Kritik-Sifre-9";

function owner(over: Partial<ServiceContext> = {}): ServiceContext {
  return { role: "SUPER_ADMIN", userId: "user_owner_nilufer", tenantId: DEFAULT_TENANT_ID, channel: "web", ...over };
}

beforeEach(async () => {
  auditCalls.length = 0;
  for (const f of [DATA_FILE, TASKS_FILE, CRITICAL_ACTION_PASSWORD_FILE]) await fs.rm(f, { force: true });
});

async function withPassword() {
  const res = await setCriticalActionPasswordTool(owner(), { newPassword: PASSWORD });
  expect(res.ok).toBe(true);
}

function lesson(over: Partial<Lesson>): Lesson {
  return {
    id: "l",
    studentId: "s1",
    teacherId: "t1",
    branchId: "erzene",
    roomId: "r1",
    instrument: "Piyano",
    startAt: "2026-09-10T10:00:00.000Z",
    endAt: "2026-09-10T10:40:00.000Z",
    status: "scheduled",
    type: "regular",
    createdAt: "2026-09-01T00:00:00.000Z",
    ...over,
  } as Lesson;
}

// ─── 1. Ders programı hücresi ──────────────────────────────────────────
describe("haftalık program hücresi", () => {
  it("şerit genişliği gün değil çakışma kümesi başına", () => {
    const { laneOf, lanesOf } = assignLanes([
      { id: "a", startAt: "2026-09-10T10:00:00Z", endAt: "2026-09-10T10:40:00Z" },
      { id: "b", startAt: "2026-09-10T10:00:00Z", endAt: "2026-09-10T10:40:00Z" },
      { id: "c", startAt: "2026-09-10T10:20:00Z", endAt: "2026-09-10T11:00:00Z" },
      { id: "d", startAt: "2026-09-10T15:00:00Z", endAt: "2026-09-10T15:40:00Z" },
    ]);
    expect(lanesOf.get("a")).toBe(3);
    expect(lanesOf.get("c")).toBe(3);
    // Öğleden sonraki tek ders artık tam genişlik — eskiden 1/3'e düşüyordu.
    expect(lanesOf.get("d")).toBe(1);
    expect(new Set([laneOf.get("a"), laneOf.get("b"), laneOf.get("c")]).size).toBe(3);
  });

  it("dar şerit için kısaltma ve baş harf; tam ad kaybolmaz", () => {
    expect(compactStudentName("Ayşe Nur Yılmaz")).toBe("Ayşe Nur Y.");
    expect(compactStudentName("Deniz")).toBe("Deniz");
    expect(studentInitials("ilker şahin")).toBe("İŞ");
    expect(weekCardNameLines(26)).toBe(1);
    expect(weekCardNameLines(54)).toBe(2);
  });

  it("statü metni hover kartında (hücrede yalnız ad var)", () => {
    const lines = lessonHoverCardLines(lesson({}), { id: "s1", name: "Deniz Ak" } as Student, undefined, undefined, undefined, "cancelled");
    expect(lines).toContain("Durum: İptal");
  });
});

// ─── 3. Ödemeler kapsamı + tek tahsilat tanımı ─────────────────────────
describe("ödeme kapsamı ve tahsil edilen tanımı", () => {
  // 2026-10-20 — gecikmiş vade gününden türetilir; "overdue" satırlar geçmiş, diğerleri gelecek vadeli.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-15T09:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  const students = [
    { id: "act", active: true },
    { id: "pas", active: false },
    { id: "del", active: false, deletedAt: "2026-09-01" },
  ] as Student[];
  const pay = (over: Partial<Payment>) =>
    ({ id: Math.random().toString(), studentId: "act", status: "pending", amount: 1000, paidAmount: 0, dueDate: over.status === "overdue" ? "2026-08-01" : "2026-09-01", ...over }) as Payment;
  const payments = [
    pay({ status: "paid", paidAmount: 1000 }),
    pay({ status: "partial", paidAmount: 400 }),
    pay({ status: "overdue" }),
    pay({ status: "voided", paidAmount: 0 }),
    pay({ studentId: "pas", status: "overdue" }),
    pay({ studentId: "pas", status: "paid", paidAmount: 700, amount: 700 }),
    pay({ studentId: "del", status: "pending", contractId: "c-cancel" }),
    pay({ studentId: "ghost", status: "pending" }),
  ];
  const terminal = new Set(["c-cancel"]);

  it("kısmi ödemenin alınan kısmı tahsil edilende; kalan açık alacakta", () => {
    expect(collectedAmountOf({ status: "partial", amount: 1000, paidAmount: 400 })).toBe(400);
    expect(collectedAmountOf({ status: "voided", amount: 1000, paidAmount: 1000 })).toBe(0);
    expect(collectedAmountOf({ status: "paid", amount: 900, paidAmount: 0 })).toBe(900);
    const t = computePaymentScopeTotals(payments.slice(0, 4), terminal);
    expect(t.collected).toBe(1400);
    expect(t.outstanding).toBe(600 + 1000);
    expect(t.overdueAmount).toBe(1000);
  });

  it("aktif / pasif / tüm kapsamlar ayrışır; kayıtlar değişmez", () => {
    const snapshot = JSON.stringify(payments);
    const active = scopePayments(payments, students, "aktif", terminal);
    const passive = scopePayments(payments, students, "pasif", terminal);
    const all = scopePayments(payments, students, "tum", terminal);
    expect(active.rows).toHaveLength(4);
    // Pasif + silinmiş + öğrencisi bulunamayan satır pasifte (kaybolmaz).
    expect(passive.rows).toHaveLength(4);
    expect(active.rows.length + passive.rows.length).toBe(all.rows.length);
    // İptal edilmiş sözleşmenin taksiti listede ama borç değil.
    expect(passive.totals.outstanding).toBe(1000 + 1000);
    expect(passive.totals.collected).toBe(700);
    expect(JSON.stringify(payments)).toBe(snapshot);
  });
});

// ─── 4. Hakediş kapsamı ────────────────────────────────────────────────
describe("hakediş kapsamı", () => {
  it("pasif öğretmenin dönem hakediş ve kayıtlı açık hakkı listeden düşmez", async () => {
    const data = await readData();
    const [t1, t2, t3] = data.teachers;
    const d: AppData = {
      ...data,
      teachers: [{ ...t1, active: true }, { ...t2, active: false }, { ...t3, active: false }],
      teacherPayouts: [
        { id: "p1", teacherId: t2.id, periodStart: "2026-09-01", periodEnd: "2026-09-30", totalMinutes: 60, totalAmount: 500, status: "pending", generatedAt: "x" },
        { id: "p0", teacherId: t2.id, periodStart: "2026-08-01", periodEnd: "2026-08-31", totalMinutes: 60, totalAmount: 300, status: "pending", generatedAt: "x" },
      ],
      lessons: [],
    };
    const rows = buildPayoutOverviewRows(d, "2026-09-01", "2026-09-30");
    expect(rows.map((r) => r.teacher.id)).toEqual([t1.id, t2.id]); // t3: pasif ve hareketsiz → gürültü yok
    expect(sumPayoutRows(rowsInPayoutScope(rows, "pasif")).pending).toBe(500);
    expect(sumPayoutRows(rowsInPayoutScope(rows, "aktif")).pending).toBe(0);
    expect(passiveTeacherOpenPayouts(d)).toEqual({ total: 800, count: 2, teacherCount: 1 });
  });
});

// ─── 8. Güvenli geri dönüş ─────────────────────────────────────────────
describe("returnTo", () => {
  it("yalnız uygulama içi panel yolları; etiket bağlamsal", () => {
    expect(withReturnTo("/sozlesme-yazdir/c1", "/panel/evraklar?kind=Sözleşme&ogrenci=active")).toContain("returnTo=");
    expect(withReturnTo("/sozlesme-yazdir/c1", "https://evil.com/x")).toBe("/sozlesme-yazdir/c1");
    expect(withReturnTo("/sozlesme-yazdir/c1", "//evil.com")).toBe("/sozlesme-yazdir/c1");
    expect(resolveSafeReturnTo(encodeURIComponent("/login"))).toBeNull();
    expect(returnToLabel("/panel/evraklar?kind=x")).toBe("Evraklara dön");
    expect(returnToLabel("/panel/ogrenciler/s1")).toBe("Öğrenci detayına dön");
    expect(returnToLabel("/panel/ogrenciler/s1/evraklar")).toBe("Öğrencinin evraklarına dön");
    expect(returnToLabel("/panel/odemeler")).toBe("Ödemelere dön");
  });
});

// ─── 5. Paket silme ────────────────────────────────────────────────────
describe("paket güvenli silme", () => {
  it("saf kural: kullanılmış paket silinmez, eşzamanlı değişiklik reddedilir", async () => {
    const data = await readData();
    const pkg = { id: "pk", title: "Deneme Paketi", status: "active", updatedAt: "2026-09-01T00:00:00.000Z" } as never;
    const base = { ...data, packages: [pkg] } as AppData;
    expect(deletePackageData(base, "pk", "2026-09-02T00:00:00.000Z")).toMatchObject({ ok: false, code: "CHANGED" });
    const used = { ...base, students: [{ ...data.students[0], packageId: "pk", active: false }] };
    expect(computePackageDeletionImpact(used, "pk")?.hardDeleteEligible).toBe(false);
    expect(deletePackageData(used, "pk", "2026-09-01T00:00:00.000Z")).toMatchObject({ ok: false, code: "IN_USE" });
    const nameOnly = { ...base, students: [{ ...data.students[0], packageId: undefined, packageName: "deneme  paketi" }] };
    expect(computePackageDeletionImpact(nameOnly, "pk")?.nameMatchStudentCount).toBe(1);
    const clean = { ...base, students: [] };
    const res = deletePackageData(clean, "pk", "2026-09-01T00:00:00.000Z");
    expect(res.ok && res.data.packages).toEqual([]);
  });

  it("tool: yetkisiz rol, yanlış şifre, yanlış ad reddedilir ve audit'e yazılır; doğru akış siler", async () => {
    await withPassword();
    const created = await createPackageTool(owner(), { title: "Yanlış Paket", price30Min: 1, price40Min: 1, price50Min: 1 });
    expect(created.ok).toBe(true);
    const packageId = created.ok ? created.data.packageId : "";
    const impact = await getPackageDeletionImpactTool(owner(), { packageId });
    expect(impact.ok && impact.data.hardDeleteEligible).toBe(true);
    const updatedAt = impact.ok ? impact.data.updatedAt : "";
    const base = { packageId, confirmationTitle: "Yanlış Paket", criticalPassword: PASSWORD, expectedUpdatedAt: updatedAt, reason: "Yanlışlıkla oluşturuldu" };

    expect((await deletePackageTool(owner({ role: "TEACHER" }), base)).ok).toBe(false);
    // Paket & Kampanya Motoru — paket CRUD yalnız SUPER_ADMIN (SCHOOL_ADMIN dahil diğer roller red).
    expect((await deletePackageTool(owner({ role: "SCHOOL_ADMIN" }), base)).ok).toBe(false);
    const wrongPw = await deletePackageTool(owner(), { ...base, criticalPassword: "yanlis-sifre" });
    expect(wrongPw.ok).toBe(false);
    const wrongName = await deletePackageTool(owner(), { ...base, confirmationTitle: "Başka" });
    expect(wrongName.ok).toBe(false);
    expect(auditCalls.filter((a) => a.action === "package.delete" && a.outcome === "denied").length).toBe(2);
    expect((await readData()).packages?.some((p) => p.id === packageId)).toBe(true);

    const done = await deletePackageTool(owner(), base);
    expect(done.ok).toBe(true);
    expect((await readData()).packages?.some((p) => p.id === packageId)).toBe(false);
    expect(auditCalls.some((a) => a.action === "package.delete" && a.outcome === "success")).toBe(true);
  });
});

// ─── 6. İş silme ───────────────────────────────────────────────────────
describe("iş güvenli (geri alınabilir) silme", () => {
  it("yanlış şifre/yetkisiz reddedilir; silinen iş listelerden çıkar, geri alınır", async () => {
    await withPassword();
    const task = await createTask({
      tenantId: DEFAULT_TENANT_ID,
      title: "Veliyi ara",
      priority: "MEDIUM",
      category: "Veli İletişimi",
      createdById: "user_owner_nilufer",
    });
    const input = { taskId: task.id, confirmation: "SİL", criticalPassword: PASSWORD, reason: "Yanlış açıldı" };
    expect((await deleteTaskTool(owner({ role: "TEACHER" }), input)).ok).toBe(false);
    expect((await deleteTaskTool(owner(), { ...input, criticalPassword: "hatali-sifre" })).ok).toBe(false);
    expect((await listTasks(DEFAULT_TENANT_ID)).some((t) => t.id === task.id)).toBe(true);

    expect((await deleteTaskTool(owner(), { ...input, confirmation: "SIL" })).ok).toBe(true);
    expect((await listTasks(DEFAULT_TENANT_ID)).some((t) => t.id === task.id)).toBe(false);
    expect(await getTask(DEFAULT_TENANT_ID, task.id)).toBeNull();

    expect((await restoreDeletedTaskTool(owner(), { taskId: task.id })).ok).toBe(true);
    expect((await listTasks(DEFAULT_TENANT_ID)).some((t) => t.id === task.id)).toBe(true);
  });
});

// ─── Oda düzenleme ─────────────────────────────────────────────────────
describe("oda düzenleme", () => {
  it("ileri tarihli planlı dersi olan odada şube/enstrüman kısıtı; ad/kapasite serbest", async () => {
    const data = await readData();
    const room = data.rooms[0];
    const other = data.settings.branches.find((b) => b.id !== room.branchId)!;
    const d = {
      rooms: data.rooms,
      lessons: [lesson({ roomId: room.id, instrument: room.instruments[0], startAt: "2099-01-01T10:00:00Z" })],
    };
    expect(validateRoomRevision(d, room.id, { name: "Yeni Ad", capacity: 3 })).toBeNull();
    expect(validateRoomRevision(d, room.id, { branchId: other.id })).toMatch(/şubesi değiştirilemez/);
    expect(validateRoomRevision(d, room.id, { instruments: room.instruments.slice(1) })).toMatch(/çıkarılamaz/);
    const twin = data.rooms.find((r) => r.id !== room.id && r.branchId === room.branchId);
    if (twin) expect(validateRoomRevision(d, room.id, { name: twin.name.toUpperCase() })).toMatch(/başka bir oda/);
  });

  it("tool: ad ve kapasite güncellenir, audit önceki değeri taşır", async () => {
    const room = (await readData()).rooms[0];
    const res = await updateRoomTool(owner(), { roomId: room.id, name: `${room.name} (A)`, capacity: room.capacity + 1 });
    expect(res.ok).toBe(true);
    const after = (await readData()).rooms.find((r) => r.id === room.id)!;
    expect(after.name).toBe(`${room.name} (A)`);
    expect(after.capacity).toBe(room.capacity + 1);
  });
});

// ─── 9. İptal/Telafi kaynağı ───────────────────────────────────────────
describe("iptal/telafi kaynağı", () => {
  it("öğretmen/kurum kaynaklı telafi kişisel hakkı tüketmez; öğrenci kaynaklı tüketir", async () => {
    const data = await readData();
    const student = data.students.find((s) => s.active)!;
    const settings = { ...data.settings, monthlyMakeupAllowance: 2 };
    const used: Lesson[] = [
      lesson({ id: "u1", studentId: student.id, startAt: "2026-10-05T10:00:00Z", endAt: "2026-10-05T10:40:00Z" }),
      lesson({ id: "u2", studentId: student.id, startAt: "2026-10-12T10:00:00Z", endAt: "2026-10-12T10:40:00Z" }),
    ];
    const mk = (id: string, src: string): MakeupRequest =>
      ({ id, studentId: student.id, sourceLessonId: src, status: "confirmed", createdAt: "2026-10-06" }) as MakeupRequest;
    const target = lesson({ id: "tgt", studentId: student.id, startAt: "2026-10-19T10:00:00Z", endAt: "2026-10-19T10:40:00Z" });
    const d: AppData = { ...data, settings, lessons: [...used, target], makeupRequests: [mk("m1", "u1"), mk("m2", "u2")] };
    const now = new Date("2026-10-19T12:00:00Z");

    const studentSourced = applyLessonOpsFlag(d, "tgt", "makeup", "admin", now, "Öğrenci hasta", { source: "student" });
    expect(studentSourced.ok).toBe(false); // kota dolu

    const teacherSourced = applyLessonOpsFlag(d, "tgt", "makeup", "admin", now, "Öğretmen gelemedi", { source: "teacher" });
    expect(teacherSourced.ok).toBe(true);
    if (teacherSourced.ok) {
      expect(teacherSourced.lesson.disruptionSource).toBe("teacher");
    }

    // Önceki telafilerden biri geriye dönük kurum kaynaklı sınıflandırılırsa hak açılır.
    const reclassified = { ...d, lessons: d.lessons.map((l) => (l.id === "u1" ? { ...l, disruptionSource: "institution" as const } : l)) };
    expect(applyLessonOpsFlag(reclassified, "tgt", "makeup", "admin", now, "Öğrenci hasta", { source: "student" }).ok).toBe(true);
  });

  it("kurum kaynaklı iptal öğretmene yazılmaz; sonradan öğretmen kaynaklıya düzeltilebilir", async () => {
    const data = await readData();
    const future = data.lessons.find((l) => l.status === "scheduled" && new Date(l.startAt) > new Date() && !l.seriesId) ??
      data.lessons.find((l) => l.status === "scheduled" && new Date(l.startAt) > new Date())!;
    const res = await cancelLessonTool(owner(), { lessonId: future.id, disruptionSource: "institution", disruptionNote: "Resmî tatil" });
    expect(res.ok).toBe(true);
    const after = (await readData()).lessons.find((l) => l.id === future.id)!;
    expect(after.status).toBe("cancelled");
    expect(after.disruptionSource).toBe("institution");
    await vi.waitFor(() =>
      expect(auditCalls.some((a) => a.action === "lesson.cancel" && a.meta?.disruptionSource === "institution")).toBe(true)
    );

    // Sonradan öğretmen kaynaklı olarak düzeltilir — öğretmen performansının tek verisi bu kaynaktır.
    const fix = await setLessonDisruptionTool(owner(), { lessonId: future.id, disruptionSource: "teacher" });
    expect(fix.ok).toBe(true);
    const fixed = (await readData()).lessons.find((l) => l.id === future.id)!;
    expect(fixed.disruptionSource).toBe("teacher");
  });

  it("iptal/telafi edilmemiş derse kaynak girilemez", async () => {
    const data = await readData();
    const plain = data.lessons.find((l) => l.status === "scheduled" && !l.opsMakeupFlag)!;
    const res = await setLessonDisruptionTool(owner(), { lessonId: plain.id, disruptionSource: "teacher" });
    expect(res.ok).toBe(false);
  });
});

// ─── 10. Öğretmen aksama raporu ────────────────────────────────────────
describe("öğretmen aksama raporu", () => {
  const lessons = [
    lesson({ id: "a", status: "completed" }),
    lesson({ id: "b", status: "cancelled", disruptionSource: "teacher" }),
    lesson({ id: "c", status: "cancelled", disruptionSource: "institution" }),
    lesson({ id: "d", status: "cancelled" }), // eski kayıt — kaynak yok
    lesson({ id: "e", opsMakeupFlag: true, disruptionSource: "student" }),
    lesson({ id: "f", type: "makeup", status: "completed" }), // telafi dersi
    lesson({ id: "g", teacherId: "t2", startAt: "2026-08-01T10:00:00Z" }), // aralık dışı
  ];
  const filters = { from: "2026-09-01", to: "2026-09-30" };

  it("kaynaklar ayrı sayılır; eski kayıt 'belirtilmemiş', kurum kaynaklı öğretmene yazılmaz", () => {
    const { rows, totals } = buildTeacherAttendanceReport(lessons, filters);
    expect(rows).toHaveLength(1);
    expect(totals).toMatchObject({
      lessonCount: 6,
      teacher_source: 1,
      institution_source: 1,
      student_other_source: 1,
      unspecified_source: 1,
    });
  });

  it("rapor toplamları ders detayıyla uzlaşır", () => {
    const { totals } = buildTeacherAttendanceReport(lessons, filters);
    for (const cat of ["teacher_source", "institution_source", "student_other_source", "unspecified_source"] as const) {
      expect(teacherAttendanceDetail(lessons, filters, cat)).toHaveLength(totals[cat]);
    }
  });
});


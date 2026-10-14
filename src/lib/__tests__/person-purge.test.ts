/**
 * 2026-10-15 (owner) — öğrenci/öğretmen kalıcı silme. Önizleme ile silme aynı planı kullanır; ilişkisiz ve ilişkili
 * demo kayıt temizlenebilir; tahsilat/hakediş/başkasının kaydı korunur; önizlemeden sonra veri değişirse silme
 * yapılmaz; yetkisiz rol reddedilir; tekrar istek güvenlidir; şemaya eklenen yeni kişi FK'si sınıflandırılmadan geçemez.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { DEFAULT_TENANT_ID } from "../auth/config";
import { readData } from "../store";
import { writeData } from "../store-json";
import {
  deleteStudentTool,
  deleteTeacherTool,
  getPersonPurgePreviewTool,
  purgePersonTool,
  restoreDeletedStudentTool,
} from "../services/tools";
import { planStudentPurge, planTeacherPurge, type StudentPurgeSnapshot, type TeacherPurgeSnapshot } from "../person-purge";
import type { ServiceContext } from "../services/context";
import type { Attendance, Lesson, Payment, Student, Teacher, TeacherPayout } from "../types";
import { CRIT, withTestCriticalPassword } from "./helpers/critical-delete";

const auditCalls: { action: string; outcome: string; meta?: Record<string, unknown> }[] = [];
vi.mock("../audit/log", () => ({
  recordAuditLog: vi.fn(async (input: { action: string; outcome: string; meta?: Record<string, unknown> }) => {
    auditCalls.push({ action: input.action, outcome: input.outcome, meta: input.meta });
    return { id: "audit", persisted: true };
  }),
}));

const DIR = resolveDataDir(path.join(process.cwd(), "data"));
const admin: ServiceContext = { role: "SCHOOL_ADMIN", userId: "u_admin", tenantId: DEFAULT_TENANT_ID, channel: "web" };
const DEMO = "s_purge_demo";
const OTHER = "s_purge_other";
const DAY = 86_400_000;

beforeEach(async () => {
  auditCalls.length = 0;
  for (const f of ["store.json", "student-contracts.json", "club-memberships.json", "clubs.json", "tasks.json"]) {
    await fs.rm(path.join(DIR, f), { force: true });
  }
  await withTestCriticalPassword();
});

// Bu dosyanın yazdığı yan dosyalar sonraki test dosyalarına sızmasın.
afterEach(async () => {
  for (const f of ["clubs.json", "tasks.json"]) await fs.rm(path.join(DIR, f), { force: true });
});

function lessonAt(tpl: Lesson, id: string, studentId: string, offsetDays: number, extra: Partial<Lesson> = {}): Lesson {
  const start = new Date(Date.now() + offsetDays * DAY);
  return {
    ...tpl,
    id,
    studentId,
    seriesId: undefined,
    makeupRequestId: undefined,
    status: offsetDays < 0 ? "completed" : "scheduled",
    startAt: start.toISOString(),
    endAt: new Date(start.getTime() + 40 * 60_000).toISOString(),
    ...extra,
  };
}

/**
 * Seed'e silinmiş (Silinenler'de) bir demo öğrenci + aynı grup oturumunda başka bir öğrenci ekler:
 * demo'nun 1 geçmiş dersi (+yoklama), 1 gelecek dersi, 1 grup dersi satırı ve 1 ödenmemiş borcu vardır.
 */
async function seedDemo(opts: { collected?: boolean; deleted?: boolean } = {}) {
  const data = await readData();
  const tpl = data.students[0]!;
  const lessonTpl = data.lessons.find((l) => l.status !== "cancelled")!;
  const demo: Student = {
    ...tpl,
    id: DEMO,
    displayId: "Ö-9001",
    name: "Demo Silinecek",
    phone: "05550001122",
    parentPhone: "05550003344",
    enrollments: undefined,
    active: false,
    ...(opts.deleted === false ? {} : { deletedAt: new Date().toISOString(), deletionReason: "demo kaydı" }),
  };
  const other: Student = { ...tpl, id: OTHER, displayId: "Ö-9002", name: "Kalan Öğrenci", enrollments: undefined };
  const past = lessonAt(lessonTpl, "les_demo_past", DEMO, -10);
  const future = lessonAt(lessonTpl, "les_demo_future", DEMO, 10);
  const groupDemo = lessonAt(lessonTpl, "les_group_demo", DEMO, -3, { type: "group", clubSessionId: "cs_1", status: "completed" });
  const groupOther = lessonAt(lessonTpl, "les_group_other", OTHER, -3, { type: "group", clubSessionId: "cs_1", status: "completed" });
  const att: Attendance = { id: "att_demo_past", lessonId: past.id, studentId: DEMO, status: "present", markedAt: past.startAt, createsMakeupCredit: false } as Attendance;
  const payTpl = data.payments[0]!;
  const debt: Payment = {
    ...payTpl,
    id: "pay_demo_debt",
    studentId: DEMO,
    contractId: undefined,
    lessonId: undefined,
    clubMembershipId: undefined,
    amount: 3000,
    paidAmount: 0,
    status: "pending",
  };
  const paid: Payment = { ...debt, id: "pay_demo_paid", paidAmount: 3000, status: "paid", paidAt: new Date().toISOString() };
  await writeData({
    ...data,
    students: [...data.students, demo, other],
    lessons: [...data.lessons, past, future, groupDemo, groupOther],
    attendances: [...data.attendances, att],
    payments: [...data.payments, debt, ...(opts.collected ? [paid] : [])],
  });
  return { demo, other, lessonTpl };
}

const purgeInput = (fingerprint: string, over: Record<string, unknown> = {}) => ({
  kind: "student",
  id: DEMO,
  expectedFingerprint: fingerprint,
  confirmationName: "Demo Silinecek",
  ...CRIT,
  ...over,
});

async function previewOf(kind: "student" | "teacher", id: string) {
  const r = await getPersonPurgePreviewTool(admin, { kind, id });
  expect(r.ok, r.ok ? "" : r.error.message).toBe(true);
  if (!r.ok) throw new Error(r.error.message);
  return r.data;
}

describe("öğrenci kalıcı silme — ilişkili demo kayıt", () => {
  it("önizleme somut sayıları verir ve silme tam olarak önizlenen kapsamı uygular; grup dersindeki diğer öğrenci etkilenmez", async () => {
    await seedDemo();
    const preview = await previewOf("student", DEMO);
    expect(preview.outcome).toBe("delete");
    expect(preview.eligible).toBe(true);
    const removed = Object.fromEntries(preview.remove.map((b) => [b.key, b.ids]));
    expect(removed.lessons?.sort()).toEqual(["les_demo_future", "les_demo_past", "les_group_demo"]);
    expect(removed.attendances).toEqual(["att_demo_past"]);
    expect(removed.payments).toEqual(["pay_demo_debt"]);
    expect(preview.effects.join(" ")).toContain("1 gelecek ders");
    expect(preview.effects.join(" ")).toContain("grup dersi");

    const r = await purgePersonTool(admin, purgeInput(preview.fingerprint));
    expect(r.ok, r.ok ? "" : r.error.message).toBe(true);
    if (r.ok) expect(r.data.outcome).toBe("delete");
    const after = await readData();
    expect(after.students.some((s) => s.id === DEMO)).toBe(false);
    expect(after.lessons.filter((l) => l.studentId === DEMO)).toHaveLength(0);
    expect(after.attendances.some((a) => a.studentId === DEMO)).toBe(false);
    expect(after.payments.some((p) => p.studentId === DEMO)).toBe(false);
    // Paylaşılan: aynı grup oturumundaki diğer öğrenci ve kendi dersi yerinde.
    expect(after.students.some((s) => s.id === OTHER)).toBe(true);
    expect(after.lessons.some((l) => l.id === "les_group_other")).toBe(true);

    const success = auditCalls.find((c) => c.action === "student.purge" && c.outcome === "success");
    expect(success?.meta).toMatchObject({ outcome: "delete", displayId: "Ö-9001" });
    expect(JSON.stringify(success?.meta)).not.toContain("Demo Silinecek");
    expect(JSON.stringify(success?.meta)).not.toContain(CRIT.reason);

    // Tekrar istek: kayıt yok → anlaşılır NOT_FOUND, çökme/ikinci etki yok.
    const again = await purgePersonTool(admin, purgeInput(preview.fingerprint));
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.code).toBe("NOT_FOUND");
  });

  it("görev silinmez; öğrenciyle iki yoldan bağı (studentId ve genel bağ + ad etiketi) kaldırılır", async () => {
    await seedDemo();
    const task = (id: string, extra: Record<string, unknown>) => ({ id, tenantId: DEFAULT_TENANT_ID, title: "Takip", status: "TODO", createdById: "u", ...extra });
    await fs.writeFile(
      path.join(DIR, "tasks.json"),
      JSON.stringify({ tasks: [task("tk1", { studentId: DEMO }), task("tk2", { relatedEntityType: "student", relatedEntityId: DEMO, relatedEntityLabel: "Demo Silinecek" }), task("tk3", { studentId: OTHER })] })
    );
    const preview = await previewOf("student", DEMO);
    expect(preview.detach.find((b) => b.key === "tasks")?.ids).toEqual(["tk1", "tk2"]);
    expect((await purgePersonTool(admin, purgeInput(preview.fingerprint))).ok).toBe(true);
    const { tasks } = JSON.parse(await fs.readFile(path.join(DIR, "tasks.json"), "utf8")) as { tasks: Record<string, unknown>[] };
    expect(tasks.map((t) => t.id)).toEqual(["tk1", "tk2", "tk3"]);
    expect(tasks[0]!.studentId).toBeNull();
    expect(tasks[1]!.relatedEntityId).toBeUndefined();
    expect(JSON.stringify(tasks[1])).not.toContain("Demo Silinecek");
    expect(tasks[2]!.studentId).toBe(OTHER);
  });

  it("kesinleşmiş tahsilat varsa satır silinmez, anonimleştirilir; tahsilat korunur; listede ve geri almada yok; tekrar istek güvenli", async () => {
    await seedDemo({ collected: true });
    const preview = await previewOf("student", DEMO);
    expect(preview.outcome).toBe("anonymize");
    expect(preview.keep.find((b) => b.key === "payments")?.ids).toEqual(["pay_demo_paid"]);
    expect(preview.remove.find((b) => b.key === "payments")?.ids).toEqual(["pay_demo_debt"]);

    const r = await purgePersonTool(admin, purgeInput(preview.fingerprint));
    expect(r.ok, r.ok ? "" : r.error.message).toBe(true);
    const after = await readData();
    const row = after.students.find((s) => s.id === DEMO)!;
    expect(row.name).toBe("Silinmiş öğrenci (Ö-9001)");
    expect(row.phone).toBe("");
    expect(row.parentPhone).toBeUndefined();
    expect(row.purgedAt).toBeTruthy();
    expect(after.payments.find((p) => p.id === "pay_demo_paid")?.paidAmount).toBe(3000);
    expect(after.payments.some((p) => p.id === "pay_demo_debt")).toBe(false);

    expect((await restoreDeletedStudentTool(admin, { studentId: DEMO })).ok).toBe(false);
    const again = await purgePersonTool(admin, purgeInput(preview.fingerprint, { confirmationName: "x" }));
    expect(again.ok && again.data.alreadyPurged).toBe(true);
  });

  it("önizlemeden sonra yeni ders eklenirse hiçbir şey silinmez ve yeniden önizleme istenir", async () => {
    const { lessonTpl } = await seedDemo();
    const stale = await previewOf("student", DEMO);
    const data = await readData();
    await writeData({ ...data, lessons: [...data.lessons, lessonAt(lessonTpl, "les_demo_new", DEMO, 20)] });

    const r = await purgePersonTool(admin, purgeInput(stale.fingerprint));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("CONFLICT");
      expect(r.error.message).toContain("yeniden onaylayın");
    }
    expect((await readData()).students.some((s) => s.id === DEMO)).toBe(true);
    const fresh = await previewOf("student", DEMO);
    expect(fresh.fingerprint).not.toBe(stale.fingerprint);
    expect((await purgePersonTool(admin, purgeInput(fresh.fingerprint))).ok).toBe(true);
  });

  it("Silinenler'de olmayan öğrenci, yetkisiz rol, yanlış ad ve yanlış şifre reddedilir", async () => {
    await seedDemo({ deleted: false });
    const p = await previewOf("student", DEMO);
    expect(p.eligible).toBe(false);
    expect(p.blockers[0]?.fix).toContain("Silinenler");
    expect((await purgePersonTool(admin, purgeInput(p.fingerprint))).ok).toBe(false);

    const del = await deleteStudentTool(admin, { studentId: DEMO, mode: "soft", confirmationName: "Demo Silinecek", ...CRIT });
    expect(del.ok).toBe(true);
    const ok = await previewOf("student", DEMO);
    for (const role of ["TEACHER", "STUDENT", "BRANCH_MANAGER"] as const) {
      expect((await getPersonPurgePreviewTool({ ...admin, role }, { kind: "student", id: DEMO })).ok).toBe(false);
      expect((await purgePersonTool({ ...admin, role }, purgeInput(ok.fingerprint))).ok).toBe(false);
    }
    expect((await purgePersonTool(admin, purgeInput(ok.fingerprint, { confirmationName: "Başka" }))).ok).toBe(false);
    expect((await purgePersonTool(admin, purgeInput(ok.fingerprint, { criticalPassword: "yanlis" }))).ok).toBe(false);
    expect((await readData()).students.some((s) => s.id === DEMO)).toBe(true);
    expect(auditCalls.filter((c) => c.action === "student.purge" && c.outcome === "denied").length).toBeGreaterThanOrEqual(2);
  });
});

describe("öğretmen kalıcı silme", () => {
  const LEAVER = "t_purge_leaver";
  async function seedTeacher(withHistory: boolean) {
    const data = await readData();
    const t: Teacher = { ...data.teachers[0]!, id: LEAVER, displayId: "T-77", name: "Ayrılan Hoca", phone: "0555", email: "hoca@example.com", active: false, deletedAt: new Date().toISOString() };
    const lessonTpl = data.lessons.find((l) => l.status !== "cancelled")!;
    const past = lessonAt(lessonTpl, "les_leaver_past", lessonTpl.studentId, -15, { teacherId: LEAVER });
    const payout = { ...(data.teacherPayouts[0] ?? ({} as TeacherPayout)), id: "pay_leaver", teacherId: LEAVER, status: "paid" } as TeacherPayout;
    await writeData({
      ...data,
      teachers: [...data.teachers, t],
      lessons: withHistory ? [...data.lessons, past] : data.lessons,
      teacherPayouts: withHistory ? [...data.teacherPayouts, payout] : data.teacherPayouts,
    });
    await fs.writeFile(path.join(DIR, "clubs.json"), JSON.stringify([{ id: "club_x", tenantId: DEFAULT_TENANT_ID, name: "Koro", teacherIds: [LEAVER, "t1"] }]));
  }
  const input = (fp: string) => ({ teacherId: LEAVER, mode: "hard", expectedFingerprint: fp, confirmationName: "Ayrılan Hoca", ...CRIT });

  it("geçmişi olan öğretmen anonimleştirilir; ders/hakediş öğretmen kimliğiyle kalır; grup dersinden yalnız çıkarılır", async () => {
    await seedTeacher(true);
    const p = await previewOf("teacher", LEAVER);
    expect(p.outcome).toBe("anonymize");
    expect(p.detach.find((b) => b.key === "clubs")?.ids).toEqual(["club_x"]);
    const r = await deleteTeacherTool(admin, input(p.fingerprint));
    expect(r.ok, r.ok ? "" : r.error.message).toBe(true);
    const after = await readData();
    const t = after.teachers.find((x) => x.id === LEAVER)!;
    expect(t.name).toBe("Silinmiş öğretmen (T-77)");
    expect(t.email).toBe("");
    expect(after.lessons.find((l) => l.id === "les_leaver_past")?.teacherId).toBe(LEAVER);
    expect(after.teacherPayouts.find((x) => x.id === "pay_leaver")?.status).toBe("paid");
    const clubs = JSON.parse(await fs.readFile(path.join(DIR, "clubs.json"), "utf8")) as { teacherIds: string[] }[];
    expect(clubs[0]!.teacherIds).toEqual(["t1"]);
  });

  it("geçmişi olmayan öğretmen tamamen silinir", async () => {
    await seedTeacher(false);
    const p = await previewOf("teacher", LEAVER);
    expect(p.outcome).toBe("delete");
    expect((await deleteTeacherTool(admin, input(p.fingerprint))).ok).toBe(true);
    expect((await readData()).teachers.some((x) => x.id === LEAVER)).toBe(false);
  });
});

describe("planlayıcı (saf) — paylaşılan hesap, hakediş, açık borç, öğretmen engelleri", () => {
  const person = { id: "s1", name: "A B", displayId: "Ö-1", active: false, deletedAt: "2026-10-01T00:00:00.000Z" };
  const base: StudentPurgeSnapshot = {
    kind: "student",
    person,
    lessons: [],
    attendances: [],
    series: [],
    makeups: [],
    payments: [],
    contracts: [],
    checkouts: [],
    followUps: [],
    payouts: [],
    documents: [],
    clubMemberships: [],
    owned: {},
    detach: {},
    accounts: [],
    teacherNames: { t1: "Ayşe Hoca" },
    nowIso: "2026-10-15T00:00:00.000Z",
  };

  it("paylaşılan veli hesabı kapatılmaz, yalnız bağı kaldırılır; yalnız bu öğrenciye ait hesap kapatılır", () => {
    const plan = planStudentPurge({
      ...base,
      accounts: [
        { userId: "u_shared", role: "STUDENT", email: "veli@example.com", otherLinks: 1, portalAccessIds: ["pa1"] },
        { userId: "u_own", role: "STUDENT", email: "ogr@example.com", otherLinks: 0, portalAccessIds: ["pa2"] },
      ],
    });
    expect(plan.accounts.find((a) => a.userId === "u_shared")?.action).toBe("unlink");
    expect(plan.accounts.find((a) => a.userId === "u_own")?.action).toBe("close");
    expect(plan.accounts[0]!.maskedEmail).not.toContain("veli@");
  });

  it("kesinleşmiş hakediş dönemindeki ders korunur, dışındaki silinir ve öğretmen etkisi adıyla gösterilir", () => {
    const l = (id: string, startAt: string) => ({ id, studentId: "s1", teacherId: "t1", startAt, status: "completed" });
    const plan = planStudentPurge({
      ...base,
      lessons: [l("in", "2026-09-10T10:00:00.000Z"), l("out", "2026-10-05T10:00:00.000Z")],
      payouts: [{ id: "po", teacherId: "t1", periodStart: "2026-09-01T00:00:00.000Z", periodEnd: "2026-09-30T23:59:59.000Z", status: "paid" }],
    });
    expect(plan.outcome).toBe("anonymize");
    expect(plan.keep.find((b) => b.key === "lessons")?.ids).toEqual(["in"]);
    expect(plan.remove.find((b) => b.key === "lessons")?.ids).toEqual(["out"]);
    expect(plan.effects.join(" ")).toContain("Ayşe Hoca");
  });

  it("imzalı sözleşmenin açık taksidi kalıcı silmeyi engeller ve çözüm ekranını söyler; parmak izi deterministik", () => {
    const snap: StudentPurgeSnapshot = {
      ...base,
      contracts: [{ id: "c1", status: "signed", signedAt: "2026-09-01T00:00:00.000Z" }],
      payments: [
        { id: "i1", amount: 1000, paidAmount: 1000, status: "paid", contractId: "c1" },
        { id: "i2", amount: 1000, paidAmount: 0, status: "pending", contractId: "c1" },
      ],
    };
    const plan = planStudentPurge(snap);
    expect(plan.eligible).toBe(false);
    expect(plan.blockers[0]!.fix).toContain("Ödemeler");
    expect(planStudentPurge(snap).fingerprint).toBe(plan.fingerprint);
    const cancelled = planStudentPurge({ ...snap, contracts: [{ ...snap.contracts[0]!, status: "cancelled" }] });
    expect(cancelled.eligible).toBe(true);
    expect(cancelled.keep.find((b) => b.key === "payments")?.ids).toEqual(["i1", "i2"]);
  });

  it("öğretmen: aktif öğrenci ve gelecek ders engeller; öğretmen sessizce değiştirilmez", () => {
    const t: TeacherPurgeSnapshot = {
      kind: "teacher",
      person: { ...person, id: "t9", name: "Hoca" },
      lessons: [{ id: "f", studentId: "s2", teacherId: "t9", startAt: "2026-11-01T10:00:00.000Z", status: "scheduled" }],
      series: [],
      makeups: [],
      payouts: [],
      feeRules: [],
      payoutExclusions: [],
      students: [{ id: "s2", name: "Ali Veli", active: true, activeLink: true }],
      owned: {},
      history: {},
      detach: {},
      accounts: [],
      nowIso: "2026-10-15T00:00:00.000Z",
    };
    const plan = planTeacherPurge(t);
    expect(plan.eligible).toBe(false);
    expect(plan.blockers.map((b) => b.fix).join(" ")).toContain("başka öğretmene");
    expect(plan.blockers.map((b) => b.reason).join(" ")).toContain("Ali Veli");
  });
});

describe("şema kapsama kilidi", () => {
  /**
   * Öğrenci/öğretmene işaret eden her kolon kalıcı silme yükleyicilerinde (person-purge-db.ts) sınıflandırılmıştır.
   * Yeni bir model eklenirse bu test kırılır: kalıcı silmede silinecek mi, korunacak mı, bağı mı kaldırılacak — karar verin.
   */
  const CLASSIFIED = new Set([
    "User", "StudentPortalAccess", "Student", "Lesson", "LessonSeries", "TeacherFeeRule", "TeacherPayout", "TeacherPayoutExclusion",
    "Attendance", "MakeupRequest", "Payment", "PaymentCheckoutAttempt", "PaymentFollowUpCase", "FeedbackInvite", "LessonAssessment",
    "PeriodicAssessment", "TeacherAvailabilityRequest", "Homework", "HomeworkSubmission", "TeachingMaterial", "TeacherFeedback",
    "StudentFeedback", "StudentCurriculumTopic", "SocialMediaConsent", "TrialLesson", "ClubMembership", "ClubApplication",
    "DocumentInstance", "StudentContract", "Task", "StudentAttendanceRiskLog", "Notification",
  ]);

  it("studentId/teacherId taşıyan her model sınıflandırılmış", async () => {
    const schema = await fs.readFile(path.join(process.cwd(), "prisma/schema.prisma"), "utf8");
    const models = [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)]
      .filter(([, , body]) => /^\s+(studentId|teacherId|convertedStudentId|targetStudentId)\s/m.test(body!))
      .map(([, name]) => name!);
    expect(models.filter((m) => !CLASSIFIED.has(m))).toEqual([]);
  });
});

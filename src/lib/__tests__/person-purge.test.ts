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
  getBulkStudentPurgePreviewTool,
  bulkPurgeStudentsTool,
} from "../services/tools";
import { planStudentPurge, planTeacherPurge, type StudentPurgeSnapshot, type TeacherPurgeSnapshot } from "../person-purge";
import type { ServiceContext } from "../services/context";
import type { Attendance, Lesson, MakeupRequest, Payment, Student, Teacher, TeacherPayout } from "../types";
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
      JSON.stringify({ tasks: [task("tk1", { studentId: DEMO, title: "Öğrenci takibi — Demo Silinecek" }), task("tk2", { relatedEntityType: "student", relatedEntityId: DEMO, relatedEntityLabel: "Demo Silinecek" }), task("tk3", { studentId: OTHER })] })
    );
    const preview = await previewOf("student", DEMO);
    expect(preview.detach.find((b) => b.key === "tasks")?.ids).toEqual(["tk1", "tk2"]);
    expect((await purgePersonTool(admin, purgeInput(preview.fingerprint))).ok).toBe(true);
    const { tasks } = JSON.parse(await fs.readFile(path.join(DIR, "tasks.json"), "utf8")) as { tasks: Record<string, unknown>[] };
    expect(tasks.map((t) => t.id)).toEqual(["tk1", "tk2", "tk3"]);
    expect(tasks[0]!.studentId).toBeNull();
    expect(tasks[0]!.title).toBe("Öğrenci takibi — Silinmiş öğrenci (Ö-9001)");
    expect(tasks[1]!.relatedEntityId).toBeUndefined();
    expect(tasks[1]!.title).toBe("Takip");
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

  it("hakediş dönemi kurum saatine göre (yalnız tarih saklanır): son günün geç saati ve ilk günün gece yarısı sonrası korunur", () => {
    const l = (id: string, startAt: string) => ({ id, studentId: "s1", teacherId: "t1", startAt, status: "completed" });
    const plan = planStudentPurge({
      ...base,
      lessons: [
        l("last_day_evening", "2026-09-30T18:30:00.000Z"), // İstanbul 30 Eylül 21:30 → dönem içi
        l("first_day_0030", "2026-08-31T21:30:00.000Z"), // İstanbul 1 Eylül 00:30 → dönem içi
        l("next_day_0030", "2026-09-30T21:30:00.000Z"), // İstanbul 1 Ekim 00:30 → dönem dışı
        l("snapshot_only", "2026-10-02T10:00:00.000Z"), // dönem dışı ama hakedişin dondurulmuş satırında
      ],
      payouts: [{ id: "po", teacherId: "t1", periodStart: "2026-09-01", periodEnd: "2026-09-30", status: "paid", lessonIds: ["snapshot_only"] }],
    });
    expect(plan.keep.find((b) => b.key === "lessons")?.ids).toEqual(["first_day_0030", "last_day_evening", "snapshot_only"]);
    expect(plan.remove.find((b) => b.key === "lessons")?.ids).toEqual(["next_day_0030"]);
  });

  it("grup oturumunun tek üyesiyse oturumun programdan kalkacağı söylenir", () => {
    const g = { id: "g1", studentId: "s1", teacherId: "t1", startAt: "2026-10-01T10:00:00.000Z", status: "completed", clubSessionId: "cs" };
    expect(planStudentPurge({ ...base, lessons: [g], groupSessionOthers: { cs: 0 } }).effects.join(" ")).toContain("tek üyesi");
    expect(planStudentPurge({ ...base, lessons: [g], groupSessionOthers: { cs: 3 } }).effects.join(" ")).not.toContain("tek üyesi");
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

describe("yanlış oluşturuldu — her şeyi sil (wipe)", () => {
  const owner: ServiceContext = { ...admin, role: "SUPER_ADMIN", userId: "u_owner" };

  it("tahsilatlı öğrenci: yalnız kurum sahibi + finansal onayla; tahsilat ve borç dahil her şey silinir; grup dersinin diğer üyesi kalır; audit'te ad yok", async () => {
    await seedDemo({ collected: true });
    expect((await getPersonPurgePreviewTool(admin, { kind: "student", id: DEMO, mode: "wipe" })).ok).toBe(false);
    const r0 = await getPersonPurgePreviewTool(owner, { kind: "student", id: DEMO, mode: "wipe" });
    if (!r0.ok) throw new Error(r0.error.message);
    const p = r0.data;
    expect(p.mode).toBe("wipe");
    expect(p.outcome).toBe("delete");
    expect(p.keep).toEqual([]);
    expect(p.remove.find((b) => b.key === "payments")?.ids).toEqual(["pay_demo_debt", "pay_demo_paid"]);
    expect(p.financial).toMatchObject({ collectedCount: 1, collectedTotal: 3000, debtCount: 1, debtTotal: 3000 });
    expect(p.effects[0]).toContain("Finansal kayıtlar da silinecek");
    expect((await previewOf("student", DEMO)).fingerprint).not.toBe(p.fingerprint);

    // Kurum yöneticisi ve finansal onay kutusu olmadan reddedilir.
    expect((await purgePersonTool(admin, purgeInput(p.fingerprint, { mode: "wipe", financialAcknowledged: true }))).ok).toBe(false);
    expect((await purgePersonTool(owner, purgeInput(p.fingerprint, { mode: "wipe" }))).ok).toBe(false);
    expect((await readData()).payments.some((x) => x.id === "pay_demo_paid")).toBe(true);

    // "Tümünü seç" (onaylanan kapsam) işaretlenmeden reddedilir.
    expect((await purgePersonTool(owner, purgeInput(p.fingerprint, { mode: "wipe", financialAcknowledged: true }))).ok).toBe(false);
    const r = await purgePersonTool(owner, purgeInput(p.fingerprint, { mode: "wipe", financialAcknowledged: true, scopeAll: true }));
    expect(r.ok, r.ok ? "" : r.error.message).toBe(true);
    const after = await readData();
    expect(after.students.some((s) => s.id === DEMO)).toBe(false);
    expect(after.payments.some((x) => x.studentId === DEMO)).toBe(false);
    expect(after.lessons.some((l) => l.studentId === DEMO)).toBe(false);
    expect(after.attendances.some((a) => a.studentId === DEMO)).toBe(false);
    expect(after.lessons.some((l) => l.id === "les_group_other")).toBe(true);
    expect(after.students.some((s) => s.id === OTHER)).toBe(true);

    const audit = auditCalls.find((a) => a.action === "student.purge_wipe" && a.outcome === "success");
    expect(audit?.meta).toMatchObject({ mode: "wipe", outcome: "delete", financial: { collectedTotal: 3000, debtTotal: 3000 } });
    expect(JSON.stringify(audit?.meta)).not.toContain("Demo Silinecek");
    expect(JSON.stringify(audit?.meta)).not.toContain("Test amaçlı");
  });

  const person = { id: "s1", name: "A B", displayId: "Ö-1", active: false, deletedAt: "2026-10-01T00:00:00.000Z" };
  const base: StudentPurgeSnapshot = {
    kind: "student",
    person,
    lessons: [{ id: "l1", studentId: "s1", teacherId: "t1", startAt: "2026-09-10T10:00:00.000Z", status: "completed" }],
    attendances: [{ id: "a1", lessonId: "l1" }],
    series: [],
    makeups: [],
    payments: [{ id: "p1", amount: 5000, paidAmount: 5000, status: "paid", contractId: "c1" }],
    contracts: [{ id: "c1", status: "signed", signedAt: "2026-09-01T00:00:00.000Z", documentInstanceId: "d1" }],
    checkouts: [],
    followUps: [],
    payouts: [],
    documents: [{ id: "d1" }],
    clubMemberships: [],
    paymentTasks: [{ id: "task_pay", paymentId: "p1" }],
    owned: { kvkkConsents: ["k1"] },
    detach: {},
    accounts: [{ userId: "u_shared", role: "PARENT", email: "veli@example.com", otherLinks: 1, portalAccessIds: ["pa1"] }],
    teacherNames: { t1: "Ayşe Hoca" },
    nowIso: "2026-10-15T00:00:00.000Z",
  };

  it("planlayıcı: imzalı sözleşme + tahsilat + KVKK silinir; ortak veli hesabı kapatılmaz; ödeme görevi yalnız bağdan çıkar", () => {
    const plan = planStudentPurge(base, "wipe");
    expect(plan.eligible).toBe(true);
    expect(plan.outcome).toBe("delete");
    const removed = Object.fromEntries(plan.remove.map((b) => [b.key, b.ids]));
    expect(removed).toMatchObject({ payments: ["p1"], contracts: ["c1"], documents: ["d1"], lessons: ["l1"], kvkkConsents: ["k1"] });
    expect(plan.detach.find((b) => b.key === "paymentTasks")?.ids).toEqual(["task_pay"]);
    expect(plan.accounts[0]!.action).toBe("unlink");
    expect(plan.financial).toMatchObject({ signedContractCount: 1, collectedTotal: 5000 });
    expect(planStudentPurge(base).outcome).toBe("anonymize");
  });

  it("planlayıcı: hakediş engel değil — bekleyende satır çıkar + yeniden hesap, ödenmişte tutar korunur; yalnız online tahsilat somut istisna", () => {
    const line = (lessonId: string, studentId: string, amount: number) => ({ lessonId, lessonDate: "2026-09-10", studentId, studentName: "X", instrument: "piyano", durationMinutes: 40, amount }) as never;
    const period = { periodStart: "2026-09-01T00:00:00.000Z", periodEnd: "2026-09-30T00:00:00.000Z" };
    const plan = planStudentPurge(
      {
        ...base,
        payouts: [
          { id: "po_pend", teacherId: "t1", ...period, status: "pending", totalAmount: 1000, version: 2, lineSnapshot: [line("l1", "s1", 400), line("lx", "s2", 600)] },
          { id: "po_paid", teacherId: "t1", ...period, status: "paid", totalAmount: 800, version: 0, lineSnapshot: [line("l1", "s1", 300), line("ly", "s2", 500)] },
          { id: "po_old", teacherId: "t1", ...period, status: "paid", totalAmount: 700 },
        ],
      },
      "wipe"
    );
    expect(plan.eligible).toBe(true);
    const by = Object.fromEntries(plan.payoutChanges.map((c) => [c.payoutId, c]));
    expect(by.po_pend).toMatchObject({ action: "recalc", lessonIds: ["l1"], before: 1000, after: 600, version: 2 });
    expect(by.po_paid).toMatchObject({ action: "scrub", before: 800, after: 800 });
    expect(by.po_old).toMatchObject({ action: "legacy", after: 700 });
    const payoutGroup = plan.groups.find((g) => g.key === "payout")!;
    expect(payoutGroup.items.map((i) => i.action)).toEqual(expect.arrayContaining(["recalc", "exception"]));
    expect(plan.effects.join(" ")).toContain("Ayşe Hoca — 01.09.2026–30.09.2026");

    const online = planStudentPurge({ ...base, checkouts: [{ id: "ch1", paymentId: "p1", status: "succeeded" }] }, "wipe");
    expect(online.eligible).toBe(false);
    expect(online.blockers[0]!.reason).toContain("Somut istisna");
    expect(online.groups.find((g) => g.key === "finance")!.items.some((i) => i.action === "exception")).toBe(true);
  });

  it("öğretmen: yalnız kendi finans satırları silinir (ödenmiş hakediş dahil); öğrenci geçmişi varsa engel", () => {
    const t: TeacherPurgeSnapshot = {
      kind: "teacher",
      person: { ...person, id: "t9", name: "Hoca" },
      lessons: [],
      series: [],
      makeups: [],
      payouts: [{ id: "po9", teacherId: "t9", periodStart: "2026-09-01T00:00:00.000Z", periodEnd: "2026-09-30T00:00:00.000Z", status: "paid", totalAmount: 800 }],
      feeRules: ["fr1"],
      payoutExclusions: [],
      students: [],
      owned: {},
      history: {},
      detach: {},
      accounts: [],
      nowIso: "2026-10-15T00:00:00.000Z",
    };
    expect(planTeacherPurge(t).outcome).toBe("anonymize");
    const wipe = planTeacherPurge(t, "wipe");
    expect(wipe.eligible).toBe(true);
    expect(wipe.outcome).toBe("delete");
    expect(wipe.remove.find((b) => b.key === "payouts")?.ids).toEqual(["po9"]);
    expect(wipe.financial).toMatchObject({ payoutCount: 1, payoutTotal: 800, paidPayoutCount: 1 });

    // Ders tek başına engel değil (sil); grup dersi silinemez → devir; öğrenci bağı hedef öğretmen ister.
    const lesson = { id: "l9", studentId: "s2", teacherId: "t9", startAt: "2026-09-02T10:00:00.000Z", status: "completed" };
    expect(planTeacherPurge({ ...t, lessons: [lesson] }, "wipe").eligible).toBe(true);
    const group = planTeacherPurge({ ...t, lessons: [{ ...lesson, clubSessionId: "cs" }] }, "wipe");
    expect(group.eligible).toBe(false);
    expect(group.blockers[0]!.fix).toContain("devret");
    const withStudent = { ...t, students: [{ id: "s2", name: "Öğr", active: true, activeLink: true }], teachers: [{ id: "t2", name: "Yeni Hoca", active: true }] };
    expect(planTeacherPurge(withStudent, "wipe").eligible).toBe(false);
    const ok = planTeacherPurge(withStudent, "wipe", { targetTeacherId: "t2" });
    expect(ok.eligible).toBe(true);
    expect(ok.reassign).toMatchObject({ targetTeacherId: "t2", students: ["s2"] });
    expect(ok.fingerprint).not.toBe(planTeacherPurge(withStudent, "wipe", { targetTeacherId: "t2", lessonAction: "reassign" }).fingerprint);
  });
});

describe("tam silme uçtan uca — sentetik öğrenci ve öğretmen (finans + hakediş + ders + telafi)", () => {
  const owner: ServiceContext = { ...admin, role: "SUPER_ADMIN", userId: "u_owner" };
  const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString();
  const line = (lessonId: string, studentId: string, amount: number) =>
    ({ lessonId, lessonDate: iso(-10).slice(0, 10), studentId, studentName: studentId === DEMO ? "Demo Silinecek" : "Kalan Öğrenci", instrument: "piyano", durationMinutes: 40, amount }) as never;

  it("öğrenci: tahsilat + borç + bekleyen ve ödenmiş hakediş + telafi — önizlenen kapsamla gerçekten silinir", async () => {
    const { lessonTpl } = await seedDemo({ collected: true });
    const data = await readData();
    const tid = lessonTpl.teacherId;
    const makeup = { id: "mk_demo", studentId: DEMO, teacherId: tid, attendanceId: "att_demo_past", sourceLessonId: "les_demo_past", status: "pending" } as MakeupRequest;
    const payoutTpl = (data.teacherPayouts[0] ?? {}) as TeacherPayout;
    const pending = { ...payoutTpl, id: "po_pend", teacherId: tid, periodStart: iso(-11), periodEnd: iso(-9), status: "pending", totalAmount: 1000, totalMinutes: 80, version: 1, payments: [], lineSnapshot: [line("les_demo_past", DEMO, 400), line("les_other_x", OTHER, 600)] } as TeacherPayout;
    const paid = { ...payoutTpl, id: "po_paid", teacherId: tid, periodStart: iso(-4), periodEnd: iso(-2), status: "paid", totalAmount: 800, totalMinutes: 80, version: 0, lineSnapshot: [line("les_group_demo", DEMO, 300), line("les_other_y", OTHER, 500)] } as TeacherPayout;
    await writeData({ ...data, makeupRequests: [...data.makeupRequests, makeup], teacherPayouts: [...data.teacherPayouts.filter((p) => p.teacherId !== tid), pending, paid] });

    const r0 = await getPersonPurgePreviewTool(owner, { kind: "student", id: DEMO, mode: "wipe" });
    if (!r0.ok) throw new Error(r0.error.message);
    const p = r0.data;
    expect(p.eligible, JSON.stringify(p.blockers)).toBe(true);
    expect(p.remove.find((b) => b.key === "makeups")?.ids).toEqual(["mk_demo"]);
    expect(p.payoutChanges.map((c) => [c.payoutId, c.action, c.before, c.after])).toEqual([
      ["po_paid", "scrub", 800, 800],
      ["po_pend", "recalc", 1000, 600],
    ]);
    expect(p.groups.map((g) => g.key)).toEqual(expect.arrayContaining(["schedule", "attendance", "finance", "payout"]));

    const r = await purgePersonTool(owner, purgeInput(p.fingerprint, { mode: "wipe", financialAcknowledged: true, scopeAll: true }));
    expect(r.ok, r.ok ? "" : r.error.message).toBe(true);
    if (r.ok) expect(r.data.warnings.join(" ")).toContain("tutarı (");
    const after = await readData();
    expect(after.students.some((s) => s.id === DEMO)).toBe(false);
    expect(after.makeupRequests.some((m) => m.id === "mk_demo")).toBe(false);
    expect(after.payments.some((x) => x.studentId === DEMO)).toBe(false);
    const pend = after.teacherPayouts.find((x) => x.id === "po_pend")!;
    expect(pend.totalAmount).toBe(600);
    expect(pend.lineSnapshot?.map((l) => l.lessonId)).toEqual(["les_other_x"]);
    expect(pend.version).toBe(2);
    const pd = after.teacherPayouts.find((x) => x.id === "po_paid")!;
    expect(pd.totalAmount).toBe(800);
    expect(JSON.stringify(pd.lineSnapshot)).not.toContain("Demo Silinecek");
    expect(pd.lineSnapshot?.find((l) => l.lessonId === "les_other_y")?.studentName).toBe("Kalan Öğrenci");
  });

  const T = "t_wipe_wrong";
  const ST = "s_wipe_t_student";
  async function seedWrongTeacher(group: boolean) {
    const data = await readData();
    const t: Teacher = { ...data.teachers[0]!, id: T, displayId: "T-88", name: "Yanlış Hoca", active: false, deletedAt: new Date().toISOString() };
    const st: Student = { ...data.students[0]!, id: ST, displayId: "Ö-9100", name: "Devredilen Öğrenci", teacherId: T, enrollments: undefined };
    const tpl = data.lessons.find((l) => l.status !== "cancelled")!;
    const les = lessonAt(tpl, "les_wt", ST, -5, { teacherId: T, ...(group ? { type: "group", clubSessionId: "cs_wt" } : {}) });
    const att = { id: "att_wt", lessonId: les.id, studentId: ST, status: "absent", markedAt: les.startAt, createsMakeupCredit: true } as Attendance;
    const mk = { id: "mk_wt", studentId: ST, teacherId: T, attendanceId: att.id, sourceLessonId: les.id, status: "pending" } as MakeupRequest;
    const pay = { ...data.payments[0]!, id: "pay_wt", studentId: ST, lessonId: les.id, contractId: undefined, amount: 500, paidAmount: 500, status: "paid" } as Payment;
    const po = { ...((data.teacherPayouts[0] ?? {}) as TeacherPayout), id: "po_wt", teacherId: T, status: "paid", totalAmount: 900 } as TeacherPayout;
    // Başka öğretmenin dersinden doğan telafi; planlanan telafi dersi yanlış öğretmende.
    const mkLesson = lessonAt(tpl, "les_wt_mk", tpl.studentId, 3, { teacherId: T, type: "makeup" });
    const foreignMk = { id: "mk_foreign", studentId: tpl.studentId, teacherId: tpl.teacherId, attendanceId: "att_foreign", sourceLessonId: tpl.id, confirmedLessonId: mkLesson.id, status: "confirmed", changeLog: [] } as unknown as MakeupRequest;
    await writeData({
      ...data,
      teachers: [...data.teachers, t],
      students: [...data.students, st],
      lessons: [...data.lessons, les, mkLesson],
      attendances: [...data.attendances, att],
      makeupRequests: [...data.makeupRequests, mk, foreignMk],
      payments: [...data.payments, pay],
      teacherPayouts: [...data.teacherPayouts, po],
    });
    await fs.writeFile(path.join(DIR, "clubs.json"), JSON.stringify([{ id: "club_wt", tenantId: DEFAULT_TENANT_ID, name: "Koro", teacherIds: [T] }]));
    return { target: data.teachers[0]!.id };
  }
  const tInput = (fp: string, over: Record<string, unknown>) => ({
    kind: "teacher", id: T, mode: "wipe", expectedFingerprint: fp, confirmationName: "Yanlış Hoca", financialAcknowledged: true, scopeAll: true, ...CRIT, ...over,
  });

  it("öğretmen — dersleri sil: ders/yoklama/telafi/hakediş silinir, derse bağlı tahsilat öğrencide kalır, öğrenci hedefe devredilir", async () => {
    const { target } = await seedWrongTeacher(false);
    const blocked = await getPersonPurgePreviewTool(owner, { kind: "teacher", id: T, mode: "wipe" });
    if (!blocked.ok) throw new Error(blocked.error.message);
    expect(blocked.data.eligible).toBe(false);
    expect(blocked.data.targetCandidates?.some((c) => c.id === target)).toBe(true);
    const opts = { lessonAction: "delete", targetTeacherId: target };
    const r0 = await getPersonPurgePreviewTool(owner, { kind: "teacher", id: T, mode: "wipe", ...opts });
    if (!r0.ok) throw new Error(r0.error.message);
    expect(r0.data.eligible, JSON.stringify(r0.data.blockers)).toBe(true);
    // Önizlemedeki seçenekle değil başka seçenekle yürütme → parmak izi tutmaz, hiçbir şey silinmez.
    expect((await purgePersonTool(owner, tInput(r0.data.fingerprint, { lessonAction: "reassign", targetTeacherId: target }))).ok).toBe(false);
    const r = await purgePersonTool(owner, tInput(r0.data.fingerprint, opts));
    expect(r.ok, r.ok ? "" : r.error.message).toBe(true);
    const after = await readData();
    expect(after.teachers.some((x) => x.id === T)).toBe(false);
    expect(after.lessons.some((l) => l.id === "les_wt")).toBe(false);
    expect(after.attendances.some((a) => a.id === "att_wt")).toBe(false);
    expect(after.makeupRequests.some((m) => m.id === "mk_wt")).toBe(false);
    expect(after.teacherPayouts.some((p) => p.id === "po_wt")).toBe(false);
    const pay = after.payments.find((p) => p.id === "pay_wt")!;
    expect(pay.paidAmount).toBe(500);
    expect(pay.lessonId).toBeUndefined();
    expect(after.students.find((s) => s.id === ST)?.teacherId).toBe(target);
    // Kaynağı başka derste olan telafi SİLİNMEZ: planı kalkar, talep yeniden açık, kaynak ders yerinde.
    expect(r0.data.detach.find((b) => b.key === "makeupPlans")?.ids).toEqual(["mk_foreign"]);
    const fm = after.makeupRequests.find((m) => m.id === "mk_foreign")!;
    expect(fm).toMatchObject({ status: "pending" });
    expect(fm.confirmedLessonId).toBeUndefined();
    expect(fm.changeLog?.at(-1)).toMatchObject({ action: "plan_deleted", from: "les_wt_mk" });
    expect(after.lessons.some((l) => l.id === "les_wt_mk")).toBe(false);
  });

  it("öğretmen — grup dersi silinemez, devredilir: ders/telafi/öğrenci hedef öğretmene geçer, grup listesinde yerine yazılır", async () => {
    const { target } = await seedWrongTeacher(true);
    const del = await getPersonPurgePreviewTool(owner, { kind: "teacher", id: T, mode: "wipe", lessonAction: "delete", targetTeacherId: target });
    if (!del.ok) throw new Error(del.error.message);
    expect(del.data.eligible).toBe(false);
    const opts = { lessonAction: "reassign", targetTeacherId: target };
    const r0 = await getPersonPurgePreviewTool(owner, { kind: "teacher", id: T, mode: "wipe", ...opts });
    if (!r0.ok) throw new Error(r0.error.message);
    expect(r0.data.eligible, JSON.stringify(r0.data.blockers)).toBe(true);
    const r = await purgePersonTool(owner, tInput(r0.data.fingerprint, opts));
    expect(r.ok, r.ok ? "" : r.error.message).toBe(true);
    const after = await readData();
    expect(after.teachers.some((x) => x.id === T)).toBe(false);
    expect(after.lessons.find((l) => l.id === "les_wt")?.teacherId).toBe(target);
    expect(after.makeupRequests.find((m) => m.id === "mk_wt")?.teacherId).toBe(target);
    expect(after.attendances.some((a) => a.id === "att_wt")).toBe(true);
    expect(after.students.find((s) => s.id === ST)?.teacherId).toBe(target);
    const clubs = JSON.parse(await fs.readFile(path.join(DIR, "clubs.json"), "utf8")) as { teacherIds: string[] }[];
    expect(clubs[0]!.teacherIds).toEqual([target]);
  });
});

describe("2026-10-17 — Silinen öğrenciler: toplu kalıcı silme", () => {
  it("şifre bir kez doğrulanır (10+ öğrenci hız sınırına takılmaz); aktif öğrenci engellenir, diğerleri silinir", async () => {
    const data = await readData();
    const tpl = data.students[0]!;
    const active = data.students.find((s) => !s.deletedAt)!;
    const gone: Student[] = Array.from({ length: 12 }, (_, i) => ({
      ...tpl,
      id: `s_bulk_${i}`,
      displayId: `Ö-95${String(i).padStart(2, "0")}`,
      name: `Toplu Silinecek ${i}`,
      enrollments: undefined,
      active: false,
      deletedAt: new Date().toISOString(),
      deletionReason: "demo kaydı",
    }));
    await writeData({ ...data, students: [...data.students, ...gone] });
    const ids = [...gone.map((s) => s.id), active.id];

    const p = await getBulkStudentPurgePreviewTool(admin, { studentIds: ids });
    expect(p.ok, p.ok ? "" : p.error.message).toBe(true);
    if (!p.ok) return;
    expect(p.data.students.filter((s) => s.eligible)).toHaveLength(12);
    expect(p.data.students.find((s) => s.id === active.id)?.eligible).toBe(false);

    const base = { studentIds: ids, fingerprints: p.data.fingerprints, ...CRIT };
    expect((await bulkPurgeStudentsTool(admin, { ...base, confirmationCount: "12" })).ok).toBe(false);
    expect((await bulkPurgeStudentsTool({ ...admin, role: "TEACHER" }, { ...base, confirmationCount: "13" })).ok).toBe(false);

    const r = await bulkPurgeStudentsTool(admin, { ...base, confirmationCount: "13" });
    expect(r.ok, r.ok ? "" : r.error.message).toBe(true);
    if (!r.ok) return;
    expect(r.data.results.filter((x) => x.status === "success")).toHaveLength(12);
    expect(r.data.results.find((x) => x.id === active.id)?.status).toBe("blocked");
    const after = await readData();
    expect(after.students.some((s) => s.id.startsWith("s_bulk_"))).toBe(false);
    expect(after.students.some((s) => s.id === active.id)).toBe(true);
  });
});

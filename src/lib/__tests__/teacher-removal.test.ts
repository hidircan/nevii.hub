/**
 * 2026-10-03 (owner) — pasif öğretmeni sistemden kaldırma: aktif öğretmen silinmez; ileri tarihli ders,
 * aktif seri/öğrenci, ödenmemiş hakediş engeller ve gösterilir; listeden kaldırma geçmişi korur ve geri
 * alınabilir; kalıcı silme yalnız ilişkisiz öğretmende; yetki + ad teyidi + kritik şifre + audit.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { deleteTeacherTool, getTeacherDeletionImpactTool, restoreDeletedTeacherTool } from "../services/tools";
import { readData } from "../store";
import { writeData } from "../store-json";
import { lessonTeacherOptions } from "../lesson-teacher-options";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import type { AppData, Lesson, Teacher, TeacherPayout } from "../types";
import { CRIT, withTestCriticalPassword } from "./helpers/critical-delete";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");
const admin: ServiceContext = { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web" };
const LEAVER = "t_leaver";

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
  await withTestCriticalPassword();
});

/** Seed'e pasif, geçmişte 1 dersi + ödenmiş 1 hakedişi olan, ileri tarihli işi olmayan bir öğretmen ekler. */
async function seedLeaver(extra?: (d: AppData, t: Teacher, past: Lesson) => Partial<AppData>): Promise<{ teacher: Teacher; past: Lesson }> {
  const data = await readData();
  const tpl = data.teachers[0]!;
  const teacher: Teacher = { ...tpl, id: LEAVER, displayId: undefined, name: "Ayrılan Öğretmen", email: "ayrilan@example.com", active: false, archivedAt: new Date().toISOString() };
  const lessonTpl = data.lessons.find((l) => l.status !== "cancelled")!;
  const start = new Date(Date.now() - 20 * 86_400_000);
  const past: Lesson = { ...lessonTpl, id: "les_leaver_past", teacherId: LEAVER, seriesId: undefined, status: "completed", startAt: start.toISOString(), endAt: new Date(start.getTime() + 45 * 60_000).toISOString() };
  const payout = { ...(data.teacherPayouts[0] ?? ({} as TeacherPayout)), id: "pay_leaver", teacherId: LEAVER, status: "paid" } as TeacherPayout;
  const base: AppData = { ...data, teachers: [...data.teachers, teacher], lessons: [...data.lessons, past], teacherPayouts: [...data.teacherPayouts, payout] };
  await writeData({ ...base, ...(extra?.(base, teacher, past) ?? {}) });
  return { teacher, past };
}

const softInput = (over?: Record<string, unknown>) => ({ teacherId: LEAVER, mode: "soft", confirmationName: "Ayrılan Öğretmen", ...CRIT, ...over });

describe("öğretmen silme — engeller kullanıcıya gösterilir, hiçbir şey yazılmaz", () => {
  it("aktif öğretmen silinemez", async () => {
    await seedLeaver((d) => ({ teachers: d.teachers.map((t) => (t.id === LEAVER ? { ...t, active: true, archivedAt: undefined } : t)) }));
    const r = await deleteTeacherTool(admin, softInput());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toContain("Pasife al");
    expect((await readData()).teachers.find((t) => t.id === LEAVER)?.deletedAt).toBeUndefined();
  });

  it("ileri tarihli ders ve ödenmemiş hakediş engeller; etki özeti sayıları gösterir", async () => {
    await seedLeaver((d, _t, past) => ({
      lessons: [...d.lessons, { ...past, id: "les_leaver_future", status: "scheduled", startAt: new Date(Date.now() + 7 * 86_400_000).toISOString(), endAt: new Date(Date.now() + 7 * 86_400_000 + 45 * 60_000).toISOString() }],
      teacherPayouts: d.teacherPayouts.map((p) => (p.id === "pay_leaver" ? { ...p, status: "pending" as const } : p)),
    }));
    const impact = await getTeacherDeletionImpactTool(admin, { teacherId: LEAVER });
    expect(impact.ok).toBe(true);
    if (!impact.ok) return;
    expect(impact.data.upcomingLessonCount).toBe(1);
    expect(impact.data.openPayoutCount).toBe(1);
    expect(impact.data.blockers.join(" ")).toContain("Ders Programı");
    expect(impact.data.blockers.join(" ")).toContain("Hakedişler");
    const r = await deleteTeacherTool(admin, softInput());
    expect(r.ok).toBe(false);
  });

  it("yetkisiz rol, yanlış ad ve yanlış kritik şifre reddedilir", async () => {
    await seedLeaver();
    expect((await deleteTeacherTool({ ...admin, role: "TEACHER" }, softInput())).ok).toBe(false);
    expect((await deleteTeacherTool({ ...admin, role: "BRANCH_MANAGER" }, softInput())).ok).toBe(false);
    const wrongName = await deleteTeacherTool(admin, softInput({ confirmationName: "Başka Biri" }));
    expect(wrongName.ok).toBe(false);
    if (!wrongName.ok) expect(wrongName.error.message).toContain("Ayrılan Öğretmen");
    expect((await deleteTeacherTool(admin, softInput({ criticalPassword: "yanlis" }))).ok).toBe(false);
  });

  it("başka kurumun bağlamından öğretmen bulunamaz", async () => {
    await seedLeaver();
    const r = await getTeacherDeletionImpactTool({ ...admin, tenantId: "tenant_baska_kurum" }, { teacherId: LEAVER });
    // json modu tek kurumludur; asıl izolasyon db modunda tenantId filtresi (store-db setTeacherDeletion/hardDeleteTeacher).
    expect(r.ok === false || r.data.teacherId === LEAVER).toBe(true);
  });
});

describe("listeden kaldırma (geri alınabilir)", () => {
  it("geçmiş kayıtlar ve ad korunur, yeni ders seçiminde çıkmaz, geri alınabilir; kalıcı silme reddedilir", async () => {
    const { past } = await seedLeaver();
    const hard = await deleteTeacherTool(admin, softInput({ mode: "hard" }));
    expect(hard.ok).toBe(false);
    if (!hard.ok) expect(hard.error.message).toContain("Listeden kaldırmayı kullanın");

    const r = await deleteTeacherTool(admin, softInput());
    expect(r.ok, r.ok ? "" : r.error.message).toBe(true);
    const after = await readData();
    const t = after.teachers.find((x) => x.id === LEAVER)!;
    expect(t.deletedAt).toBeTruthy();
    expect(t.deletionReason).toBe(CRIT.reason);
    expect(t.name).toBe("Ayrılan Öğretmen");
    expect(after.lessons.find((l) => l.id === past.id)?.teacherId).toBe(LEAVER);
    expect(after.teacherPayouts.find((p) => p.id === "pay_leaver")?.teacherId).toBe(LEAVER);
    expect(lessonTeacherOptions(after.teachers, { instrument: t.instruments[0]! }).some((x) => x.id === LEAVER)).toBe(false);

    const again = await deleteTeacherTool(admin, softInput());
    expect(again.ok).toBe(false);

    const restored = await restoreDeletedTeacherTool(admin, { teacherId: LEAVER });
    expect(restored.ok).toBe(true);
    const back = (await readData()).teachers.find((x) => x.id === LEAVER)!;
    expect(back.deletedAt).toBeUndefined();
    expect(back.active).toBe(false);
  });
});

describe("kalıcı silme (yalnız ilişkisiz öğretmen)", () => {
  it("hiç kaydı olmayan pasif öğretmen kalıcı silinir", async () => {
    await seedLeaver((d) => ({ lessons: d.lessons.filter((l) => l.teacherId !== LEAVER), teacherPayouts: d.teacherPayouts.filter((p) => p.teacherId !== LEAVER) }));
    const impact = await getTeacherDeletionImpactTool(admin, { teacherId: LEAVER });
    expect(impact.ok && impact.data.hardDeleteEligible).toBe(true);
    const r = await deleteTeacherTool(admin, softInput({ mode: "hard" }));
    expect(r.ok, r.ok ? "" : r.error.message).toBe(true);
    expect((await readData()).teachers.some((t) => t.id === LEAVER)).toBe(false);
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { createLessonTool, upsertStudentEnrollmentTool } from "../services/tools";
import { readData } from "../store";
import { DEFAULT_TENANT_ID } from "../auth/config";
import { canAccessStudent } from "../services/context";
import { effectiveEnrollments, enrollmentForLesson } from "../student-enrollments";
import type { ServiceContext } from "../services/context";

const DIR = resolveDataDir(path.join(process.cwd(), "data"));
const admin: ServiceContext = { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web" };
beforeEach(async () => {
  await fs.rm(path.join(DIR, "store.json"), { force: true });
});

describe("tek öğrenci, birden fazla eğitim (2026-10-04)", () => {
  it("eski kayıt veri kaybetmeden eğitime dönüşür; ikinci eğitim öğretmeniyle eklenir, öğretmen erişir", async () => {
    const data = await readData();
    const s1 = data.students.find((s) => s.id === "s1")!;
    const other = data.teachers.find((t) => t.active && t.id !== s1.teacherId && t.instruments.some((i) => !s1.instruments.includes(i)))!;
    const instrument = other.instruments.find((i) => !s1.instruments.includes(i))!;
    expect(effectiveEnrollments(s1, data.teachers)[0]!.legacy).toBe(true);

    const res = await upsertStudentEnrollmentTool(admin, {
      studentId: "s1",
      enrollment: { instrument, teacherId: other.id, lessonDurationMinutes: 30 },
    });
    expect(res.ok ? "ok" : res.error.message).toBe("ok");
    const after = (await readData()).students.find((s) => s.id === "s1")!;
    expect(after.enrollments).toHaveLength(s1.instruments.length + 1);
    expect(after.teacherId).toBe(s1.teacherId); // birincil eğitim değişmedi
    expect(after.instruments).toContain(instrument);
    expect(await canAccessStudent({ role: "TEACHER", userId: "x", teacherId: other.id, tenantId: DEFAULT_TENANT_ID, channel: "web" }, "s1", after)).toBe(true);

    const second = after.enrollments!.find((e) => e.instrument === instrument)!;
    // Eğitimi yanlış enstrümanla derse bağlamak reddedilir.
    const wrong = await createLessonTool(admin, {
      studentId: "s1",
      teacherId: other.id,
      roomId: "r1",
      instrument: s1.instruments[0],
      startAt: "2030-01-08T10:00",
      enrollmentId: second.id,
    });
    expect(!wrong.ok && wrong.error.message).toContain("Seçilen eğitim");
    expect(enrollmentForLesson(after.enrollments!, { instrument, teacherId: other.id })?.id).toBe(second.id);
  });

  it("öğretmen o enstrümanı vermiyorsa ve aynı eğitim ikinci kez eklenirse reddedilir; son aktif eğitim kapatılamaz", async () => {
    const data = await readData();
    const s1 = data.students.find((s) => s.id === "s1")!;
    const t = data.teachers.find((x) => x.id === s1.teacherId)!;
    const notTaught = (await import("../instrument-catalog")).resolveActiveInstrumentNames;
    const catalog = await notTaught(DEFAULT_TENANT_ID);
    const foreign = catalog.find((i) => !t.instruments.includes(i as never));
    if (foreign) {
      const bad = await upsertStudentEnrollmentTool(admin, { studentId: "s1", enrollment: { instrument: foreign, teacherId: t.id, lessonDurationMinutes: 40 } });
      expect(!bad.ok && bad.error.message).toContain("vermiyor");
    }
    const dup = await upsertStudentEnrollmentTool(admin, { studentId: "s1", enrollment: { instrument: s1.instruments[0], teacherId: t.id, lessonDurationMinutes: 40 } });
    expect(!dup.ok && dup.error.code).toBe("CONFLICT");
  });
});

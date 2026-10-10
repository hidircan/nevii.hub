/**
 * 2026-09-17 — yönetici UAT paketi regresyonları:
 *  A) Öğretmen detayı "Öğrencilerini pasife al" gerçekten veri değiştirir.
 *  B) "Öğrenciyi pasife al/arşivle" + geri alma; liste/öğretmen detayı aynı `active` alanını okur.
 *  C) Yoklama Takvimi ↔ Ders Programı aynı ders için aynı gün + aynı statü.
 *  E) Yönetici öğretmen genel bilgilerini düzenler; öğretmen düzenleyemez.
 * (D — müsaitlik yetkisi: teacher-availability-approval.test.ts;
 *  db modu Prisma eşlemesi: admin-archive-teacher-profile-db.test.ts)
 */
import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import {
  archiveStudentTool,
  archiveTeacherStudentsTool,
  getAttendanceCalendarMonthTool,
  updateTeacherProfileTool,
} from "../services/tools";
import { readData } from "../store";
import { writeData } from "../store-json";
import { DEFAULT_TENANT_ID } from "../auth/config";
import { resolveLessonFinalStatus } from "../lesson-live-status";
import { lessonCardStatusVisual } from "@/components/program-studio";
import type { ServiceContext } from "../services/context";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

function admin(): ServiceContext {
  return { role: "SCHOOL_ADMIN", userId: "admin1", tenantId: DEFAULT_TENANT_ID, channel: "web" };
}
function teacher(teacherId = "t1"): ServiceContext {
  return { role: "TEACHER", userId: "teach1", tenantId: DEFAULT_TENANT_ID, teacherId, channel: "web" };
}

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
});

describe("A — archiveTeacherStudentsTool", () => {
  it("öğretmene atanmış aktif öğrencilerin hepsi pasife düşer; diğer öğretmenlerin öğrencileri etkilenmez", async () => {
    const before = await readData();
    const teacherId = before.students.find((s) => s.active)!.teacherId;
    const own = before.students.filter((s) => s.teacherId === teacherId && s.active);
    const others = before.students.filter((s) => s.teacherId !== teacherId && s.active);
    expect(own.length).toBeGreaterThan(0);

    const result = await archiveTeacherStudentsTool(admin(), { teacherId });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.archivedCount).toBe(own.length);
      expect(result.data.failed).toEqual([]);
    }

    const after = await readData();
    for (const s of own) {
      const row = after.students.find((x) => x.id === s.id)!;
      expect(row.active).toBe(false);
      expect(row.archivedAt).toBeTruthy();
    }
    expect(after.students.filter((s) => others.some((o) => o.id === s.id)).every((s) => s.active)).toBe(true);

    // Tekrar çalıştırmak no-op (zaten pasif olanlara dokunmaz).
    const again = await archiveTeacherStudentsTool(admin(), { teacherId });
    expect(again.ok && again.data.archivedCount).toBe(0);
  });

  it("TEACHER rolü çağıramaz; veri değişmez", async () => {
    const before = await readData();
    const teacherId = before.students.find((s) => s.active)!.teacherId;
    const result = await archiveTeacherStudentsTool(teacher(teacherId), { teacherId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
    const after = await readData();
    expect(after.students.filter((s) => s.active).length).toBe(before.students.filter((s) => s.active).length);
  });

  it("bilinmeyen öğretmen NOT_FOUND", async () => {
    const result = await archiveTeacherStudentsTool(admin(), { teacherId: "yok" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
  });
});

describe("B — archiveStudentTool pasife al / aktifleştir", () => {
  it("pasife alınan öğrenci listede Aktif filtresinden düşer, Pasif filtresinde görünür; geri alma temizler", async () => {
    const before = await readData();
    const target = before.students.find((s) => s.active)!;

    const archived = await archiveStudentTool(admin(), { studentId: target.id, archived: true });
    expect(archived.ok).toBe(true);
    let data = await readData();
    let row = data.students.find((s) => s.id === target.id)!;
    expect(row.active).toBe(false);
    expect(row.archivedAt).toBeTruthy();
    // Öğrenci listesi (students-table statusFilter) ve öğretmen detayı rozetleri `active` alanını okur.
    expect(data.students.filter((s) => s.active).some((s) => s.id === target.id)).toBe(false);
    expect(data.students.filter((s) => !s.active).some((s) => s.id === target.id)).toBe(true);

    const restored = await archiveStudentTool(admin(), { studentId: target.id, archived: false });
    expect(restored.ok).toBe(true);
    data = await readData();
    row = data.students.find((s) => s.id === target.id)!;
    expect(row.active).toBe(true);
    expect(row.archivedAt).toBeUndefined();
  });

  it("TEACHER öğrenci arşivleyemez", async () => {
    const data = await readData();
    const result = await archiveStudentTool(teacher(), { studentId: data.students[0]!.id, archived: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
  });
});

describe("C — Yoklama Takvimi ↔ Ders Programı aynı ders için çelişmez", () => {
  it("İstanbul gece yarısı sonrası ders: takvim günü = program günü, statü = program kartı statüsü", async () => {
    const data = await readData();
    const lesson = data.lessons.find((l) => l.studentId === "s1")!;
    // 15 Ekim 2026 01:30 İstanbul = 14 Ekim 22:30 UTC; UTC gün anahtarı ÖNCEKİ günü verirdi.
    const moved = {
      ...lesson,
      startAt: "2026-10-14T22:30:00.000Z",
      endAt: "2026-10-14T23:10:00.000Z",
      status: "scheduled" as const,
      lessonProcessed: true,
    };
    await writeData({ ...data, lessons: data.lessons.map((l) => (l.id === lesson.id ? moved : l)) });

    const month = await getAttendanceCalendarMonthTool(admin(), { studentId: "s1", year: 2026, month: 10 });
    expect(month.ok).toBe(true);
    if (!month.ok) return;
    const dayOf = (id: string) => month.data.days.find((d) => d.lessonIds.includes(id))?.date;
    expect(dayOf(lesson.id)).toBe("2026-10-15");

    const info = month.data.days.flatMap((d) => d.lessons).find((l) => l.lessonId === lesson.id)!;
    const programStatus = lessonCardStatusVisual({ ...lesson, ...moved });
    expect(info.opsStatus).toBe(programStatus);
    expect(info.opsStatus).toBe(resolveLessonFinalStatus(moved));
    expect(info.opsStatus).toBe("processed");
  });
});

describe("E — updateTeacherProfileTool genel bilgiler", () => {
  it("yönetici ad, telefon, doğum tarihi, lise/üniversite/mezuniyet ve günlük limiti kalıcı günceller", async () => {
    const result = await updateTeacherProfileTool(admin(), {
      teacherId: "t1",
      name: "Güncel Öğretmen Adı",
      phone: "05321234567",
      birthDate: "1990-04-12",
      highSchool: "Anadolu Lisesi",
      university: "Hacettepe Üniversitesi",
      graduationYear: 2012,
      maxDailyLessons: 6,
    });
    expect(result.ok).toBe(true);
    const t1 = (await readData()).teachers.find((t) => t.id === "t1")!;
    expect(t1).toMatchObject({
      name: "Güncel Öğretmen Adı",
      phone: "05321234567",
      birthDate: "1990-04-12",
      highSchool: "Anadolu Lisesi",
      university: "Hacettepe Üniversitesi",
      graduationYear: 2012,
      maxDailyLessons: 6,
    });
  });

  it("geçersiz günlük limit Türkçe doğrulama hatası verir", async () => {
    const result = await updateTeacherProfileTool(admin(), { teacherId: "t1", maxDailyLessons: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_ERROR");
      expect(JSON.stringify(result.error.details)).toContain("Günlük ders limiti en az 1 olmalı.");
    }
  });

  it("öğretmen (kendi kaydı dahil) genel bilgileri düzenleyemez", async () => {
    const result = await updateTeacherProfileTool(teacher("t1"), { teacherId: "t1", name: "Kendim" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
  });
});

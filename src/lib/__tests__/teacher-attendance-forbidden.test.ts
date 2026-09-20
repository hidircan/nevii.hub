/**
 * 2026-09-17 owner kararı — öğretmen yoklama ALAMAZ (öğrenci geldi/gelmedi,
 * İşlendi/Telafi işaretleri). UI'dan kaldırıldı; doğrudan API/mobil isteği de
 * tool katmanında Türkçe nedenle reddedilir. Yönetici aynı işlemleri yapar.
 * Müsaitlik yetkisi: teacher-availability-approval.test.ts.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { createLessonTool, markAttendanceTool, setLessonOpsFlagTool } from "../services/tools";
import { readData } from "../store";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import { findOpenLessonSlot } from "./helpers/lesson-slot";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");
const admin: ServiceContext = { role: "SCHOOL_ADMIN", userId: "admin1", tenantId: DEFAULT_TENANT_ID, channel: "web" };

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
});

/**
 * 2026-09-21 — TARİHE BAĞIMLILIK KALDIRILDI.
 *
 * Bu yardımcı eskiden demo seed'inde "geçmiş + planlı + normal" bir ders
 * ARIYORDU. Seed dersleri `new Date()`e göre üretildiği için böyle bir ders
 * bazı takvim günlerinde hiç oluşmuyordu ve test o gün "seed: geçmiş planlı
 * ders yok" ile kırılıyordu — koda bağlı olmayan, günün tarihine bağlı bir
 * kırmızı. Artık dersi ARAMIYORUZ, ürünün KENDİ akışıyla OLUŞTURUYORUZ.
 *
 * Gün seçimi de ürünün kendi çalışma günü kuralından geçer
 * (`findOpenLessonSlot` → `validateLessonSlot` → src/lib/work-days.ts):
 * referans tarih 30 gün geriye alınır ve oradan ileriye doğru AÇIK ilk slot
 * bulunur. Böylece üretilen ders her zaman (a) geçmişte, (b) kurumun açık
 * olduğu bir günde olur — yönetici yoklama adımı (üçüncü test) kapalı gün
 * guard'ına takılmaz.
 */
async function ownPastLesson() {
  const data = await readData();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);
  const startAt = await findOpenLessonSlot(data, "s1", "t1", "r1", {
    referenceDate: thirtyDaysAgo,
    maxOffsetDays: 14, // en geç bugünden 16 gün önce → her zaman geçmişte
  });
  expect(new Date(startAt).getTime()).toBeLessThan(Date.now());

  const created = await createLessonTool(admin, {
    studentId: "s1",
    teacherId: "t1",
    roomId: "r1",
    instrument: "Piyano",
    startAt,
  });
  if (!created.ok) throw new Error(`fixture dersi oluşturulamadı: ${created.error.message}`);

  const lesson = (await readData()).lessons.find((l) => l.id === created.data.lessonId)!;
  const teacher: ServiceContext = { role: "TEACHER", userId: "teach1", tenantId: DEFAULT_TENANT_ID, teacherId: lesson.teacherId, channel: "web" };
  return { lesson, teacher };
}

describe("öğretmen yoklama alamaz", () => {
  it("markAttendanceTool: kendi dersi olsa bile FORBIDDEN + Türkçe neden; kayıt oluşmaz", async () => {
    const { lesson, teacher } = await ownPastLesson();
    const before = (await readData()).attendances.filter((a) => a.lessonId === lesson.id).length;
    const res = await markAttendanceTool(teacher, { lessonId: lesson.id, status: "present" });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("FORBIDDEN");
      expect(res.error.message).toContain("yalnız kurum yöneticileri");
    }
    expect((await readData()).attendances.filter((a) => a.lessonId === lesson.id).length).toBe(before);
  });

  it("setLessonOpsFlagTool: Geldi/İşlendi/Telafi işaretleri reddedilir; ders değişmez", async () => {
    const { lesson, teacher } = await ownPastLesson();
    for (const flag of ["attended", "processed", "makeup"] as const) {
      const res = await setLessonOpsFlagTool(teacher, { lessonId: lesson.id, flag, reason: "test" });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.code).toBe("FORBIDDEN");
    }
    const after = (await readData()).lessons.find((l) => l.id === lesson.id)!;
    expect(after.studentAttended ?? false).toBe(false);
    expect(after.lessonProcessed ?? false).toBe(false);
  });

  it("yönetici aynı derste yoklama alabilir", async () => {
    const { lesson } = await ownPastLesson();
    const res = await setLessonOpsFlagTool(admin, { lessonId: lesson.id, flag: "attended" });
    expect(res.ok).toBe(true);
    expect((await readData()).lessons.find((l) => l.id === lesson.id)!.studentAttended).toBe(true);
  });
});

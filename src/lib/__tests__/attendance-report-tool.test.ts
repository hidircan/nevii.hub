import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { createLessonTool, setLessonOpsFlagTool, getAttendanceReportTool } from "../services/tools";
import { readData } from "../store";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import { findOpenLessonSlot } from "./helpers/lesson-slot";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

function ctx(overrides?: Partial<ServiceContext>): ServiceContext {
  return {
    role: "SCHOOL_ADMIN",
    userId: "u1",
    tenantId: DEFAULT_TENANT_ID,
    channel: "web",
    ...overrides,
  };
}

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
});

async function createTestLesson(): Promise<string> {
  const data = await readData();
  const startAt = await findOpenLessonSlot(data, "s1", "t1", "r1");
  const res = await createLessonTool(ctx(), {
    studentId: "s1",
    teacherId: "t1",
    roomId: "r1",
    instrument: "Piyano",
    startAt,
  });
  if (!res.ok) throw new Error(res.error.message);
  return res.data.lessonId;
}

describe("getAttendanceReportTool — RBAC", () => {
  it("TEACHER göremez (FORBIDDEN)", async () => {
    const res = await getAttendanceReportTool(ctx({ role: "TEACHER", teacherId: "t1" }), {});
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("FORBIDDEN");
  });

  it("STUDENT göremez (FORBIDDEN)", async () => {
    const res = await getAttendanceReportTool(ctx({ role: "STUDENT", teacherId: undefined }), {});
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("FORBIDDEN");
  });

  it("SCHOOL_ADMIN/SUPER_ADMIN erişebilir", async () => {
    const res = await getAttendanceReportTool(ctx(), {});
    expect(res.ok).toBe(true);
  });
});

describe("getAttendanceReportTool — içerik", () => {
  it("işlenmiş ders gerekçesi ve öğrenci/öğretmen adları satırda görünür", async () => {
    const lessonId = await createTestLesson();
    const marked = await setLessonOpsFlagTool(ctx(), {
      lessonId,
      flag: "processed",
      reason: "Ders fiilen işlendi",
    });
    expect(marked.ok).toBe(true);

    const data = await readData();
    const lesson = data.lessons.find((l) => l.id === lessonId)!;
    const [y, m] = lesson.startAt.slice(0, 7).split("-").map(Number);

    const res = await getAttendanceReportTool(ctx(), {
      datePreset: "custom",
      from: `${y}-${String(m).padStart(2, "0")}-01`,
      to: `${y}-${String(m).padStart(2, "0")}-28`,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const row = res.data.rows.find((r) => r.lessonId === lessonId);
    expect(row?.status).toBe("processed");
    expect(row?.processedReason).toBe("Ders fiilen işlendi");
    expect(row?.studentName).toBeTruthy();
    expect(row?.teacherName).toBeTruthy();
  });

  // Not: `Lesson` (json/memory AppData) kayıt başına bir `tenantId` alanı
  // TAŞIMAZ — tenant izolasyonu `readData()`'nın ALS/tenant-context
  // çözümlemesinden miras alınır (bu tool, `getAttendanceCalendarMonthTool`
  // dahil TÜM ders-okuyan tool'larla AYNI mekanizma). Doğrudan tool
  // çağrısıyla (gerçek HTTP/middleware olmadan) sahte bir ikinci tenant
  // simüle etmek bu store mimarisinde anlamlı bir izolasyon testi ÜRETMEZ
  // (readData() zaten aynı varsayılan tenant'ı döner) — bkz.
  // `contracts.test.ts`'deki AYNI desenin yalnız kendi `tenantId` alanı
  // TAŞIYAN kayıtlarda (StudentContract) geçerli olduğu not.

  it("geçersiz özel tarih aralığı VALIDATION_ERROR döner", async () => {
    const res = await getAttendanceReportTool(ctx(), { datePreset: "custom", from: "2026-09-15", to: "2026-09-01" });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VALIDATION_ERROR");
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { getAttendanceCalendarMonthTool, getAttendanceCalendarTermTool } from "../services/tools";
import { attendanceCalendarTermMonths } from "../attendance-calendar";
import { readData } from "../store";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";

/**
 * P0 performans (2026-09-07) — Yoklama Takvimi artık dönemin TÜM aylarını
 * TEK istekte alır (`getAttendanceCalendarTermTool`). Bu dosyanın asıl işi
 * toplu yolun tek-ay yolundan AYRIŞMADIĞINI kanıtlamak: aynı gün statüleri,
 * aynı ders/ödeme bilgisi, aynı ücretlendirme — ikinci bir hesap yolu YOK.
 * Ayrıca toplu uç noktanın yetki kapısını GEVŞETMEDİĞİNİ doğrular.
 */

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

function ctx(overrides?: Partial<ServiceContext>): ServiceContext {
  return { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web", ...overrides };
}

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
});

describe("getAttendanceCalendarTermTool", () => {
  it("güz dönemi için Eylül–Haziran (10 ay) döner — istemcinin çizdiği kutu listesiyle aynı", async () => {
    const data = await readData();
    const student = data.students[0]!;
    const result = await getAttendanceCalendarTermTool(ctx(), {
      studentId: student.id,
      term: "guz",
      anchorYear: 2026,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.months).toHaveLength(10);
    expect(result.data.months.map((m) => `${m.year}-${m.month}`)).toEqual(
      attendanceCalendarTermMonths("guz", 2026).map((m) => `${m.year}-${m.month}`)
    );
  });

  it("yaz dönemi için Temmuz/Ağustos/Eylül (3 ay) döner", async () => {
    const data = await readData();
    const student = data.students[0]!;
    const result = await getAttendanceCalendarTermTool(ctx(), {
      studentId: student.id,
      term: "yaz",
      anchorYear: 2026,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.months.map((m) => m.month)).toEqual([7, 8, 9]);
  });

  it("her ay, tek-ay tool'unun ürettiğiyle BİREBİR aynıdır (ikinci bir hesap yolu yok)", async () => {
    const data = await readData();
    // Dersi olan bir öğrenci seç — boş bir öğrenci bu kontrolü anlamsızlaştırır.
    const student = data.students.find((s) => data.lessons.some((l) => l.studentId === s.id)) ?? data.students[0]!;
    const termResult = await getAttendanceCalendarTermTool(ctx(), {
      studentId: student.id,
      term: "guz",
      anchorYear: 2026,
    });
    expect(termResult.ok).toBe(true);
    if (!termResult.ok) return;

    for (const month of termResult.data.months) {
      const single = await getAttendanceCalendarMonthTool(ctx(), {
        studentId: student.id,
        year: month.year,
        month: month.month,
      });
      expect(single.ok).toBe(true);
      if (!single.ok) return;
      expect(month).toEqual(single.data);
    }
  });

  it("var olmayan öğrenci için NOT_FOUND/FORBIDDEN döner — toplu uç nokta kapıyı gevşetmez", async () => {
    const result = await getAttendanceCalendarTermTool(ctx(), {
      studentId: "yok-boyle-bir-ogrenci",
      term: "guz",
      anchorYear: 2026,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(["NOT_FOUND", "FORBIDDEN"]).toContain(result.error.code);
  });

  it("yetkisiz rol FORBIDDEN alır", async () => {
    const data = await readData();
    const student = data.students[0]!;
    const result = await getAttendanceCalendarTermTool(ctx({ role: "PARENT" as ServiceContext["role"] }), {
      studentId: student.id,
      term: "guz",
      anchorYear: 2026,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
  });

  it("geçersiz dönem/yıl VALIDATION_ERROR ile reddedilir", async () => {
    const data = await readData();
    const student = data.students[0]!;
    const bad = await getAttendanceCalendarTermTool(ctx(), {
      studentId: student.id,
      term: "bahar",
      anchorYear: 2026,
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.code).toBe("VALIDATION_ERROR");
  });
});

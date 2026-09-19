/**
 * (2026-09-19: fikstür tarihleri 13 hafta ileri alındı — 9 Mart 2027 düzeltilen tabloda
 * Ramazan Bayramı 1. günüdür ve artık planlanamaz; hafta günleri korunur.)
 * 2026-09-17 — Ders Programı çekirdek regresyonları. Bu dosya BİLİNÇLİ OLARAK
 * sunucu saat dilimini UTC yapar (Vercel ile aynı): kritik "15:50 → 18:50"
 * hatası yalnız UTC sunucuda görünüyordu, geliştirici makinesinde (İstanbul) değil.
 */
process.env.TZ = "UTC";

import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import {
  createLessonSeriesTool,
  createLessonTool,
  deleteLessonsTool,
  getAttendanceCalendarMonthTool,
  reviseLessonsTool,
  setLessonOpsFlagTool,
} from "../services/tools";
import { readData } from "../store";
import { DEFAULT_TENANT_ID } from "../auth/config";
import { computeSeriesOccurrences } from "../lesson-series";
import { DEFAULT_APP_TIMEZONE, toZonedYmd, wallDateTimeInputToIso, zonedHm, zonedWeekday } from "../timezone";
import { formatTime } from "../utils";
import { emptyProgramNotices, onlyNotice } from "../program-notices";
import type { ServiceContext } from "../services/context";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");
const admin: ServiceContext = { role: "SCHOOL_ADMIN", userId: "admin1", tenantId: DEFAULT_TENANT_ID, channel: "web" };
const hm = (iso: string) => zonedHm(new Date(iso), DEFAULT_APP_TIMEZONE);

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
});

/** Hira senaryosu: t1 (Salı 10–19 müsait), Salı 15:50, 4 haftalık seri — seed dersleriyle çakışmayan uzak bir dönem. */
const HIRA_SERIES = {
  studentId: "s1",
  teacherId: "t1",
  roomId: "r1",
  branchId: "erzene",
  instrument: "Piyano",
  weekday: 2,
  startTime: "15:50",
  durationMinutes: 40,
  startsOn: "2027-05-31",
  endsOn: "2027-06-27",
};

async function seriesLessons(seriesId: string) {
  return (await readData()).lessons.filter((l) => l.seriesId === seriesId).sort((a, b) => a.startAt.localeCompare(b.startAt));
}

describe("D — saat kayması (sunucu UTC)", () => {
  it("wall-time yardımcısı: 15:50 İstanbul = 12:50Z; datetime-local değeri kurum saati sayılır", () => {
    expect(wallDateTimeInputToIso("2027-06-01T15:50")).toBe("2027-06-01T12:50:00.000Z");
    expect(wallDateTimeInputToIso("2027-06-01T12:50:00.000Z")).toBe("2027-06-01T12:50:00.000Z");
    expect(formatTime("2027-06-01T12:50:00.000Z")).toBe("15:50");
  });

  it("seri oluşumları 15:50 kalır ve doğru haftanın gününe düşer", () => {
    const occ = computeSeriesOccurrences(HIRA_SERIES);
    expect(occ).toHaveLength(4);
    for (const o of occ) {
      expect(hm(o.startAt)).toBe("15:50");
      expect(zonedWeekday(new Date(o.startAt))).toBe(2);
    }
  });

  it("createLessonSeriesTool: kaydedilen tüm dersler 15:50 (18:50 DEĞİL)", async () => {
    const res = await createLessonSeriesTool(admin, HIRA_SERIES);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const lessons = await seriesLessons(res.data.seriesId);
    expect(lessons).toHaveLength(4);
    expect(lessons.map((l) => hm(l.startAt))).toEqual(["15:50", "15:50", "15:50", "15:50"]);
    expect(lessons.map((l) => hm(l.endAt))).toEqual(["16:30", "16:30", "16:30", "16:30"]);
  });

  it("createLessonTool: formdaki '2027-06-01T15:50' 15:50 olarak kaydedilir", async () => {
    const res = await createLessonTool(admin, { studentId: "s1", teacherId: "t1", roomId: "r1", instrument: "Piyano", startAt: "2027-06-01T15:50", durationMinutes: 40 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const lesson = (await readData()).lessons.find((l) => l.id === res.data.lessonId)!;
    expect(hm(lesson.startAt)).toBe("15:50");
    expect(toZonedYmd(new Date(lesson.startAt), DEFAULT_APP_TIMEZONE)).toBe("2027-06-01");
  });

  it("müsait olmayan saat: uyarı verir, onaylanınca AYNI saate kaydedilir (başka saate kaydırmaz)", async () => {
    // t1 Cumartesi 10–14 müsait → 15:50 müsaitlik dışı.
    const input = { studentId: "s1", teacherId: "t1", roomId: "r1", instrument: "Piyano", startAt: "2027-06-05T15:50", durationMinutes: 40 };
    const warned = await createLessonTool(admin, input);
    expect(warned.ok).toBe(false);
    if (!warned.ok) expect((warned.error.details as { overridable?: boolean }).overridable).toBe(true);

    const forced = await createLessonTool(admin, { ...input, overrideAvailability: true });
    expect(forced.ok).toBe(true);
    if (!forced.ok) return;
    const lesson = (await readData()).lessons.find((l) => l.id === forced.data.lessonId)!;
    expect(hm(lesson.startAt)).toBe("15:50");
  });

  it("müsaitlik penceresi kurum saatine göre: Salı 18:30 (10–19 içinde) müsait sayılır", async () => {
    const res = await createLessonTool(admin, { studentId: "s1", teacherId: "t1", roomId: "r1", instrument: "Piyano", startAt: "2027-06-08T18:10", durationMinutes: 40 });
    expect(res.ok).toBe(true);
  });
});

describe("B — geçmişe ders planlama", () => {
  it("geçmiş tarihli ders oluşturulur ve Yoklama Takvimi'nde o günde görünür", async () => {
    const res = await createLessonTool(admin, { studentId: "s1", teacherId: "t1", roomId: "r1", instrument: "Piyano", startAt: "2026-02-03T15:50", durationMinutes: 40 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const month = await getAttendanceCalendarMonthTool(admin, { studentId: "s1", year: 2026, month: 2 });
    expect(month.ok).toBe(true);
    if (!month.ok) return;
    const day = month.data.days.find((d) => d.lessonIds.includes(res.data.lessonId));
    expect(day?.date).toBe("2026-02-03");
  });

  it("geçmiş başlangıçlı seri de oluşturulur", async () => {
    const res = await createLessonSeriesTool(admin, { ...HIRA_SERIES, startsOn: "2026-02-01", endsOn: "2026-02-28" });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.createdLessonIds.length).toBe(4);
  });
});

describe("C — sayfa bildirimleri tek ve güncel", () => {
  it("yeni bildirim öncekileri düşürür", () => {
    const afterError = onlyNotice<never>({ gridError: "Değişiklik uygulanmadı: çakışma" });
    const afterSuccess = onlyNotice<never>({ actionSuccess: "Ders planlandı." });
    expect(afterError.gridError).toBeTruthy();
    expect(afterSuccess).toEqual({ ...emptyProgramNotices(), actionSuccess: "Ders planlandı." });
    expect(afterSuccess.gridError).toBeNull();
  });
});

describe("E — ders silme (üç kapsam)", () => {
  async function newSeries() {
    const res = await createLessonSeriesTool(admin, HIRA_SERIES);
    if (!res.ok) throw new Error(res.error.message);
    return seriesLessons(res.data.seriesId);
  }

  it("sadece bu ders: yalnız o ders silinir", async () => {
    const [, second] = await newSeries();
    const res = await deleteLessonsTool(admin, { lessonId: second!.id, scope: "single" });
    expect(res.ok).toBe(true);
    const left = await seriesLessons(second!.seriesId!);
    expect(left.map((l) => l.id)).not.toContain(second!.id);
    expect(left).toHaveLength(3);
  });

  it("bu ders ve sonrası: önceki ders kalır", async () => {
    const [first, second] = await newSeries();
    const res = await deleteLessonsTool(admin, { lessonId: second!.id, scope: "fromHereOnward" });
    expect(res.ok && res.data.deletedLessonIds).toHaveLength(3);
    expect((await seriesLessons(first!.seriesId!)).map((l) => l.id)).toEqual([first!.id]);
  });

  it("tüm seri: hepsi silinir, seri kapanır; yoklaması olan ders korunur", async () => {
    const lessons = await newSeries();
    const marked = await setLessonOpsFlagTool(admin, { lessonId: lessons[0]!.id, flag: "attended" });
    expect(marked.ok).toBe(true);
    const res = await deleteLessonsTool(admin, { lessonId: lessons[2]!.id, scope: "entireSeries" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.deletedLessonIds).toHaveLength(3);
    expect(res.data.protectedLessons.map((p) => p.lessonId)).toEqual([lessons[0]!.id]);
    expect((await seriesLessons(lessons[0]!.seriesId!)).map((l) => l.id)).toEqual([lessons[0]!.id]);
  });

  it("seriye ait olmayan derste seri kapsamı anlaşılır Türkçe hata verir", async () => {
    const single = await createLessonTool(admin, { studentId: "s1", teacherId: "t1", roomId: "r1", instrument: "Piyano", startAt: "2027-07-06T15:50", durationMinutes: 40 });
    if (!single.ok) throw new Error(single.error.message);
    const res = await deleteLessonsTool(admin, { lessonId: single.data.lessonId, scope: "entireSeries" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toContain("seriye ait değil");
  });

  it("öğretmen ders silemez", async () => {
    const [first] = await newSeries();
    const res = await deleteLessonsTool({ ...admin, role: "TEACHER", teacherId: "t1" }, { lessonId: first!.id, scope: "single" });
    expect(res.ok).toBe(false);
  });
});

describe("E — ders revize (üç kapsam)", () => {
  async function newSeries() {
    const res = await createLessonSeriesTool(admin, HIRA_SERIES);
    if (!res.ok) throw new Error(res.error.message);
    return seriesLessons(res.data.seriesId);
  }

  it("sadece bu ders: tarih-saat değişir, diğerleri 15:50 kalır", async () => {
    const lessons = await newSeries();
    const res = await reviseLessonsTool(admin, { lessonId: lessons[1]!.id, scope: "single", startAt: "2027-06-08T17:00" });
    expect(res.ok).toBe(true);
    const after = await seriesLessons(lessons[0]!.seriesId!);
    expect(after.map((l) => hm(l.startAt))).toEqual(["15:50", "17:00", "15:50", "15:50"]);
  });

  it("bu ders ve sonrası: yalnız sonraki dersler yeni saate geçer, seri kaydı güncellenir", async () => {
    const lessons = await newSeries();
    const res = await reviseLessonsTool(admin, { lessonId: lessons[2]!.id, scope: "fromHereOnward", startTime: "16:30" });
    expect(res.ok).toBe(true);
    const after = await seriesLessons(lessons[0]!.seriesId!);
    expect(after.map((l) => hm(l.startAt))).toEqual(["15:50", "15:50", "16:30", "16:30"]);
    const series = (await readData()).lessonSeries.find((s) => s.id === lessons[0]!.seriesId);
    expect(series?.startTime).toBe("16:30");
  });

  it("tüm seri: gün + saat + süre birlikte değişir; yoklaması olan ders korunur", async () => {
    const lessons = await newSeries();
    await setLessonOpsFlagTool(admin, { lessonId: lessons[0]!.id, flag: "attended" });
    const res = await reviseLessonsTool(admin, { lessonId: lessons[3]!.id, scope: "entireSeries", weekday: 3, startTime: "11:00", durationMinutes: 50 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.updatedLessonIds).toHaveLength(3);
    expect(res.data.protectedLessons).toHaveLength(1);
    const after = await seriesLessons(lessons[0]!.seriesId!);
    expect(hm(after[0]!.startAt)).toBe("15:50");
    for (const l of after.slice(1)) {
      expect(hm(l.startAt)).toBe("11:00");
      expect(hm(l.endAt)).toBe("11:50");
      expect(zonedWeekday(new Date(l.startAt))).toBe(3);
    }
  });

  it("çakışma varsa hiçbir ders değişmez ve Türkçe neden döner", async () => {
    const lessons = await newSeries();
    const blocker = await createLessonTool(admin, { studentId: "s1", teacherId: "t1", roomId: "r1", instrument: "Piyano", startAt: "2027-06-15T17:00", durationMinutes: 40 });
    expect(blocker.ok).toBe(true);
    const res = await reviseLessonsTool(admin, { lessonId: lessons[0]!.id, scope: "entireSeries", startTime: "17:00" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toContain("hiçbir ders değiştirilmedi");
    const after = await seriesLessons(lessons[0]!.seriesId!);
    expect(after.every((l) => hm(l.startAt) === "15:50")).toBe(true);
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import {
  createLessonSeriesTool,
  createLessonTool,
  setLessonOpsFlagTool,
} from "../services/tools";
import { readData } from "../store";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import { resolveLessonAcademicPeriod, lessonMatchesAcademicPeriod } from "../attendance-calendar";
import { validateLessonSlot } from "../makeup-engine";


// Seed dersleri ve göreli tarihler "bugün"e göre üretilir; gün kapalı güne/geçmişe/müsaitlik dışına düşünce test
// takvime bağlı kırılıyordu (2026-10 CI baseline). Saat sabit bir SALI sabahına dondurulur — yalnız Date sahte.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-15T06:00:00.000Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");
const CLOSED_DAYS_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "closed-days.json");

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
  await fs.rm(CLOSED_DAYS_FILE, { force: true });
});

/**
 * Kök neden düzeltmesi — bu dosyadaki "Güz 2026" senaryoları sabit
 * guzDay(0) tabanlı literal tarihler kullanıyordu (bkz. AYNI sınıf
 * düzeltme: lesson-reassignment.test.ts / lesson-series-*.test.ts).
 * Takvim bu tarihe ulaştığında serinin ilk oluşumu geçmişe düşer,
 * validateLessonSlot PAST_START ile reddeder. Ürün davranışı doğru;
 * tüm "Güz 2026" tarihleri artık bugünden en az 8 gün sonraki ortak bir
 * referans noktasından (GUZ_2026_ANCHOR) göreli olarak hesaplanıyor —
 * aralarındaki gün farkları (0/4/7/14/18) korunuyor, yalnızca taban
 * kayıyor. 2027 Yaz senaryoları zaten güvenle gelecekte, dokunulmadı.
 */
// Sabit, tatil içermeyen bir güz haftası (5–12 Ekim 2026; saat 15 Eylül'e dondurulduğu için gelecekte). Eskiden
// "bugün + 8 gün" idi — modül yüklenirken gerçek saatle hesaplanıp 28 Ekim (bayram arifesi) gibi kapalı güne düşüyordu.
const GUZ_2026_ANCHOR = new Date(2026, 9, 5);
function guzDay(offsetDays: number): string {
  const d = new Date(GUZ_2026_ANCHOR);
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function findOpenSlot(weekday: number, hour: number): Promise<string | null> {
  const data = await readData();
  for (let offset = 1; offset <= 60; offset++) {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    if (d.getDay() !== weekday) continue;
    d.setHours(hour, 0, 0, 0);
    const candidate = d.toISOString();
    const check = validateLessonSlot(
      data,
      { instrument: "Piyano", studentId: "s1" },
      { teacherId: "t1", roomId: "r1", startAt: candidate }
    );
    if (check.ok) return candidate;
  }
  return null;
}

describe("ÖNCELİK 4 (devam) — Program ekranı akademik dönem/yıl etiketi", () => {
  it("yeni ders serisi seçili term/academicYearStart ile kaydedilir; ürettiği dersler bunu miras alır", async () => {
    const res = await createLessonSeriesTool(ctx(), {
      studentId: "s1",
      teacherId: "t1",
      roomId: "r1",
      branchId: "erzene",
      instrument: "Piyano",
      weekday: 2,
      startTime: "11:00",
      durationMinutes: 40,
      startsOn: guzDay(0),
      endsOn: guzDay(14),
      term: "guz",
      academicYearStart: 2026,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const data = await readData();
    const series = data.lessonSeries.find((s) => s.id === res.data.seriesId);
    expect(series?.term).toBe("guz");
    expect(series?.academicYearStart).toBe(2026);

    const lessons = data.lessons.filter((l) => l.seriesId === res.data.seriesId);
    expect(lessons.length).toBeGreaterThan(0);
    for (const l of lessons) {
      expect(l.term).toBe("guz");
      expect(l.academicYearStart).toBe(2026);
    }
  });

  it("aynı öğrenci için farklı dönemlerde farklı gün/saatle iki ayrı seri tanımlanabilir", async () => {
    const guzRes = await createLessonSeriesTool(ctx(), {
      studentId: "s1",
      teacherId: "t1",
      roomId: "r1",
      branchId: "erzene",
      instrument: "Piyano",
      weekday: 2, // Salı
      startTime: "11:00",
      durationMinutes: 40,
      startsOn: guzDay(0),
      endsOn: guzDay(14),
      term: "guz",
      academicYearStart: 2026,
    });
    expect(guzRes.ok).toBe(true);

    const yazRes = await createLessonSeriesTool(ctx(), {
      studentId: "s1",
      teacherId: "t1",
      roomId: "r1",
      branchId: "erzene",
      instrument: "Piyano",
      weekday: 3, // Çarşamba — farklı gün
      startTime: "15:00", // farklı saat
      durationMinutes: 40,
      startsOn: "2027-07-01",
      endsOn: "2027-07-15",
      term: "yaz",
      academicYearStart: 2027,
    });
    expect(yazRes.ok).toBe(true);
    if (!guzRes.ok || !yazRes.ok) return;

    const data = await readData();
    const guzLessons = data.lessons.filter((l) => l.seriesId === guzRes.data.seriesId);
    const yazLessons = data.lessons.filter((l) => l.seriesId === yazRes.data.seriesId);
    expect(guzLessons.every((l) => new Date(l.startAt).getHours() === 11)).toBe(true);
    expect(yazLessons.every((l) => new Date(l.startAt).getHours() === 15)).toBe(true);
    expect(guzLessons.length).toBeGreaterThan(0);
    expect(yazLessons.length).toBeGreaterThan(0);
  });

  it("aynı yıl/dönem altında birden fazla ders serisi (farklı öğrenci) desteklenir", async () => {
    const res1 = await createLessonSeriesTool(ctx(), {
      studentId: "s1",
      teacherId: "t1",
      roomId: "r1",
      branchId: "erzene",
      instrument: "Piyano",
      weekday: 2,
      startTime: "11:00",
      durationMinutes: 40,
      startsOn: guzDay(0),
      endsOn: guzDay(7),
      term: "guz",
      academicYearStart: 2026,
    });
    const res2 = await createLessonSeriesTool(ctx(), {
      studentId: "s2",
      teacherId: "t1",
      roomId: "r1",
      branchId: "erzene",
      instrument: "Piyano",
      weekday: 3,
      startTime: "12:00",
      durationMinutes: 40,
      startsOn: guzDay(0),
      endsOn: guzDay(7),
      term: "guz",
      academicYearStart: 2026,
    });
    expect(res1.ok).toBe(true);
    expect(res2.ok).toBe(true);
    if (!res1.ok || !res2.ok) return;
    expect(res1.data.seriesId).not.toBe(res2.data.seriesId);
  });

  it("legacy (term set edilmemiş) ders, resolveLessonAcademicPeriod fallback'i ile hâlâ doğru dönem/yıla düşer — veri kaybı yok", async () => {
    const startAt = await findOpenSlot(2, 11); // herhangi bir Salı
    if (!startAt) throw new Error("no open slot found");
    const created = await createLessonTool(ctx(), {
      studentId: "s1",
      teacherId: "t1",
      roomId: "r1",
      instrument: "Piyano",
      startAt,
      // term/academicYearStart verilmiyor — legacy davranış
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const data = await readData();
    const lesson = data.lessons.find((l) => l.id === created.data.lessonId)!;
    expect(lesson.term).toBeUndefined();
    const period = resolveLessonAcademicPeriod(lesson, "guz");
    expect(period.source).toBe("legacy_fallback");
    expect(lessonMatchesAcademicPeriod(lesson, period.term, period.academicYearStart, "guz")).toBe(true);
  });

  it("Package B — term etiketli bir derste Geldi işaretlenmesi hiçbir Payment (lesson_ops) üretmez", async () => {
    const res = await createLessonSeriesTool(ctx(), {
      studentId: "s1",
      teacherId: "t1",
      roomId: "r1",
      branchId: "erzene",
      instrument: "Piyano",
      weekday: 2,
      startTime: "11:00",
      durationMinutes: 40,
      startsOn: guzDay(0),
      endsOn: guzDay(7),
      term: "guz",
      academicYearStart: 2026,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const data = await readData();
    const lesson = data.lessons.find((l) => l.seriesId === res.data.seriesId);
    expect(lesson).toBeDefined();
    if (!lesson) return;

    const flagRes = await setLessonOpsFlagTool(ctx(), { lessonId: lesson.id, flag: "attended" });
    expect(flagRes.ok).toBe(true);

    const after = await readData();
    const payment = after.payments.find((p) => p.lessonId === lesson.id);
    expect(payment).toBeUndefined();
  });

  it("dönem/yıl parametreleri ile yetkisiz erişim mümkün değildir — RBAC yine service katmanında uygulanır", async () => {
    const res = await createLessonSeriesTool(ctx({ role: "TEACHER", teacherId: "t1" }), {
      studentId: "s1",
      teacherId: "t1",
      roomId: "r1",
      branchId: "erzene",
      instrument: "Piyano",
      weekday: 2,
      startTime: "11:00",
      durationMinutes: 40,
      startsOn: guzDay(0),
      endsOn: guzDay(7),
      term: "guz",
      academicYearStart: 2026,
    });
    expect(res.ok).toBe(false);
  });
});

describe("ÖNCELİK 4 (devam) — Program ekranı: döneme göre gün grid'i (backend doğrulaması)", () => {
  it("Güz: Pazartesi ders serisi reddedilir, hafta sonu kabul edilir", async () => {
    const monday = await createLessonSeriesTool(ctx(), {
      studentId: "s1",
      teacherId: "t1",
      roomId: "r1",
      branchId: "erzene",
      instrument: "Piyano",
      weekday: 1, // Pazartesi
      startTime: "11:00",
      durationMinutes: 40,
      startsOn: guzDay(0),
      endsOn: guzDay(14),
      term: "guz",
      academicYearStart: 2026,
    });
    expect(monday.ok).toBe(false);

    const saturday = await createLessonSeriesTool(ctx(), {
      studentId: "s1",
      teacherId: "t1",
      roomId: "r1",
      branchId: "erzene",
      instrument: "Piyano",
      weekday: 6, // Cumartesi
      startTime: "11:00",
      durationMinutes: 40,
      startsOn: guzDay(4),
      endsOn: guzDay(18),
      term: "guz",
      academicYearStart: 2026,
    });
    expect(saturday.ok).toBe(true);
  });

  it("Yaz: Cumartesi/Pazar ders serisi reddedilir, Pazartesi kabul edilir", async () => {
    const saturday = await createLessonSeriesTool(ctx(), {
      studentId: "s1",
      teacherId: "t1",
      roomId: "r1",
      branchId: "erzene",
      instrument: "Piyano",
      weekday: 6,
      startTime: "11:00",
      durationMinutes: 40,
      startsOn: "2027-07-03",
      endsOn: "2027-07-17",
      term: "yaz",
      academicYearStart: 2027,
    });
    expect(saturday.ok).toBe(false);

    const sunday = await createLessonSeriesTool(ctx(), {
      studentId: "s1",
      teacherId: "t1",
      roomId: "r1",
      branchId: "erzene",
      instrument: "Piyano",
      weekday: 0,
      startTime: "11:00",
      durationMinutes: 40,
      startsOn: "2027-07-04",
      endsOn: "2027-07-18",
      term: "yaz",
      academicYearStart: 2027,
    });
    expect(sunday.ok).toBe(false);

    const monday = await createLessonSeriesTool(ctx(), {
      studentId: "s1",
      teacherId: "t1",
      roomId: "r1",
      branchId: "erzene",
      instrument: "Piyano",
      weekday: 1,
      startTime: "11:00",
      durationMinutes: 40,
      startsOn: "2027-07-05",
      endsOn: "2027-07-19",
      term: "yaz",
      academicYearStart: 2027,
    });
    expect(monday.ok).toBe(true);
  });

  it("term verilmezse legacy davranış korunur — yalnızca Pazartesi kapalı, hafta sonu açık", async () => {
    const monday = await createLessonSeriesTool(ctx(), {
      studentId: "s1",
      teacherId: "t1",
      roomId: "r1",
      branchId: "erzene",
      instrument: "Piyano",
      weekday: 1,
      startTime: "11:00",
      durationMinutes: 40,
      startsOn: guzDay(0),
      endsOn: guzDay(14),
      // term verilmedi
    });
    expect(monday.ok).toBe(false);

    const saturday = await createLessonSeriesTool(ctx(), {
      studentId: "s1",
      teacherId: "t1",
      roomId: "r1",
      branchId: "erzene",
      instrument: "Piyano",
      weekday: 6,
      startTime: "11:00",
      durationMinutes: 40,
      startsOn: guzDay(4),
      endsOn: guzDay(18),
    });
    expect(saturday.ok).toBe(true);
  });

  it("tek ders oluşturma da (createLessonTool) aynı dönem-gün kuralını API katmanında uygular", async () => {
    // Cumartesi (weekday 6) — Güz'de açık, Yaz'da kapalı olmalı. Öğretmenin
    // gerçekten müsait olduğu bir Cumartesi/saat kombinasyonu aranır.
    const saturdaySlot = await findOpenSlot(6, 11);
    if (!saturdaySlot) throw new Error("no open Saturday slot found");
    const guzRes = await createLessonTool(ctx(), {
      studentId: "s1",
      teacherId: "t1",
      roomId: "r1",
      instrument: "Piyano",
      startAt: saturdaySlot,
      term: "guz",
      academicYearStart: 2026,
    });
    expect(guzRes.ok).toBe(true);

    const yazRes = await createLessonTool(ctx(), {
      studentId: "s2",
      teacherId: "t1",
      roomId: "r1",
      instrument: "Piyano",
      startAt: saturdaySlot,
      term: "yaz",
      academicYearStart: 2026,
    });
    expect(yazRes.ok).toBe(false);
  });
});

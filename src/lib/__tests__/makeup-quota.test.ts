import { describe, it, expect } from "vitest";
import {
  assertCanCreateMakeup,
  calendarMonthKey,
  countStudentMakeupsInMonth,
  formatMakeupQuotaLabel,
  getStudentMakeupQuota,
  resolveMonthlyMakeupAllowance,
  DEFAULT_MONTHLY_MAKEUP_ALLOWANCE,
} from "../makeup-quota";
import type { AppData, MakeupRequest } from "../types";

function mk(partial: Partial<MakeupRequest> & Pick<MakeupRequest, "id" | "studentId" | "status" | "createdAt">): Partial<MakeupRequest> {
  return {
    teacherId: "t1",
    branchId: "erzene",
    instrument: "Piyano",
    sourceLessonId: "l1",
    reason: "test",
    expiresAt: "2026-12-01T00:00:00.000Z",
    suggestedSlots: [],
    ...partial,
  };
}

// Dönem-bazlı kota (Nilüfer Acar politikası §3) döneme her isteğin
// `sourceLessonId`'sinin gösterdiği gerçek dersten türetilir; bu yüzden
// testlerde her istek AYNI (Ağustos 2026 = "2026-yaz" dönemi) bir derse
// bağlanır.
const SAME_PERIOD_LESSON = {
  id: "l1",
  studentId: "s1",
  teacherId: "t1",
  branchId: "erzene",
  roomId: "r1",
  instrument: "Piyano",
  startAt: "2026-08-10T10:00:00.000Z",
  endAt: "2026-08-10T10:40:00.000Z",
  type: "regular" as const,
  status: "scheduled" as const,
};

function baseData(requests: Partial<MakeupRequest>[], allowance?: number): AppData {
  return {
    settings: {
      tenantId: "t",
      name: "T",
      shortName: "T",
      city: "",
      website: "",
      email: "",
      phone: "",
      logoUrl: "",
      makeupWindowDays: 14,
      monthlyMakeupAllowance: allowance,
      lessonDurationMinutes: 40,
      workingHours: { start: "09:00", end: "21:00" },
      workingDays: [1, 2, 3, 4, 5, 6],
      currency: "TRY",
      branches: [],
      feeRoundingMode: "exact_minutes",
    },
    teachers: [],
    students: [],
    rooms: [],
    lessons: [SAME_PERIOD_LESSON],
    lessonSeries: [],
    attendances: [],
    makeupRequests: requests as unknown as MakeupRequest[],
    payments: [],
    teacherFeeRules: [],
    teacherPayouts: [],
  } as unknown as AppData;
}

describe("makeup-quota", () => {
  it("varsayılan hak 2", () => {
    expect(resolveMonthlyMakeupAllowance({})).toBe(DEFAULT_MONTHLY_MAKEUP_ALLOWANCE);
  });

  it("pending/suggested/awaiting_info/confirmed sayar; cancelled/expired saymaz", () => {
    const month = "2026-08";
    const reqs = [
      mk({ id: "1", studentId: "s1", status: "pending", createdAt: "2026-08-01T10:00:00.000Z" }),
      mk({ id: "2", studentId: "s1", status: "confirmed", createdAt: "2026-08-05T10:00:00.000Z" }),
      mk({ id: "3", studentId: "s1", status: "cancelled", createdAt: "2026-08-06T10:00:00.000Z" }),
      mk({ id: "4", studentId: "s1", status: "expired", createdAt: "2026-08-07T10:00:00.000Z" }),
      mk({ id: "5", studentId: "s1", status: "suggested", createdAt: "2026-07-01T10:00:00.000Z" }),
    ] as unknown as MakeupRequest[];
    expect(countStudentMakeupsInMonth(reqs, "s1", month)).toBe(2);
  });

  it("2 hak dolunca 3. talebi engeller", () => {
    const data = baseData(
      [
        mk({ id: "1", studentId: "s1", status: "pending", createdAt: "2026-08-01T10:00:00.000Z" }),
        mk({ id: "2", studentId: "s1", status: "confirmed", createdAt: "2026-08-05T10:00:00.000Z" }),
      ],
      2
    );
    const res = assertCanCreateMakeup(data, "s1", new Date("2026-08-12T12:00:00.000Z"));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toContain("2 telafi hakkını kullanmıştır");
  });

  it("0 hak telafiyi kapatır", () => {
    const data = baseData([], 0);
    const res = assertCanCreateMakeup(data, "s1", new Date("2026-08-12T12:00:00.000Z"));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toMatch(/kapalı/);
  });

  it("etiket metni kalan hakkı gösterir", () => {
    const snap = getStudentMakeupQuota(
      baseData([mk({ id: "1", studentId: "s1", status: "pending", createdAt: "2026-08-01T10:00:00.000Z" })], 2),
      "s1",
      new Date("2026-08-12T12:00:00.000Z")
    );
    // Sahibi onaylı zorunlu metin: "<yıl> eğitim dönemi için kalan telafi hakkı: X / 2".
    expect(formatMakeupQuotaLabel(snap)).toContain("eğitim dönemi için kalan telafi hakkı: 1 / 2");
    expect(formatMakeupQuotaLabel(snap)).toMatch(/^\d{4}-\d{4} eğitim dönemi/);
  });

  it("ay anahtarı YYYY-MM", () => {
    expect(calendarMonthKey("2026-08-13T10:00:00.000Z")).toMatch(/^\d{4}-\d{2}$/);
  });

  it("aynı eğitim dönemi içinde ay değişse bile kota sıfırlanmaz (§3 — dönem bazlı, AY bazlı değil)", () => {
    const data = baseData(
      [
        mk({ id: "1", studentId: "s1", status: "pending", createdAt: "2026-07-31T10:00:00.000Z" }),
        mk({ id: "2", studentId: "s1", status: "confirmed", createdAt: "2026-07-15T10:00:00.000Z" }),
      ],
      2
    );
    // sourceLessonId hâlâ Ağustos 2026 = "2026-yaz" dönemindeki l1'e bağlı;
    // ay Temmuz→Ağustos'a geçse de dönem AYNI kaldığı için kota TÜKENMİŞ kalmalı.
    const res = assertCanCreateMakeup(data, "s1", new Date("2026-08-01T12:00:00.000Z"));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.snapshot.used).toBe(2);
  });

  it("sahibi onaylı NİHAİ karar — Güz + Yaz AYRI AYRI 2'şer değil, aynı eğitim yılında TOPLAM 2 hak (Madde 11)", () => {
    // Güz dersi (Ekim 2026 → academicYearStart=2026, term=guz) — 2 hak kullanılmış.
    const guzLesson = {
      ...SAME_PERIOD_LESSON,
      id: "l_guz",
      startAt: "2026-10-05T10:00:00.000Z",
      endAt: "2026-10-05T10:40:00.000Z",
    };
    // Yaz dersi AYNI akademik yılda (Ağustos 2026 → academicYearStart=2026, term=yaz) — 3. talebin kaynağı.
    const yazLesson = {
      ...SAME_PERIOD_LESSON,
      id: "l_yaz",
      startAt: "2026-08-20T10:00:00.000Z",
      endAt: "2026-08-20T10:40:00.000Z",
    };
    const data = baseData(
      [
        mk({ id: "1", studentId: "s1", status: "pending", createdAt: "2026-10-05T10:00:00.000Z", sourceLessonId: "l_guz" }),
        mk({ id: "2", studentId: "s1", status: "confirmed", createdAt: "2026-10-06T10:00:00.000Z", sourceLessonId: "l_guz" }),
      ],
      2
    );
    data.lessons = [guzLesson, yazLesson] as unknown as AppData["lessons"];
    const res = assertCanCreateMakeup(data, "s1", new Date("2026-08-21T12:00:00.000Z"), "l_yaz");
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.snapshot.used).toBe(2);
      expect(res.message).toContain("2026-2027");
    }
  });

  it("farklı eğitim döneminden kaynaklanan talepler kotayı etkilemez", () => {
    const guzLesson = { ...SAME_PERIOD_LESSON, id: "l2", startAt: "2025-10-10T10:00:00.000Z", endAt: "2025-10-10T10:40:00.000Z" };
    const data = baseData(
      [mk({ id: "1", studentId: "s1", status: "pending", createdAt: "2025-10-10T10:00:00.000Z", sourceLessonId: "l2" })],
      2
    );
    data.lessons.push(guzLesson as unknown as AppData["lessons"][number]);
    const res = assertCanCreateMakeup(data, "s1", new Date("2026-08-12T12:00:00.000Z"));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.snapshot.used).toBe(0);
  });

  it("suggested ve awaiting_info sayılır", () => {
    const reqs = [
      mk({ id: "1", studentId: "s1", status: "suggested", createdAt: "2026-08-01T10:00:00.000Z" }),
      mk({ id: "2", studentId: "s1", status: "awaiting_info", createdAt: "2026-08-02T10:00:00.000Z" }),
    ] as unknown as MakeupRequest[];
    expect(countStudentMakeupsInMonth(reqs, "s1", "2026-08")).toBe(2);
  });

  it("başka öğrencinin talebi kotayı etkilemez", () => {
    const data = baseData(
      [
        mk({ id: "1", studentId: "s2", status: "pending", createdAt: "2026-08-01T10:00:00.000Z" }),
        mk({ id: "2", studentId: "s2", status: "confirmed", createdAt: "2026-08-02T10:00:00.000Z" }),
      ],
      2
    );
    const res = assertCanCreateMakeup(data, "s1", new Date("2026-08-12T12:00:00.000Z"));
    expect(res.ok).toBe(true);
  });

  it("geçersiz ISO ayı now'a düşer", () => {
    expect(calendarMonthKey("not-a-date", new Date("2026-03-05T00:00:00.000Z"))).toBe("2026-03");
  });
});

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
    lessons: [],
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
    expect(formatMakeupQuotaLabel(snap)).toContain("1 / 2");
    expect(formatMakeupQuotaLabel(snap)).toContain("1 hak kaldı");
  });

  it("ay anahtarı YYYY-MM", () => {
    expect(calendarMonthKey("2026-08-13T10:00:00.000Z")).toMatch(/^\d{4}-\d{2}$/);
  });

  it("yeni ay kotayı sıfırlar", () => {
    const data = baseData(
      [
        mk({ id: "1", studentId: "s1", status: "pending", createdAt: "2026-07-31T10:00:00.000Z" }),
        mk({ id: "2", studentId: "s1", status: "confirmed", createdAt: "2026-07-15T10:00:00.000Z" }),
      ],
      2
    );
    const res = assertCanCreateMakeup(data, "s1", new Date("2026-08-01T12:00:00.000Z"));
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

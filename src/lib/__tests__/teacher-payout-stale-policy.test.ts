/**
 * Hakediş etkin-politika regresyonları (Şevval/Olcay vakaları):
 * - sabit-ücret aylarında "ücret kuralı yok" yanlış alarmı üretilmez (teacherFeeRuleRequired),
 * - dönem aylarının politika kaynağı (explicit/inherited/default) çözümlenir,
 * - kayıtlı hakediş donmuş rozeti korur, canlı hesap güncel politikadan türer,
 * - süre istisnası orantı detayını taşır (Adel: 45 dk, 50 dk tarifesi × 45/50).
 */
import { describe, it, expect } from "vitest";
import {
  computeTeacherEarningsForPeriod,
  createTeacherPayoutSnapshot,
  payoutBaseEarnings,
  resolvePayoutPolicySources,
  teacherFeeRuleRequired,
} from "../teacher-payout";
import type { AppData, Lesson, Student, Teacher, TeacherFeeRule, TeacherPayoutPolicyPeriod } from "../types";

const BRANCH = "erzene";

function makeTeacher(): Teacher {
  return {
    id: "t1",
    name: "Olcay Öğretmen",
    email: "",
    phone: "",
    branchId: BRANCH,
    instruments: ["Piyano"],
    availability: [],
    maxDailyLessons: 8,
    active: true,
    color: "#7c3aed",
  };
}

function makeStudent(): Student {
  return {
    id: "s1",
    name: "Ece Öğrenci",
    email: "",
    phone: "",
    parentName: "",
    parentPhone: "",
    branchId: BRANCH,
    instruments: ["Piyano"],
    teacherId: "t1",
    packageName: "",
    weeklyLessonCount: 1,
    monthlyFee: 0,
    active: true,
    notes: "",
    createdAt: "2026-01-01T00:00:00+03:00",
  };
}

function makeLesson45min(): Lesson {
  return {
    id: "l1",
    studentId: "s1",
    teacherId: "t1",
    roomId: "r1",
    branchId: BRANCH,
    instrument: "Piyano",
    startAt: "2026-10-10T10:00:00+03:00",
    endAt: "2026-10-10T10:45:00+03:00",
    type: "regular",
    status: "completed",
  };
}

function fixedPolicy(month: string): TeacherPayoutPolicyPeriod {
  return {
    id: `ppol-${month}`,
    month,
    policy: "fixed_duration",
    rate30: 300,
    rate40: 400,
    rate50: 500,
    setByUserId: "u1",
    setAt: `${month}-02T10:00:00+03:00`,
  };
}

function makeData(overrides: Partial<AppData> = {}): AppData {
  return {
    settings: {
      tenantId: "tenant_test",
      name: "Test",
      shortName: "Test",
      city: "İzmir",
      website: "",
      email: "",
      phone: "",
      logoUrl: "",
      makeupWindowDays: 14,
      lessonDurationMinutes: 45,
      workingHours: { start: "09:00", end: "21:00" },
      workingDays: [1, 2, 3, 4, 5, 6],
      currency: "TRY",
      feeRoundingMode: "exact_minutes",
      branches: [{ id: BRANCH, name: "Erzene", shortName: "Erzene", address: "", phone: "", city: "İzmir" }],
    },
    teachers: [makeTeacher()],
    students: [makeStudent()],
    rooms: [],
    lessons: [makeLesson45min()],
    lessonSeries: [],
    attendances: [],
    makeupRequests: [],
    payments: [],
    teacherFeeRules: [],
    teacherPayouts: [],
    ...overrides,
  };
}

function feeRule(): TeacherFeeRule {
  return {
    id: "fee1",
    teacherId: "t1",
    perMinuteRate: 10,
    effectiveFrom: "2020-01-01",
    createdAt: "2020-01-01T00:00:00+03:00",
  };
}

describe("bayat politika — istisna rozeti regresyonu (Olcay vakası)", () => {
  it("sabit ücret politikasında 45 dk ders süre-istisnası üretir (gerçek istisna)", () => {
    const data = makeData({ teacherPayoutPolicies: [fixedPolicy("2026-09")] });
    const r = computeTeacherEarningsForPeriod(data, "t1", "2026-10-01", "2026-10-31");
    expect(r.unsupportedDurationLessonIds).toEqual(["l1"]);
    expect(r.lines[0].issue).toBe("duration-exception");
  });

  it("eski politika kalkınca (güncel politika öğretmen-ücretli) aynı ders rozetsiz hesaplanır", () => {
    const data = makeData({ teacherFeeRules: [feeRule()] });
    const r = computeTeacherEarningsForPeriod(data, "t1", "2026-10-01", "2026-10-31");
    expect(r.unsupportedDurationLessonIds).toEqual([]);
    expect(r.lines[0].issue).toBeUndefined();
    expect(r.lines[0].amount).toBe(450);
  });

  it("kayıtlı hakediş donmuş rozeti korur; canlı hesap temizdir (defter kuralı kilidi)", () => {
    const before = makeData({ teacherPayoutPolicies: [fixedPolicy("2026-09")] });
    const created = createTeacherPayoutSnapshot(before, "t1", "2026-10-01", "2026-10-31");
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    // Politika değişti + kayıt bekliyor → kayıt hâlâ eski rozeti taşır (yeniden hesaplanana kadar).
    const after: AppData = { ...before, teacherFeeRules: [feeRule()], teacherPayoutPolicies: [], teacherPayouts: [created.payout] };
    const frozen = payoutBaseEarnings(after, created.payout);
    expect(frozen.lines[0].issue).toBe("duration-exception");
    const live = computeTeacherEarningsForPeriod(after, "t1", "2026-10-01", "2026-10-31");
    expect(live.lines[0].issue).toBeUndefined();
  });
});

describe("teacherFeeRuleRequired — ücret-uyarısı politika bilinçli", () => {
  it("sabit ücret ayında ücret kuralı gerekmez (devralınan politika dahil)", () => {
    const data = makeData({ teacherPayoutPolicies: [fixedPolicy("2026-09")] });
    expect(teacherFeeRuleRequired(data, "t1", "2026-10")).toBe(false);
  });

  it("öğretmen-ücretli ayda ücret kuralı gerekir; politika yoksa da gerekir (varsayılan)", () => {
    expect(teacherFeeRuleRequired(makeData(), "t1", "2026-10")).toBe(true);
    const perTeacher: AppData = makeData({
      teacherPayoutPolicies: [{ ...fixedPolicy("2026-10"), policy: "per_teacher_rule", rate30: undefined, rate40: undefined, rate50: undefined }],
    });
    expect(teacherFeeRuleRequired(perTeacher, "t1", "2026-10")).toBe(true);
  });
});

describe("resolvePayoutPolicySources — dönem aylarının politika kaynağı", () => {
  it("açık / devralınan / varsayılan kaynaklarını ay ay döndürür", () => {
    const data = makeData({ teacherPayoutPolicies: [fixedPolicy("2026-09")] });
    const src = resolvePayoutPolicySources(data, "t1", "2026-09-01", "2026-10-31");
    expect(src["2026-09"].source).toBe("explicit");
    expect(src["2026-10"].source).toBe("inherited");
    expect(src["2026-10"].fromMonth).toBe("2026-09");
    const bare = resolvePayoutPolicySources(makeData(), "t1", "2026-10-01", "2026-10-31");
    expect(bare["2026-10"].source).toBe("default");
  });
});

describe("süre istisnası orantı detayı (Adel vakası)", () => {
  it("45 dk ders 50 dk tarifesinden orantılı hesaplanır ve detayı taşır (600 × 45/50 = 540)", () => {
    const data = makeData({
      teacherPayoutPolicies: [{ ...fixedPolicy("2026-10"), rate30: 360, rate40: 480, rate50: 600 }],
    });
    const r = computeTeacherEarningsForPeriod(data, "t1", "2026-10-01", "2026-10-31");
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0].durationMinutes).toBe(45);
    expect(r.lines[0].issue).toBe("duration-exception");
    expect(r.lines[0].amount).toBe(540);
    expect(r.lines[0].exceptionDetail).toEqual({ tariffMinutes: 50, tariffRate: 600 });
    // Politika ders süresini değiştirmez — 45 dk kayıttan aynen gelir.
    expect(r.totalMinutes).toBe(45);
  });

  it("istisna detayı kayda donar ve kayıt ekranında okunur", () => {
    const data = makeData({
      teacherPayoutPolicies: [{ ...fixedPolicy("2026-10"), rate30: 360, rate40: 480, rate50: 600 }],
    });
    const created = createTeacherPayoutSnapshot(data, "t1", "2026-10-01", "2026-10-31");
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.payout.lineSnapshot?.[0].exceptionDetail).toEqual({ tariffMinutes: 50, tariffRate: 600 });
    const shown = payoutBaseEarnings(data, created.payout);
    expect(shown.lines[0].exceptionDetail).toEqual({ tariffMinutes: 50, tariffRate: 600 });
  });
});

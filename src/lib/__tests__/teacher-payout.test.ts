import { describe, it, expect } from "vitest";
import {
  resolveFeeRule,
  computeTeacherEarningsForPeriod,
  computeTeacherPayoutPaymentMethodInfo,
  createTeacherPayoutSnapshot,
  createTeacherFeeRuleData,
  updateTeacherFeeRuleData,
  updateTeacherPayoutPaymentMethodData,
  validateFeeRuleInput,
  markTeacherPayoutPaidData,
  payoutPeriodDayKey,
} from "../teacher-payout";
import type { AppData, Lesson, Student, Teacher, TeacherFeeRule } from "../types";

const BRANCH_A = "erzene";
const BRANCH_B = "evka3";

function makeTeacher(overrides: Partial<Teacher> = {}): Teacher {
  return {
    id: "t1",
    name: "Ada Öğretmen",
    email: "ada@example.com",
    phone: "",
    branchId: BRANCH_A,
    instruments: ["Piyano"],
    availability: [],
    maxDailyLessons: 8,
    active: true,
    color: "#7c3aed",
    ...overrides,
  };
}

function makeStudent(overrides: Partial<Student> = {}): Student {
  return {
    id: "s1",
    name: "Ece Öğrenci",
    email: "",
    phone: "",
    parentName: "",
    parentPhone: "",
    branchId: BRANCH_A,
    instruments: ["Piyano"],
    teacherId: "t1",
    packageName: "",
    weeklyLessonCount: 1,
    monthlyFee: 0,
    active: true,
    notes: "",
    createdAt: "2026-01-01T00:00:00+03:00",
    ...overrides,
  };
}

function makeLesson(overrides: Partial<Lesson> = {}): Lesson {
  return {
    id: "l1",
    studentId: "s1",
    teacherId: "t1",
    roomId: "r1",
    branchId: BRANCH_A,
    instrument: "Piyano",
    startAt: "2026-08-10T10:00:00+03:00",
    endAt: "2026-08-10T10:30:00+03:00",
    type: "regular",
    status: "completed",
    ...overrides,
  };
}

function makeFeeRule(overrides: Partial<TeacherFeeRule> = {}): TeacherFeeRule {
  return {
    id: "fee1",
    teacherId: "t1",
    perMinuteRate: 11.5,
    effectiveFrom: "2020-01-01",
    createdAt: "2020-01-01T00:00:00+03:00",
    ...overrides,
  };
}

function makeData(overrides: Partial<AppData> = {}): AppData {
  return {
    settings: {
      tenantId: "tenant_test",
      name: "Test Müzik Akademisi",
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
      branches: [
        { id: BRANCH_A, name: "Erzene Şubesi", shortName: "Erzene", address: "", phone: "0553 000 0000", city: "İzmir" },
        { id: BRANCH_B, name: "Evka 3 Şubesi", shortName: "Evka 3", address: "", phone: "", city: "İzmir" },
      ],
    },
    teachers: [makeTeacher()],
    students: [makeStudent()],
    rooms: [],
    lessons: [],
    lessonSeries: [],
    attendances: [],
    makeupRequests: [],
    payments: [],
    teacherFeeRules: [],
    teacherPayouts: [],
    ...overrides,
  };
}

const PERIOD_START = "2026-08-01";
const PERIOD_END = "2026-08-31";

describe("computeTeacherEarningsForPeriod — dakika başı doğrusal hesap", () => {
  it("11.50 TL/dk ile 30 dakika = 345.00 TL", () => {
    const data = makeData({
      lessons: [makeLesson({ startAt: "2026-08-10T10:00:00+03:00", endAt: "2026-08-10T10:30:00+03:00" })],
      teacherFeeRules: [makeFeeRule({ perMinuteRate: 11.5 })],
    });
    const result = computeTeacherEarningsForPeriod(data, "t1", PERIOD_START, PERIOD_END);
    expect(result.lines[0].durationMinutes).toBe(30);
    expect(result.lines[0].amount).toBe(345.0);
    expect(result.totalAmount).toBe(345.0);
  });

  it("11.50 TL/dk ile 40 dakika = 460.00 TL", () => {
    const data = makeData({
      lessons: [makeLesson({ startAt: "2026-08-10T10:00:00+03:00", endAt: "2026-08-10T10:40:00+03:00" })],
      teacherFeeRules: [makeFeeRule({ perMinuteRate: 11.5 })],
    });
    const result = computeTeacherEarningsForPeriod(data, "t1", PERIOD_START, PERIOD_END);
    expect(result.lines[0].durationMinutes).toBe(40);
    expect(result.lines[0].amount).toBe(460.0);
  });

  it("11.50 TL/dk ile 50 dakika = 575.00 TL", () => {
    const data = makeData({
      lessons: [makeLesson({ startAt: "2026-08-10T10:00:00+03:00", endAt: "2026-08-10T10:50:00+03:00" })],
      teacherFeeRules: [makeFeeRule({ perMinuteRate: 11.5 })],
    });
    const result = computeTeacherEarningsForPeriod(data, "t1", PERIOD_START, PERIOD_END);
    expect(result.lines[0].durationMinutes).toBe(50);
    expect(result.lines[0].amount).toBe(575.0);
  });
});

describe("computeTeacherEarningsForPeriod — ders durumu filtresi", () => {
  it("yalnızca status === 'completed' dersler dahil edilir", () => {
    const data = makeData({
      lessons: [
        makeLesson({ id: "l1", status: "completed" }),
        makeLesson({ id: "l2", status: "scheduled" }),
        makeLesson({ id: "l3", status: "cancelled" }),
        makeLesson({ id: "l4", status: "no_show" }),
      ],
      teacherFeeRules: [makeFeeRule()],
    });
    const result = computeTeacherEarningsForPeriod(data, "t1", PERIOD_START, PERIOD_END);
    expect(result.lines.map((l) => l.lessonId)).toEqual(["l1"]);
  });

  it("cancelled ve no_show dersler hariç tutulur", () => {
    const data = makeData({
      lessons: [
        makeLesson({ id: "l-cancelled", status: "cancelled" }),
        makeLesson({ id: "l-noshow", status: "no_show" }),
      ],
      teacherFeeRules: [makeFeeRule()],
    });
    const result = computeTeacherEarningsForPeriod(data, "t1", PERIOD_START, PERIOD_END);
    expect(result.lines).toHaveLength(0);
    expect(result.totalLessons).toBe(0);
    expect(result.totalAmount).toBe(0);
  });

  it("aynı lesson.id iki kez gelirse yalnızca ilk geçerli kayıt hesaplanır", () => {
    const duplicated = makeLesson({ id: "l1", status: "completed" });
    const data = makeData({
      lessons: [duplicated, { ...duplicated }],
      teacherFeeRules: [makeFeeRule()],
    });
    const result = computeTeacherEarningsForPeriod(data, "t1", PERIOD_START, PERIOD_END);
    expect(result.totalLessons).toBe(1);
    expect(result.lines).toHaveLength(1);
  });

  it("tamamlanmış bir telafi dersi normal ders gibi yalnızca bir kez sayılır", () => {
    const data = makeData({
      lessons: [
        // Orijinal ders gelinmedi (no_show) — hakedişe girmez.
        makeLesson({ id: "l-source", type: "regular", status: "no_show" }),
        // Telafi dersi tamamlandı — hakedişe bir kez girer.
        makeLesson({
          id: "l-makeup",
          type: "makeup",
          status: "completed",
          makeupRequestId: "m1",
          startAt: "2026-08-12T10:00:00+03:00",
          endAt: "2026-08-12T10:30:00+03:00",
        }),
      ],
      teacherFeeRules: [makeFeeRule()],
    });
    const result = computeTeacherEarningsForPeriod(data, "t1", PERIOD_START, PERIOD_END);
    expect(result.lines.map((l) => l.lessonId)).toEqual(["l-makeup"]);
    expect(result.totalLessons).toBe(1);
    expect(result.totalAmount).toBe(345.0);
  });
});

describe("computeTeacherEarningsForPeriod — kesirli süre yuvarlama politikası (EPIC 3)", () => {
  it("exact_minutes (varsayılan): 35 dakikalık ders tam 35 dakika üzerinden ödenir", () => {
    const data = makeData({
      lessons: [makeLesson({ startAt: "2026-08-10T10:00:00+03:00", endAt: "2026-08-10T10:35:00+03:00" })],
      teacherFeeRules: [makeFeeRule({ perMinuteRate: 10 })],
    });
    const result = computeTeacherEarningsForPeriod(data, "t1", PERIOD_START, PERIOD_END);
    expect(result.lines[0].durationMinutes).toBe(35);
    expect(result.lines[0].amount).toBe(350.0);
  });

  it("round_30: 35 dakikalık ders öğretmen lehine 60 dakikaya yuvarlanarak ödenir", () => {
    const data = makeData({
      settings: { ...makeData().settings, feeRoundingMode: "round_30" },
      lessons: [makeLesson({ startAt: "2026-08-10T10:00:00+03:00", endAt: "2026-08-10T10:35:00+03:00" })],
      teacherFeeRules: [makeFeeRule({ perMinuteRate: 10 })],
    });
    const result = computeTeacherEarningsForPeriod(data, "t1", PERIOD_START, PERIOD_END);
    expect(result.lines[0].durationMinutes).toBe(35); // gerçekleşen süre görünür değişmez
    expect(result.lines[0].amount).toBe(600.0); // ama 60dk üzerinden ödenir
  });

  it("round_30: tam 30 dakikalık ders yuvarlanmadan aynı kalır (tam dilim sınırında yukarı atlamaz)", () => {
    const data = makeData({
      settings: { ...makeData().settings, feeRoundingMode: "round_30" },
      lessons: [makeLesson({ startAt: "2026-08-10T10:00:00+03:00", endAt: "2026-08-10T10:30:00+03:00" })],
      teacherFeeRules: [makeFeeRule({ perMinuteRate: 10 })],
    });
    const result = computeTeacherEarningsForPeriod(data, "t1", PERIOD_START, PERIOD_END);
    expect(result.lines[0].amount).toBe(300.0);
  });

  it("round_30: 65 dakikalık ders 90 dakikaya yuvarlanır", () => {
    const data = makeData({
      settings: { ...makeData().settings, feeRoundingMode: "round_30" },
      lessons: [makeLesson({ startAt: "2026-08-10T10:00:00+03:00", endAt: "2026-08-10T11:05:00+03:00" })],
      teacherFeeRules: [makeFeeRule({ perMinuteRate: 10 })],
    });
    const result = computeTeacherEarningsForPeriod(data, "t1", PERIOD_START, PERIOD_END);
    expect(result.lines[0].amount).toBe(900.0);
  });

  it("fixed_package: gerçek süre yok sayılır, kurumun standart ders süresi (lessonDurationMinutes) esas alınır", () => {
    const data = makeData({
      settings: { ...makeData().settings, feeRoundingMode: "fixed_package", lessonDurationMinutes: 45 },
      // Ders fiilen 20 dakika sürmüş olsa bile...
      lessons: [makeLesson({ startAt: "2026-08-10T10:00:00+03:00", endAt: "2026-08-10T10:20:00+03:00" })],
      teacherFeeRules: [makeFeeRule({ perMinuteRate: 10 })],
    });
    const result = computeTeacherEarningsForPeriod(data, "t1", PERIOD_START, PERIOD_END);
    expect(result.lines[0].durationMinutes).toBe(20); // gerçekleşen süre değişmez
    expect(result.lines[0].amount).toBe(450.0); // ama 45dk (standart) üzerinden ödenir
  });

  it("yuvarlama politikası, zaten oluşturulmuş bir TeacherPayout snapshot'ını asla etkilemez", () => {
    const data = makeData({
      lessons: [makeLesson({ startAt: "2026-08-10T10:00:00+03:00", endAt: "2026-08-10T10:35:00+03:00" })],
      teacherFeeRules: [makeFeeRule({ id: "r1", perMinuteRate: 10 })],
    });
    const created = createTeacherPayoutSnapshot(data, "t1", PERIOD_START, PERIOD_END);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.payout.totalAmount).toBe(350.0); // exact_minutes altında oluşturuldu

    const withNewPolicy: AppData = {
      ...created.data,
      settings: { ...created.data.settings, feeRoundingMode: "round_30" },
    };
    const frozenPayout = withNewPolicy.teacherPayouts.find((p) => p.id === created.payout.id);
    expect(frozenPayout?.totalAmount).toBe(350.0); // politika değişse de snapshot donmuş kalır
  });
});

describe("computeTeacherEarningsForPeriod — ders tipi politikası (EPIC 3)", () => {
  it("trial (deneme) dersi tamamlanmışsa tam oranla hakedişe girer", () => {
    const data = makeData({
      lessons: [makeLesson({ type: "trial", status: "completed" })],
      teacherFeeRules: [makeFeeRule({ perMinuteRate: 11.5 })],
    });
    const result = computeTeacherEarningsForPeriod(data, "t1", PERIOD_START, PERIOD_END);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].amount).toBe(345.0);
  });

  it("devamsızlık nedeniyle no_show olan ders hakedişe hiç girmez (öğretmen dersi fiilen vermedi)", () => {
    const data = makeData({
      lessons: [makeLesson({ status: "no_show" })],
      teacherFeeRules: [makeFeeRule()],
    });
    const result = computeTeacherEarningsForPeriod(data, "t1", PERIOD_START, PERIOD_END);
    expect(result.lines).toHaveLength(0);
  });

  it("Lesson.status 'completed' kaldığı sürece, öğrencinin Attendance kaydı 'absent' olsa bile hakediş etkilenmez", () => {
    // Öğretmen dersi bekledi/verdi ama öğrenci gelmedi senaryosu: bu durumda
    // okulun iş kuralı Lesson.status'u "completed" bırakabilir (yalnızca
    // Attendance ayrı bir "absent" kaydı taşır) — hakediş yalnızca
    // Lesson.status'a bakar, Attendance'a bakmaz.
    const data = makeData({
      lessons: [makeLesson({ status: "completed" })],
      attendances: [
        { id: "att1", lessonId: "l1", studentId: "s1", status: "absent", markedAt: "2026-08-10T10:30:00+03:00", createsMakeupCredit: true },
      ],
      teacherFeeRules: [makeFeeRule({ perMinuteRate: 11.5 })],
    });
    const result = computeTeacherEarningsForPeriod(data, "t1", PERIOD_START, PERIOD_END);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].amount).toBe(345.0);
  });
});

describe("computeTeacherEarningsForPeriod — teacherId filtresi", () => {
  it("yalnızca istenen teacherId'nin dersleri döner", () => {
    const data = makeData({
      teachers: [makeTeacher({ id: "t1" }), makeTeacher({ id: "t2", branchId: BRANCH_B })],
      lessons: [
        makeLesson({ id: "l1", teacherId: "t1" }),
        makeLesson({ id: "l2", teacherId: "t2", branchId: BRANCH_B }),
      ],
      teacherFeeRules: [makeFeeRule({ id: "fee1", teacherId: "t1" }), makeFeeRule({ id: "fee2", teacherId: "t2" })],
    });
    const result = computeTeacherEarningsForPeriod(data, "t1", PERIOD_START, PERIOD_END);
    expect(result.lines.map((l) => l.lessonId)).toEqual(["l1"]);
  });

  it("Teacher.branchId ile fazladan filtre uygulanmaz — öğretmenin kayıtlı şubesinden farklı bir şubede geçen dersi de sayar", () => {
    // Öğretmen t1'in Teacher.branchId'si BRANCH_A, ama bu ders BRANCH_B'de
    // geçmiş gibi kurgulandı (çok şubeli öğretmen senaryosunun saf veri
    // düzeyinde simülasyonu). Hesaplama yalnızca teacherId ile filtrelemeli.
    const data = makeData({
      teachers: [makeTeacher({ id: "t1", branchId: BRANCH_A })],
      lessons: [makeLesson({ id: "l1", teacherId: "t1", branchId: BRANCH_B })],
      teacherFeeRules: [makeFeeRule({ teacherId: "t1" })], // teacherId-only kapsam, şube fark etmez
    });
    const result = computeTeacherEarningsForPeriod(data, "t1", PERIOD_START, PERIOD_END);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].amount).toBe(345.0);
    expect(result.missingFeeRuleLessonIds).toEqual([]);
  });
});

describe("resolveFeeRule — spesifiklik önceliği", () => {
  const lessonDateIso = "2026-08-10T10:00:00+03:00";

  it("teacherId+branchId+instrument en spesifik kural önceliklidir", () => {
    const rules = [
      makeFeeRule({ id: "r-general", perMinuteRate: 10 }),
      makeFeeRule({ id: "r-branch", branchId: BRANCH_A, perMinuteRate: 11 }),
      makeFeeRule({ id: "r-instrument", instrument: "Piyano", perMinuteRate: 12 }),
      makeFeeRule({ id: "r-most-specific", branchId: BRANCH_A, instrument: "Piyano", perMinuteRate: 13 }),
    ];
    const resolved = resolveFeeRule(rules, {
      teacherId: "t1",
      branchId: BRANCH_A,
      instrument: "Piyano",
      lessonDateIso,
    });
    expect(resolved?.id).toBe("r-most-specific");
  });

  it("en spesifik kural yoksa teacherId+branchId'ye düşer", () => {
    const rules = [
      makeFeeRule({ id: "r-general", perMinuteRate: 10 }),
      makeFeeRule({ id: "r-branch", branchId: BRANCH_A, perMinuteRate: 11 }),
    ];
    const resolved = resolveFeeRule(rules, {
      teacherId: "t1",
      branchId: BRANCH_A,
      instrument: "Piyano",
      lessonDateIso,
    });
    expect(resolved?.id).toBe("r-branch");
  });

  it("yalnızca teacherId+instrument varsa onu kullanır", () => {
    const rules = [
      makeFeeRule({ id: "r-general", perMinuteRate: 10 }),
      makeFeeRule({ id: "r-instrument", instrument: "Piyano", perMinuteRate: 12 }),
    ];
    const resolved = resolveFeeRule(rules, {
      teacherId: "t1",
      branchId: BRANCH_A,
      instrument: "Piyano",
      lessonDateIso,
    });
    expect(resolved?.id).toBe("r-instrument");
  });

  it("hiçbir daraltma yoksa yalnızca teacherId kuralına düşer", () => {
    const rules = [makeFeeRule({ id: "r-general", perMinuteRate: 10 })];
    const resolved = resolveFeeRule(rules, {
      teacherId: "t1",
      branchId: BRANCH_A,
      instrument: "Piyano",
      lessonDateIso,
    });
    expect(resolved?.id).toBe("r-general");
  });

  it("geçerlilik tarihine göre doğru kural seçilir", () => {
    const rules = [
      makeFeeRule({ id: "r-old", perMinuteRate: 10, effectiveFrom: "2020-01-01", effectiveTo: "2026-06-30" }),
      makeFeeRule({ id: "r-new", perMinuteRate: 15, effectiveFrom: "2026-07-01" }),
    ];
    const beforeRaise = resolveFeeRule(rules, {
      teacherId: "t1",
      branchId: BRANCH_A,
      instrument: "Piyano",
      lessonDateIso: "2026-05-15T10:00:00+03:00",
    });
    const afterRaise = resolveFeeRule(rules, {
      teacherId: "t1",
      branchId: BRANCH_A,
      instrument: "Piyano",
      lessonDateIso: "2026-08-15T10:00:00+03:00",
    });
    expect(beforeRaise?.id).toBe("r-old");
    expect(afterRaise?.id).toBe("r-new");
  });

  it("hiçbir kural o tarihte geçerli değilse null döner", () => {
    const rules = [makeFeeRule({ id: "r-future", effectiveFrom: "2027-01-01" })];
    const resolved = resolveFeeRule(rules, {
      teacherId: "t1",
      branchId: BRANCH_A,
      instrument: "Piyano",
      lessonDateIso,
    });
    expect(resolved).toBeNull();
  });
});

describe("validateFeeRuleInput / createTeacherFeeRuleData — çakışma ve geçerlilik", () => {
  it("aynı kapsamda tarih aralığı çakışan aktif kural reddedilir", () => {
    const existing = [makeFeeRule({ id: "r1", effectiveFrom: "2026-01-01", effectiveTo: "2026-12-31" })];
    const result = validateFeeRuleInput(existing, {
      teacherId: "t1",
      perMinuteRate: 12,
      effectiveFrom: "2026-06-01", // 2026-01-01..2026-12-31 ile kesişiyor
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("OVERLAPPING_RULE");
  });

  it("farklı kapsamdaki (branch/instrument) kurallar çakışma sayılmaz", () => {
    const existing = [makeFeeRule({ id: "r1", effectiveFrom: "2026-01-01" })]; // teacherId-only, açık uçlu
    const result = validateFeeRuleInput(existing, {
      teacherId: "t1",
      branchId: BRANCH_A, // farklı kapsam
      perMinuteRate: 12,
      effectiveFrom: "2026-06-01",
    });
    expect(result.ok).toBe(true);
  });

  it("çakışmayan (ardışık) tarih aralıkları kabul edilir", () => {
    const existing = [makeFeeRule({ id: "r1", effectiveFrom: "2020-01-01", effectiveTo: "2026-06-30" })];
    const result = validateFeeRuleInput(existing, {
      teacherId: "t1",
      perMinuteRate: 12,
      effectiveFrom: "2026-07-01",
    });
    expect(result.ok).toBe(true);
  });

  it("sıfır ücret reddedilir", () => {
    const result = validateFeeRuleInput([], {
      teacherId: "t1",
      perMinuteRate: 0,
      effectiveFrom: "2026-01-01",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("INVALID_RATE");
  });

  it("negatif ücret reddedilir", () => {
    const result = validateFeeRuleInput([], {
      teacherId: "t1",
      perMinuteRate: -5,
      effectiveFrom: "2026-01-01",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("INVALID_RATE");
  });

  it("effectiveTo effectiveFrom'dan önceyse reddedilir", () => {
    const result = validateFeeRuleInput([], {
      teacherId: "t1",
      perMinuteRate: 11.5,
      effectiveFrom: "2026-08-01",
      effectiveTo: "2026-07-01",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("INVALID_DATE_RANGE");
  });

  it("createTeacherFeeRuleData geçerli girdide AppData'ya kuralı ekler", () => {
    const data = makeData();
    const result = createTeacherFeeRuleData(data, {
      teacherId: "t1",
      perMinuteRate: 11.5,
      effectiveFrom: "2020-01-01",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.teacherFeeRules).toHaveLength(1);
      expect(result.data.teacherFeeRules[0].perMinuteRate).toBe(11.5);
    }
  });

  it("updateTeacherFeeRuleData var olmayan kural için NOT_FOUND döner", () => {
    const data = makeData();
    const result = updateTeacherFeeRuleData(data, "does-not-exist", { perMinuteRate: 20 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("NOT_FOUND");
  });

  it("updateTeacherFeeRuleData kuralı günceller ve kendisiyle çakışma saymaz", () => {
    const data = makeData({ teacherFeeRules: [makeFeeRule({ id: "r1", perMinuteRate: 11.5 })] });
    const result = updateTeacherFeeRuleData(data, "r1", { perMinuteRate: 15 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.rule.perMinuteRate).toBe(15);
  });
});

describe("Eksik ücret kuralı — görünür sorun ve payout engeli", () => {
  it("eksik ücret kurallı ders 'missing-fee-rule' işaretiyle görünür, tutarı 0 olur", () => {
    const data = makeData({
      lessons: [makeLesson()],
      teacherFeeRules: [], // hiç kural yok
    });
    const result = computeTeacherEarningsForPeriod(data, "t1", PERIOD_START, PERIOD_END);
    expect(result.lines[0].issue).toBe("missing-fee-rule");
    expect(result.lines[0].amount).toBe(0);
    expect(result.missingFeeRuleLessonIds).toEqual(["l1"]);
    expect(result.canCreatePayout).toBe(false);
  });

  it("eksik ücret kurallı dönem için payout oluşturma engellenir", () => {
    const data = makeData({ lessons: [makeLesson()], teacherFeeRules: [] });
    const result = createTeacherPayoutSnapshot(data, "t1", PERIOD_START, PERIOD_END);
    expect(result.ok).toBe(false);
    if (!result.ok && result.code === "MISSING_FEE_RULE") {
      expect(result.missingFeeRuleLessonIds).toEqual(["l1"]);
    } else {
      throw new Error("MISSING_FEE_RULE bekleniyordu");
    }
  });
});

describe("TeacherPayout snapshot — donma ve tekrar oluşturma engeli", () => {
  it("payout oluşturulduktan sonra ücret kuralı değişse bile geçmiş tutar değişmez", () => {
    const data = makeData({
      lessons: [makeLesson({ startAt: "2026-08-10T10:00:00+03:00", endAt: "2026-08-10T10:30:00+03:00" })],
      teacherFeeRules: [makeFeeRule({ id: "r1", perMinuteRate: 11.5 })],
    });

    const created = createTeacherPayoutSnapshot(data, "t1", PERIOD_START, PERIOD_END);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.payout.totalAmount).toBe(345.0);

    const updatedRule = updateTeacherFeeRuleData(created.data, "r1", { perMinuteRate: 20 });
    expect(updatedRule.ok).toBe(true);
    if (!updatedRule.ok) return;

    const frozenPayout = updatedRule.data.teacherPayouts.find((p) => p.id === created.payout.id);
    expect(frozenPayout?.totalAmount).toBe(345.0);

    // Yeni oranla canlı hesap farklı olurdu — snapshot bilerek buna bağlı değil.
    const liveRecompute = computeTeacherEarningsForPeriod(updatedRule.data, "t1", PERIOD_START, PERIOD_END);
    expect(liveRecompute.totalAmount).toBe(600.0);
  });

  it("aynı öğretmen ve dönem için ikinci payout oluşturulamaz", () => {
    const data = makeData({
      lessons: [makeLesson()],
      teacherFeeRules: [makeFeeRule()],
    });
    const first = createTeacherPayoutSnapshot(data, "t1", PERIOD_START, PERIOD_END);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = createTeacherPayoutSnapshot(first.data, "t1", PERIOD_START, PERIOD_END);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.code).toBe("PAYOUT_ALREADY_EXISTS");
  });

  it("başlangıç durumu pending olur", () => {
    const data = makeData({ lessons: [makeLesson()], teacherFeeRules: [makeFeeRule()] });
    const result = createTeacherPayoutSnapshot(data, "t1", PERIOD_START, PERIOD_END);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payout.status).toBe("pending");
  });
});

describe("markTeacherPayoutPaidData", () => {
  it("bekleyen hakedişi ödendi olarak işaretler", () => {
    const data = makeData({ lessons: [makeLesson()], teacherFeeRules: [makeFeeRule()] });
    const created = createTeacherPayoutSnapshot(data, "t1", PERIOD_START, PERIOD_END);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const paid = markTeacherPayoutPaidData(created.data, created.payout.id, "Havale");
    expect(paid.ok).toBe(true);
    if (paid.ok) {
      expect(paid.payout.status).toBe("paid");
      expect(paid.payout.method).toBe("Havale");
      expect(paid.payout.paidAt).toBeDefined();
      expect(paid.payout.totalAmount).toBe(created.payout.totalAmount);
    }
  });

  it("zaten ödenmiş bir hakediş tekrar işaretlenemez", () => {
    const data = makeData({ lessons: [makeLesson()], teacherFeeRules: [makeFeeRule()] });
    const created = createTeacherPayoutSnapshot(data, "t1", PERIOD_START, PERIOD_END);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const paidOnce = markTeacherPayoutPaidData(created.data, created.payout.id);
    expect(paidOnce.ok).toBe(true);
    if (!paidOnce.ok) return;

    const paidTwice = markTeacherPayoutPaidData(paidOnce.data, created.payout.id);
    expect(paidTwice.ok).toBe(false);
    if (!paidTwice.ok) expect(paidTwice.code).toBe("ALREADY_PAID");
  });

  it("var olmayan hakediş için NOT_FOUND döner", () => {
    const data = makeData();
    const result = markTeacherPayoutPaidData(data, "does-not-exist");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("NOT_FOUND");
  });
});

/**
 * PRODUCT_BACKLOG §3.4 — hakediş / ödeme eşiği. 2 haftalık (14 gün, dahil)
 * bir dönem kullanılır ki "haftalık ortalama" hesabı kesirsiz, tam sayı
 * olsun ve testler okunaklı kalsın.
 */
describe("computeTeacherPayoutPaymentMethodInfo — nakit/havale eşiği", () => {
  const TWO_WEEK_START = "2026-08-01";
  const TWO_WEEK_END = "2026-08-14"; // dahil 14 gün = tam 2 hafta

  function twoWeekLessons(totalMinutes: number): Lesson[] {
    // Tek bir ders olarak modellenir — periyot boyunca dağılımı hesaba
    // katmaz, yalnızca toplam süre önemlidir (bkz. computeTeacherEarningsForPeriod).
    return [
      makeLesson({
        startAt: "2026-08-05T10:00:00+03:00",
        endAt: new Date(new Date("2026-08-05T10:00:00+03:00").getTime() + totalMinutes * 60_000).toISOString(),
      }),
    ];
  }

  it("eşik üstü → nakit", () => {
    const data = makeData({
      teachers: [makeTeacher({ weeklyHoursThreshold: 5 })],
      lessons: twoWeekLessons(840), // 14 saat / 2 hafta = haftalık 7 saat
      teacherFeeRules: [makeFeeRule()],
    });
    const info = computeTeacherPayoutPaymentMethodInfo(data, "t1", TWO_WEEK_START, TWO_WEEK_END);
    expect(info?.weeklyHours).toBe(7);
    expect(info?.defaultMethod).toBe("cash");
  });

  it("eşiğe eşit → havale", () => {
    const data = makeData({
      teachers: [makeTeacher({ weeklyHoursThreshold: 5 })],
      lessons: twoWeekLessons(600), // 10 saat / 2 hafta = haftalık 5 saat
      teacherFeeRules: [makeFeeRule()],
    });
    const info = computeTeacherPayoutPaymentMethodInfo(data, "t1", TWO_WEEK_START, TWO_WEEK_END);
    expect(info?.weeklyHours).toBe(5);
    expect(info?.defaultMethod).toBe("transfer");
  });

  it("eşik altı → havale", () => {
    const data = makeData({
      teachers: [makeTeacher({ weeklyHoursThreshold: 5 })],
      lessons: twoWeekLessons(360), // 6 saat / 2 hafta = haftalık 3 saat
      teacherFeeRules: [makeFeeRule()],
    });
    const info = computeTeacherPayoutPaymentMethodInfo(data, "t1", TWO_WEEK_START, TWO_WEEK_END);
    expect(info?.weeklyHours).toBe(3);
    expect(info?.defaultMethod).toBe("transfer");
  });

  it("weeklyHoursThreshold yoksa yöntem üretilmez", () => {
    const data = makeData({
      teachers: [makeTeacher({ weeklyHoursThreshold: undefined })],
      lessons: twoWeekLessons(840),
      teacherFeeRules: [makeFeeRule()],
    });
    const info = computeTeacherPayoutPaymentMethodInfo(data, "t1", TWO_WEEK_START, TWO_WEEK_END);
    expect(info?.threshold).toBeUndefined();
    expect(info?.defaultMethod).toBeUndefined();
  });

  it("farklı haftalara yayılan (31 günlük) dönemde sabit 4 hafta VARSAYILMAZ — kesirli hafta sayısıyla doğru hesap", () => {
    // 31 gün / 7 = ~4.42857 hafta. 620 dakika (≈10.333 saat) toplam süre,
    // sabit 4 hafta varsayılsaydı 2.583 sa/hafta çıkardı — gerçek (kesirli)
    // hafta sayısıyla farklı (daha düşük) bir değer çıkmalı.
    const data = makeData({
      teachers: [makeTeacher({ weeklyHoursThreshold: 2 })],
      lessons: [
        makeLesson({ startAt: "2026-08-05T10:00:00+03:00", endAt: "2026-08-05T20:20:00+03:00" }), // 620 dk
      ],
      teacherFeeRules: [makeFeeRule()],
    });
    const info = computeTeacherPayoutPaymentMethodInfo(data, "t1", PERIOD_START, PERIOD_END);
    const expectedWeeks = 31 / 7;
    const expectedWeeklyHours = 620 / 60 / expectedWeeks;
    expect(info?.weeklyHours).toBeCloseTo(expectedWeeklyHours, 6);
    // Kaba (yanlış) sabit-4-hafta varsayımından KESİNLİKLE farklı olmalı.
    expect(info?.weeklyHours).not.toBeCloseTo(620 / 60 / 4, 6);
  });

  it("öğretmen bulunamazsa null döner", () => {
    const data = makeData();
    expect(computeTeacherPayoutPaymentMethodInfo(data, "yok", PERIOD_START, PERIOD_END)).toBeNull();
  });

  it("farklı tenant verisi (ayrı AppData) hesaplamaya karışmaz — fonksiyon yalnızca kendi `data` parametresini okur", () => {
    const tenantA = makeData({
      teachers: [makeTeacher({ id: "t1", weeklyHoursThreshold: 5 })],
      lessons: twoWeekLessons(840), // haftalık 7 sa → nakit
      teacherFeeRules: [makeFeeRule({ teacherId: "t1" })],
    });
    const tenantB = makeData({
      teachers: [makeTeacher({ id: "t1", weeklyHoursThreshold: 5 })],
      lessons: twoWeekLessons(360), // aynı teacherId, FARKLI AppData → haftalık 3 sa → havale
      teacherFeeRules: [makeFeeRule({ teacherId: "t1" })],
    });

    const infoA = computeTeacherPayoutPaymentMethodInfo(tenantA, "t1", TWO_WEEK_START, TWO_WEEK_END);
    const infoB = computeTeacherPayoutPaymentMethodInfo(tenantB, "t1", TWO_WEEK_START, TWO_WEEK_END);

    expect(infoA?.defaultMethod).toBe("cash");
    expect(infoB?.defaultMethod).toBe("transfer");
  });
});

describe("createTeacherPayoutSnapshot — ödeme yöntemi ön-doldurma ve yönetici override", () => {
  it("eşik tanımlıysa hakediş oluşturulurken varsayılan yöntem ön-doldurulur", () => {
    const data = makeData({
      teachers: [makeTeacher({ weeklyHoursThreshold: 5 })],
      lessons: [makeLesson({ startAt: "2026-08-05T10:00:00+03:00", endAt: "2026-08-05T20:00:00+03:00" })],
      teacherFeeRules: [makeFeeRule()],
    });
    const created = createTeacherPayoutSnapshot(data, "t1", "2026-08-01", "2026-08-14");
    expect(created.ok).toBe(true);
    if (created.ok) expect(["cash", "transfer"]).toContain(created.payout.method);
  });

  it("yönetici override'ı varsayılanı ezer ve kayıtta korunur", () => {
    const data = makeData({
      // weeklyHours düşük → varsayılan "transfer" olurdu, ama admin "cash" seçiyor.
      teachers: [makeTeacher({ weeklyHoursThreshold: 100 })],
      lessons: [makeLesson({ startAt: "2026-08-05T10:00:00+03:00", endAt: "2026-08-05T11:00:00+03:00" })],
      teacherFeeRules: [makeFeeRule()],
    });
    const created = createTeacherPayoutSnapshot(data, "t1", "2026-08-01", "2026-08-14", new Date(), "cash");
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.payout.method).toBe("cash");

    // Aynı kaydı ödendi işaretlerken method VERİLMEZSE override SİLİNMEZ.
    const paid = markTeacherPayoutPaidData(created.data, created.payout.id);
    expect(paid.ok).toBe(true);
    if (paid.ok) expect(paid.payout.method).toBe("cash");
  });

  it("weeklyHoursThreshold yoksa varsayılan yöntem üretilmez, payout.method undefined kalır", () => {
    const data = makeData({
      teachers: [makeTeacher({ weeklyHoursThreshold: undefined })],
      lessons: [makeLesson({ startAt: "2026-08-05T10:00:00+03:00", endAt: "2026-08-05T11:00:00+03:00" })],
      teacherFeeRules: [makeFeeRule()],
    });
    const created = createTeacherPayoutSnapshot(data, "t1", "2026-08-01", "2026-08-14");
    expect(created.ok).toBe(true);
    if (created.ok) expect(created.payout.method).toBeUndefined();
  });
});

describe("updateTeacherPayoutPaymentMethodData — yönetici override, sonraki hesaplamalarda ezilmez", () => {
  it("mevcut kaydın yöntemini değiştirir, tutar/ders sayısı/statü değişmez", () => {
    const data = makeData({
      teachers: [makeTeacher({ weeklyHoursThreshold: 5 })],
      lessons: [makeLesson({ startAt: "2026-08-05T10:00:00+03:00", endAt: "2026-08-05T11:00:00+03:00" })],
      teacherFeeRules: [makeFeeRule()],
    });
    const created = createTeacherPayoutSnapshot(data, "t1", "2026-08-01", "2026-08-14");
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const overridden = updateTeacherPayoutPaymentMethodData(created.data, created.payout.id, "cash");
    expect(overridden.ok).toBe(true);
    if (!overridden.ok) return;
    expect(overridden.payout.method).toBe("cash");
    expect(overridden.payout.totalAmount).toBe(created.payout.totalAmount);
    expect(overridden.payout.status).toBe(created.payout.status);

    // Override sonrası, ödendi işaretlense bile (method verilmeden) korunur.
    const paid = markTeacherPayoutPaidData(overridden.data, created.payout.id);
    expect(paid.ok).toBe(true);
    if (paid.ok) expect(paid.payout.method).toBe("cash");
  });

  it("var olmayan hakediş için NOT_FOUND döner", () => {
    const data = makeData();
    const result = updateTeacherPayoutPaymentMethodData(data, "does-not-exist", "cash");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("NOT_FOUND");
  });
});

describe("hakediş dönemi kimliği — gün bazında (2026-09-22 Hakediş oluştur hatası)", () => {
  it("DB'den gelen ISO datetime ile formun yyyy-MM-dd değeri aynı dönemdir", () => {
    expect(payoutPeriodDayKey("2026-08-01T00:00:00.000Z")).toBe("2026-08-01");
    expect(payoutPeriodDayKey("2026-08-01")).toBe("2026-08-01");
  });

  it("ISO biçimde kayıtlı mevcut hakediş ikinci kez oluşturulmaz; açık Türkçe mesaj döner", () => {
    const data = makeData({
      lessons: [makeLesson()],
      teacherFeeRules: [makeFeeRule()],
      teacherPayouts: [
        {
          id: "po_existing",
          teacherId: "t1",
          periodStart: "2026-08-01T00:00:00.000Z",
          periodEnd: "2026-08-31T00:00:00.000Z",
          totalMinutes: 30,
          totalAmount: 345,
          status: "pending",
          generatedAt: "2026-09-01T10:00:00.000Z",
        },
      ],
    });
    const again = createTeacherPayoutSnapshot(data, "t1", PERIOD_START, PERIOD_END);
    expect(again.ok).toBe(false);
    if (!again.ok) {
      expect(again.code).toBe("PAYOUT_ALREADY_EXISTS");
      expect(again.message).not.toMatch(/Unique|P2002|constraint/i);
    }
  });

  it("oluşturulan hakediş hızlı ödeme ile ödendi olur", () => {
    const data = makeData({ lessons: [makeLesson()], teacherFeeRules: [makeFeeRule()] });
    const created = createTeacherPayoutSnapshot(data, "t1", PERIOD_START, PERIOD_END);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const paid = markTeacherPayoutPaidData(created.data, created.payout.id, "transfer");
    expect(paid.ok).toBe(true);
    if (paid.ok) {
      expect(paid.payout.status).toBe("paid");
      expect(paid.payout.method).toBe("transfer");
    }
  });
});

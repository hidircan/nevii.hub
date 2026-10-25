/**
 * Ücret kuralı kaldırma etkisi (saf önizleme): politika-bilinçli açık ders
 * sayımı, halef kural before/after, değişmeyecek kayıtlı defter, bekleyen
 * kayıt yeniden hesabı ve tarih-kuralı mesajı.
 */
import { describe, it, expect } from "vitest";
import {
  createTeacherPayoutSnapshot,
  deactivateEffectiveToForRule,
  previewFeeRuleRemovalData,
} from "../teacher-payout";
import type { AppData, Lesson, TeacherFeeRule, TeacherPayout } from "../types";

const BRANCH = "erzene";

function feeOld(): TeacherFeeRule {
  return { id: "fee-old", teacherId: "t1", branchId: BRANCH, instrument: "Piyano", perMinuteRate: 10, effectiveFrom: "2020-01-01", createdAt: "2020-01-01" };
}

function feeNew(): TeacherFeeRule {
  return { id: "fee-new", teacherId: "t1", perMinuteRate: 12, effectiveFrom: "2026-10-01", createdAt: "2026-10-01" };
}

function lesson(id: string, start: string, minutes: number): Lesson {
  const s = new Date(start);
  return {
    id,
    studentId: "s1",
    teacherId: "t1",
    roomId: "r1",
    branchId: BRANCH,
    instrument: "Piyano",
    startAt: s.toISOString(),
    endAt: new Date(s.getTime() + minutes * 60_000).toISOString(),
    type: "regular",
    status: "completed",
    lessonProcessed: true,
  } as Lesson;
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
      lessonDurationMinutes: 50,
      workingHours: { start: "09:00", end: "21:00" },
      workingDays: [1, 2, 3, 4, 5, 6],
      currency: "TRY",
      feeRoundingMode: "exact_minutes",
      branches: [{ id: BRANCH, name: "Erzene", shortName: "Erzene", address: "", phone: "", city: "İzmir" }],
    },
    teachers: [
      { id: "t1", name: "Şevval Öğretmen", email: "", phone: "", branchId: BRANCH, instruments: ["Piyano"], availability: [], maxDailyLessons: 8, active: true },
    ],
    students: [
      { id: "s1", name: "Adel Öğrenci", email: "", phone: "", parentName: "", parentPhone: "", branchId: BRANCH, instruments: ["Piyano"], teacherId: "t1", packageName: "", weeklyLessonCount: 1, monthlyFee: 0, active: true, notes: "", createdAt: "2026-01-01" },
    ],
    rooms: [],
    lessons: [],
    lessonSeries: [],
    attendances: [],
    makeupRequests: [],
    payments: [],
    teacherFeeRules: [feeOld(), feeNew()],
    teacherPayouts: [],
    ...overrides,
  } as AppData;
}

function withOctoberPayout(data: AppData, status: TeacherPayout["status"]): AppData {
  const created = createTeacherPayoutSnapshot(data, "t1", "2026-10-01", "2026-10-31");
  if (!created.ok) throw new Error(created.message);
  const payout: TeacherPayout =
    status === "pending"
      ? created.payout
      : { ...created.payout, status, payments: [{ id: "pay1", amount: created.payout.totalAmount, paidAt: "2026-11-01", createdByUserId: "u1", createdAt: "2026-11-01" }] };
  return { ...data, teacherPayouts: [payout] };
}

describe("previewFeeRuleRemovalData — silme", () => {
  it("bilinmeyen kuralda NOT_FOUND döner", () => {
    const r = previewFeeRuleRemovalData(makeData(), "yok", "delete");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("NOT_FOUND");
  });

  it("açık ders halef kurala düşer: önce/sonra + ay + halef kimliği", () => {
    const data = makeData({ lessons: [lesson("l1", "2026-10-10T10:00:00Z", 40)] });
    const r = previewFeeRuleRemovalData(data, "fee-old", "delete");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.preview.openLessons.total).toBe(1);
    expect(r.preview.openLessons.months).toEqual(["2026-10"]);
    expect(r.preview.openLessons.beforeTotal).toBe(400);
    expect(r.preview.openLessons.afterTotal).toBe(480);
    expect(r.preview.openLessons.withoutRule).toBe(0);
    expect(r.preview.openLessons.rows[0]).toMatchObject({ lessonId: "l1", before: 400, after: 480, successorRuleId: "fee-new" });
    expect(r.preview.confirmRequired).toBe(true);
  });

  it("halef kural yoksa ders 'kural yok' olur (sayımla birlikte)", () => {
    const data = makeData({ lessons: [lesson("l1", "2026-10-10T10:00:00Z", 40)], teacherFeeRules: [feeOld()] });
    const r = previewFeeRuleRemovalData(data, "fee-old", "delete");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.preview.openLessons.withoutRule).toBe(1);
    expect(r.preview.openLessons.afterTotal).toBe(0);
    expect(r.preview.openLessons.rows[0].after).toBeUndefined();
    expect(r.preview.openLessons.rows[0].successorRuleId).toBeUndefined();
  });

  it("sabit-ücret ayındaki ders kurala çözümlense bile sayıma girmez (politika körü değil)", () => {
    const data = makeData({
      lessons: [lesson("l1", "2026-11-10T10:00:00Z", 40)],
      teacherPayoutPolicies: [
        { id: "ppol", month: "2026-11", policy: "fixed_duration", rate30: 300, rate40: 400, rate50: 500, setByUserId: "u1", setAt: "2026-11-01" },
      ],
    });
    const r = previewFeeRuleRemovalData(data, "fee-old", "delete");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.preview.openLessons.total).toBe(0);
    expect(r.preview.confirmRequired).toBe(false);
  });

  it("ödemeli kayıt 'değişmeyecek' listelenir; bekleyen kayıt before/after ile yeniden hesaplanır", () => {
    const nov = makeData({ lessons: [lesson("l1", "2026-10-10T10:00:00Z", 40)] });
    const paid = withOctoberPayout(nov, "paid");
    const r = previewFeeRuleRemovalData(paid, "fee-old", "delete");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Ekim dersi kayda geçti → açık ders yok; ödemeli kayıt değişmez listesinde.
    expect(r.preview.openLessons.total).toBe(0);
    expect(r.preview.recordedUnchanged).toHaveLength(1);
    expect(r.preview.recordedUnchanged[0]).toMatchObject({ status: "paid", totalAmount: 400 });
    expect(r.preview.pendingRecomputed).toHaveLength(0);

    const pending = withOctoberPayout(nov, "pending");
    const r2 = previewFeeRuleRemovalData(pending, "fee-old", "delete");
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.preview.pendingRecomputed).toHaveLength(1);
    expect(r2.preview.pendingRecomputed[0]).toMatchObject({ before: 400, after: 480 });
    expect(r2.preview.recordedUnchanged).toHaveLength(0);
  });

  it("hiç kullanılmayan kuralda onay gerekmez", () => {
    const r = previewFeeRuleRemovalData(makeData(), "fee-old", "delete");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.preview.confirmRequired).toBe(false);
    expect(r.preview.replacementRules.map((x) => x.id)).toEqual(["fee-new"]);
  });
});

describe("previewFeeRuleRemovalData — devre dışı", () => {
  it("yeni bitiş fromDate'in bir öncesidir; önceki dersler aynı kuralda kalır", () => {
    const data = makeData({
      lessons: [lesson("l-early", "2026-10-10T10:00:00Z", 40), lesson("l-late", "2026-12-10T10:00:00Z", 40)],
      teacherFeeRules: [feeOld(), feeNew()],
    });
    const r = previewFeeRuleRemovalData(data, "fee-old", "deactivate", "2026-11-01");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // fee-old yalnız fee-new'dan daha spesifik (şube+enstrüman) Ekim öncesi derslerde kazanır;
    // Kasım sonrası fee-old geçersiz → fee-new.
    expect(r.preview.effectiveTo).toBe("2026-10-31");
    const early = r.preview.openLessons.rows.find((x) => x.lessonId === "l-early")!;
    expect(early).toMatchObject({ before: 400, after: 400, successorRuleId: "fee-old" });
    const late = r.preview.openLessons.rows.find((x) => x.lessonId === "l-late")!;
    expect(late).toMatchObject({ before: 400, after: 480, successorRuleId: "fee-new" });
  });

  it("geçersiz tarihte gerçek neden söylenir (kural değişmez)", () => {
    const eff = deactivateEffectiveToForRule({ effectiveFrom: "2026-10-01" }, "2026-10-01");
    expect(eff.ok).toBe(false);
    if (eff.ok) return;
    expect(eff.message).toContain("2026-10-01");
    expect(eff.message).toContain("Kalıcı sil");
    const r = previewFeeRuleRemovalData(makeData(), "fee-old", "deactivate", "2020-01-01");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("INVALID_DATE");
  });
});

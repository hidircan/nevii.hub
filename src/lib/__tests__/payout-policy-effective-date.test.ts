import { describe, it, expect } from "vitest";
import { resolvePayoutPolicyWithSource, setPayoutPolicyForMonthData } from "../teacher-payout";
import type { AppData, TeacherPayoutPolicyPeriod } from "../types";

const rec = (month: string, extra: Partial<TeacherPayoutPolicyPeriod> = {}): TeacherPayoutPolicyPeriod => ({
  id: `p_${month}`,
  month,
  policy: "fixed_duration",
  rate30: 350,
  rate40: 450,
  rate50: 600,
  setByUserId: "u1",
  setAt: "2026-09-29T10:00:00.000Z",
  ...extra,
});

describe("hakediş politikası — yürürlük tarihli varsayılan (2026-10-04)", () => {
  const data = { teacherPayoutPolicies: [rec("2026-09")] };

  it("seçim yapılmamış yeni ay, en son seçimi (30/40/50) devralır", () => {
    const r = resolvePayoutPolicyWithSource(data, "t1", "2026-10");
    expect(r).toMatchObject({ source: "inherited", fromMonth: "2026-09", terms: { policy: "fixed_duration", rate40: 450 } });
  });

  it("ilk seçimden ÖNCEKİ aylar eski varsayılanda kalır (geçmiş yeniden yorumlanmaz)", () => {
    expect(resolvePayoutPolicyWithSource(data, "t1", "2026-08")).toEqual({ terms: { policy: "per_teacher_rule" }, source: "default" });
  });

  it("açık ay seçimi (öğretmen bazlı ücrete dönüş dahil) devralmayı ezer ve sonraki ayları belirler", () => {
    const d2 = { teacherPayoutPolicies: [rec("2026-09"), rec("2026-11", { policy: "per_teacher_rule", rate30: undefined, rate40: undefined, rate50: undefined })] };
    expect(resolvePayoutPolicyWithSource(d2, "t1", "2026-10").terms.policy).toBe("fixed_duration");
    expect(resolvePayoutPolicyWithSource(d2, "t1", "2026-11").source).toBe("explicit");
    expect(resolvePayoutPolicyWithSource(d2, "t1", "2027-01").terms.policy).toBe("per_teacher_rule");
  });

  it("devralınan politikayı aynen seçmek 'değişiklik' sayılmaz", () => {
    const res = setPayoutPolicyForMonthData({ teacherPayoutPolicies: [rec("2026-09")] } as unknown as AppData, { month: "2026-10", policy: "fixed_duration", rate30: 350, rate40: 450, rate50: 600 }, "u1");
    expect(res.ok && res.changed).toBe(false);
  });
});

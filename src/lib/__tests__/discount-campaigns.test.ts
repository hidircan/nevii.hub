import { describe, expect, it } from "vitest";
import {
  applyPercentDiscount,
  countActiveHouseholdMembers,
  createDiscountCampaignData,
  findApplicableSiblingCampaign,
  previewSiblingDiscount,
  updateDiscountCampaignData,
} from "../discount-campaigns";
import type { AppData, DiscountCampaign, Student } from "../types";

function student(overrides: Partial<Student> & Pick<Student, "id">): Student {
  return {
    name: "Test Öğrenci",
    parentName: "Veli",
    parentPhone: "5550000000",
    instruments: [],
    branchId: "b1" as Student["branchId"],
    active: true,
    ...overrides,
  } as Student;
}

function baseData(): AppData {
  return {
    settings: {} as AppData["settings"],
    teachers: [],
    students: [],
    rooms: [],
    lessons: [],
    lessonSeries: [],
    attendances: [],
    makeupRequests: [],
    payments: [],
    teacherFeeRules: [],
    teacherPayouts: [],
    packages: [],
    discountCampaigns: [],
  };
}

describe("applyPercentDiscount", () => {
  it("yüzdeyi doğru uygular ve tam sayıya yuvarlar", () => {
    expect(applyPercentDiscount(1000, 10)).toBe(900);
    expect(applyPercentDiscount(999, 10)).toBe(899); // round(899.1) = 899
  });

  it("0-100 dışındaki değerleri sınırlar (clamp)", () => {
    expect(applyPercentDiscount(1000, 150)).toBe(0);
    expect(applyPercentDiscount(1000, -10)).toBe(1000);
  });
});

describe("countActiveHouseholdMembers", () => {
  it("aynı veli telefonuna kayıtlı aktif öğrencileri sayar", () => {
    const students = [
      student({ id: "s1", parentPhone: "555" }),
      student({ id: "s2", parentPhone: "555" }),
      student({ id: "s3", parentPhone: "999" }),
    ];
    expect(countActiveHouseholdMembers(students, "s1")).toBe(2);
    expect(countActiveHouseholdMembers(students, "s3")).toBe(1);
  });

  it("pasif öğrencileri saymaz", () => {
    const students = [
      student({ id: "s1", parentPhone: "555" }),
      student({ id: "s2", parentPhone: "555", active: false }),
    ];
    expect(countActiveHouseholdMembers(students, "s1")).toBe(1);
  });

  it("veli telefonu yoksa 1 döner (tek öğrenci varsayımı)", () => {
    const students = [student({ id: "s1", parentPhone: "" })];
    expect(countActiveHouseholdMembers(students, "s1")).toBe(1);
  });
});

const activeCampaign: DiscountCampaign = {
  id: "c1",
  name: "Kardeş Kampanyası",
  kind: "sibling",
  discountPercent: 10,
  active: true,
  stackingRule: "none",
  priority: 0,
  usageCount: 0,
  createdBy: "admin",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("findApplicableSiblingCampaign", () => {
  it("aktif ve tarih aralığında olan kampanyayı bulur", () => {
    expect(findApplicableSiblingCampaign([activeCampaign], undefined)).toEqual(activeCampaign);
  });

  it("pasif kampanyayı döndürmez", () => {
    expect(findApplicableSiblingCampaign([{ ...activeCampaign, active: false }], undefined)).toBeUndefined();
  });

  it("şube kapsamı eşleşmiyorsa döndürmez", () => {
    const scoped = { ...activeCampaign, branchId: "erzene" as DiscountCampaign["branchId"] };
    expect(findApplicableSiblingCampaign([scoped], "evka3")).toBeUndefined();
    expect(findApplicableSiblingCampaign([scoped], "erzene")).toEqual(scoped);
  });

  it("geçerlilik tarihi dışındaysa döndürmez", () => {
    const expired = { ...activeCampaign, validTo: "2020-01-01T00:00:00.000Z" };
    expect(findApplicableSiblingCampaign([expired], undefined)).toBeUndefined();
  });
});

describe("previewSiblingDiscount", () => {
  it("2+ hane üyesi ve aktif kampanya varsa indirimli fiyatı döner", () => {
    const students = [student({ id: "s1", parentPhone: "555" }), student({ id: "s2", parentPhone: "555" })];
    const preview = previewSiblingDiscount(students, "s2", undefined, 1000, [activeCampaign]);
    expect(preview?.discountedPrice).toBe(900);
  });

  it("tek çocuk varsa indirim uygulanmaz (undefined)", () => {
    const students = [student({ id: "s1", parentPhone: "555" })];
    expect(previewSiblingDiscount(students, "s1", undefined, 1000, [activeCampaign])).toBeUndefined();
  });

  it("aktif kampanya yoksa undefined döner", () => {
    const students = [student({ id: "s1", parentPhone: "555" }), student({ id: "s2", parentPhone: "555" })];
    expect(previewSiblingDiscount(students, "s1", undefined, 1000, [])).toBeUndefined();
  });
});

describe("createDiscountCampaignData / updateDiscountCampaignData", () => {
  it("geçerli girdiyle kampanya oluşturur", () => {
    const result = createDiscountCampaignData(baseData(), {
      name: "Kardeş Kampanyası",
      kind: "sibling",
      discountPercent: 10,
      createdBy: "admin",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.discountCampaigns).toHaveLength(1);
      expect(result.campaign.active).toBe(true);
    }
  });

  it("boş isim reddedilir", () => {
    const result = createDiscountCampaignData(baseData(), {
      name: "  ",
      kind: "sibling",
      discountPercent: 10,
      createdBy: "admin",
    });
    expect(result.ok).toBe(false);
  });

  it("0-100 dışı yüzde reddedilir", () => {
    const result = createDiscountCampaignData(baseData(), {
      name: "Test",
      kind: "sibling",
      discountPercent: 150,
      createdBy: "admin",
    });
    expect(result.ok).toBe(false);
  });

  it("var olmayan kampanyayı güncellemeye çalışınca hata döner", () => {
    const result = updateDiscountCampaignData(baseData(), "yok", { active: false });
    expect(result.ok).toBe(false);
  });

  it("aktif/pasif durumu değiştirilebilir", () => {
    const created = createDiscountCampaignData(baseData(), {
      name: "Test",
      kind: "sibling",
      discountPercent: 10,
      createdBy: "admin",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const updated = updateDiscountCampaignData(created.data, created.campaign.id, { active: false });
    expect(updated.ok).toBe(true);
    if (updated.ok) expect(updated.campaign.active).toBe(false);
  });
});

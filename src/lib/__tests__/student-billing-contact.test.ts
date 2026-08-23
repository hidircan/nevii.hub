import { describe, it, expect } from "vitest";
import { resolveStudentBillingContact } from "../student-billing-contact";
import type { Student } from "../types";

function student(overrides: Partial<Student> = {}): Student {
  return {
    id: "s1",
    name: "Ada Yılmaz",
    email: "",
    phone: "05551112233",
    parentName: "Selin Yılmaz",
    parentPhone: "05559998877",
    branchId: "erzene",
    instruments: ["Piyano"],
    teacherId: "t1",
    packageName: "Bireysel Aylık — 4 ders",
    weeklyLessonCount: 1,
    monthlyFee: 3000,
    active: true,
    notes: "",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("resolveStudentBillingContact — legacy PARENT_MANAGED regresyonu (Karma Öğrenci Portalı)", () => {
  it("accountResponsibility hiç belirtilmemişse (eski/legacy kayıt) PARENT_MANAGED gibi davranır — veli muhatap alınır", () => {
    const s = student({ accountResponsibility: undefined });
    const contact = resolveStudentBillingContact(s);
    expect(contact.kind).toBe("guardian");
    expect(contact.name).toBe(s.parentName);
    expect(contact.phone).toBe(s.parentPhone);
  });

  it("accountResponsibility='PARENT_MANAGED' açıkça verilmişse veli muhatap alınır", () => {
    const s = student({ accountResponsibility: "PARENT_MANAGED" });
    const contact = resolveStudentBillingContact(s);
    expect(contact.kind).toBe("guardian");
    expect(contact.phone).toBe(s.parentPhone);
  });

  it("accountResponsibility='SELF_MANAGED' ise öğrencinin kendi bilgisi muhatap alınır", () => {
    const s = student({ accountResponsibility: "SELF_MANAGED", phone: "05550000000" });
    const contact = resolveStudentBillingContact(s);
    expect(contact.kind).toBe("student");
    expect(contact.name).toBe(s.name);
    expect(contact.phone).toBe(s.phone);
  });

  it("PARENT_MANAGED işaretli olsa bile veli iletişim alanları boşsa (migration backfill kaçırdığı bir kayıt) yine de öğrenciye düşer — fail-safe", () => {
    const s = student({ accountResponsibility: "PARENT_MANAGED", parentName: "", parentPhone: "" });
    const contact = resolveStudentBillingContact(s);
    expect(contact.kind).toBe("student");
  });
});

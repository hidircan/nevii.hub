import { describe, it, expect } from "vitest";
import {
  bankForStudentType,
  dueWindowForPaymentMethod,
  isValidDueDay,
  resolveCollectionsIban,
} from "../collections-due";
import { templatePaymentReminder } from "../whatsapp-templates";
import type { Student } from "../types";

describe("due windows", () => {
  it("kredi kartı 1–5", () => {
    const w = dueWindowForPaymentMethod("credit_card");
    expect(w.minDay).toBe(1);
    expect(w.maxDay).toBe(5);
    expect(isValidDueDay("credit_card", 5)).toBe(true);
    expect(isValidDueDay("credit_card", 6)).toBe(false);
  });

  it("nakit/havale en geç 20", () => {
    expect(isValidDueDay("cash", 20)).toBe(true);
    expect(isValidDueDay("transfer", 21)).toBe(false);
  });
});

describe("IBAN bank selection", () => {
  it("MEB → VakıfBank, diğer → Halkbank", () => {
    expect(bankForStudentType(["MEB"])).toBe("vakifbank");
    expect(bankForStudentType(["Hobi"])).toBe("halkbank");
    const r = resolveCollectionsIban(["MEB"], {
      vakifbankIban: "TR00VAKIF",
      halkbankIban: "TR00HALK",
    });
    expect(r.bankLabel).toBe("VakıfBank");
    expect(r.iban).toBe("TR00VAKIF");
  });

  it("MEB olmayan öğrenci Halkbank IBAN'ını alır", () => {
    const r = resolveCollectionsIban(["Hobi"], {
      vakifbankIban: "TR00VAKIF",
      halkbankIban: "TR00HALK",
    });
    expect(r.bankLabel).toBe("Halkbank");
    expect(r.iban).toBe("TR00HALK");
  });

  it("Faz 1B — MEB + başka bir tür birlikte atanmışsa MEB kuralı kazanır (VakıfBank)", () => {
    expect(bankForStudentType(["Hobi", "MEB"])).toBe("vakifbank");
    const r = resolveCollectionsIban(["London College of Music Hazırlık", "MEB"], {
      vakifbankIban: "TR00VAKIF",
      halkbankIban: "TR00HALK",
    });
    expect(r.bankLabel).toBe("VakıfBank");
  });

  it("hiç tür atanmamışsa (boş dizi) Halkbank varsayılanına düşer", () => {
    expect(bankForStudentType([])).toBe("halkbank");
  });
});

function makeStudent(overrides: Partial<Student> = {}): Student {
  return {
    id: "s1",
    name: "Test Öğrenci",
    email: "",
    phone: "05551112233",
    parentName: "Veli",
    parentPhone: "05551112233",
    branchId: "b1",
    instruments: ["Piyano"],
    teacherId: "t1",
    packageName: "Standart",
    weeklyLessonCount: 1,
    monthlyFee: 1000,
    active: true,
    notes: "",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("payment reminder IBAN inclusion", () => {
  it("IBAN yoksa eski ödeme-teyit metnini üretmeye devam eder", () => {
    const msg = templatePaymentReminder("Okul", makeStudent(), 1000, "2026-09-01");
    expect(msg.body).not.toContain("IBAN:");
    expect(msg.body).toContain("Ödeme bilgisini okuldan teyit edebilirsiniz.");
  });

  it("IBAN varsa banka ve IBAN metne eklenir", () => {
    const msg = templatePaymentReminder("Okul", makeStudent(), 1000, "2026-09-01", {
      bankLabel: "VakıfBank",
      iban: "TR000000000000000000000000",
    });
    expect(msg.body).toContain("Banka: VakıfBank");
    expect(msg.body).toContain("IBAN: TR000000000000000000000000");
  });
});

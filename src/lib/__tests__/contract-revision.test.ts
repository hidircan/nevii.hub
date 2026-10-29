import { describe, it, expect } from "vitest";
import {
  diffContractRevision,
  previousContractUsesPerLessonBilling,
  type RevisionComparable,
} from "../contract-revision";

const BASE: RevisionComparable = {
  programmeName: "Piyano",
  monthlyAmount: 3000,
  durationMonths: 3,
  installmentCount: 3,
  enrollmentStartDate: "2026-09-01T00:00:00.000Z",
  enrollmentEndDate: "2026-11-30T00:00:00.000Z",
  firstDueDate: "2026-09-01",
  paymentMethod: "cash",
  depositAmount: "",
  lessonScheduleText: "Salı 15:00",
  signatoryFullName: "Selin Arslan",
};

describe("diffContractRevision", () => {
  it("hiç değişiklik yoksa boş döner (ISO + date-only karışımı aynı gün sayılır)", () => {
    // Başlangıç ISO, bitiş/vade date-only yazılsa da aynı günler → fark yok.
    expect(diffContractRevision(BASE, { ...BASE, firstDueDate: "2026-09-01T00:00:00.000Z" })).toEqual([]);
  });

  it("ücret değişikliğini eski → yeni olarak raporlar", () => {
    const diff = diffContractRevision(BASE, { ...BASE, monthlyAmount: 3500 });
    expect(diff).toHaveLength(1);
    expect(diff[0]).toMatchObject({ key: "monthlyAmount", label: "Aylık ücret" });
    expect(diff[0]!.before).toContain("3.000");
    expect(diff[0]!.after).toContain("3.500");
  });

  it("birden çok alanı sabit sırada raporlar", () => {
    const diff = diffContractRevision(BASE, {
      ...BASE,
      programmeName: "Keman",
      durationMonths: 6,
      enrollmentEndDate: "2027-02-28",
      paymentMethod: "credit_card",
    });
    expect(diff.map((d) => d.key)).toEqual([
      "programmeName",
      "durationMonths",
      "enrollmentEndDate",
      "paymentMethod",
    ]);
    expect(diff[3]).toMatchObject({ before: "Nakit", after: "Kredi Kartı" });
  });

  it("boş/undefined metinler '—' olarak normalize edilir, boşluk farkı sayılmaz", () => {
    const diff = diffContractRevision(
      { ...BASE, lessonScheduleText: undefined },
      { ...BASE, lessonScheduleText: "  " }
    );
    expect(diff).toEqual([]);
  });

  it("kaparo eklenmesi fark sayılır", () => {
    const diff = diffContractRevision(BASE, { ...BASE, depositAmount: 1000 });
    expect(diff).toHaveLength(1);
    expect(diff[0]).toMatchObject({ key: "depositAmount", before: "—" });
    expect(diff[0]!.after).toContain("1.000");
  });

  it("tarihler Türkçe okunabilir biçimde gösterilir", () => {
    const diff = diffContractRevision(BASE, { ...BASE, enrollmentStartDate: "2026-10-01" });
    expect(diff).toHaveLength(1);
    expect(diff[0]!.before).toContain("2026");
    expect(diff[0]!.after).toContain("2026");
    expect(diff[0]!.before).not.toBe(diff[0]!.after);
  });

  it("rıza ve KVKK değişiklikleri de fark sayılır", () => {
    const diff = diffContractRevision(
      { ...BASE, photoVideoConsent: "unset", kvkkNoticeDelivered: false },
      { ...BASE, photoVideoConsent: "granted", kvkkNoticeDelivered: true }
    );
    expect(diff.map((d) => d.key)).toEqual(["photoVideoConsent", "kvkkNoticeDelivered"]);
    expect(diff[0]).toMatchObject({ before: "Belirtilmedi", after: "İzin verildi" });
  });
});

describe("previousContractUsesPerLessonBilling", () => {
  it("kind'lı satır varsa ders-başı motoru", () => {
    expect(
      previousContractUsesPerLessonBilling({ installments: [{ kind: "period_fee" }, {}] })
    ).toBe(true);
  });

  it("snapshot yoksa veya kindsiz satırlarsa sabit motor", () => {
    expect(previousContractUsesPerLessonBilling(undefined)).toBe(false);
    expect(previousContractUsesPerLessonBilling({ installments: [{}, {}] })).toBe(false);
    expect(previousContractUsesPerLessonBilling({ installments: [] })).toBe(false);
  });
});

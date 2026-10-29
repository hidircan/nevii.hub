import { describe, expect, it } from "vitest";
import { diffRecordFields, readAuditChanges } from "@/lib/audit/humanize";
import { photoConsentLabel } from "@/lib/student-consent-labels";

describe("audit diff — yalnız gerçekten değişen alan", () => {
  it("formun tüm bölümü gönderilse de yalnız ad değişince yalnız `name` yazılır", () => {
    const before = {
      id: "s1",
      name: "Ada Yılmaz",
      parentName: "Ayşe Yılmaz",
      phone: undefined,
      enrollmentStartDate: "2026-01-05T00:00:00.000Z",
      communicationOptOut: undefined,
      studentTypes: ["Bireysel"],
      paymentDueDay: 5,
      guardian: { phone: "5550000000", name: "Ayşe" },
    };
    const patch = {
      name: "Ada Demir",
      parentName: "Ayşe Yılmaz",
      phone: "",
      enrollmentStartDate: "2026-01-05",
      communicationOptOut: false,
      studentTypes: ["Bireysel"],
      paymentDueDay: "5",
      guardian: { name: "Ayşe", phone: "5550000000" },
    };
    expect(diffRecordFields(before, patch)).toEqual([{ field: "name", from: "Ada Yılmaz", to: "Ada Demir" }]);
  });

  it("eski satırlardaki sahte değişiklikler ekranda gösterilmez", () => {
    const meta = {
      changes: [
        { field: "name", from: "A", to: "B" },
        { field: "phone", from: null, to: "" },
        { field: "birthDate", from: "2010-05-01T00:00:00.000Z", to: "2010-05-01" },
      ],
    };
    expect(readAuditChanges(meta).map((c) => c.field)).toEqual(["name"]);
  });
});

describe("öğrenci listesi fotoğraf izni etiketi", () => {
  it("sözleşme formunun kanal kapsamlarıyla verilen izin 'Veriyor' sayılır", () => {
    expect(photoConsentLabel({ status: "granted", scopes: ["website", "instagram"] })).toBe("Veriyor");
    expect(photoConsentLabel({ status: "granted", scopes: ["photo"] })).toBe("Veriyor");
    expect(photoConsentLabel({ status: "granted", scopes: ["name"] })).toBe("Vermiyor");
    expect(photoConsentLabel({ status: "denied", scopes: [] })).toBe("Vermiyor");
    expect(photoConsentLabel({ status: "withdrawn", scopes: [] })).toBe("Vermiyor");
    expect(photoConsentLabel(undefined)).toBe("Kayıt yok");
  });
});

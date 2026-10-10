/** UAT 2026-09-24 (D) — sözleşme formu taslağı: yalnız değişen alanlar, bellekte, temizlenebilir. */
import { describe, it, expect } from "vitest";
import { clearContractDraft, hasContractDraft, readContractDraftField, writeContractDraftField } from "../contract-draft";

describe("contract draft (bellek içi)", () => {
  it("ön-doldurmadan farklı girilen alan saklanır, geri alınınca silinir", () => {
    const key = "stu1:initial";
    writeContractDraftField(key, "monthlyAmount", 6000, 5000);
    expect(readContractDraftField(key, "monthlyAmount")).toEqual({ found: true, value: 6000 });
    writeContractDraftField(key, "monthlyAmount", 5000, 5000);
    expect(readContractDraftField(key, "monthlyAmount").found).toBe(false);
    expect(hasContractDraft(key)).toBe(false);
  });

  it("dokunulmamış alan saklanmaz — kayıt düzeltilince taze ön-doldurma kullanılır", () => {
    writeContractDraftField("stu2:initial", "programmeName", "Piyano", "Piyano");
    expect(hasContractDraft("stu2:initial")).toBe(false);
  });

  it("başarılı oluşturma/Vazgeç sonrası temizlenir; öğrenciler arası karışmaz", () => {
    writeContractDraftField("a:initial", "signatoryNationalId", "10000000146", "");
    writeContractDraftField("b:initial", "overlapReason", "x", "");
    clearContractDraft("a:initial");
    expect(hasContractDraft("a:initial")).toBe(false);
    expect(hasContractDraft("b:initial")).toBe(true);
  });
});

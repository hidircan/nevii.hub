import { describe, it, expect } from "vitest";
import { ALL_KURUMLAR, pickInstitutionSelection, scopeFromSelection } from "../institution/scope";
import type { KurumSummary } from "../institution/scope";

const ONE: KurumSummary[] = [{ tenantId: "tenant_a", name: "A Akademi" }];
const TWO: KurumSummary[] = [
  { tenantId: "tenant_a", name: "A Akademi" },
  { tenantId: "tenant_b", name: "B Akademi" },
];

describe("pickInstitutionSelection — kurum varsayılanı", () => {
  it("kurum müdürü (SCHOOL_ADMIN) tercih yokken kendi kurumunu görür", () => {
    expect(pickInstitutionSelection("SCHOOL_ADMIN", "tenant_a", ONE, undefined)).toBe("tenant_a");
  });

  it("kurum sahibi (SUPER_ADMIN) tercih yokken kendi kurumunu görür", () => {
    expect(pickInstitutionSelection("SUPER_ADMIN", "tenant_a", TWO, undefined)).toBe("tenant_a");
  });

  it("platform yöneticisi (HYPER_ADMIN) tercih yokken 'Tüm kurumlar' görür", () => {
    expect(pickInstitutionSelection("HYPER_ADMIN", "tenant_platform", TWO, undefined)).toBe(ALL_KURUMLAR);
  });

  it("öğretmen/veli rolleri de varsayılan olarak kendi kurumunu görür", () => {
    expect(pickInstitutionSelection("TEACHER", "tenant_a", ONE, undefined)).toBe("tenant_a");
    expect(pickInstitutionSelection("STUDENT", "tenant_a", ONE, undefined)).toBe("tenant_a");
  });
});

describe("pickInstitutionSelection — kurum değiştirici (kayıtlı tercih)", () => {
  it("kurum sahibi erişebildiği listede başka bir kuruma geçebilir (liste zaten süzülmüştür)", () => {
    expect(pickInstitutionSelection("SUPER_ADMIN", "tenant_a", TWO, "tenant_b")).toBe("tenant_b");
  });

  it("kurum sahibi 'Tüm kurumlar'ı seçemez", () => {
    expect(pickInstitutionSelection("SUPER_ADMIN", "tenant_a", TWO, ALL_KURUMLAR)).toBe("tenant_a");
  });

  it("kurum müdürü 'Tüm kurumlar' isteyemez — geçersiz sayılır, varsayılana döner", () => {
    expect(pickInstitutionSelection("SCHOOL_ADMIN", "tenant_a", ONE, ALL_KURUMLAR)).toBe("tenant_a");
  });

  it("erişilemeyen bir kurum id'si istenirse sessizce varsayılana döner", () => {
    expect(pickInstitutionSelection("SUPER_ADMIN", "tenant_a", ONE, "tenant_z")).toBe("tenant_a");
    expect(pickInstitutionSelection("SCHOOL_ADMIN", "tenant_a", ONE, "tenant_z")).toBe("tenant_a");
  });
});

describe("pickInstitutionSelection — filtre tercihinin korunması", () => {
  it("geçerli bir tercih (kendi kurumu) ekranlar arası aynen korunur", () => {
    const first = pickInstitutionSelection("SUPER_ADMIN", "tenant_a", TWO, "tenant_b");
    const second = pickInstitutionSelection("SUPER_ADMIN", "tenant_a", TWO, first);
    expect(second).toBe("tenant_b");
  });

  it("'Tüm kurumlar' tercihi SUPER_ADMIN için yok sayılır, kendi kurumuna düşer", () => {
    const first = pickInstitutionSelection("SUPER_ADMIN", "tenant_a", TWO, ALL_KURUMLAR);
    const second = pickInstitutionSelection("SUPER_ADMIN", "tenant_a", TWO, first);
    expect(second).toBe("tenant_a");
  });
});

describe("scopeFromSelection", () => {
  it("tek kurum seçiliyse 'single' kapsam döner", () => {
    expect(scopeFromSelection("tenant_a", TWO)).toEqual({ mode: "single", tenantId: "tenant_a" });
  });

  it("'Tüm kurumlar' seçiliyse mevcut tüm kurum id'lerini içeren 'all' kapsam döner", () => {
    expect(scopeFromSelection(ALL_KURUMLAR, TWO)).toEqual({
      mode: "all",
      tenantIds: ["tenant_a", "tenant_b"],
    });
  });

  it("tek kurumlu ortamda 'Tüm kurumlar' o tek kurumla aynı sonucu verir", () => {
    expect(scopeFromSelection(ALL_KURUMLAR, ONE)).toEqual({ mode: "all", tenantIds: ["tenant_a"] });
  });
});

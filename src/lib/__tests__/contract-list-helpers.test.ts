import { describe, it, expect } from "vitest";
import { findLatestActiveContractForRenewal } from "../contract-list-helpers";

describe("findLatestActiveContractForRenewal — Faz 5 kök neden regresyonu", () => {
  it("tüm sözleşmeler iptal/yenilenmişse null döner (İPTAL EDİLMİŞ bir sözleşmeyi ASLA 'önceki sözleşme' olarak seçmez)", () => {
    const contracts = [
      { id: "c2", status: "cancelled" },
      { id: "c1", status: "superseded" },
    ];
    expect(findLatestActiveContractForRenewal(contracts)).toBeNull();
  });

  it("aktif bir sözleşme varsa onu döner (durum sırası önemli değil)", () => {
    const contracts = [
      { id: "c3", status: "cancelled" },
      { id: "c2", status: "generated" },
      { id: "c1", status: "superseded" },
    ];
    expect(findLatestActiveContractForRenewal(contracts)!.id).toBe("c2");
  });

  it("boş listede null döner", () => {
    expect(findLatestActiveContractForRenewal([])).toBeNull();
  });

  it("recorded (tanışma) durumundaki sözleşme aktif sayılır, yenileme için uygun kalır", () => {
    const contracts = [{ id: "c1", status: "recorded" }];
    expect(findLatestActiveContractForRenewal(contracts)!.id).toBe("c1");
  });
});

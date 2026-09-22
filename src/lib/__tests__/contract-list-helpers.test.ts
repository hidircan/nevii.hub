import { describe, it, expect } from "vitest";
import {
  findLatestActiveContractForRenewal,
  isTerminalContractStatus,
  selectCurrentContract,
  sortContractsForDisplay,
} from "../contract-list-helpers";

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

describe("selectCurrentContract — iptal sonrası güncel sözleşme", () => {
  it("A iptal, B oluşturulunca B günceldir; A asla güncel değildir", () => {
    const contracts = [
      { id: "A", status: "cancelled", versionNumber: 1, createdAt: "2026-09-01T10:00:00.000Z" },
      { id: "B", status: "generated", versionNumber: 2, createdAt: "2026-09-02T10:00:00.000Z" },
    ];
    expect(selectCurrentContract(contracts)!.id).toBe("B");
    expect(isTerminalContractStatus("cancelled")).toBe(true);
    const ordered = sortContractsForDisplay(contracts);
    expect(ordered.map((c) => c.id)).toEqual(["B", "A"]);
    expect(ordered[0]!.status).toBe("generated");
    expect(ordered[1]!.status).toBe("cancelled");
  });

  it("aynı versionNumber=1 iken (eski veri) en yeni createdAt ve aktif olan günceldir", () => {
    const contracts = [
      { id: "A", status: "cancelled", versionNumber: 1, createdAt: "2026-09-01T10:00:00.000Z" },
      { id: "B", status: "generated", versionNumber: 1, createdAt: "2026-09-02T10:00:00.000Z" },
    ];
    expect(selectCurrentContract(contracts)!.id).toBe("B");
  });

  it("iptal edilmiş tek sözleşme güncel sayılmaz", () => {
    expect(selectCurrentContract([{ id: "A", status: "cancelled", versionNumber: 1 }])).toBeNull();
  });

  it("yazdırılmış/imzalanmış güncel sözleşme hâlâ günceldir (iptal edilebilir)", () => {
    const contracts = [
      { id: "old", status: "superseded", versionNumber: 1, createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "live", status: "signed", versionNumber: 2, createdAt: "2026-06-01T00:00:00.000Z" },
    ];
    expect(selectCurrentContract(contracts)!.id).toBe("live");
    expect(isTerminalContractStatus("signed")).toBe(false);
  });
});

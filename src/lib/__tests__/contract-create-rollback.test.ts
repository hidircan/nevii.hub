import { describe, it, expect, beforeEach, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

beforeEach(async () => {
  vi.resetModules();
  const { STUDENT_CONTRACTS_FILE } = await import("../contracts");
  const { DOCUMENT_TEMPLATES_FILE, DOCUMENT_INSTANCES_FILE } = await import("../documents");
  await fs.rm(DATA_FILE, { force: true });
  await fs.rm(STUDENT_CONTRACTS_FILE, { force: true });
  await fs.rm(DOCUMENT_TEMPLATES_FILE, { force: true });
  await fs.rm(DOCUMENT_INSTANCES_FILE, { force: true });
});

describe("sözleşme oluşturma — başarısız işlem yarım sözleşme bırakmaz (2026-10-04)", () => {
  it("taksit yazımı hata verirse sözleşme satırı ve bu işlemde alınan ilk tahsilat geri alınır", async () => {
    vi.doMock("../store", async (importOriginal) => {
      const original = await importOriginal<typeof import("../store")>();
      return {
        ...original,
        addContractInstallments: async () => {
          throw new Error("simüle edilmiş yazma hatası");
        },
      };
    });
    const { createStudentContractTool } = await import("../services/tools");
    const { listContractsForStudent } = await import("../contracts");
    const { DEFAULT_TENANT_ID } = await import("../auth/config");
    const { readData } = await import("../store-json");
    const before = (await readData()).payments.filter((p) => p.studentId === "s1").length;

    const res = await createStudentContractTool(
      { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web" },
      {
        studentId: "s1",
        contractType: "initial",
        programmeName: "Piyano",
        enrollmentStartDate: "2026-09-01T00:00:00.000Z",
        enrollmentEndDate: "2026-12-01T00:00:00.000Z",
        durationMonths: 3,
        monthlyAmount: 3000,
        installmentCount: 3,
        firstDueDate: "2026-09-01T00:00:00.000Z",
        signatoryFullName: "Veli",
        signatoryRelationship: "veli",
        // Kayıtta ilk tahsilat yok → bu işlem kendi ilk tahsilatını yazar; hata sonrası o da kalmamalı.
        firstPaymentCollected: { method: "cash", amount: 3000, collectedAt: "2026-09-01T00:00:00.000Z" },
      }
    );
    expect(res.ok).toBe(false);
    expect(await listContractsForStudent(DEFAULT_TENANT_ID, "s1")).toHaveLength(0);
    expect((await readData()).payments.filter((p) => p.studentId === "s1")).toHaveLength(before);
    vi.doUnmock("../store");
  });
});

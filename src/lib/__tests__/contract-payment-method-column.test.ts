import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import {
  createStudentContractTool,
  getContractHtmlTool,
} from "../services/tools";
import { buildInstallmentSchedule } from "../contracts";
import { DOCUMENT_TEMPLATES_FILE, DOCUMENT_INSTANCES_FILE } from "../documents";
import { STUDENT_CONTRACTS_FILE } from "../contracts";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import { STUDENT_PORTAL_ACCESS_FILE } from "../student-portal-access";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

function adminCtx(overrides?: Partial<ServiceContext>): ServiceContext {
  return { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web", ...overrides };
}

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
  await fs.rm(STUDENT_CONTRACTS_FILE, { force: true });
  await fs.rm(DOCUMENT_TEMPLATES_FILE, { force: true });
  await fs.rm(DOCUMENT_INSTANCES_FILE, { force: true });
  await fs.rm(STUDENT_PORTAL_ACCESS_FILE, { force: true });
});

async function seedRegistrationFirstPayment(studentId: string, method: string, amount: number, collectedAt: string) {
  const { addRegistrationFirstPayment } = await import("../store-json");
  await addRegistrationFirstPayment({ studentId, method, amount, collectedAt, receivedByUserId: "u1" });
}

describe("Sözleşme ödeme planı — 'Ödeme Türü' sütunu (P0 revizyonu)", () => {
  it("1. satırda GERÇEK ilk tahsilatın yöntemi, ödenmemiş satırlarda '—' (uydurma yok)", async () => {
    const durationMonths = 3;
    const monthlyAmount = 3000;
    const installmentCount = 3;
    const firstDueDate = "2026-09-01T00:00:00.000Z";
    const firstAmount = buildInstallmentSchedule({
      totalContractAmount: durationMonths * monthlyAmount,
      installmentCount,
      firstDueDate,
    })[0]!.amount;
    // Kayıt anında Havale/EFT ile tahsil edildi (ders başlangıcından bağımsız gün).
    await seedRegistrationFirstPayment("s1", "transfer", firstAmount, "2026-08-28T00:00:00.000Z");

    const res = await createStudentContractTool(adminCtx(), {
      studentId: "s1",
      contractType: "initial",
      programmeName: "Piyano",
      enrollmentStartDate: "2026-09-01T00:00:00.000Z",
      enrollmentEndDate: "2026-12-01T00:00:00.000Z",
      durationMonths,
      monthlyAmount,
      installmentCount,
      firstDueDate,
      signatoryFullName: "Selin Arslan",
      signatoryRelationship: "veli",
      firstPaymentCollected: { method: "transfer", amount: firstAmount, collectedAt: "2026-08-28T00:00:00.000Z" },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const html = await getContractHtmlTool(adminCtx(), { contractId: res.data.contract.id });
    expect(html.ok).toBe(true);
    if (!html.ok) return;
    // Yeni sütun başlığı + 1. satırda gerçek yöntem.
    expect(html.data.html).toContain("Ödeme Türü");
    expect(html.data.html).toContain("Havale / EFT");
    // Ödenmemiş 2./3. satırda yöntem uydurulmadı.
    expect(html.data.html).not.toContain("{{taksit");
  });

  it("nakit ilk tahsilat 'Nakit' olarak görünür", async () => {
    const firstAmount = buildInstallmentSchedule({
      totalContractAmount: 9000,
      installmentCount: 3,
      firstDueDate: "2026-09-01T00:00:00.000Z",
    })[0]!.amount;
    await seedRegistrationFirstPayment("s1", "cash", firstAmount, "2026-09-01T00:00:00.000Z");

    const res = await createStudentContractTool(adminCtx(), {
      studentId: "s1",
      contractType: "initial",
      programmeName: "Piyano",
      enrollmentStartDate: "2026-09-01T00:00:00.000Z",
      enrollmentEndDate: "2026-12-01T00:00:00.000Z",
      durationMonths: 3,
      monthlyAmount: 3000,
      installmentCount: 3,
      firstDueDate: "2026-09-01T00:00:00.000Z",
      signatoryFullName: "Selin Arslan",
      signatoryRelationship: "veli",
      firstPaymentCollected: { method: "cash", amount: firstAmount, collectedAt: "2026-09-01T00:00:00.000Z" },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const html = await getContractHtmlTool(adminCtx(), { contractId: res.data.contract.id });
    expect(html.ok).toBe(true);
    if (!html.ok) return;
    expect(html.data.html).toContain("Nakit");
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import {
  createStaffMemberTool,
  createPayrollRecordTool,
  updatePayrollStatusTool,
  listPayrollTool,
  createLeaveRequestTool,
  decideLeaveRequestTool,
  listLeaveTool,
  createExpenseTool,
  getFinanceSummaryTool,
} from "../services/tools";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import { STAFF_FILE } from "../staff";
import { PAYROLL_FILE } from "../payroll";
import { LEAVE_FILE } from "../leave";
import { EXPENSE_FILE } from "../expense";

function ctx(overrides?: Partial<ServiceContext>): ServiceContext {
  return { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web", ...overrides };
}

beforeEach(async () => {
  await fs.rm(STAFF_FILE, { force: true });
  await fs.rm(PAYROLL_FILE, { force: true });
  await fs.rm(LEAVE_FILE, { force: true });
  await fs.rm(EXPENSE_FILE, { force: true });
});

async function createStaff() {
  const res = await createStaffMemberTool(ctx(), { name: "Ayşe Yılmaz", position: "Muhasebe" });
  if (!res.ok) throw new Error(res.error.message);
  return res.data.staffId;
}

const thisMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
const today = new Date().toISOString().slice(0, 10);

describe("İş 3B — Bordro RBAC + statü akışı", () => {
  it("TEACHER bordro göremez/oluşturamaz", async () => {
    const staffId = await createStaff();
    const list = await listPayrollTool(ctx({ role: "TEACHER" }), {});
    expect(list.ok).toBe(false);
    const create = await createPayrollRecordTool(ctx({ role: "TEACHER" }), {
      staffId,
      month: thisMonth,
      grossAmount: 30000,
      netAmount: 25000,
    });
    expect(create.ok).toBe(false);
  });

  it("aynı personel+ay için ikinci bordro kaydı reddedilir (duplicate)", async () => {
    const staffId = await createStaff();
    const first = await createPayrollRecordTool(ctx(), { staffId, month: thisMonth, grossAmount: 30000, netAmount: 25000 });
    expect(first.ok).toBe(true);
    const second = await createPayrollRecordTool(ctx(), { staffId, month: thisMonth, grossAmount: 30000, netAmount: 25000 });
    expect(second.ok).toBe(false);
  });

  it("statü yalnızca sırayla ilerleyebilir — draft'tan doğrudan paid'e atlanamaz", async () => {
    const staffId = await createStaff();
    const created = await createPayrollRecordTool(ctx(), { staffId, month: thisMonth, grossAmount: 30000, netAmount: 25000 });
    if (!created.ok) throw new Error();
    const jump = await updatePayrollStatusTool(ctx(), { payrollId: created.data.payrollId, status: "paid" });
    expect(jump.ok).toBe(false);
    const step1 = await updatePayrollStatusTool(ctx(), { payrollId: created.data.payrollId, status: "pending_approval" });
    expect(step1.ok).toBe(true);
    const step2 = await updatePayrollStatusTool(ctx(), { payrollId: created.data.payrollId, status: "approved" });
    expect(step2.ok).toBe(true);
    const step3 = await updatePayrollStatusTool(ctx(), { payrollId: created.data.payrollId, status: "paid" });
    expect(step3.ok).toBe(true);
  });
});

describe("İş 3C — İzin RBAC + onay akışı", () => {
  it("bir izin talebi yalnızca bir kez karara bağlanabilir", async () => {
    const staffId = await createStaff();
    const created = await createLeaveRequestTool(ctx(), {
      staffId,
      type: "annual",
      startDate: today,
      endDate: today,
    });
    if (!created.ok) throw new Error();
    const first = await decideLeaveRequestTool(ctx(), { leaveId: created.data.leaveId, status: "approved" });
    expect(first.ok).toBe(true);
    const second = await decideLeaveRequestTool(ctx(), { leaveId: created.data.leaveId, status: "rejected" });
    expect(second.ok).toBe(false);
  });

  it("TEACHER izin listesine/onayına erişemez", async () => {
    const res = await listLeaveTool(ctx({ role: "TEACHER" }), {});
    expect(res.ok).toBe(false);
  });
});

describe("İş 3D — Gider + Finans Özeti RBAC ve veri eksikliği uyarısı", () => {
  it("TEACHER finans özetine erişemez", async () => {
    const res = await getFinanceSummaryTool(ctx({ role: "TEACHER" }), {});
    expect(res.ok).toBe(false);
  });

  it("hiç gider girilmemişse expenseDataIncomplete=true döner (sahte toplam üretilmez)", async () => {
    const res = await getFinanceSummaryTool(ctx(), {});
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.expenseDataIncomplete).toBe(true);
  });

  it("gider eklenince finans özetinde toplam gidere yansır", async () => {
    const expense = await createExpenseTool(ctx(), { category: "rent", amount: 15000, date: today });
    expect(expense.ok).toBe(true);
    const res = await getFinanceSummaryTool(ctx(), {});
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.expenseDataIncomplete).toBe(false);
    expect(res.data.totalExpenseThisMonth).toBeGreaterThanOrEqual(15000);
  });

  it("ödenmiş bordro finans özetindeki personel maliyetine ve gidere yansır", async () => {
    const staffId = await createStaff();
    const created = await createPayrollRecordTool(ctx(), { staffId, month: thisMonth, grossAmount: 30000, netAmount: 25000 });
    if (!created.ok) throw new Error();
    await updatePayrollStatusTool(ctx(), { payrollId: created.data.payrollId, status: "pending_approval" });
    await updatePayrollStatusTool(ctx(), { payrollId: created.data.payrollId, status: "approved" });
    await updatePayrollStatusTool(ctx(), { payrollId: created.data.payrollId, status: "paid" });

    const res = await getFinanceSummaryTool(ctx(), {});
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.payrollPaidThisMonth).toBe(25000);
    expect(res.data.totalExpenseThisMonth).toBeGreaterThanOrEqual(25000);
  });
});

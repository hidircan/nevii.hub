import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { computeTeacherPayoutTool, createTeacherPayoutTool, updateTeacherPayoutPaymentMethodTool } from "../services/tools";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

function ctx(overrides?: Partial<ServiceContext>): ServiceContext {
  return {
    role: "SCHOOL_ADMIN",
    userId: "user_admin",
    tenantId: DEFAULT_TENANT_ID,
    channel: "web",
    ...overrides,
  };
}

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
});

const PERIOD_START = "2026-08-01";
const PERIOD_END = "2026-08-14";

/**
 * Bootstrap öğretmen "t1" (seed) üzerinden — burada dersler önemli değil,
 * 0 derslik bir hakediş bile geçerlidir (canCreatePayout: missingFeeRuleLessonIds
 * boşsa true) — yalnızca RBAC/override kalıcılığı doğrulanır.
 */
describe("Hakediş ödeme yöntemi araçları — RBAC ve override kalıcılığı", () => {
  it("SCHOOL_ADMIN olmayan bir rol ödeme yöntemini değiştiremez (FORBIDDEN)", async () => {
    const created = await createTeacherPayoutTool(ctx(), { teacherId: "t1", periodStart: PERIOD_START, periodEnd: PERIOD_END });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const asTeacher = await updateTeacherPayoutPaymentMethodTool(ctx({ role: "TEACHER", teacherId: "t1" }), {
      payoutId: created.data.payout.id,
      method: "cash",
    });
    expect(asTeacher.ok).toBe(false);
    if (!asTeacher.ok) expect(asTeacher.error.code).toBe("FORBIDDEN");
  });

  it("SCHOOL_ADMIN override'ı kaydeder ve sonraki computeTeacherPayoutTool çağrısı bunu EZMEZ", async () => {
    const created = await createTeacherPayoutTool(ctx(), { teacherId: "t1", periodStart: PERIOD_START, periodEnd: PERIOD_END });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const overridden = await updateTeacherPayoutPaymentMethodTool(ctx(), {
      payoutId: created.data.payout.id,
      method: "cash",
    });
    expect(overridden.ok).toBe(true);
    if (!overridden.ok) return;
    expect(overridden.data.payout.method).toBe("cash");

    const preview = await computeTeacherPayoutTool(ctx(), { teacherId: "t1", periodStart: PERIOD_START, periodEnd: PERIOD_END });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.data.existingPayout?.method).toBe("cash");
  });

  it("SUPER_ADMIN da ödeme yöntemini değiştirebilir", async () => {
    const created = await createTeacherPayoutTool(ctx(), { teacherId: "t1", periodStart: PERIOD_START, periodEnd: PERIOD_END });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const overridden = await updateTeacherPayoutPaymentMethodTool(ctx({ role: "SUPER_ADMIN" }), {
      payoutId: created.data.payout.id,
      method: "transfer",
    });
    expect(overridden.ok).toBe(true);
    if (overridden.ok) expect(overridden.data.payout.method).toBe("transfer");
  });
});

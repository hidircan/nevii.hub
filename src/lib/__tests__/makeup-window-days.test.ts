import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { updateMakeupWindowDaysTool, updateMonthlyMakeupAllowanceTool } from "../services/tools";
import { readData } from "../store";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

function ctx(overrides?: Partial<ServiceContext>): ServiceContext {
  return {
    role: "SCHOOL_ADMIN",
    userId: "u1",
    tenantId: DEFAULT_TENANT_ID,
    channel: "web",
    ...overrides,
  };
}

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
});

describe("Telafi Merkezi politika penceresi (makeupWindowDays) — Paket 5", () => {
  it("geçerli bir gün değeriyle günceller", async () => {
    const res = await updateMakeupWindowDaysTool(ctx(), { makeupWindowDays: 45 });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.makeupWindowDays).toBe(45);

    const data = await readData();
    expect(data.settings.makeupWindowDays).toBe(45);
  });

  it("1-365 dışındaki değerleri reddeder", async () => {
    const tooLow = await updateMakeupWindowDaysTool(ctx(), { makeupWindowDays: 0 });
    expect(tooLow.ok).toBe(false);
    const tooHigh = await updateMakeupWindowDaysTool(ctx(), { makeupWindowDays: 400 });
    expect(tooHigh.ok).toBe(false);
  });

  it("yalnız SCHOOL_ADMIN/SUPER_ADMIN değiştirebilir (RBAC)", async () => {
    const res = await updateMakeupWindowDaysTool(ctx({ role: "TEACHER" }), { makeupWindowDays: 30 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("FORBIDDEN");
  });
});

describe("Aylık telafi hakkı (monthlyMakeupAllowance)", () => {
  it("geçerli değeri kaydeder", async () => {
    const res = await updateMonthlyMakeupAllowanceTool(ctx(), { monthlyMakeupAllowance: 4 });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.monthlyMakeupAllowance).toBe(4);
    const data = await readData();
    expect(data.settings.monthlyMakeupAllowance).toBe(4);
  });

  it("0-31 dışını reddeder", async () => {
    expect((await updateMonthlyMakeupAllowanceTool(ctx(), { monthlyMakeupAllowance: -1 })).ok).toBe(false);
    expect((await updateMonthlyMakeupAllowanceTool(ctx(), { monthlyMakeupAllowance: 32 })).ok).toBe(false);
  });

  it("öğretmen güncelleyemez", async () => {
    const res = await updateMonthlyMakeupAllowanceTool(ctx({ role: "TEACHER" }), {
      monthlyMakeupAllowance: 3,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("FORBIDDEN");
  });
});

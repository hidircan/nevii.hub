import { describe, it, expect, vi, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { DEFAULT_TENANT_ID } from "../auth/config";
import { createSeedData } from "../seed";
import { writeData as writeJson } from "../store-json";

vi.mock("../store", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../store")>();
  const { DEFAULT_TENANT_ID: def } = await import("../auth/config");
  return {
    ...orig,
    listTenants: async () => [
      { tenantId: def, name: "gerçek" },
      { tenantId: "t-broken", name: "bozuk" },
    ],
  };
});

vi.mock("../manager-notifications", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../manager-notifications")>();
  return {
    ...orig,
    notifyAdmins: async (tenantId: string, ...rest: unknown[]) => {
      if (tenantId === "t-broken") throw new Error("tenant store bozuk");
      return (orig.notifyAdmins as (...a: unknown[]) => Promise<unknown>)(tenantId, ...rest);
    },
  };
});

vi.mock("../leave", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../leave")>();
  return {
    ...orig,
    listLeave: async (tenantId: string) => {
      if (tenantId === "t-broken") throw new Error("tenant store bozuk");
      return orig.listLeave(tenantId);
    },
  };
});

import { sweepLeavePendingApproval, sweepPaymentFailedOrPending } from "../notification-sweeps";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

describe("bildirim süpürmeleri — tenant izolasyonu", () => {
  beforeEach(async () => {
    await fs.rm(DATA_FILE, { force: true });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    return () => vi.restoreAllMocks();
  });

  it("bozuk tenant sağlam tenant'ın bildirimini engellemez, hata sayılır", async () => {
    const seed = createSeedData();
    const old = new Date(Date.now() - 10 * 86400000).toISOString();
    seed.payments.push({
      id: "pay_iso_old",
      studentId: "s1",
      amount: 1000,
      paidAmount: 0,
      status: "pending",
      dueDate: old,
      createdAt: old,
      description: "izolasyon",
    });
    await writeJson(seed);

    const res = await sweepPaymentFailedOrPending(new Date());
    expect(res.created).toBe(1);
    expect(res.tenantErrors).toBe(1);
  });

  it("bozuk tenant izin süpürmesini durdurmaz, hata sayılır", async () => {
    const res = await sweepLeavePendingApproval();
    expect(res.created).toBe(0);
    expect(res.tenantErrors).toBe(1);
  });
});

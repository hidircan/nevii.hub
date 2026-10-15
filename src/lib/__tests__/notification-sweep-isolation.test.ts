import { describe, it, expect, vi, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { createSeedData } from "../seed";
import { writeData as writeJson } from "../store-json";

// Canlı tablo (2026-10-15): aktif kurumlar = gerçek okul + okul kaydı OLMAYAN NeviiOS platform tenant'ı.
// `t-broken` her kurum-içi okumada hata veren bir kurumu temsil eder.
const visitedReads: string[] = [];

vi.mock("../store-json", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../store-json")>();
  const { DEFAULT_TENANT_ID: def, PLATFORM_TENANT_ID: platform } = await import("../auth/config");
  return {
    ...orig,
    listTenants: async () => [
      { tenantId: def, name: "gerçek" },
      { tenantId: platform, name: "NeviiOS" },
      { tenantId: "t-broken", name: "bozuk" },
    ],
  };
});

vi.mock("../store", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../store")>();
  const { tryTenantId } = await import("../tenant-context");
  const { PLATFORM_TENANT_ID: platform } = await import("../auth/config");
  return {
    ...orig,
    // Canlı db store'u okulsuz kurumda böyle fırlatır (store-db.ts readData).
    readData: async () => {
      const tid = tryTenantId() ?? "";
      visitedReads.push(tid);
      if (tid === "t-broken" || tid === platform) throw new Error(`Kurum (${tid}) için okul kaydı bulunamadı.`);
      return orig.readData();
    },
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

import { runNotificationSweeps, sweepLeavePendingApproval, sweepPaymentFailedOrPending } from "../notification-sweeps";
import { PLATFORM_TENANT_ID } from "../auth/config";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

describe("bildirim süpürmeleri — tenant izolasyonu", () => {
  beforeEach(async () => {
    await fs.rm(DATA_FILE, { force: true });
    visitedReads.length = 0;
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

  it("tick: okulsuz platform tenant'ı hiç okunmaz; bozuk kurum tüm koşuyu düşürmez, sayaçta görünür", async () => {
    await writeJson(createSeedData());
    const summary = await runNotificationSweeps(new Date());

    expect(visitedReads).not.toContain(PLATFORM_TENANT_ID);
    // Sağlam kurum her aşamada işlendi; bozuk kurum yalnız sayıldı.
    expect(summary.upcoming.tenants).toBe(1);
    expect(summary.upcoming.tenantErrors).toBe(1);
    expect(summary.reminders.tenantErrors).toBe(1);
    expect(summary.paymentTenantErrors).toBe(1);
    expect(summary.leaveTenantErrors).toBe(1);
    expect(summary.tenantErrors).toBeGreaterThanOrEqual(4);

    // Teşhis log'u: kurum id + aşama + hata adı; mesaj (kişi verisi taşıyabilir) YOK.
    const logged = vi.mocked(console.error).mock.calls.filter((c) => c[1] === "[notifications.sweep.tenant.failed]");
    expect(logged.length).toBe(summary.tenantErrors);
    for (const call of logged) {
      expect(call[2]).toMatchObject({ tenantId: "t-broken", errorName: "Error" });
      expect(JSON.stringify(call[2])).not.toContain("okul kaydı bulunamadı");
    }
  });
});

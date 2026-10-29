import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Regresyon (2026-10-10) — gece `monthly-accrual` cron'u okulsuz tenant'ta (sentetik platform tenant'ı)
 * `readPaymentsPageData` → `readData()` seed geri düşüşüne giriyordu: sabit demo id'leri → P2002 (canlıya
 * demo veri yazma girişimi; öncesinde tenant'ın kullanıcılarını silen transaction commit oluyordu). İstisna
 * döngüden kaçtığı için alfabetik sonraki kurumların tahakkuku her gece atlanıyordu.
 * Prisma mock'lanır: okuma boş döner, her yazım kaydedilir; `$transaction` seed'i durdurur.
 */
const h = vi.hoisted(() => ({
  writes: [] as string[],
  tenants: [] as { tenantId: string; name: string }[],
  accrual: vi.fn(),
  club: vi.fn(),
}));

vi.mock("../db", () => {
  const model = (name: string) =>
    new Proxy(
      {},
      {
        get: (_t, op: string) => async () => {
          if (op === "findFirst" || op === "findUnique") return null;
          if (op === "findMany") return [];
          h.writes.push(`${name}.${op}`);
        },
      }
    );
  const prisma = new Proxy(
    {},
    {
      get: (_t, k: string) =>
        k === "$transaction"
          ? async () => {
              h.writes.push("$transaction");
              throw new Error("STOP_BEFORE_SEED");
            }
          : model(k),
    }
  );
  return { prisma };
});
vi.mock("../store", async (orig) => ({ ...(await orig<typeof import("../store")>()), listTenants: async () => h.tenants }));
vi.mock("../standalone-monthly-accrual", async (orig) => ({
  ...(await orig<typeof import("../standalone-monthly-accrual")>()),
  runStandaloneMonthlyAccrual: h.accrual,
}));
vi.mock("../clubs", async (orig) => ({ ...(await orig<typeof import("../clubs")>()), runClubFeeAccrual: h.club }));

import { readData, readPaymentsPageData } from "../store-db";
import { runWithTenantAsync } from "../tenant-context";
import { PLATFORM_TENANT_ID } from "../auth/config";
import { GET } from "@/app/api/v1/platform/jobs/monthly-accrual/route";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  h.writes.length = 0;
});

describe("store-db: okulu olmayan tenant", () => {
  it.each([
    ["VERCEL_ENV", "production"],
    ["NEVII_DEPLOYMENT_TIER", "production"],
  ])("%s=%s → seed yok, hiçbir yazım yok, açık Türkçe hata", async (key, value) => {
    vi.stubEnv(key, value);
    for (const read of [readData, readPaymentsPageData] as (() => Promise<unknown>)[]) {
      await expect(runWithTenantAsync("tenant_bos", read)).rejects.toThrow(
        "Kurum (tenant_bos) için okul kaydı bulunamadı. Canlı ortamda demo veri otomatik yazılmaz"
      );
    }
    expect(h.writes).toEqual([]);
  });

  it("canlı dışı ortamda eski seed davranışı korunur", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("NEVII_DEPLOYMENT_TIER", "test");
    await expect(runWithTenantAsync("tenant_bos", readData)).rejects.toThrow("STOP_BEFORE_SEED");
    expect(h.writes).toContain("$transaction");
  });
});

describe("monthly-accrual cron", () => {
  it("platform tenant'ını atlar; bir kurumun hatası sonrakileri durdurmaz, 500 + sayı + log ile raporlanır", async () => {
    const secret = "s".repeat(32);
    vi.stubEnv("CRON_SECRET", secret);
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    h.tenants = [
      { tenantId: "tenant_a", name: "A" },
      { tenantId: PLATFORM_TENANT_ID, name: "Platform" },
      { tenantId: "tenant_b", name: "B" },
    ];
    h.accrual.mockReset().mockImplementation(async (tid: string) => {
      if (tid === "tenant_a") throw new Error("okul yok");
      return { month: "2026-10", planned: [{}], created: 1 };
    });
    h.club.mockReset().mockResolvedValue({ planned: 2, created: 2 });

    const res = await GET(
      new Request("http://localhost/api/v1/platform/jobs/monthly-accrual?apply=1", {
        headers: { authorization: `Bearer ${secret}` },
      })
    );

    expect(res.status).toBe(500);
    expect(h.accrual.mock.calls.map((c) => c[0])).toEqual(["tenant_a", "tenant_b"]);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.data).toEqual({
      apply: true,
      tenants: [{ tenantId: "tenant_b", month: "2026-10", planned: 1, created: 1, clubPlanned: 2, clubCreated: 2 }],
      failed: 1,
      failures: [{ tenantId: "tenant_a", message: "okul yok" }],
    });
    expect(logged).toHaveBeenCalledWith("[nevii-hub]", "monthly-accrual", "tenant failed", "tenant_a", "okul yok");
  });
});

import { describe, it, expect } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { ensureTenantDataFile, listTenants, readData, writeData } from "../store-json";
import { runWithTenantAsync } from "../tenant-context";
import { DEFAULT_TENANT_ID } from "../auth/config";

const DIR = resolveDataDir(path.join(process.cwd(), "data"));

/**
 * JSON çok-tenant dosya düzeni (2026-10-28) — kök neden: `store-json`
 * TEK dosyalıydı; ikinci tenant her okumada "Cross-tenant access denied"
 * ile /panel'i çökertiyordu. Düzeltme: varsayılan kurum `store.json`'da
 * kalır, diğer tenant'lar `store-<tenant>.json` dosyasında BOŞ şablonla
 * açılır; veri karışmaz.
 */
describe("store-json — tenant başına dosya izolasyonu", () => {
  it("yeni tenant BOŞ şablonla açılır, varsayılan dosya değişmez", async () => {
    const before = await fs.readFile(path.join(DIR, "store.json"), "utf-8").catch(() => null);
    await ensureTenantDataFile("tenant_test_fresh", "Taze Test Kurumu");
    const fresh = await runWithTenantAsync("tenant_test_fresh", () => readData());
    expect(fresh.settings.tenantId).toBe("tenant_test_fresh");
    expect(fresh.settings.name).toBe("Taze Test Kurumu");
    expect(fresh.students).toHaveLength(0);
    expect(fresh.teachers).toHaveLength(0);
    expect(fresh.lessons).toHaveLength(0);
    expect(fresh.payments).toHaveLength(0);
    const after = await fs.readFile(path.join(DIR, "store.json"), "utf-8").catch(() => null);
    expect(after).toBe(before);
  });

  it("yazımlar kendi dosyasına gider, çapraz okuma engellenir", async () => {
    await ensureTenantDataFile("tenant_test_a", "A Kurumu");
    await ensureTenantDataFile("tenant_test_b", "B Kurumu");
    const a = await runWithTenantAsync("tenant_test_a", () => readData());
    await runWithTenantAsync("tenant_test_a", () =>
      writeData({ ...a, settings: { ...a.settings, city: "Ankara" } })
    );
    const b = await runWithTenantAsync("tenant_test_b", () => readData());
    expect(b.settings.city).not.toBe("Ankara");
    // Başka tenant'ın verisini kendi bağlamına yazma denemesi reddedilir.
    await expect(
      runWithTenantAsync("tenant_test_b", () => writeData({ ...a, settings: { ...a.settings } }))
    ).rejects.toThrow("Cross-tenant access denied");
  });

  it("ensure idempotent: mevcut dosyayı ezmez", async () => {
    await ensureTenantDataFile("tenant_test_c", "C Kurumu");
    const c = await runWithTenantAsync("tenant_test_c", () => readData());
    await runWithTenantAsync("tenant_test_c", () =>
      writeData({ ...c, settings: { ...c.settings, city: "Izmir" } })
    );
    await ensureTenantDataFile("tenant_test_c", "Baska Isim");
    const again = await runWithTenantAsync("tenant_test_c", () => readData());
    expect(again.settings.city).toBe("Izmir");
    expect(again.settings.name).toBe("C Kurumu");
  });

  it("listTenants tüm dosyaları listeler", async () => {
    await ensureTenantDataFile("tenant_test_d", "D Kurumu");
    const all = await listTenants();
    expect(all.some((t) => t.tenantId === DEFAULT_TENANT_ID)).toBe(true);
    expect(all.some((t) => t.tenantId === "tenant_test_d" && t.name === "D Kurumu")).toBe(true);
  });
});

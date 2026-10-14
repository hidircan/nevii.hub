/**
 * Müsaitlik ekranı crash-sözleşmesi (statik).
 * Kök neden: `res.data.currentAvailability.length` — alan yoksa render crash.
 * Kural: eksik/undefined alanlar `?? []` ile okunur; ekran read-only kalır.
 */
import { describe, expect, it } from "vitest";
import { promises as fs } from "fs";
import path from "path";

const SCREEN = path.join(__dirname, "..", "..", "..", "..", "app", "(teacher)", "hesabim", "musaitlik.tsx");

describe("müsaitlik crash-sözleşmesi", () => {
  it("currentAvailability/requests/proposedAvailability savunmacı okunur", async () => {
    const content = await fs.readFile(SCREEN, "utf-8");
    expect(content).toMatch(/res\.data\?\.currentAvailability \?\? \[\]/);
    expect(content).toMatch(/res\.data\?\.requests \?\? \[\]/);
    expect(content).toMatch(/r\.proposedAvailability \?\? \[\]/);
    expect(content).not.toMatch(/res\.data\.currentAvailability\.length/);
    expect(content).not.toMatch(/res\.data\.requests\.length/);
  });

  it("read-only: yazma çağrısı ve düzenleme CTA'sı yok", async () => {
    const content = await fs.readFile(SCREEN, "utf-8");
    expect(content).not.toMatch(/\bapiPost\b|\bapiPatch\b|\bapiDelete\b/);
    expect(content).toMatch(/yalnız kurum yöneticileri tarafından düzenlenir/);
  });
});

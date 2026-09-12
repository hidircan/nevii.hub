import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import type { ServiceContext } from "../services/context";

/**
 * Regresyon: `store.ts` db/memory backend'lerini çıplak `require("./store-db")`
 * ile seçiyordu. Turbopack (Next 16) bu çağrıyı production server bundle'ında
 * ÇÖZMÜYOR — modülü hiç emit etmiyor ve uyarı da vermiyor; `as StoreApi` cast'i
 * de tip kontrolünü susturuyordu. Sonuç: `STORE_MODE=db` deploy'unda `store`
 * boş kalıyor ve /panel'in ilk store çağrısı
 * `TypeError: ae.listTenants is not a function` ile 500 dönüyordu.
 *
 * Bu dosya DB'ye BAĞLANMADAN üç şeyi bağlar:
 *   1) seçici statik import kullanmalı (bundler'ın modülü görebilmesi için),
 *   2) `store.X()` çağrılan her metot üç backend'de de bulunmalı,
 *   3) /panel'in ilk store çağrısı (listTenants → listAvailableKurumlar)
 *      db modunda gerçekten çalışmalı ve rol kapsamını korumalı.
 */

const STORE_SRC = readFileSync(path.resolve(import.meta.dirname, "../store.ts"), "utf-8");
/** Yorum satırları hariç kod — yasaklı kalıplar yorumda geçebilir. */
const STORE_CODE = STORE_SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {} }),
}));

type PrismaCall = { model: string; op: string; args: Record<string, unknown> };

/** Gerçek bağlantı AÇMADAN prisma çağrılarını yakalar (bkz. demo-seed-store-mode.test.ts). */
function fakePrisma(calls: PrismaCall[], tenants: unknown[]) {
  return new Proxy({} as Record<string, unknown>, {
    get: (_t, model: string) =>
      new Proxy({} as Record<string, unknown>, {
        get: (_t2, op: string) => async (args: Record<string, unknown>) => {
          calls.push({ model: String(model), op: String(op), args });
          return String(model) === "tenant" && String(op) === "findMany" ? tenants : [];
        },
      }),
  });
}

describe("store.ts backend seçimi — bundler'ın göremediği require yasak", () => {
  it("üç backend de statik import edilir, çıplak require ile seçilmez", () => {
    expect(STORE_SRC).toMatch(/import \* as dbStore from "\.\/store-db"/);
    expect(STORE_SRC).toMatch(/import \* as memoryStore from "\.\/store-memory"/);
    expect(STORE_CODE).not.toMatch(/require\(["']\.\/store-(db|memory|json)["']\)/);
  });

  it("seçim tablosu StoreApi sözleşmesine `satisfies` ile bağlıdır (cast değil)", () => {
    expect(STORE_SRC).toMatch(/satisfies Record<typeof STORE_MODE, StoreApi>/);
    expect(STORE_CODE).not.toMatch(/as StoreApi/);
  });
});

describe("store mod paritesi — store.ts'in çağırdığı her metot üç backend'de var", () => {
  it("json/db/memory aynı yüzeyi sunar", async () => {
    const called = [...STORE_CODE.matchAll(/\bstore\.([A-Za-z0-9_]+)\(/g)].map((m) => m[1]);
    expect(called.length).toBeGreaterThan(20);
    expect(called).toContain("listTenants");

    const backends = {
      json: await import("../store-json"),
      db: await import("../store-db"),
      memory: await import("../store-memory"),
    } as Record<string, Record<string, unknown>>;

    const missing: string[] = [];
    for (const [mode, mod] of Object.entries(backends)) {
      for (const name of new Set(called)) {
        if (typeof mod[name] !== "function") missing.push(`${mode}.${name}`);
      }
    }
    expect(missing).toEqual([]);
  });
});

describe("/panel yükleyicisi — STORE_MODE=db altında listTenants gerçekten çalışır", () => {
  const previousMode = process.env.STORE_MODE;

  afterEach(() => {
    if (previousMode === undefined) delete process.env.STORE_MODE;
    else process.env.STORE_MODE = previousMode;
    vi.doUnmock("../db");
    vi.resetModules();
  });

  async function loadKurumlar(ctx: ServiceContext, calls: PrismaCall[]) {
    process.env.STORE_MODE = "db";
    vi.resetModules();
    vi.doMock("../db", () => ({
      prisma: fakePrisma(calls, [
        { id: "tenant_a", name: "A Kurumu", schools: [{ name: "A Akademi" }] },
        { id: "tenant_b", name: "B Kurumu", schools: [] },
      ]),
    }));
    const { listAvailableKurumlar } = await import("../institution/context");
    return listAvailableKurumlar(ctx);
  }

  const ctx = (over: Partial<ServiceContext>): ServiceContext => ({
    role: "SCHOOL_ADMIN",
    userId: "u1",
    tenantId: "tenant_a",
    channel: "web",
    ...over,
  });

  it("HYPER_ADMIN (platform sahibi) tüm aktif kurumları {tenantId,name} biçiminde alır", async () => {
    const calls: PrismaCall[] = [];
    const kurumlar = await loadKurumlar(ctx({ role: "HYPER_ADMIN" }), calls);

    expect(kurumlar).toEqual([
      { tenantId: "tenant_a", name: "A Akademi" },
      { tenantId: "tenant_b", name: "B Kurumu" },
    ]);
    expect(calls).toContainEqual(
      expect.objectContaining({
        model: "tenant",
        op: "findMany",
        args: expect.objectContaining({ where: { active: true } }),
      })
    );
  });

  it("SCHOOL_ADMIN yalnız kendi kurumunu görür — kurum izolasyonu korunur", async () => {
    const kurumlar = await loadKurumlar(ctx({ role: "SCHOOL_ADMIN", tenantId: "tenant_b" }), []);
    expect(kurumlar).toEqual([{ tenantId: "tenant_b", name: "B Kurumu" }]);
  });
});

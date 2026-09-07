import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "fs";
import { Prisma } from "@prisma/client";
import path from "path";

/**
 * P0 bildirim paralelleştirmesi (2026-09-07) — `json` / `memory` / `db`
 * PARİTESİ.
 *
 * `notifications/index.ts` yalnız `isDbMode` ile dallanır, yani `memory` modu
 * `json` ile AYNI dosya tabanlı yolu kullanır (aşağıda kaynak üzerinden
 * kilitlenir). Geriye db dalının aynı sözleşmeyi vermesi kalır ve bu, depodaki
 * mevcut desenle — GERÇEK bağlantı AÇMADAN, sahte bir prisma proxy'siyle —
 * doğrulanır (bkz. store-mode-parity.test.ts / demo-seed-store-mode.test.ts).
 *
 * Sözleşme: `dedupeKey` verilmişse aynı (tenant, hedef, kind, anahtar, gün)
 * beşlisi için EN FAZLA BİR satır oluşur; ikinci çağrı `duplicate` döner.
 */
const NOTIF_SRC = readFileSync(
  path.resolve(import.meta.dirname, "../notifications/index.ts"),
  "utf-8"
);
const NOTIF_CODE = NOTIF_SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("mod dallanması — memory, json ile AYNI yolu kullanır", () => {
  it("bildirim modülünde mod dallanması YALNIZ `isDbMode` ile yapılır", () => {
    // `memory` modu json ile aynı dosya yolunu kullanır; STORE_MODE'a veya
    // isMemoryMode'a bakan ikinci bir dal eklenirse bu parite bozulur.
    expect(NOTIF_CODE).not.toMatch(/STORE_MODE/);
    expect(NOTIF_CODE).not.toMatch(/isMemoryMode/);
    expect(NOTIF_CODE).toMatch(/if \(isDbMode\) return createNotificationDb/);
  });

  it("satır kimliği mod dallanmasından ÖNCE türetilir (üç mod aynı id'yi üretir)", () => {
    const idLine = NOTIF_CODE.indexOf("notificationRowId(input, new Date())");
    const branchLine = NOTIF_CODE.indexOf("if (isDbMode) return createNotificationDb");
    expect(idLine).toBeGreaterThan(-1);
    expect(branchLine).toBeGreaterThan(-1);
    expect(idLine).toBeLessThan(branchLine);
  });

  it("json/memory yazımı kilit altındadır, db yazımı çakışmayı `duplicate`'e çevirir", () => {
    expect(NOTIF_CODE).toMatch(/mutateAllUnderLock/);
    expect(NOTIF_CODE).toMatch(/isUniqueViolation\(Prisma, error\)/);
    // Kilitsiz oku-değiştir-yaz geri gelmesin.
    expect(NOTIF_CODE).not.toMatch(/await saveAll\(\[\.\.\.all/);
  });

  it("`../db` DİNAMİK import edilir ve süreç başına bir kez çözümlenir", () => {
    // `import type` derlemede silinir, modül grafiğine GİRMEZ — serbest.
    expect(NOTIF_CODE).not.toMatch(/^import (?!type )[^;]*from "\.\.\/db"/m);
    expect(NOTIF_CODE).not.toMatch(/^import (?!type )[^;]*from "@prisma\/client"/m);
    expect(NOTIF_CODE).toMatch(/Promise\.all\(\[import\("\.\.\/db"\), import\("@prisma\/client"\)\]\)/);
    // Memoize: her yazımda yeniden çözümlenmesin.
    expect(NOTIF_CODE).toMatch(/dbModules \?\?=/);
  });
});

/**
 * db dalının davranışı — birincil anahtarı olan sahte bir Notification
 * tablosuyla, GERÇEK bağlantı AÇILMADAN. Enjeksiyon deseni depodaki mevcut
 * `store-mode-parity.test.ts` ile aynıdır (STORE_MODE + `vi.resetModules()` +
 * `vi.doMock("../db")` + dinamik import).
 *
 * `createMany(skipDuplicates)` PostgreSQL'de aynı birincil anahtar için
 * `count: 0` döner; burada o davranış birebir modellenir.
 */
type Row = Record<string, unknown> & { id: string; tenantId: string };

function fakePrisma(table: Row[]) {
  return {
    notification: {
      /** Gerçek PostgreSQL birincil anahtarı gibi davranır: çakışmada P2002. */
      create: async ({ data }: { data: Row }) => {
        if (table.some((r) => r.id === data.id)) {
          throw new Prisma.PrismaClientKnownRequestError(
            "Unique constraint failed on the fields: (`id`)",
            { code: "P2002", clientVersion: "test" }
          );
        }
        const row = { ...data, createdAt: new Date(), readAt: null };
        table.push(row);
        return row;
      },
      findFirst: async ({ where }: { where: { id: string; tenantId: string } }) =>
        table.find((r) => r.id === where.id && r.tenantId === where.tenantId) ?? null,
    },
  };
}

describe("db modu — createNotification idempotans sözleşmesi", () => {
  const previousMode = process.env.STORE_MODE;

  afterEach(() => {
    if (previousMode === undefined) delete process.env.STORE_MODE;
    else process.env.STORE_MODE = previousMode;
    vi.doUnmock("../db");
    vi.resetModules();
  });

  async function loadDbMode(table: Row[]) {
    process.env.STORE_MODE = "db";
    vi.resetModules();
    vi.doMock("../db", () => ({ prisma: fakePrisma(table) }));
    const { createNotification } = await import("../notifications");
    return createNotification;
  }

  it("aynı dedupeKey ile ikinci çağrı yeni satır YAZMAZ, 'duplicate' döner", async () => {
    const table: Row[] = [];
    const createNotification = await loadDbMode(table);
    const input = {
      tenantId: "tenant_a",
      targetUserId: "u1",
      kind: "lesson_rescheduled",
      title: "T",
      body: "B",
      dedupeKey: "l1:2026-09-09T08:00:00.000Z",
    };
    const first = await createNotification(input);
    const second = await createNotification(input);

    expect(first.status).toBe("created");
    expect(second.status).toBe("duplicate");
    expect(second.notification.id).toBe(first.notification.id);
    expect(table).toHaveLength(1);
  });

  it("aynı dedupeKey ile 10 EŞZAMANLI çağrı: tam olarak 1 satır (json ile AYNI sonuç)", async () => {
    const table: Row[] = [];
    const createNotification = await loadDbMode(table);
    // Modülü önce TEK çağrıyla ısıt: `notifications/index.ts` `../db`'yi dinamik
    // import ediyor ve eşzamanlı 10 çözümleme vitest'in mock kaydını yarışa
    // sokuyor. Isınma, ölçülen davranışı (idempotans) değiştirmez.
    await createNotification({
      tenantId: "tenant_isinma",
      targetUserId: "warmup",
      kind: "warmup",
      title: "T",
      body: "B",
    });
    table.length = 0;
    const input = {
      tenantId: "tenant_a",
      targetUserId: "u2",
      kind: "lesson_rescheduled",
      title: "T",
      body: "B",
      dedupeKey: "l2:2026-09-10T08:00:00.000Z",
    };
    const results = await Promise.all(Array.from({ length: 10 }, () => createNotification(input)));
    expect(results.filter((r) => r.status === "created")).toHaveLength(1);
    expect(results.filter((r) => r.status === "duplicate")).toHaveLength(9);
    expect(table).toHaveLength(1);
  });

  it("tenant izolasyonu: aynı anahtar farklı tenant'ta AYRI satırdır", async () => {
    const table: Row[] = [];
    const createNotification = await loadDbMode(table);
    const base = {
      targetUserId: "ortak_kullanici",
      kind: "lesson_rescheduled",
      title: "T",
      body: "B",
      dedupeKey: "l3:08:00",
    };
    await createNotification({ ...base, tenantId: "tenant_a" });
    await createNotification({ ...base, tenantId: "tenant_b" });
    expect(table).toHaveLength(2);
    expect(new Set(table.map((r) => r.id)).size).toBe(2);
    expect(table.filter((r) => r.tenantId === "tenant_a")).toHaveLength(1);
  });

  it("dedupeKey YOKSA her çağrı yeni satır üretir (eski davranış korunur)", async () => {
    const table: Row[] = [];
    const createNotification = await loadDbMode(table);
    const input = { tenantId: "tenant_a", targetUserId: "u3", kind: "generic", title: "T", body: "B" };
    await createNotification(input);
    await createNotification(input);
    expect(table).toHaveLength(2);
  });
});

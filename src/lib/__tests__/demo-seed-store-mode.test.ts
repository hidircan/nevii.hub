import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  applyDemoSeedRecords,
  assertDemoSeedAllowed,
  type DemoSeedInput,
} from "../demo-seed";
import type { AppData, Lesson, MakeupRequest } from "../types";

/**
 * Regresyon: demo seed script'leri `store-json`'ı DOĞRUDAN import ediyordu,
 * yani `STORE_MODE=db` altında geçmiş dersler JSON dosyasına, telafi talepleri
 * PostgreSQL'e yazılıyordu (veri ikiye bölünüyordu ve A/B/C/D senaryoları
 * hiç oluşmuyordu). Artık her ikisi de `store.ts` soyutlamasından geçiyor.
 */

const SCRIPTS = path.resolve(import.meta.dirname, "../../../scripts");

function readScript(name: string): string {
  return readFileSync(path.join(SCRIPTS, name), "utf-8");
}

const DEMO_SEED_SCRIPTS = ["seed-makeup-demo.ts", "seed-attendance-demo.ts"];

/** NODE_ENV tip tanımında readonly — testte geçici override için dar kapı. */
function setEnv(key: "NODE_ENV" | "VERCEL_ENV", value: string | undefined): void {
  const env = process.env as unknown as Record<string, string | undefined>;
  if (value === undefined) delete env[key];
  else env[key] = value;
}

function baseLesson(over: Partial<Lesson> = {}): Omit<Lesson, "id"> {
  return {
    studentId: "stu_1",
    teacherId: "tea_1",
    roomId: "room_1",
    branchId: "erzene",
    instrument: "Piyano",
    startAt: "2026-01-05T10:00:00.000Z",
    endAt: "2026-01-05T10:40:00.000Z",
    type: "regular",
    status: "scheduled",
    ...over,
  } as Omit<Lesson, "id">;
}

function dataWith(requests: MakeupRequest[]): AppData {
  return { lessons: [], makeupRequests: requests } as unknown as AppData;
}

function makeupRequest(id: string): MakeupRequest {
  return {
    id,
    studentId: "stu_1",
    teacherId: "tea_1",
    branchId: "erzene",
    instrument: "Piyano",
    sourceLessonId: "les_1",
    attendanceId: "att_1",
    status: "pending",
    reason: "devamsızlık",
    expiresAt: "2025-01-01T00:00:00.000Z",
    suggestedSlots: [],
    createdAt: "2024-12-01T00:00:00.000Z",
    policyNote: "demo",
  } as MakeupRequest;
}

describe("demo-seed — saf uygulama", () => {
  it("dersleri benzersiz id ile ekler ve id'leri sırayla döndürür", () => {
    const input: DemoSeedInput = {
      lessons: [baseLesson(), baseLesson({ startAt: "2026-01-06T10:00:00.000Z" })],
    };
    const { data, lessonIds } = applyDemoSeedRecords(dataWith([]), input);
    expect(data.lessons).toHaveLength(2);
    expect(lessonIds).toHaveLength(2);
    expect(new Set(lessonIds).size).toBe(2);
    expect(data.lessons.map((l) => l.id)).toEqual(lessonIds);
  });

  it("telafi talebini expiry akışına takılmadan confirmed yapar (Öğrenci C senaryosu)", () => {
    // expiresAt GEÇMİŞTE — gerçek confirmSlot akışı bunu AFTER_EXPIRY ile
    // reddederdi; demo kapısı bu yüzden var.
    const { data } = applyDemoSeedRecords(dataWith([makeupRequest("mk_1")]), {
      makeupDecisions: [
        { requestId: "mk_1", status: "confirmed", decidedBy: "seed", decisionNote: "demo" },
      ],
    });
    const req = data.makeupRequests[0];
    expect(req.status).toBe("confirmed");
    expect(req.decidedBy).toBe("seed");
    expect(req.decisionNote).toBe("demo");
    expect(req.decidedAt).toBeTruthy();
  });

  it("iptal kararını da yazar (Öğrenci D — kota tüketmez)", () => {
    const { data } = applyDemoSeedRecords(dataWith([makeupRequest("mk_1")]), {
      makeupDecisions: [{ requestId: "mk_1", status: "cancelled", decidedBy: "seed" }],
    });
    expect(data.makeupRequests[0].status).toBe("cancelled");
  });

  it("bilinmeyen talep id'sinde sessizce geçmez, hata fırlatır", () => {
    expect(() =>
      applyDemoSeedRecords(dataWith([]), {
        makeupDecisions: [{ requestId: "yok", status: "confirmed", decidedBy: "seed" }],
      })
    ).toThrow(/bulunamadı/);
  });

  it("ilgisiz talepleri değiştirmez", () => {
    const { data } = applyDemoSeedRecords(
      dataWith([makeupRequest("mk_1"), makeupRequest("mk_2")]),
      { makeupDecisions: [{ requestId: "mk_1", status: "confirmed", decidedBy: "seed" }] }
    );
    expect(data.makeupRequests.find((m) => m.id === "mk_2")!.status).toBe("pending");
  });
});

describe("demo-seed — production fail-closed", () => {
  const original = { node: process.env.NODE_ENV, vercel: process.env.VERCEL_ENV };
  afterEach(() => {
    setEnv("NODE_ENV", original.node);
    setEnv("VERCEL_ENV", original.vercel);
  });

  it("NODE_ENV=production ise reddeder", () => {
    setEnv("NODE_ENV", "production");
    expect(() => assertDemoSeedAllowed()).toThrow(/PRODUCTION/);
  });

  it("VERCEL_ENV=production ise reddeder", () => {
    setEnv("VERCEL_ENV", "production");
    expect(() => assertDemoSeedAllowed()).toThrow(/PRODUCTION/);
  });

  it("test/dev ortamında izin verir", () => {
    setEnv("NODE_ENV", "test");
    setEnv("VERCEL_ENV", undefined);
    expect(() => assertDemoSeedAllowed()).not.toThrow();
  });
});

describe("store parity — üç backend de demo kapısını uygular", () => {
  // store.ts `require(...) as StoreApi` ile CAST ettiği için tsc eksik bir
  // uygulamayı YAKALAYAMAZ; bu yüzden çalışma zamanında doğrulanır.
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock("../db");
    vi.resetModules();
  });

  it("store-json seedDemoRecords export eder", async () => {
    const mod = await import("../store-json");
    expect(typeof mod.seedDemoRecords).toBe("function");
  });

  it("store-memory seedDemoRecords export eder", async () => {
    const mod = await import("../store-memory");
    expect(typeof mod.seedDemoRecords).toBe("function");
  });

  it("store-db seedDemoRecords export eder", async () => {
    vi.doMock("../db", () => ({ prisma: {} }));
    const mod = await import("../store-db");
    expect(typeof mod.seedDemoRecords).toBe("function");
  });

  it("dispatcher (store.ts) seedDemoRecords export eder", async () => {
    const mod = await import("../store");
    expect(typeof mod.seedDemoRecords).toBe("function");
  });
});

describe("STORE_MODE=json davranışı korunuyor (gerçek entegrasyon)", () => {
  it("aktif store'a yazar ve readData tarafından görülür", async () => {
    const { seedDemoRecords, readData } = await import("../store");
    const before = await readData();
    const student = before.students[0];
    const teacher = before.teachers[0];
    const room = before.rooms[0];
    expect(student && teacher && room).toBeTruthy();

    const startAt = "2026-01-05T07:00:00.000Z";
    const { lessonIds } = await seedDemoRecords({
      lessons: [
        {
          studentId: student.id,
          teacherId: teacher.id,
          roomId: room.id,
          branchId: student.branchId,
          instrument: student.instruments[0] ?? "Piyano",
          startAt,
          endAt: "2026-01-05T07:40:00.000Z",
          type: "regular",
          status: "scheduled",
        },
      ],
    });

    expect(lessonIds).toHaveLength(1);
    const after = await readData();
    const created = after.lessons.find((l) => l.id === lessonIds[0]);
    expect(created).toBeTruthy();
    expect(created!.startAt).toBe(startAt);
    // GEÇMİŞ tarihli ders yazılabildi — asıl amaç buydu.
    expect(new Date(created!.startAt).getTime()).toBeLessThan(Date.now());
  });
});

describe("seed script'leri artık JSON store'a doğrudan yazmıyor", () => {
  for (const name of DEMO_SEED_SCRIPTS) {
    it(`${name} store-json'ı doğrudan import etmiyor`, () => {
      const src = readScript(name);
      expect(src).not.toMatch(/^\s*import[^\n]*from\s+"\.\.\/src\/lib\/store-json"/m);
      expect(src).not.toMatch(/\bwriteDataJson\s*\(/);
      expect(src).not.toMatch(/\breadDataJson\s*\(/);
    });

    it(`${name} yazımlarını store soyutlamasından geçiriyor`, () => {
      const src = readScript(name);
      expect(src).toMatch(/from\s+"\.\.\/src\/lib\/store"/);
      expect(src).toMatch(/seedDemoRecords\s*\(/);
    });
  }

  it("seed-makeup-demo A/B/C/D + Program Vitrini senaryolarını korur", () => {
    const src = readScript("seed-makeup-demo.ts");
    for (const label of ["Öğrenci A", "Öğrenci B", "Öğrenci C", "Öğrenci D", "Program Vitrini"]) {
      expect(src).toContain(label);
    }
  });

  it("idempotency anahtarı (demo öğretmen adı) korunuyor", () => {
    const src = readScript("seed-makeup-demo.ts");
    expect(src).toMatch(/alreadySeeded/);
    expect(src).toMatch(/DEMO_TEACHER_NAME/);
    expect(src).toMatch(/Atlandı/);
  });

  it("production guard'ı korunuyor", () => {
    for (const name of DEMO_SEED_SCRIPTS) {
      const src = readScript(name);
      expect(src).toMatch(/VERCEL_ENV === "production"|assertNotProductionRuntime/);
    }
  });
});

type PrismaCall = { model: string; op: string; args: Record<string, unknown> };

/** Gerçek bağlantı AÇMADAN store-db'nin hangi tabloya ne yazdığını yakalar. */
function fakePrisma(calls: PrismaCall[]) {
  return new Proxy({} as Record<string, unknown>, {
    get: (_t, model: string) => {
      // $transaction / $queryRaw gibi üst düzey istemci metodları
      if (String(model).startsWith("$")) {
        return async (arg: unknown) => (Array.isArray(arg) ? Promise.all(arg) : arg);
      }
      return new Proxy({} as Record<string, unknown>, {
        get: (_t2, op: string) => async (args: Record<string, unknown>) => {
          calls.push({ model: String(model), op: String(op), args });
          const o = String(op);
          if (o.startsWith("findMany")) return [];
          if (o === "count") return 0;
          if (o === "updateMany" || o === "deleteMany") return { count: 1 };
          if (o === "create" || o === "update" || o === "upsert") return args?.data ?? {};
          if (o === "findFirst" || o === "findUnique")
            return String(model) === "branch" ? { id: "erzene", schoolId: "sch_1" } : null;
          return null;
        },
      });
    },
  });
}

describe("STORE_MODE=db — yazımlar PostgreSQL'e gider, JSON dosyasına DEĞİL", () => {
  afterEach(() => {
    vi.doUnmock("../db");
    vi.resetModules();
  });

  it("geçmiş dersi prisma.lesson.create ile, telafi kararını updateMany ile yazar", async () => {
    vi.resetModules();
    const calls: PrismaCall[] = [];
    vi.doMock("../db", () => ({ prisma: fakePrisma(calls) }));
    const { runWithTenantAsync } = await import("../tenant-context");
    const storeDb = await import("../store-db");

    const startAt = "2026-01-05T10:00:00.000Z";
    await runWithTenantAsync("t_test", () =>
      storeDb.seedDemoRecords({
        lessons: [
          {
            studentId: "s1",
            teacherId: "t1",
            roomId: "r1",
            branchId: "erzene",
            instrument: "Piyano",
            startAt,
            endAt: "2026-01-05T10:40:00.000Z",
            type: "regular",
            status: "scheduled",
          },
        ],
        makeupDecisions: [{ requestId: "mk_1", status: "confirmed", decidedBy: "seed" }],
      })
    );

    const lessonCreate = calls.find((c) => c.model === "lesson" && c.op === "create");
    expect(lessonCreate).toBeTruthy();
    const lessonData = lessonCreate!.args.data as Record<string, unknown>;
    expect(lessonData.tenantId).toBe("t_test");
    expect(lessonData.schoolId).toBe("sch_1");
    expect(lessonData.status).toBe("scheduled");
    expect((lessonData.startAt as Date).toISOString()).toBe(startAt);

    const decision = calls.find((c) => c.model === "makeupRequest" && c.op === "updateMany");
    expect(decision).toBeTruthy();
    expect((decision!.args.where as Record<string, unknown>).tenantId).toBe("t_test");
    expect((decision!.args.data as Record<string, unknown>).status).toBe("confirmed");
  });

  it("bilinmeyen telafi talebinde sessizce geçmez", async () => {
    vi.resetModules();
    const calls: PrismaCall[] = [];
    const prisma = fakePrisma(calls) as unknown as Record<string, Record<string, unknown>>;
    vi.doMock("../db", () => ({
      prisma: new Proxy(prisma, {
        get: (t, model: string) =>
          String(model) === "makeupRequest"
            ? { updateMany: async () => ({ count: 0 }) }
            : (t as Record<string, unknown>)[String(model)],
      }),
    }));
    const { runWithTenantAsync } = await import("../tenant-context");
    const storeDb = await import("../store-db");
    await expect(
      runWithTenantAsync("t_test", () =>
        storeDb.seedDemoRecords({
          makeupDecisions: [{ requestId: "yok", status: "confirmed", decidedBy: "seed" }],
        })
      )
    ).rejects.toThrow(/bulunamadı/);
  });

  it("production'da db backend'i de fail-closed", async () => {
    vi.resetModules();
    vi.doMock("../db", () => ({ prisma: fakePrisma([]) }));
    const { runWithTenantAsync } = await import("../tenant-context");
    const storeDb = await import("../store-db");
    const prev = process.env.NODE_ENV;
    setEnv("NODE_ENV", "production");
    try {
      await expect(
        runWithTenantAsync("t_test", () => storeDb.seedDemoRecords({ lessons: [] }))
      ).rejects.toThrow(/PRODUCTION/);
    } finally {
      setEnv("NODE_ENV", prev);
    }
  });
});

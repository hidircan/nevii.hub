import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { confirmMakeupLessonTool, cancelMakeupLessonTool } from "../services/tools";
import { readData } from "../store";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

function ctx(overrides?: Partial<ServiceContext>): ServiceContext {
  return {
    role: "SCHOOL_ADMIN",
    userId: "admin1",
    tenantId: DEFAULT_TENANT_ID,
    channel: "web",
    ...overrides,
  };
}

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
});

describe("EPIC 10 — karar notu zorunluluğu (kasıtlı sözleşme kırılması)", () => {
  // 2026-09-30 (owner) — ONAYDA planlama gerekçesi isteğe bağlı (boş kayıt: makeup-past-date.test.ts);
  // girilirse biçim kontrolü çalışır. İptal/ret notu aşağıda zorunlu kalır.
  it("confirmMakeupLessonTool: gerekçe girilirse uzunluk kontrolü çalışır (1000 karakter üstü reddedilir, hiçbir şey yazılmaz)", async () => {
    const before = await readData();
    const request = before.makeupRequests.find((m) => m.status === "pending" || m.status === "suggested");
    expect(request).toBeDefined();
    if (!request) return;

    const result = await confirmMakeupLessonTool(ctx(), {
      requestId: request.id,
      slot: {
        startAt: "2026-08-10T10:00:00.000Z",
        endAt: "2026-08-10T10:30:00.000Z",
        teacherId: request.teacherId,
        roomId: "r1",
        branchId: request.branchId,
        score: 90,
        reasons: [],
      },
      decisionNote: "x".repeat(1001),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION_ERROR");
    const after = await readData();
    expect(after.makeupRequests.find((m) => m.id === request.id)!.status).toBe(request.status);
  });

  it("cancelMakeupLessonTool: decisionNote olmadan VALIDATION_ERROR döner, statüyü değiştirmez", async () => {
    const before = await readData();
    const request = before.makeupRequests.find((m) => m.status === "pending" || m.status === "suggested");
    expect(request).toBeDefined();
    if (!request) return;

    const result = await cancelMakeupLessonTool(ctx(), { requestId: request.id });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION_ERROR");

    const after = await readData();
    expect(after.makeupRequests.find((m) => m.id === request.id)?.status).toBe(request.status);
  });

  it("cancelMakeupLessonTool: decisionNote verilirse kaydedilir ve iptal başarılı olur", async () => {
    const before = await readData();
    const request = before.makeupRequests.find((m) => m.status === "pending" || m.status === "suggested");
    if (!request) return;

    const result = await cancelMakeupLessonTool(ctx(), {
      requestId: request.id,
      decisionNote: "Öğrenci ailesi telafiden vazgeçti.",
    });
    expect(result.ok).toBe(true);

    const after = await readData();
    const updated = after.makeupRequests.find((m) => m.id === request.id);
    expect(updated?.status).toBe("cancelled");
    expect(updated?.decisionNote).toBe("Öğrenci ailesi telafiden vazgeçti.");
    expect(updated?.decidedBy).toBe("admin1");
    expect(updated?.decidedAt).toBeDefined();
  });
});

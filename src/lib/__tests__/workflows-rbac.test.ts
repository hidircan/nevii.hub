import { describe, it, expect, vi, beforeEach } from "vitest";
import { promises as fs } from "fs";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { AuthUser } from "../auth/types";
import { WORKFLOWS_FILE } from "../workflows/state";

/**
 * FAZ 4 — workflows/[id] PATCH önceden "tools:catalog" izniyle korunuyordu,
 * bu izin PARENT/STUDENT/TEACHER dahil hemen her role veriliyordu. `enabled`
 * alanı ise src/lib/workflows/state.ts'de tenantId TAŞIMAYAN, tüm tenant'lar
 * için GLOBAL bir anahtar — yani herhangi bir tenant'taki düşük yetkili bir
 * kullanıcı başka bir tenant'ın otomasyonunu global olarak kapatabiliyordu.
 * Bu test iki katmanlı düzeltmeyi doğrular: (1) route "workflows:manage"
 * izni ister (yalnızca SCHOOL_ADMIN/SUPER_ADMIN), (2) `enabled` alanı ayrıca
 * yalnızca SUPER_ADMIN'e açık.
 */
const mockUser: { value: AuthUser } = {
  value: { userId: "u1", role: "SCHOOL_ADMIN", tenantId: DEFAULT_TENANT_ID },
};

vi.mock("@/lib/auth/authenticate", () => ({
  authenticateRequest: async () => ({ ok: true, user: mockUser.value, via: "bearer" }),
}));

beforeEach(async () => {
  await fs.rm(WORKFLOWS_FILE, { force: true });
});

describe("workflows/[id] RBAC (FAZ 4 düzeltmesi)", () => {
  it("PARENT/STUDENT/TEACHER route seviyesinde 403 alır (workflows:manage yok)", async () => {
    const { PATCH } = await import("../../app/api/v1/workflows/[id]/route");
    for (const role of ["PARENT", "STUDENT", "TEACHER"] as const) {
      mockUser.value = { userId: "u1", role, tenantId: DEFAULT_TENANT_ID };
      const req = new Request("https://example.test/api/v1/workflows/payment_reminders", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: false }),
      });
      const res = await PATCH(req, { params: Promise.resolve({ id: "payment_reminders" }) });
      expect(res.status).toBe(403);
    }
  });

  it("SCHOOL_ADMIN 'enabled' değiştiremez (global anahtar yalnızca SUPER_ADMIN'e açık)", async () => {
    const { PATCH } = await import("../../app/api/v1/workflows/[id]/route");
    mockUser.value = { userId: "admin1", role: "SCHOOL_ADMIN", tenantId: DEFAULT_TENANT_ID };
    const req = new Request("https://example.test/api/v1/workflows/payment_reminders", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: false }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "payment_reminders" }) });
    expect(res.status).toBe(403);
    const json = (await res.json()) as { error?: { message?: string } };
    expect(json.error?.message).toMatch(/SUPER_ADMIN/);
  });

  it("SUPER_ADMIN 'enabled' değiştirebilir", async () => {
    const { PATCH } = await import("../../app/api/v1/workflows/[id]/route");
    mockUser.value = { userId: "super1", role: "SUPER_ADMIN", tenantId: DEFAULT_TENANT_ID };
    const req = new Request("https://example.test/api/v1/workflows/payment_reminders", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: false }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "payment_reminders" }) });
    expect(res.status).toBe(200);
  });

  it("SCHOOL_ADMIN yine de runNow (kendi tenant'ında) tetikleyebilir", async () => {
    const { PATCH } = await import("../../app/api/v1/workflows/[id]/route");
    mockUser.value = { userId: "admin1", role: "SCHOOL_ADMIN", tenantId: DEFAULT_TENANT_ID };
    const req = new Request("https://example.test/api/v1/workflows/payment_reminders", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ runNow: true }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "payment_reminders" }) });
    expect(res.status).toBe(200);
  });
});

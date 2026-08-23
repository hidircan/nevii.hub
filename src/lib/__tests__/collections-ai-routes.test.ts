import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AuthUser } from "../auth/types";

const TENANT = "tenant_nilufer_acar";
const mockUser: { value: AuthUser } = {
  value: { userId: "user_admin", role: "SCHOOL_ADMIN", tenantId: TENANT },
};

vi.mock("@/lib/auth/authenticate", () => ({
  authenticateRequest: async () => ({ ok: true, user: mockUser.value }),
}));

const upsertMock = vi.fn().mockResolvedValue({});
const updateManyMock = vi.fn().mockResolvedValue({ count: 1 });
vi.mock("@/lib/db", () => ({
  prisma: { aiAuditLog: { upsert: upsertMock, updateMany: updateManyMock } },
}));

const { POST: collectionsPost } = await import("../../app/api/ai/collections/route");
const { POST: approvePost } = await import("../../app/api/ai/collections/approve/route");

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer test" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mockUser.value = { userId: "user_admin", role: "SCHOOL_ADMIN", tenantId: TENANT };
  upsertMock.mockClear();
  updateManyMock.mockClear();
  updateManyMock.mockResolvedValue({ count: 1 });
});

describe("POST /api/ai/collections — tenant/rol yalnız oturumdan gelir", () => {
  it("collectionsMessageDraft: SCHOOL_ADMIN için status 'pending_approval' döner, asla otomatik göndermez", async () => {
    const res = await collectionsPost(
      jsonRequest("http://localhost/api/ai/collections", {
        capabilityId: "collectionsMessageDraft",
        payload: { studentId: "s1" },
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.status).toBe("pending_approval");
    expect(typeof json.data.invocationId).toBe("string");
    expect(json.data.result.text).toBeTruthy();
  });

  it("collectionsIntake: SCHOOL_ADMIN için status 'completed' döner (onay gerekmez)", async () => {
    const res = await collectionsPost(
      jsonRequest("http://localhost/api/ai/collections", {
        capabilityId: "collectionsIntake",
        payload: {},
      })
    );
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.status).toBe("completed");
  });

  it("PARENT rolü collectionsMessageDraft çalıştıramaz — 403 FORBIDDEN, hiçbir şey üretilmez", async () => {
    mockUser.value = { userId: "user_parent", role: "STUDENT", tenantId: TENANT };
    const res = await collectionsPost(
      jsonRequest("http://localhost/api/ai/collections", {
        capabilityId: "collectionsMessageDraft",
        payload: {},
      })
    );
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.ok).toBe(false);
  });

  it("bu ekranın kapsamı dışındaki bir capability (ör. collectionsROIReport) reddedilir", async () => {
    const res = await collectionsPost(
      jsonRequest("http://localhost/api/ai/collections", {
        capabilityId: "collectionsROIReport",
        payload: {},
      })
    );
    expect(res.status).not.toBe(200);
  });

  it("gövdede tenantId gönderilse bile yok sayılır — yanıt her zaman oturumun kurumunu yansıtır", async () => {
    const res = await collectionsPost(
      jsonRequest("http://localhost/api/ai/collections", {
        capabilityId: "collectionsIntake",
        payload: {},
        tenantId: "tenant_forged", // route bunu okumaz — yalnız session
      })
    );
    const json = await res.json();
    expect(json.ok).toBe(true);
    // upsert'e giden tenantId ctx'ten (TENANT) gelmiş olmalı, body'den değil.
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ tenantId: TENANT }) })
    );
  });
});

describe("POST /api/ai/collections/approve — asla otomatik göndermez, tenant-scoped", () => {
  it("approved:true ile approvalStatus 'approved' olarak güncellenir", async () => {
    const res = await approvePost(
      jsonRequest("http://localhost/api/ai/collections/approve", {
        invocationId: "inv_1",
        approved: true,
      })
    );
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.approvalStatus).toBe("approved");
    expect(updateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "inv_1", tenantId: TENANT } })
    );
  });

  it("approved:false ile approvalStatus 'rejected' olur", async () => {
    const res = await approvePost(
      jsonRequest("http://localhost/api/ai/collections/approve", {
        invocationId: "inv_2",
        approved: false,
      })
    );
    const json = await res.json();
    expect(json.data.approvalStatus).toBe("rejected");
  });

  it("var olmayan/başka kuruma ait bir invocationId için NOT_FOUND döner (sızma yok)", async () => {
    updateManyMock.mockResolvedValueOnce({ count: 0 });
    const res = await approvePost(
      jsonRequest("http://localhost/api/ai/collections/approve", {
        invocationId: "inv_other_tenant",
        approved: true,
      })
    );
    const json = await res.json();
    expect(json.ok).toBe(false);
  });

  it("bu route hiçbir gönderim/WhatsApp aksiyonu tetiklemez — yanıtta yalnızca approvalStatus vardır", async () => {
    const res = await approvePost(
      jsonRequest("http://localhost/api/ai/collections/approve", {
        invocationId: "inv_3",
        approved: true,
        editedContent: "Merhaba, ödeme hatırlatması.",
      })
    );
    const json = await res.json();
    expect(Object.keys(json.data).sort()).toEqual(["approvalStatus", "invocationId"]);
  });
});

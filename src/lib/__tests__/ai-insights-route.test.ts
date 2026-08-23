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
vi.mock("@/lib/db", () => ({
  prisma: { aiAuditLog: { upsert: upsertMock, updateMany: vi.fn() } },
}));

const { POST } = await import("../../app/api/ai/insights/route");

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
});

describe("POST /api/ai/insights — read-only, no-approval capabilities", () => {
  it("attendanceDailySummary: SCHOOL_ADMIN için status 'completed' döner", async () => {
    const res = await POST(
      jsonRequest("http://localhost/api/ai/insights", {
        capabilityId: "attendanceDailySummary",
        payload: { totalLessons: 5, present: 3 },
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.status).toBe("completed");
    expect(json.data.result.text).toBeTruthy();
  });

  it("makeupSlotSuggestion: TEACHER rolü çalıştırabilir (heuristic, deterministik)", async () => {
    mockUser.value = { userId: "user_teacher", role: "TEACHER", tenantId: TENANT };
    const res = await POST(
      jsonRequest("http://localhost/api/ai/insights", {
        capabilityId: "makeupSlotSuggestion",
        payload: { openCount: 4 },
      })
    );
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it("collectionsROIReport: TEACHER rolü çalıştıramaz — 403 FORBIDDEN", async () => {
    mockUser.value = { userId: "user_teacher", role: "TEACHER", tenantId: TENANT };
    const res = await POST(
      jsonRequest("http://localhost/api/ai/insights", {
        capabilityId: "collectionsROIReport",
        payload: {},
      })
    );
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.ok).toBe(false);
  });

  it("teacherPerformanceScore: TEACHER rolü çalıştıramaz (HR-hassas, yalnız işletme sahibi) — 403", async () => {
    mockUser.value = { userId: "user_teacher", role: "TEACHER", tenantId: TENANT };
    const res = await POST(
      jsonRequest("http://localhost/api/ai/insights", {
        capabilityId: "teacherPerformanceScore",
        payload: { teacherName: "Ada", score: 90 },
      })
    );
    expect(res.status).toBe(403);
  });

  it("teacherPerformanceScore: SCHOOL_ADMIN çalıştırabilir", async () => {
    const res = await POST(
      jsonRequest("http://localhost/api/ai/insights", {
        capabilityId: "teacherPerformanceScore",
        payload: { teacherName: "Ada", score: 90 },
      })
    );
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.status).toBe("completed");
  });

  it("attendanceRiskAssessment: TEACHER rolü de çalıştırabilir (SCHOOL_STAFF)", async () => {
    mockUser.value = { userId: "user_teacher", role: "TEACHER", tenantId: TENANT };
    const res = await POST(
      jsonRequest("http://localhost/api/ai/insights", {
        capabilityId: "attendanceRiskAssessment",
        payload: { atRiskCount: 2 },
      })
    );
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it("attendanceRiskAssessment: PARENT rolü çalıştıramaz — 403", async () => {
    mockUser.value = { userId: "user_parent", role: "STUDENT", tenantId: TENANT };
    const res = await POST(
      jsonRequest("http://localhost/api/ai/insights", {
        capabilityId: "attendanceRiskAssessment",
        payload: {},
      })
    );
    expect(res.status).toBe(403);
  });

  it("collectionsMessageDraft bu ekranın kapsamı dışında — reddedilir (yalnız /api/ai/collections'ta)", async () => {
    const res = await POST(
      jsonRequest("http://localhost/api/ai/insights", {
        capabilityId: "collectionsMessageDraft",
        payload: {},
      })
    );
    expect(res.status).not.toBe(200);
  });

  it("gövdede tenantId gönderilse bile yok sayılır — yanıt her zaman oturumun kurumunu yansıtır", async () => {
    const res = await POST(
      jsonRequest("http://localhost/api/ai/insights", {
        capabilityId: "attendanceDailySummary",
        payload: {},
        tenantId: "tenant_forged",
      })
    );
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ tenantId: TENANT }) })
    );
  });
});

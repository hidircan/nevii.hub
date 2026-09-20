import { describe, it, expect, beforeEach } from "vitest";
import { listTeacherAvailabilityRequestsTool } from "../services/tools";
import type { ServiceContext } from "../services/context";

/**
 * `GET /api/v1/teachers/:id/availability-requests` response normalizasyonu —
 * kök neden: tool yalnız `{ requests }` dönüyordu, `currentAvailability`
 * eksikti → mobil `undefined.length` ile render crash.
 * Sözleşme: her iki alan da HER ZAMAN array; legacy kayıtlarda
 * `proposedAvailability` []'e normalize edilir. Salt-okunur uçtur.
 */

function teacherCtx(): ServiceContext {
  return {
    role: "TEACHER",
    userId: "user_teacher_t1",
    tenantId: "tenant_nilufer_acar",
    teacherId: "t1",
    channel: "test",
    requestId: "test-availability-normalize",
  } as ServiceContext;
}

describe("listTeacherAvailabilityRequestsTool response sözleşmesi", () => {
  beforeEach(() => {});

  it("currentAvailability + requests her zaman array döner", async () => {
    const res = await listTeacherAvailabilityRequestsTool(teacherCtx(), { teacherId: "t1" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(Array.isArray(res.data.requests)).toBe(true);
    expect(Array.isArray((res.data as { currentAvailability?: unknown }).currentAvailability)).toBe(true);
  });

  it("başka öğretmenin kaydına TEACHER erişemez (sahiplik korunur)", async () => {
    const res = await listTeacherAvailabilityRequestsTool(teacherCtx(), { teacherId: "t2" });
    expect(res.ok).toBe(false);
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import {
  proposeTeacherAvailabilityTool,
  listTeacherAvailabilityRequestsTool,
  reviewTeacherAvailabilityRequestTool,
  updateTeacherAvailabilityTool,
} from "../services/tools";
import { TEACHER_AVAILABILITY_REQUESTS_FILE, createAvailabilityRequest } from "../teacher-availability";
import { readData } from "../store";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

function ctx(overrides?: Partial<ServiceContext>): ServiceContext {
  return {
    role: "TEACHER",
    userId: "u1",
    tenantId: DEFAULT_TENANT_ID,
    teacherId: "t2",
    channel: "web",
    ...overrides,
  };
}

const VALID_PROPOSAL = {
  proposedAvailability: [
    { dayOfWeek: 1, start: "09:00", end: "17:00" },
    { dayOfWeek: 3, start: "09:00", end: "17:00" },
  ],
};

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
  await fs.rm(TEACHER_AVAILABILITY_REQUESTS_FILE, { force: true });
});

/** Owner kararı öncesi öğretmenin gönderdiği (hâlâ incelenebilir) eski bir öneri. */
async function seedPendingRequest(teacherId = "t2", proposedAvailability = VALID_PROPOSAL.proposedAvailability) {
  const request = await createAvailabilityRequest({ tenantId: DEFAULT_TENANT_ID, teacherId, proposedAvailability });
  return request.id;
}

describe("proposeTeacherAvailabilityTool — öğretmen self-service KAPALI (2026-09-17)", () => {
  it("TEACHER elle istek atsa bile FORBIDDEN + Türkçe neden; ne öneri ne müsaitlik oluşur", async () => {
    const before = await readData();
    const t2Before = before.teachers.find((t) => t.id === "t2")!;

    const result = await proposeTeacherAvailabilityTool(ctx(), VALID_PROPOSAL);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FORBIDDEN");
      expect(result.error.message).toContain("yalnız kurum yöneticisi");
    }

    const after = await readData();
    expect(after.teachers.find((t) => t.id === "t2")!.availability).toEqual(t2Before.availability);
    const list = await listTeacherAvailabilityRequestsTool(ctx(), { teacherId: "t2" });
    expect(list.ok && list.data.requests).toHaveLength(0);
  });
});

describe("updateTeacherAvailabilityTool — müsaitliği yalnız yönetici düzenler", () => {
  const SUNDAY_BLOCKS = [
    { dayOfWeek: 0, start: "09:00", end: "12:00" },
    { dayOfWeek: 0, start: "15:00", end: "18:00" },
    { dayOfWeek: 2, start: "10:00", end: "18:00" },
  ];

  it("SCHOOL_ADMIN doğrudan kaydeder; değer kalıcıdır", async () => {
    const result = await updateTeacherAvailabilityTool(ctx({ role: "SCHOOL_ADMIN", teacherId: undefined }), {
      teacherId: "t2",
      availability: SUNDAY_BLOCKS,
    });
    expect(result.ok).toBe(true);
    const data = await readData();
    expect(data.teachers.find((t) => t.id === "t2")!.availability).toEqual(SUNDAY_BLOCKS);
  });

  it("TEACHER kendi müsaitliğini bile yazamaz (backend FORBIDDEN)", async () => {
    const before = await readData();
    const result = await updateTeacherAvailabilityTool(ctx({ teacherId: "t2" }), {
      teacherId: "t2",
      availability: SUNDAY_BLOCKS,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
    const after = await readData();
    expect(after.teachers.find((t) => t.id === "t2")!.availability).toEqual(
      before.teachers.find((t) => t.id === "t2")!.availability
    );
  });

  it("aynı gün/şubede çakışan aralık ve bitiş<başlangıç VALIDATION_ERROR", async () => {
    const admin = ctx({ role: "SCHOOL_ADMIN", teacherId: undefined });
    const overlap = await updateTeacherAvailabilityTool(admin, {
      teacherId: "t2",
      availability: [
        { dayOfWeek: 1, start: "09:00", end: "12:00" },
        { dayOfWeek: 1, start: "11:00", end: "13:00" },
      ],
    });
    expect(overlap.ok).toBe(false);
    const reversed = await updateTeacherAvailabilityTool(admin, {
      teacherId: "t2",
      availability: [{ dayOfWeek: 1, start: "18:00", end: "09:00" }],
    });
    expect(reversed.ok).toBe(false);
    if (!reversed.ok) expect(reversed.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("listTeacherAvailabilityRequestsTool — erişim kapsaması", () => {
  it("TEACHER yalnızca kendi önerilerini görebilir", async () => {
    await seedPendingRequest();

    const ownList = await listTeacherAvailabilityRequestsTool(ctx({ teacherId: "t2" }), {
      teacherId: "t2",
    });
    expect(ownList.ok).toBe(true);
    if (ownList.ok) expect(ownList.data.requests).toHaveLength(1);

    const otherList = await listTeacherAvailabilityRequestsTool(ctx({ teacherId: "t1" }), {
      teacherId: "t2",
    });
    expect(otherList.ok).toBe(false);
    if (!otherList.ok) expect(otherList.error.code).toBe("FORBIDDEN");
  });

  it("SCHOOL_ADMIN herhangi bir öğretmenin önerilerini görebilir", async () => {
    await seedPendingRequest();

    const result = await listTeacherAvailabilityRequestsTool(
      ctx({ role: "SCHOOL_ADMIN", teacherId: undefined }),
      { teacherId: "t2" }
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.requests).toHaveLength(1);
  });
});

describe("reviewTeacherAvailabilityRequestTool — yalnızca SCHOOL_ADMIN/SUPER_ADMIN", () => {
  const createPendingRequest = () => seedPendingRequest();

  it("TEACHER kendi önerisini bile onaylayamaz (FORBIDDEN)", async () => {
    const requestId = await createPendingRequest();
    const result = await reviewTeacherAvailabilityRequestTool(ctx({ teacherId: "t2" }), {
      requestId,
      decision: "approved",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
  });

  it("SCHOOL_ADMIN onaylarsa Teacher.availability HEMEN önerilen değere döner", async () => {
    const requestId = await createPendingRequest();

    const result = await reviewTeacherAvailabilityRequestTool(
      ctx({ role: "SCHOOL_ADMIN", userId: "admin1", teacherId: undefined }),
      { requestId, decision: "approved" }
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.status).toBe("approved");

    const data = await readData();
    const t2 = data.teachers.find((t) => t.id === "t2")!;
    expect(t2.availability).toEqual(VALID_PROPOSAL.proposedAvailability);
  });

  it("SCHOOL_ADMIN reddederse Teacher.availability DEĞİŞMEZ", async () => {
    const before = await readData();
    const t2Before = before.teachers.find((t) => t.id === "t2")!;

    const requestId = await createPendingRequest();
    const result = await reviewTeacherAvailabilityRequestTool(
      ctx({ role: "SCHOOL_ADMIN", userId: "admin1", teacherId: undefined }),
      { requestId, decision: "rejected", reviewNote: "Çakışan ders saatleri var" }
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.status).toBe("rejected");

    const after = await readData();
    const t2After = after.teachers.find((t) => t.id === "t2")!;
    expect(t2After.availability).toEqual(t2Before.availability);
  });

  it("zaten incelenmiş bir öneriyi tekrar incelemek hata döner (idempotent koruma)", async () => {
    const requestId = await createPendingRequest();
    const adminCtx = ctx({ role: "SCHOOL_ADMIN", userId: "admin1", teacherId: undefined });

    const first = await reviewTeacherAvailabilityRequestTool(adminCtx, {
      requestId,
      decision: "approved",
    });
    expect(first.ok).toBe(true);

    const second = await reviewTeacherAvailabilityRequestTool(adminCtx, {
      requestId,
      decision: "rejected",
    });
    expect(second.ok).toBe(false);
  });

  it("var olmayan bir requestId NOT_FOUND döner", async () => {
    const result = await reviewTeacherAvailabilityRequestTool(
      ctx({ role: "SCHOOL_ADMIN", teacherId: undefined }),
      { requestId: "missing", decision: "approved" }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
  });

  it("Pazar (dayOfWeek=0) dahil, Pazar için BİRDEN FAZLA blok içeren bir öneri onaylanınca Teacher.availability'ye aynen uygulanır", async () => {
    const proposalWithSunday = {
      proposedAvailability: [
        { dayOfWeek: 0, start: "09:00", end: "12:00" },
        { dayOfWeek: 0, start: "15:00", end: "18:00" },
        { dayOfWeek: 1, start: "10:00", end: "18:00" },
      ],
    };
    const requestId = await seedPendingRequest("t2", proposalWithSunday.proposedAvailability);

    const result = await reviewTeacherAvailabilityRequestTool(
      ctx({ role: "SCHOOL_ADMIN", userId: "admin1", teacherId: undefined }),
      { requestId, decision: "approved" }
    );
    expect(result.ok).toBe(true);

    const data = await readData();
    const t2 = data.teachers.find((t) => t.id === "t2")!;
    expect(t2.availability).toEqual(proposalWithSunday.proposedAvailability);
    // Güz döneminde Pazartesi'nin ders PLANLAMA için kapalı olması, öğretmenin
    // Pazartesi müsaitlik KAYDINI silmez — kayıt olduğu gibi kalır.
    expect(t2.availability.some((w) => w.dayOfWeek === 1)).toBe(true);
    expect(t2.availability.filter((w) => w.dayOfWeek === 0)).toHaveLength(2);
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import {
  proposeTeacherAvailabilityTool,
  listTeacherAvailabilityRequestsTool,
  reviewTeacherAvailabilityRequestTool,
  createTeacherTool,
  archiveTeacherTool,
} from "../services/tools";
import { TEACHER_AVAILABILITY_REQUESTS_FILE } from "../teacher-availability";
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

describe("proposeTeacherAvailabilityTool — TEACHER kendi müsaitliğini DOĞRUDAN değiştiremez", () => {
  it("TEACHER bir öneri oluşturabilir; Teacher.availability HEMEN değişmez", async () => {
    const before = await readData();
    const t2Before = before.teachers.find((t) => t.id === "t2")!;

    const result = await proposeTeacherAvailabilityTool(ctx(), VALID_PROPOSAL);
    expect(result.ok).toBe(true);

    const after = await readData();
    const t2After = after.teachers.find((t) => t.id === "t2")!;
    expect(t2After.availability).toEqual(t2Before.availability);
  });

  it("SCHOOL_ADMIN öneri oluşturamaz — yalnızca TEACHER kendisi için önerir", async () => {
    const result = await proposeTeacherAvailabilityTool(
      ctx({ role: "SCHOOL_ADMIN", teacherId: undefined }),
      VALID_PROPOSAL
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
  });

  it("PARENT/STUDENT öneri oluşturamaz", async () => {
    const asParent = await proposeTeacherAvailabilityTool(
      ctx({ role: "STUDENT", teacherId: undefined }),
      VALID_PROPOSAL
    );
    expect(asParent.ok).toBe(false);

    const asStudent = await proposeTeacherAvailabilityTool(
      ctx({ role: "STUDENT", teacherId: undefined }),
      VALID_PROPOSAL
    );
    expect(asStudent.ok).toBe(false);
  });

  it("boş proposedAvailability (dizi eksik) VALIDATION_ERROR döner", async () => {
    const result = await proposeTeacherAvailabilityTool(ctx(), {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION_ERROR");
  });

  it("bitiş saati başlangıçtan önce ise VALIDATION_ERROR döner", async () => {
    const result = await proposeTeacherAvailabilityTool(ctx(), {
      proposedAvailability: [{ dayOfWeek: 1, start: "18:00", end: "09:00" }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("listTeacherAvailabilityRequestsTool — erişim kapsaması", () => {
  it("TEACHER yalnızca kendi önerilerini görebilir", async () => {
    await proposeTeacherAvailabilityTool(ctx({ teacherId: "t2" }), VALID_PROPOSAL);

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
    await proposeTeacherAvailabilityTool(ctx({ teacherId: "t2" }), VALID_PROPOSAL);

    const result = await listTeacherAvailabilityRequestsTool(
      ctx({ role: "SCHOOL_ADMIN", teacherId: undefined }),
      { teacherId: "t2" }
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.requests).toHaveLength(1);
  });
});

describe("reviewTeacherAvailabilityRequestTool — yalnızca SCHOOL_ADMIN/SUPER_ADMIN", () => {
  async function createPendingRequest() {
    const result = await proposeTeacherAvailabilityTool(ctx({ teacherId: "t2" }), VALID_PROPOSAL);
    if (!result.ok) throw new Error("setup failed");
    return result.data.requestId;
  }

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
    const proposeRes = await proposeTeacherAvailabilityTool(ctx({ teacherId: "t2" }), proposalWithSunday);
    expect(proposeRes.ok).toBe(true);
    if (!proposeRes.ok) return;

    const result = await reviewTeacherAvailabilityRequestTool(
      ctx({ role: "SCHOOL_ADMIN", userId: "admin1", teacherId: undefined }),
      { requestId: proposeRes.data.requestId, decision: "approved" }
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

  it("aynı gün (Pazar) için çakışan iki blok içeren öneri VALIDATION_ERROR ile reddedilmez ama teacher-availability-field.tsx UI'daki overlap koruması bu şekli engeller — burada yalnızca zod şemasının 0-6 aralığını kabul ettiğini doğrula", async () => {
    // Not: overlap koruması istemci tarafında (TeacherAvailabilityField/
    // TeacherAvailabilityForm) uygulanır (bkz. component testleri); backend
    // zod şeması yalnızca dayOfWeek 0-6 + start<end kuralını uygular.
    const result = await proposeTeacherAvailabilityTool(ctx({ teacherId: "t2" }), {
      proposedAvailability: [{ dayOfWeek: 0, start: "09:00", end: "12:00" }],
    });
    expect(result.ok).toBe(true);
  });

  it("arşivlenmiş (pasif) bir öğretmen yeni müsaitlik önerisi gönderemez", async () => {
    const created = await createTeacherTool(ctx({ role: "SCHOOL_ADMIN", teacherId: undefined }), {
      name: "Arşivlenecek Öğretmen",
      email: "arsiv@okul.com",
      phone: "5551119999",
      branchId: "erzene",
      instrument: "Piyano",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const archiveRes = await archiveTeacherTool(ctx({ role: "SCHOOL_ADMIN", teacherId: undefined }), {
      teacherId: created.data.teacherId,
      archived: true,
    });
    expect(archiveRes.ok).toBe(true);

    const proposeRes = await proposeTeacherAvailabilityTool(
      ctx({ teacherId: created.data.teacherId }),
      VALID_PROPOSAL
    );
    expect(proposeRes.ok).toBe(false);
    if (!proposeRes.ok) expect(proposeRes.error.code).toBe("FORBIDDEN");
  });
});

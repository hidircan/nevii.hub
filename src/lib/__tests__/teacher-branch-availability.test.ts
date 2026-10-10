import { describe, it, expect, beforeEach, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { validateLessonSlot } from "../makeup-engine";
import {
  teacherServesBranch,
  availabilityForBranch,
  isTeacherSchedulable,
  allAssignedBranches,
} from "../teacher-branches";
import type { AppData, Teacher } from "../types";
import {
  createTeacherTool,
  findAvailableTeachersTool,
  updateTeacherProfileTool,
  setNationalIdTool,
  revealNationalIdTool,
} from "../services/tools";
import { readData } from "../store";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

vi.mock("../audit/log", () => ({ recordAuditLog: vi.fn().mockResolvedValue(undefined) }));

function ctx(overrides?: Partial<ServiceContext>): ServiceContext {
  return {
    role: "SCHOOL_ADMIN",
    userId: "u1",
    tenantId: DEFAULT_TENANT_ID,
    channel: "web",
    ...overrides,
  };
}

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
  vi.clearAllMocks();
});

describe("Package D — teacherServesBranch / availabilityForBranch / isTeacherSchedulable (saf helper)", () => {
  const teacher: Pick<Teacher, "branchId" | "branchIds" | "active" | "terminationDate"> = {
    branchId: "erzene",
    branchIds: ["bostanli"],
    active: true,
  };

  it("birincil şube her zaman dahildir", () => {
    expect(teacherServesBranch(teacher, "erzene")).toBe(true);
  });

  it("ek atanmış şube de dahildir", () => {
    expect(teacherServesBranch(teacher, "bostanli")).toBe(true);
  });

  it("atanmamış şube reddedilir", () => {
    expect(teacherServesBranch(teacher, "karsiyaka")).toBe(false);
  });

  it("allAssignedBranches birincil + ek şubeleri tekrarsız döner", () => {
    expect(allAssignedBranches(teacher).sort()).toEqual(["bostanli", "erzene"]);
  });

  it("availabilityForBranch yalnız o şubeye özel + branchId'siz (tüm şubeler) pencereleri döner", () => {
    const windows = [
      { dayOfWeek: 2, start: "10:00", end: "14:00", branchId: "erzene" },
      { dayOfWeek: 2, start: "15:00", end: "18:00", branchId: "bostanli" },
      { dayOfWeek: 2, start: "09:00", end: "12:00" }, // branchId yok — tüm şubeler
    ];
    const forErzene = availabilityForBranch(windows, "erzene");
    expect(forErzene).toHaveLength(2);
    expect(forErzene.some((w) => w.branchId === "bostanli")).toBe(false);

    const forBostanli = availabilityForBranch(windows, "bostanli");
    expect(forBostanli).toHaveLength(2);
    expect(forBostanli.some((w) => w.branchId === "erzene")).toBe(false);
  });

  it("isTeacherSchedulable pasif öğretmeni reddeder", () => {
    expect(isTeacherSchedulable({ active: false, terminationDate: undefined })).toBe(false);
  });

  it("isTeacherSchedulable geçmiş terminationDate'i olan öğretmeni reddeder (active=true olsa bile)", () => {
    const past = new Date();
    past.setDate(past.getDate() - 1);
    expect(isTeacherSchedulable({ active: true, terminationDate: past.toISOString() })).toBe(false);
  });

  it("isTeacherSchedulable gelecekteki terminationDate'i olan öğretmeni KABUL eder (henüz ayrılmadı)", () => {
    const future = new Date();
    future.setDate(future.getDate() + 30);
    expect(isTeacherSchedulable({ active: true, terminationDate: future.toISOString() })).toBe(true);
  });
});

function buildFixture(): AppData {
  const now = new Date();
  const nextMonday = new Date(now); // 2026-09-20: artık SALI — Pazartesi Güz döneminin kapalı günü
  const add = ((2 - now.getDay() + 7) % 7) || 7;
  nextMonday.setDate(now.getDate() + add);
  const startAt = new Date(nextMonday);
  startAt.setHours(11, 0, 0, 0);

  return {
    settings: {
      tenantId: "tenant_test",
      name: "Test Akademi",
      shortName: "Test",
      city: "İzmir",
      website: "",
      email: "",
      phone: "",
      logoUrl: "",
      makeupWindowDays: 14,
      lessonDurationMinutes: 45,
      workingHours: { start: "10:00", end: "18:00" },
      workingDays: [1, 2, 3, 4, 5],
      currency: "TRY",
      feeRoundingMode: "exact_minutes",
      branches: [
        { id: "erzene", name: "Erzene", shortName: "Erzene", address: "", phone: "", city: "İzmir" },
        { id: "bostanli", name: "Bostanlı", shortName: "Bostanlı", address: "", phone: "", city: "İzmir" },
      ],
    },
    teachers: [
      {
        id: "t1",
        name: "Nilüfer",
        email: "t1@test.com",
        phone: "",
        branchId: "erzene",
        branchIds: ["bostanli"],
        instruments: ["Piyano"],
        // Erzene: Salı 10-14. Bostanlı: Salı 15-18. Farklı pencereler.
        availability: [
          { dayOfWeek: 2, start: "10:00", end: "14:00", branchId: "erzene" },
          { dayOfWeek: 2, start: "15:00", end: "18:00", branchId: "bostanli" },
        ],
        maxDailyLessons: 8,
        active: true,
        color: "#000",
      },
    ],
    students: [
      {
        id: "s1",
        name: "Zeynep",
        email: "",
        phone: "",
        parentName: "Veli",
        parentPhone: "",
        branchId: "erzene",
        instruments: ["Piyano"],
        teacherId: "t1",
        packageName: "Bireysel Aylık",
        weeklyLessonCount: 1,
        monthlyFee: 3000,
        active: true,
        notes: "",
        createdAt: now.toISOString(),
      },
    ],
    rooms: [
      { id: "r_erzene", name: "Oda E1", branchId: "erzene", capacity: 1, instruments: ["Piyano"], active: true },
      { id: "r_bostanli", name: "Oda B1", branchId: "bostanli", capacity: 1, instruments: ["Piyano"], active: true },
    ],
    lessons: [],
    attendances: [],
    makeupRequests: [],
    payments: [],
    notifications: [],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as AppData & { _startAt?: string };
}

describe("Package D — validateLessonSlot şube-bazlı müsaitlik", () => {
  it("öğretmenin Erzene için tanımlı penceresi Bostanlı odasında GEÇERSİZDİR (TEACHER_UNAVAILABLE)", () => {
    const data = buildFixture();
    const now = new Date();
    const nextMonday = new Date(now); // 2026-09-20: artık SALI — Pazartesi Güz döneminin kapalı günü
    const add = ((2 - now.getDay() + 7) % 7) || 7;
    nextMonday.setDate(now.getDate() + add);
    // Erzene penceresi saatinde (10-14) ama BOSTANLI odasında dene.
    const startAt = new Date(nextMonday);
    startAt.setHours(11, 0, 0, 0);

    const result = validateLessonSlot(
      data,
      { instrument: "Piyano", studentId: "s1" },
      { teacherId: "t1", roomId: "r_bostanli", startAt: startAt.toISOString() }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("TEACHER_UNAVAILABLE");
  });

  it("öğretmenin Bostanlı için tanımlı penceresi Bostanlı odasında GEÇERLİDİR", () => {
    const data = buildFixture();
    const now = new Date();
    const nextMonday = new Date(now); // 2026-09-20: artık SALI — Pazartesi Güz döneminin kapalı günü
    const add = ((2 - now.getDay() + 7) % 7) || 7;
    nextMonday.setDate(now.getDate() + add);
    const startAt = new Date(nextMonday);
    startAt.setHours(16, 0, 0, 0);

    const result = validateLessonSlot(
      data,
      { instrument: "Piyano", studentId: "s1" },
      { teacherId: "t1", roomId: "r_bostanli", startAt: startAt.toISOString() }
    );
    expect(result.ok).toBe(true);
  });

  it("Erzene penceresi Erzene odasında da GEÇERLİDİR (kendi şubesi)", () => {
    const data = buildFixture();
    const now = new Date();
    const nextMonday = new Date(now); // 2026-09-20: artık SALI — Pazartesi Güz döneminin kapalı günü
    const add = ((2 - now.getDay() + 7) % 7) || 7;
    nextMonday.setDate(now.getDate() + add);
    const startAt = new Date(nextMonday);
    startAt.setHours(11, 0, 0, 0);

    const result = validateLessonSlot(
      data,
      { instrument: "Piyano", studentId: "s1" },
      { teacherId: "t1", roomId: "r_erzene", startAt: startAt.toISOString() }
    );
    expect(result.ok).toBe(true);
  });

  it("öğretmen atanmamış bir şubede (üçüncü şube) ders alamaz — ROOM_BRANCH_MISMATCH", () => {
    const data = buildFixture();
    data.rooms.push({
      id: "r_karsiyaka",
      name: "Oda K1",
      branchId: "karsiyaka",
      capacity: 1,
      instruments: ["Piyano"],
      active: true,
    });
    const now = new Date();
    const nextMonday = new Date(now); // 2026-09-20: artık SALI — Pazartesi Güz döneminin kapalı günü
    const add = ((2 - now.getDay() + 7) % 7) || 7;
    nextMonday.setDate(now.getDate() + add);
    const startAt = new Date(nextMonday);
    startAt.setHours(11, 0, 0, 0);

    const result = validateLessonSlot(
      data,
      { instrument: "Piyano", studentId: "s1" },
      { teacherId: "t1", roomId: "r_karsiyaka", startAt: startAt.toISOString() }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("ROOM_BRANCH_MISMATCH");
  });

  it("işten ayrılmış (terminationDate geçmiş) öğretmen için TEACHER_INACTIVE döner, active=true olsa bile", () => {
    const data = buildFixture();
    const past = new Date();
    past.setDate(past.getDate() - 5);
    data.teachers[0]!.terminationDate = past.toISOString();
    const now = new Date();
    const nextMonday = new Date(now); // 2026-09-20: artık SALI — Pazartesi Güz döneminin kapalı günü
    const add = ((2 - now.getDay() + 7) % 7) || 7;
    nextMonday.setDate(now.getDate() + add);
    const startAt = new Date(nextMonday);
    startAt.setHours(11, 0, 0, 0);

    const result = validateLessonSlot(
      data,
      { instrument: "Piyano", studentId: "s1" },
      { teacherId: "t1", roomId: "r_erzene", startAt: startAt.toISOString() }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("TEACHER_INACTIVE");
  });
});

describe("Package D — findAvailableTeachersTool şube/schedulable filtresi", () => {
  it("branchId filtresi yalnız o şubeye atanmış (birincil veya ek) öğretmenleri döner", async () => {
    const res = await findAvailableTeachersTool(ctx(), { branchId: "erzene" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.teachers.some((t) => t.id === "t1")).toBe(true);

    const other = await findAvailableTeachersTool(ctx(), { branchId: "does-not-exist" });
    expect(other.ok).toBe(true);
    if (!other.ok) return;
    expect(other.data.teachers).toHaveLength(0);
  });

  it("işten ayrılmış (terminationDate geçmiş) öğretmen sonuçta görünmez", async () => {
    const before = await findAvailableTeachersTool(ctx(), {});
    expect(before.ok).toBe(true);
    if (!before.ok) return;
    expect(before.data.teachers.some((t) => t.id === "t1")).toBe(true);

    const past = new Date();
    past.setDate(past.getDate() - 1);
    const upd = await updateTeacherProfileTool(ctx(), { teacherId: "t1", terminationDate: past.toISOString().slice(0, 10), hireDate: "2020-01-01" });
    expect(upd.ok).toBe(true);

    const after = await findAvailableTeachersTool(ctx(), {});
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    expect(after.data.teachers.some((t) => t.id === "t1")).toBe(false);
  });
});

describe("Package D — updateTeacherProfileTool", () => {
  it("TEACHER/PARENT özlük bilgisi güncelleyemez (RBAC)", async () => {
    const res = await updateTeacherProfileTool(ctx({ role: "TEACHER", teacherId: "t1" }), {
      teacherId: "t1",
      address: "X",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("FORBIDDEN");
  });

  it("sözleşme bitiş tarihi başlangıçtan önce olamaz", async () => {
    const res = await updateTeacherProfileTool(ctx(), {
      teacherId: "t1",
      contractStartDate: "2026-06-01",
      contractEndDate: "2026-01-01",
    });
    expect(res.ok).toBe(false);
  });

  it("ayrılış tarihi işe girişten önce olamaz", async () => {
    const res = await updateTeacherProfileTool(ctx(), {
      teacherId: "t1",
      hireDate: "2026-06-01",
      terminationDate: "2026-01-01",
    });
    expect(res.ok).toBe(false);
  });

  it("geçerli sıralı tarihler kabul edilir ve kalıcı kaydedilir", async () => {
    const res = await updateTeacherProfileTool(ctx(), {
      teacherId: "t1",
      hireDate: "2024-01-01",
      contractStartDate: "2024-01-01",
      contractEndDate: "2026-12-31",
      branchIds: ["evka3"],
      employmentType: "tam_zamanli",
      emergencyContactName: "Ayşe",
      emergencyContactPhone: "5551112233",
    });
    expect(res.ok).toBe(true);

    const data = await readData();
    const teacher = data.teachers.find((t) => t.id === "t1")!;
    expect(teacher.hireDate?.slice(0, 10)).toBe("2024-01-01");
    expect(teacher.contractEndDate?.slice(0, 10)).toBe("2026-12-31");
    expect(teacher.branchIds).toEqual(["evka3"]);
    expect(teacher.employmentType).toBe("tam_zamanli");
    expect(teacher.emergencyContactName).toBe("Ayşe");
  });

  it("geçersiz (tenant dışı/olmayan) şube atanamaz", async () => {
    const res = await updateTeacherProfileTool(ctx(), { teacherId: "t1", branchIds: ["does-not-exist"] });
    expect(res.ok).toBe(false);
  });

  it("var olmayan öğretmen NOT_FOUND döner", async () => {
    const res = await updateTeacherProfileTool(ctx(), { teacherId: "does-not-exist", address: "X" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("NOT_FOUND");
  });
});

describe("Package D — öğretmen T.C. kimlik (setNationalIdTool artık teacher'ı destekliyor)", () => {
  it("SCHOOL_ADMIN geçerli bir T.C. kimlik girebilir, maskeli döner", async () => {
    const res = await setNationalIdTool(ctx(), { entity: "teacher", entityId: "t1", nationalId: "10000000146" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.masked.endsWith("46")).toBe(true);
    expect(res.data.masked).not.toContain("10000000146");

    const data = await readData();
    const teacher = data.teachers.find((t) => t.id === "t1")!;
    expect(teacher.nationalIdCipher).toBeTruthy();
    expect(teacher.nationalIdCipher).not.toContain("10000000146");
  });

  it("geçersiz (checksum hatalı) T.C. kimlik reddedilir", async () => {
    const res = await setNationalIdTool(ctx(), { entity: "teacher", entityId: "t1", nationalId: "12345678901" });
    expect(res.ok).toBe(false);
  });

  it("TEACHER/PARENT T.C. kimlik giremez (RBAC)", async () => {
    const res = await setNationalIdTool(ctx({ role: "TEACHER", teacherId: "t1" }), {
      entity: "teacher",
      entityId: "t1",
      nationalId: "10000000146",
    });
    expect(res.ok).toBe(false);
  });

  it("yetkili rol reveal edebilir, yetkisiz rol edemez — reveal audit'lenir", async () => {
    const { recordAuditLog } = await import("../audit/log");
    await setNationalIdTool(ctx(), { entity: "teacher", entityId: "t1", nationalId: "10000000146" });

    const revealed = await revealNationalIdTool(ctx(), { entity: "teacher", entityId: "t1" });
    expect(revealed.ok).toBe(true);
    if (revealed.ok) expect(revealed.data.nationalId).toBe("10000000146");

    const teacherRole = await revealNationalIdTool(ctx({ role: "TEACHER", teacherId: "t1" }), {
      entity: "teacher",
      entityId: "t1",
    });
    expect(teacherRole.ok).toBe(false);

    expect(recordAuditLog).toHaveBeenCalled();
  });
});

describe("Package D — createTeacherTool branch-aware availability", () => {
  it("oluşturma anında branchId taşıyan müsaitlik pencereleri kaydedilir", async () => {
    const res = await createTeacherTool(ctx(), {
      name: "Yeni Öğretmen",
      email: "yeni@test.com",
      phone: "5551234567",
      branchId: "erzene",
      instrument: "Piyano",
      availability: [
        { dayOfWeek: 1, start: "10:00", end: "12:00", branchId: "erzene" },
        { dayOfWeek: 2, start: "10:00", end: "12:00" },
      ],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const data = await readData();
    const teacher = data.teachers.find((t) => t.id === res.data.teacherId)!;
    expect(teacher.availability.find((w) => w.dayOfWeek === 1)?.branchId).toBe("erzene");
    expect(teacher.availability.find((w) => w.dayOfWeek === 2)?.branchId).toBeUndefined();
  });
});

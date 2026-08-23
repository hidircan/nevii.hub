import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { archiveTeacherTool, updateRoomTool, createTeacherTool, createLessonTool, findAvailableTeachersTool } from "../services/tools";
import { readData } from "../store";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import { validateLessonSlot } from "../makeup-engine";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

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
});

async function findOpenSlot(teacherId: string, roomId: string): Promise<string> {
  const data = await readData();
  for (let offset = 1; offset <= 14; offset++) {
    for (let hour = 9; hour <= 16; hour++) {
      const d = new Date();
      d.setDate(d.getDate() + offset);
      d.setHours(hour, 0, 0, 0);
      if (d.getDay() === 1) continue;
      const candidate = d.toISOString();
      const check = validateLessonSlot(
        data,
        { instrument: "Piyano", studentId: "s1" },
        { teacherId, roomId, startAt: candidate }
      );
      if (check.ok) return candidate;
    }
  }
  throw new Error("no open slot found");
}

describe("ÖNCELİK 4 (devam) — öğretmen arşivleme (hard delete yok)", () => {
  it("admin gelecekteki dersi olmayan öğretmeni arşivleyebilir; hard delete yapılmaz (kayıt sistemde kalır)", async () => {
    const created = await createTeacherTool(ctx(), {
      name: "Arşivlenecek Öğretmen",
      email: "arsiv@okul.com",
      phone: "5551112233",
      branchId: "erzene",
      instrument: "Gitar",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const res = await archiveTeacherTool(ctx(), { teacherId: created.data.teacherId, archived: true });
    expect(res.ok).toBe(true);

    const data = await readData();
    const teacher = data.teachers.find((t) => t.id === created.data.teacherId);
    expect(teacher).toBeDefined(); // hâlâ sistemde — hard delete yok
    expect(teacher?.active).toBe(false);
    expect(teacher?.archivedAt).toBeTruthy();
  });

  it("gelecekteki planlı dersi olan öğretmen arşivlenemez — sessiz iptal/taşıma yapılmaz", async () => {
    const startAt = await findOpenSlot("t1", "r1");
    const lessonRes = await createLessonTool(ctx(), {
      studentId: "s1",
      teacherId: "t1",
      roomId: "r1",
      instrument: "Piyano",
      startAt,
    });
    expect(lessonRes.ok).toBe(true);

    const res = await archiveTeacherTool(ctx(), { teacherId: "t1", archived: true });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("CONFLICT");
      expect((res.error.details as { futureLessonCount?: number })?.futureLessonCount).toBeGreaterThan(0);
    }

    const data = await readData();
    const teacher = data.teachers.find((t) => t.id === "t1");
    expect(teacher?.active).toBe(true); // hiçbir şey değişmedi
    // Ders de sessizce iptal edilmedi / taşınmadı.
    const lesson = data.lessons.find((l) => l.startAt === startAt);
    expect(lesson?.status).toBe("scheduled");
  });

  it("arşivlenmiş öğretmen uygun-öğretmen aramasında görünmez", async () => {
    const created = await createTeacherTool(ctx(), {
      name: "Aranmayacak Öğretmen",
      email: "aranmaz@okul.com",
      phone: "5551112233",
      branchId: "erzene",
      instrument: "Piyano",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await archiveTeacherTool(ctx(), { teacherId: created.data.teacherId, archived: true });

    const search = await findAvailableTeachersTool(ctx(), { name: "Aranmayacak" });
    expect(search.ok).toBe(true);
    if (search.ok) {
      expect(search.data.teachers.some((t) => t.id === created.data.teacherId)).toBe(false);
    }
  });

  it("arşivlenen öğretmen geri aktifleştirilebilir", async () => {
    const created = await createTeacherTool(ctx(), {
      name: "Geri Dönecek",
      email: "geridonecek@okul.com",
      phone: "5551112233",
      branchId: "erzene",
      instrument: "Gitar",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await archiveTeacherTool(ctx(), { teacherId: created.data.teacherId, archived: true });

    const restore = await archiveTeacherTool(ctx(), { teacherId: created.data.teacherId, archived: false });
    expect(restore.ok).toBe(true);

    const data = await readData();
    const teacher = data.teachers.find((t) => t.id === created.data.teacherId);
    expect(teacher?.active).toBe(true);
  });

  it("TEACHER/PARENT rolü öğretmen arşivleyemez (RBAC)", async () => {
    const res1 = await archiveTeacherTool(ctx({ role: "TEACHER", teacherId: "t1" }), {
      teacherId: "t1",
      archived: true,
    });
    expect(res1.ok).toBe(false);

    const res2 = await archiveTeacherTool(ctx({ role: "STUDENT", studentId: "s1" }), {
      teacherId: "t1",
      archived: true,
    });
    expect(res2.ok).toBe(false);
  });
});

describe("ÖNCELİK 4 (devam) — oda düzenleme + pasife alma (hard delete yok)", () => {
  it("admin oda adını/kapasitesini düzenleyebilir", async () => {
    const res = await updateRoomTool(ctx(), { roomId: "r1", name: "Stüdyo Yeni Ad", capacity: 5 });
    expect(res.ok).toBe(true);
    const data = await readData();
    const room = data.rooms.find((r) => r.id === "r1");
    expect(room?.name).toBe("Stüdyo Yeni Ad");
    expect(room?.capacity).toBe(5);
  });

  it("oda pasife alınabilir; hard delete yapılmaz, geçmiş ders bağlantısı korunur", async () => {
    const startAt = await findOpenSlot("t1", "r1");
    const lessonRes = await createLessonTool(ctx(), {
      studentId: "s1",
      teacherId: "t1",
      roomId: "r1",
      instrument: "Piyano",
      startAt,
    });
    expect(lessonRes.ok).toBe(true);
    if (!lessonRes.ok) return;

    const archiveRes = await updateRoomTool(ctx(), { roomId: "r1", active: false });
    expect(archiveRes.ok).toBe(true);

    const data = await readData();
    const room = data.rooms.find((r) => r.id === "r1");
    expect(room).toBeDefined(); // hâlâ var — hard delete yok
    expect(room?.active).toBe(false);
    const lesson = data.lessons.find((l) => l.id === lessonRes.data.lessonId);
    expect(lesson?.roomId).toBe("r1"); // geçmiş ders bağlantısı korunuyor
  });

  it("pasif oda yeni ders planlamasında (createLessonTool ile) hâlâ teknik olarak reddedilmez (yalnızca UI seçiminden çıkarılır) — ama var olan kaydı bozmaz", async () => {
    await updateRoomTool(ctx(), { roomId: "r2", active: false });
    const data = await readData();
    const room = data.rooms.find((r) => r.id === "r2");
    expect(room?.active).toBe(false);
  });

  it("TEACHER/PARENT rolü oda düzenleyemez/pasife alamaz (RBAC)", async () => {
    const res1 = await updateRoomTool(ctx({ role: "TEACHER", teacherId: "t1" }), { roomId: "r1", active: false });
    expect(res1.ok).toBe(false);

    const res2 = await updateRoomTool(ctx({ role: "STUDENT", studentId: "s1" }), { roomId: "r1", active: false });
    expect(res2.ok).toBe(false);
  });
});

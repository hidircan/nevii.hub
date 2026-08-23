import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { validateLessonSlot } from "../makeup-engine";
import { createRoomTool, createLessonTool, createPaymentRecordTool } from "../services/tools";
import { readData } from "../store";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import { isWeeklyClosedDayForTerm } from "../attendance-calendar";

/** store-json.ts'in kendi çözdüğü dosya yoluyla aynı — VERCEL=1 test ortamında /tmp'e yönlenir. */
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

describe("Kurulum Merkezi · oda oluşturma", () => {
  it("admin yeni oda ekleyebilir", async () => {
    const res = await createRoomTool(ctx(), {
      name: "Stüdyo Yeni",
      branchId: "erzene",
      capacity: 2,
      instruments: ["Piyano"],
    });
    expect(res.ok).toBe(true);

    const data = await readData();
    expect(data.rooms.some((r) => r.name === "Stüdyo Yeni")).toBe(true);
  });

  it("veli rolü oda ekleyemez (FORBIDDEN)", async () => {
    const res = await createRoomTool(ctx({ role: "STUDENT" }), {
      name: "X",
      branchId: "erzene",
      capacity: 2,
      instruments: ["Piyano"],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("FORBIDDEN");
  });

  it("geçersiz girdi (isim boş) VALIDATION_ERROR döner", async () => {
    const res = await createRoomTool(ctx(), {
      name: "",
      branchId: "erzene",
      capacity: 2,
      instruments: ["Piyano"],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("Kurulum Merkezi · ders planlama", () => {
  it("geçerli gelecekteki saat için ders oluşturur", async () => {
    const data = await readData();
    const teacher = data.teachers.find((t) => t.active && t.instruments.includes("Piyano"));
    const student = data.students.find((s) => s.active && s.instruments.includes("Piyano"));
    expect(teacher).toBeDefined();
    expect(student).toBeDefined();
    const room = data.rooms.find(
      (r) => r.instruments.includes("Piyano") && r.branchId === teacher!.branchId
    );
    expect(room).toBeDefined();

    let startAt: string | null = null;
    for (let offset = 1; offset <= 14 && !startAt; offset++) {
      const day = new Date();
      day.setDate(day.getDate() + offset);
      // Merkezi kapalı gün kuralı (legacy: yalnızca Pazartesi) — testin
      // çalıştığı gün tesadüfen Pazartesi'ye denk gelen bir hafta penceresine
      // girerse bile yanlış (kapalı) bir gün denenmesin.
      if (isWeeklyClosedDayForTerm(day)) continue;
      for (let hour = 9; hour <= 17 && !startAt; hour++) {
        const d = new Date(day);
        d.setHours(hour, 0, 0, 0);
        const candidate = d.toISOString();
        const check = validateLessonSlot(
          data,
          { instrument: "Piyano", studentId: student!.id },
          { teacherId: teacher!.id, roomId: room!.id, startAt: candidate }
        );
        if (check.ok) startAt = candidate;
      }
    }
    expect(startAt).not.toBeNull();

    const res = await createLessonTool(ctx(), {
      studentId: student!.id,
      teacherId: teacher!.id,
      roomId: room!.id,
      instrument: "Piyano",
      startAt: startAt!,
    });
    expect(res.ok).toBe(true);

    const after = await readData();
    const created = after.lessons.find((l) => l.startAt === startAt);
    expect(created).toBeDefined();
    expect(created?.type).toBe("regular");
    expect(created?.status).toBe("scheduled");
    expect(created?.studentId).toBe(student!.id);
  });

  it("aynı öğretmenle çakışan ikinci ders reddedilir", async () => {
    const data = await readData();
    const teacher = data.teachers.find((t) => t.active && t.instruments.includes("Piyano"));
    const student = data.students.find((s) => s.active && s.instruments.includes("Piyano"));
    const room = data.rooms.find(
      (r) => r.instruments.includes("Piyano") && r.branchId === teacher!.branchId
    );

    let startAt: string | null = null;
    for (let offset = 1; offset <= 14 && !startAt; offset++) {
      const day = new Date();
      day.setDate(day.getDate() + offset);
      // Merkezi kapalı gün kuralı (legacy: yalnızca Pazartesi) — testin
      // çalıştığı gün tesadüfen Pazartesi'ye denk gelen bir hafta penceresine
      // girerse bile yanlış (kapalı) bir gün denenmesin.
      if (isWeeklyClosedDayForTerm(day)) continue;
      for (let hour = 9; hour <= 17 && !startAt; hour++) {
        const d = new Date(day);
        d.setHours(hour, 0, 0, 0);
        const candidate = d.toISOString();
        const check = validateLessonSlot(
          data,
          { instrument: "Piyano", studentId: student!.id },
          { teacherId: teacher!.id, roomId: room!.id, startAt: candidate }
        );
        if (check.ok) startAt = candidate;
      }
    }
    expect(startAt).not.toBeNull();

    const first = await createLessonTool(ctx(), {
      studentId: student!.id,
      teacherId: teacher!.id,
      roomId: room!.id,
      instrument: "Piyano",
      startAt: startAt!,
    });
    expect(first.ok).toBe(true);

    const second = await createLessonTool(ctx(), {
      studentId: student!.id,
      teacherId: teacher!.id,
      roomId: room!.id,
      instrument: "Piyano",
      startAt: startAt!,
    });
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.error.message).toContain("başka bir dersi var");
    }
  });

  it("veli rolü ders planlayamaz (FORBIDDEN)", async () => {
    const res = await createLessonTool(ctx({ role: "STUDENT" }), {
      studentId: "s1",
      teacherId: "t1",
      roomId: "r1",
      instrument: "Piyano",
      startAt: new Date(Date.now() + 86400000).toISOString(),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("FORBIDDEN");
  });
});

describe("Kurulum Merkezi · ödeme kaydı ekleme", () => {
  it("gelecekteki vade ile pending durumunda ödeme oluşturur", async () => {
    const data = await readData();
    const student = data.students.find((s) => s.active);
    const dueDate = new Date(Date.now() + 10 * 86400000).toISOString();

    const res = await createPaymentRecordTool(ctx(), {
      studentId: student!.id,
      description: "Test dönemi",
      amount: 3500,
      dueDate,
    });
    expect(res.ok).toBe(true);

    const after = await readData();
    const created = after.payments.find((p) => p.description === "Test dönemi");
    expect(created).toBeDefined();
    expect(created?.status).toBe("pending");
    expect(created?.paidAmount).toBe(0);
    expect(created?.amount).toBe(3500);
  });

  it("geçmiş vade ile overdue durumunda ödeme oluşturur", async () => {
    const data = await readData();
    const student = data.students.find((s) => s.active);
    const dueDate = new Date(Date.now() - 5 * 86400000).toISOString();

    const res = await createPaymentRecordTool(ctx(), {
      studentId: student!.id,
      description: "Geçmiş dönem",
      amount: 2000,
      dueDate,
    });
    expect(res.ok).toBe(true);

    const after = await readData();
    const created = after.payments.find((p) => p.description === "Geçmiş dönem");
    expect(created?.status).toBe("overdue");
  });

  it("öğretmen rolü ödeme kaydı ekleyemez (FORBIDDEN)", async () => {
    const res = await createPaymentRecordTool(ctx({ role: "TEACHER" }), {
      studentId: "s1",
      description: "Test",
      amount: 1000,
      dueDate: new Date().toISOString(),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("FORBIDDEN");
  });
});

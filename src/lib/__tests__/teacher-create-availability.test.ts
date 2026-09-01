import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { createTeacherTool } from "../services/tools";
import { readData } from "../store";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import { validateLessonSlot } from "../makeup-engine";
import { INSTRUMENT_CATALOG_FILE } from "../instrument-catalog";

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
  await fs.rm(INSTRUMENT_CATALOG_FILE, { force: true });
});

describe("öğretmen oluşturma anında müsaitlik", () => {
  it("availability verilmezse geriye dönük uyumlu varsayılan müsaitlik uygulanır", async () => {
    const res = await createTeacherTool(ctx(), {
      name: "Varsayılan Müsaitlik Öğretmeni",
      email: "varsayilan@okul.com",
      phone: "5551110000",
      branchId: "erzene",
      instrument: "Piyano",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const data = await readData();
    const teacher = data.teachers.find((t) => t.id === res.data.teacherId);
    expect(teacher?.availability).toEqual([
      { dayOfWeek: 1, start: "10:00", end: "18:00" },
      { dayOfWeek: 2, start: "10:00", end: "18:00" },
      { dayOfWeek: 3, start: "10:00", end: "18:00" },
      { dayOfWeek: 4, start: "10:00", end: "18:00" },
      { dayOfWeek: 5, start: "10:00", end: "16:00" },
    ]);
  });

  it("availability verilirse oluşturma anında doğrudan kaydedilir", async () => {
    const res = await createTeacherTool(ctx(), {
      name: "Özel Müsaitlik Öğretmeni",
      email: "ozel@okul.com",
      phone: "5551110001",
      branchId: "erzene",
      instrument: "Gitar",
      availability: [
        { dayOfWeek: 2, start: "09:00", end: "12:00" },
        { dayOfWeek: 4, start: "13:00", end: "17:00" },
      ],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const data = await readData();
    const teacher = data.teachers.find((t) => t.id === res.data.teacherId);
    expect(teacher?.availability).toEqual([
      { dayOfWeek: 2, start: "09:00", end: "12:00" },
      { dayOfWeek: 4, start: "13:00", end: "17:00" },
    ]);
  });

  it("availability boş dizi verilirse hiç müsaitlik yok olarak kaydedilir", async () => {
    const res = await createTeacherTool(ctx(), {
      name: "Boş Müsaitlik Öğretmeni",
      email: "bos@okul.com",
      phone: "5551110002",
      branchId: "erzene",
      instrument: "Şan",
      availability: [],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const data = await readData();
    const teacher = data.teachers.find((t) => t.id === res.data.teacherId);
    expect(teacher?.availability).toEqual([]);
  });

  it("geçersiz saat aralığı (bitiş <= başlangıç) reddedilir", async () => {
    const res = await createTeacherTool(ctx(), {
      name: "Geçersiz Müsaitlik Öğretmeni",
      email: "gecersiz@okul.com",
      phone: "5551110003",
      branchId: "erzene",
      instrument: "Bateri",
      availability: [{ dayOfWeek: 3, start: "18:00", end: "10:00" }],
    });
    expect(res.ok).toBe(false);
  });

  it("Pazar (dayOfWeek=0) dahil ve Pazar için BİRDEN FAZLA saat aralığı bloğu oluşturma anında kaydedilir", async () => {
    const res = await createTeacherTool(ctx(), {
      name: "Pazar Müsaitlikli Öğretmen",
      email: "pazar@okul.com",
      phone: "5551110004",
      branchId: "erzene",
      instrument: "Piyano",
      availability: [
        { dayOfWeek: 0, start: "09:00", end: "12:00" },
        { dayOfWeek: 0, start: "14:00", end: "17:00" },
        { dayOfWeek: 6, start: "10:00", end: "13:00" },
      ],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const data = await readData();
    const teacher = data.teachers.find((t) => t.id === res.data.teacherId);
    expect(teacher?.availability.filter((w) => w.dayOfWeek === 0)).toHaveLength(2);
    expect(teacher?.availability).toEqual([
      { dayOfWeek: 0, start: "09:00", end: "12:00" },
      { dayOfWeek: 0, start: "14:00", end: "17:00" },
      { dayOfWeek: 6, start: "10:00", end: "13:00" },
    ]);
  });

  it("Pazar müsaitliği öğretmen uygunluk doğrulamasına (validateLessonSlot → teacher.availability) dahil olur — Pazar'a özel bir dışlama yok", async () => {
    const res = await createTeacherTool(ctx(), {
      name: "Yalnız Pazar Müsait Öğretmen",
      email: "yalnizpazar@okul.com",
      phone: "5551110005",
      branchId: "erzene",
      instrument: "Piyano",
      availability: [{ dayOfWeek: 0, start: "09:00", end: "18:00" }],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const data = await readData();
    // Önümüzdeki 14 gün içinde bir Pazar bul, o gün 10:00'da müsaitlik
    // kontrolünün (yalnızca teacher.availability'ye bakan validateLessonSlot)
    // BAŞARILI olduğunu doğrula — Pazar hiçbir yerde sessizce reddedilmiyor.
    let sundayIso: string | null = null;
    for (let offset = 1; offset <= 14; offset++) {
      const d = new Date();
      d.setDate(d.getDate() + offset);
      if (d.getDay() !== 0) continue;
      d.setHours(10, 0, 0, 0);
      sundayIso = d.toISOString();
      break;
    }
    expect(sundayIso).not.toBeNull();

    const room = data.rooms.find((r) => r.instruments.includes("Piyano"))!;
    const check = validateLessonSlot(
      data,
      { instrument: "Piyano", studentId: "s1" },
      { teacherId: res.data.teacherId, roomId: room.id, startAt: sundayIso! }
    );
    expect(check.ok).toBe(true);
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { previewLessonImportTool, commitLessonImportTool } from "../services/tools";
import { readData } from "../store";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import { findOpenLessonSlot } from "./helpers/lesson-slot";
import {
  resolveStudentIdByName,
  resolveStudentIdByCode,
  resolveTeacherIdByCode,
  resolveStudentForScheduleRow,
  resolveTeacherForScheduleRow,
} from "../import/branch-lookup";

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

function ymdHm(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return { date, time };
}

async function buildValidCsv(): Promise<{ csv: string; date: string; time: string }> {
  const data = await readData();
  const student = data.students.find((s) => s.id === "s1")!;
  const teacher = data.teachers.find((t) => t.id === "t1")!;
  const startAt = await findOpenLessonSlot(data, "s1", "t1", "r1");
  const { date, time } = ymdHm(startAt);
  const csv = `ogrenci,ogretmen,sube,oda,enstruman,tarih,saat,sure_dk\n${student.name},${teacher.name},Erzene,Stüdyo 1 — Piyano,Piyano,${date},${time},40\n`;
  return { csv, date, time };
}

describe("resolveStudentIdByName (saf helper)", () => {
  it("aktif öğrenciyi ad ile bulur", async () => {
    const data = await readData();
    const res = resolveStudentIdByName(data, "Zeynep Arslan");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.studentId).toBe("s1");
  });

  it("bulunamayan öğrenci için açık hata döner", async () => {
    const data = await readData();
    const res = resolveStudentIdByName(data, "Olmayan Öğrenci");
    expect(res.ok).toBe(false);
  });

  it("boş ad reddedilir", async () => {
    const data = await readData();
    const res = resolveStudentIdByName(data, "  ");
    expect(res.ok).toBe(false);
  });

  it("aynı adda iki aktif öğrenci varsa tahmin etmez ve kod listeler", async () => {
    const data = await readData();
    const base = data.students.find((s) => s.id === "s1");
    if (!base) throw new Error("seed s1 missing");
    const dup = { ...base, id: "s_dup_same_name", name: base.name, parentName: "Diğer Veli", parentPhone: "05551112233" };
    const data2 = { ...data, students: [...data.students, dup] };
    const res = resolveStudentIdByName(data2, base.name);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.message).toContain("ogrenci_kodu");
      expect(res.message).toContain("s1");
      expect(res.message).toContain("s_dup_same_name");
    }
  });
});

describe("öğrenci/öğretmen kod çözümleme", () => {
  it("ogrenci_kodu ile net çözümler; ad doğrulaması geçer", async () => {
    const data = await readData();
    const s = data.students.find((x) => x.id === "s1")!;
    const res = resolveStudentIdByCode(data, "s1", s.name);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.studentId).toBe("s1");
  });

  it("kod-ad çelişkisinde hard error", async () => {
    const data = await readData();
    const res = resolveStudentIdByCode(data, "s1", "Tamamen Farklı İsim");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toMatch(/çelişiyor/);
  });

  it("geçersiz kod reddedilir", async () => {
    const data = await readData();
    expect((await Promise.resolve(resolveStudentIdByCode(data, "no_such_id"))).ok).toBe(false);
    expect(resolveTeacherIdByCode(data, "no_such_t").ok).toBe(false);
  });

  it("kod öncelikli satır çözümlemesi ad olmadan da çalışır", async () => {
    const data = await readData();
    const res = resolveStudentForScheduleRow(data, "", "s1");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.studentId).toBe("s1");
  });

  it("eski CSV (yalnız ad) kod sütunu olmadan çalışır", async () => {
    const data = await readData();
    const res = resolveStudentForScheduleRow(data, "Zeynep Arslan", "");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.studentId).toBe("s1");
  });

  it("öğretmen kod + ad tutarlılığı", async () => {
    const data = await readData();
    const t = data.teachers.find((x) => x.id === "t1")!;
    expect(resolveTeacherForScheduleRow(data, t.name, "t1").ok).toBe(true);
    expect(resolveTeacherForScheduleRow(data, "Yanlış Ad", "t1").ok).toBe(false);
  });
});

describe("previewLessonImportTool", () => {
  it("geçerli satır hatasız önizlenir ve gerçek ders/oda/öğretmen/öğrenci ID'lerine çözülür", async () => {
    const { csv } = await buildValidCsv();
    const res = await previewLessonImportTool(ctx(), { csvText: csv });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.errorCount).toBe(0);
    expect(res.data.validCount).toBe(1);
    expect(res.data.valid[0]!.studentId).toBe("s1");
    expect(res.data.valid[0]!.teacherId).toBe("t1");
    expect(res.data.valid[0]!.roomId).toBe("r1");
    expect(res.data.valid[0]!.duplicate).toBe(false);
  });

  it("bilinmeyen öğrenci/öğretmen/oda/şube/enstrüman satır hatası üretir", async () => {
    const { date, time } = ymdHm(await findOpenLessonSlot(await readData(), "s1", "t1", "r1"));
    const csv = `ogrenci,ogretmen,sube,oda,enstruman,tarih,saat,sure_dk\nOlmayan Kişi,Olmayan Öğretmen,Olmayan Şube,Olmayan Oda,Piyano,${date},${time},40\n`;
    const res = await previewLessonImportTool(ctx(), { csvText: csv });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.errorCount).toBeGreaterThan(0);
    expect(res.data.errors.some((e) => e.field === "ogrenci")).toBe(true);
    expect(res.data.errors.some((e) => e.field === "ogretmen")).toBe(true);
    expect(res.data.errors.some((e) => e.field === "sube")).toBe(true);
  });

  it("geçersiz tarih/saat/süre biçimi reddedilir", async () => {
    const csv =
      "ogrenci,ogretmen,sube,oda,enstruman,tarih,saat,sure_dk\n" +
      "Zeynep Arslan,Turgay Hoşbaş,Erzene,Stüdyo 1 — Piyano,Piyano,07-09-2026,14h00,35\n";
    const res = await previewLessonImportTool(ctx(), { csvText: csv });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.errors.some((e) => e.field === "tarih")).toBe(true);
    expect(res.data.errors.some((e) => e.field === "saat")).toBe(true);
    expect(res.data.errors.some((e) => e.field === "sure_dk")).toBe(true);
  });

  it("aynı öğretmen+oda+saatte dosya İÇİNDE iki satır varsa ikincisi 'duplicate' olarak işaretlenir (hata değil)", async () => {
    const { date, time } = await buildValidCsv();
    const csv =
      "ogrenci,ogretmen,sube,oda,enstruman,tarih,saat,sure_dk\n" +
      `Zeynep Arslan,Turgay Hoşbaş,Erzene,Stüdyo 1 — Piyano,Piyano,${date},${time},40\n` +
      `Zeynep Arslan,Turgay Hoşbaş,Erzene,Stüdyo 1 — Piyano,Piyano,${date},${time},40\n`;
    const res = await previewLessonImportTool(ctx(), { csvText: csv });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // Her iki satır da "valid" (hiçbiri hata değil) ama ikincisi duplicate — commit'te yalnız biri yazılır.
    expect(res.data.errorCount).toBe(0);
    expect(res.data.validCount).toBe(2);
    expect(res.data.valid[0]!.duplicate).toBe(false);
    expect(res.data.valid[1]!.duplicate).toBe(true);
  });

  it("teacher/parent rolü önizleme yapamaz (RBAC)", async () => {
    const { csv } = await buildValidCsv();
    const res = await previewLessonImportTool(ctx({ role: "TEACHER" }), { csvText: csv });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("FORBIDDEN");
  });
});

describe("commitLessonImportTool", () => {
  it("geçerli CSV gerçek bir Lesson kaydı oluşturur, program ekranında görünür hale gelir", async () => {
    const { csv } = await buildValidCsv();
    const res = await commitLessonImportTool(ctx(), { csvText: csv });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.created).toBe(1);
    expect(res.data.skipped ?? 0).toBe(0);

    const data = await readData();
    const created = data.lessons.find((l) => l.studentId === "s1" && l.teacherId === "t1" && l.roomId === "r1" && l.status === "scheduled");
    expect(created).toBeDefined();
  });

  it("aynı CSV ikinci kez yüklenince kör duplicate oluşturmaz — satır atlanır (skipped)", async () => {
    const { csv, date, time } = await buildValidCsv();
    const first = await commitLessonImportTool(ctx(), { csvText: csv });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.data.created).toBe(1);

    const second = await commitLessonImportTool(ctx(), { csvText: csv });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.data.created).toBe(0);
    expect(second.data.skipped).toBe(1);

    const data = await readData();
    const startAtIso = new Date(`${date}T${time}:00`).toISOString();
    const matching = data.lessons.filter(
      (l) => l.teacherId === "t1" && l.roomId === "r1" && l.startAt === startAtIso && l.status === "scheduled"
    );
    expect(matching).toHaveLength(1);
  });

  it("bir satır bile hatalıysa hiçbir ders eklenmez (atomik)", async () => {
    const { csv: validCsv, date, time } = await buildValidCsv();
    const badLine = `Olmayan Kişi,Turgay Hoşbaş,Erzene,Stüdyo 1 — Piyano,Piyano,${date},${time},40\n`;
    const csv = validCsv + badLine;
    const before = await readData();
    const beforeCount = before.lessons.length;

    const res = await commitLessonImportTool(ctx(), { csvText: csv });
    expect(res.ok).toBe(false);

    const after = await readData();
    expect(after.lessons).toHaveLength(beforeCount);
  });

  it("TEACHER/PARENT içe aktaramaz (RBAC)", async () => {
    const { csv, date, time } = await buildValidCsv();
    const before = await readData();
    const beforeCount = before.lessons.length;

    const res = await commitLessonImportTool(ctx({ role: "TEACHER" }), { csvText: csv });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("FORBIDDEN");

    const data = await readData();
    expect(data.lessons).toHaveLength(beforeCount);
    const startAtIso = new Date(`${date}T${time}:00`).toISOString();
    expect(data.lessons.some((l) => l.teacherId === "t1" && l.roomId === "r1" && l.startAt === startAtIso)).toBe(false);
  });
});

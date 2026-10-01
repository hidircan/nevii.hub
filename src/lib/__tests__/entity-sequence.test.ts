import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { allocateSequenceValue, formatDisplayId } from "../entity-sequence";
import { createStudentTool } from "../services/tools";
import { addStudent, addTeacher, readData } from "../store";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import type { EntitySequenceRecord } from "../types";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

function ctx(overrides?: Partial<ServiceContext>): ServiceContext {
  return { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web", ...overrides };
}

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
});

describe("formatDisplayId", () => {
  it("türe göre doğru önek + 5 haneli sıfır dolgu üretir", () => {
    expect(formatDisplayId("student", 1)).toBe("S00001");
    expect(formatDisplayId("teacher", 42)).toBe("T00042");
    expect(formatDisplayId("staff", 100000)).toBe("P100000");
  });
});

describe("allocateSequenceValue (saf fonksiyon)", () => {
  it("kayıt yoksa 1'den başlar ve nextValue=2 olarak saklar", () => {
    const { assigned, records } = allocateSequenceValue([], "t1", "student");
    expect(assigned).toBe(1);
    expect(records).toEqual([{ tenantId: "t1", entityType: "student", nextValue: 2 }]);
  });

  it("art arda çağrılar ardışık, tekrarsız numaralar üretir", () => {
    let records: EntitySequenceRecord[] = [];
    const assignedValues: number[] = [];
    for (let i = 0; i < 5; i++) {
      const result = allocateSequenceValue(records, "t1", "student");
      assignedValues.push(result.assigned);
      records = result.records;
    }
    expect(assignedValues).toEqual([1, 2, 3, 4, 5]);
  });

  it("farklı entityType'lar bağımsız sayaçlara sahiptir", () => {
    let records: EntitySequenceRecord[] = [];
    ({ records } = allocateSequenceValue(records, "t1", "student"));
    const teacherResult = allocateSequenceValue(records, "t1", "teacher");
    expect(teacherResult.assigned).toBe(1);
  });

  it("farklı tenantId'ler bağımsız sayaçlara sahiptir", () => {
    let records: EntitySequenceRecord[] = [];
    ({ records } = allocateSequenceValue(records, "tenant-a", "student"));
    const tenantB = allocateSequenceValue(records, "tenant-b", "student");
    expect(tenantB.assigned).toBe(1);
  });
});

describe("Faz 12 — createStudentTool displayId tahsisi (json modu)", () => {
  it("art arda oluşturulan öğrenciler ardışık displayId alır", async () => {
    const before = await readData();
    const teacher = before.teachers.find((t) => t.active && t.instruments.includes("Piyano"));
    expect(teacher).toBeDefined();

    const base = {
      email: "",
      phone: "05551234567",
      parentName: "Veli",
      parentPhone: "05551234567",
      branchId: teacher!.branchId,
      instrument: "Piyano" as const,
      teacherId: teacher!.id,
      packageName: "Bireysel Aylık — 4 ders",
      weeklyLessonCount: 1,
      monthlyFee: 3000,
      firstPaymentCollected: { method: "cash" as const, amount: 3000, collectedAt: "2026-08-30" },
      enrollmentStartDate: "2026-09-01",
      notes: "",
    };

    const r1 = await createStudentTool(ctx(), { ...base, name: "Ardışık Test 1" });
    const r2 = await createStudentTool(ctx(), { ...base, name: "Ardışık Test 2" });
    expect(r1.ok && r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;

    const data = await readData();
    const s1 = data.students.find((s) => s.id === r1.data.studentId);
    const s2 = data.students.find((s) => s.id === r2.data.studentId);
    expect(s1?.displayId).toMatch(/^S\d{5}$/);
    expect(s2?.displayId).toMatch(/^S\d{5}$/);
    expect(s1?.displayId).not.toBe(s2?.displayId);
  });

  it("eşzamanlı oluşturulan öğrenciler ASLA aynı displayId'yi almaz (mutateStoreUnderLock)", async () => {
    const before = await readData();
    const teacher = before.teachers.find((t) => t.active && t.instruments.includes("Piyano"));
    expect(teacher).toBeDefined();

    const base = {
      email: "",
      phone: "05551234567",
      parentName: "Veli",
      parentPhone: "05551234567",
      branchId: teacher!.branchId,
      instrument: "Piyano" as const,
      teacherId: teacher!.id,
      packageName: "Bireysel Aylık — 4 ders",
      weeklyLessonCount: 1,
      monthlyFee: 3000,
      notes: "",
    };

    // Not: `createStudentTool` üzerinden değil, doğrudan store katmanının
    // `addStudent`'ı üzerinden test edilir. Sebep: `createStudentTool`'un
    // "az önce oluşturduğum öğrenciyi bul" mantığı (`before` anlık
    // görüntüsünde OLMAYAN ilk öğrenciyi bulmaya dayanır) eşzamanlı çağrılar
    // altında YANLIŞ öğrenciyi eşleştirebilir (BAŞKA bir eşzamanlı çağrının
    // az önce eklediği öğrenciyi "kendisininki" sanabilir) — bu, Faz 12'nin
    // kapsamı DIŞINDA, önceden var olan, ayrı bir tool-katmanı hatası (bkz.
    // plan dokümanı "Bilinen, kapsam dışı" bölümü). Sıra numarası tahsisinin
    // KENDİSİ (asıl bu testin doğrulaması gereken şey) `addStudent`
    // (store-json.ts, `mutateStoreUnderLock`) seviyesinde zaten doğru.
    await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        addStudent({
          ...base,
          name: `Eşzamanlı ${i}`,
          instruments: [base.instrument],
        })
      )
    );
    // Store yazmaları sonuç döndürmez (db egress) — son durumu okuyarak doğrula.
    const last = await readData();
    const displayIds = last.students
      .filter((s) => s.name.startsWith("Eşzamanlı "))
      .map((s) => s.displayId);
    expect(displayIds).toHaveLength(8);
    expect(displayIds.every(Boolean)).toBe(true);
    expect(new Set(displayIds).size).toBe(8);
  });
});

describe("Faz 12 — addTeacher displayId tahsisi", () => {
  it("yeni öğretmen T-önekli displayId alır", async () => {
    const before = await readData();
    const branch = before.settings.branches[0];
    expect(branch).toBeDefined();

    await addTeacher({
      name: "Faz 12 Test Öğretmeni",
      email: "",
      phone: "05551112233",
      branchId: branch!.id,
      instruments: ["Piyano"],
      availability: [],
      maxDailyLessons: 6,
    });
    const next = await readData();
    const created = next.teachers[next.teachers.length - 1];
    expect(created?.displayId).toMatch(/^T\d{5}$/);
  });
});

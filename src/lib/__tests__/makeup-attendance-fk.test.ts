/**
 * `MakeupRequest.attendanceId` HER ZAMAN var olan bir `Attendance` kaydına
 * işaret etmelidir.
 *
 * NEDEN: şemada `attendanceId` zorunlu ve `@unique` bir FK
 * (`MakeupRequest_attendanceId_fkey`). `switchLessonOpsFlag(..., "makeup")`
 * eskiden yoklama kaydı yokken `uid("att")` ile HİÇBİR kayda karşılık
 * gelmeyen bir id uyduruyordu. json/memory modda referans denetlenmediği için
 * testler yeşil kalıyor, STORE_MODE=db altında ise "Telafi" işaretleme FK
 * ihlaliyle tamamen kırılıyordu — bu test o parite boşluğunu veritabanına
 * bağlanmadan yakalar.
 */
import { promises as fs } from "fs";
import path from "path";
import { describe, it, expect, beforeEach } from "vitest";
import { resolveDataDir } from "../config";
import { createLessonTool } from "../services/tools";
import { readData } from "../store";
import { switchLessonOpsFlag } from "../lesson-ops";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import { findOpenLessonSlot } from "./helpers/lesson-slot";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

const ctx: ServiceContext = {
  role: "SCHOOL_ADMIN",
  userId: "u1",
  tenantId: DEFAULT_TENANT_ID,
  channel: "web",
};

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
});

describe("Telafi işareti — attendanceId referans bütünlüğü", () => {
  it("yoklama kaydı YOKKEN telafi işaretlenirse Attendance da üretilir ve id eşleşir", async () => {
    const data0 = await readData();
    const startAt = await findOpenLessonSlot(data0, "s1", "t1", "r1");
    const created = await createLessonTool(ctx, {
      studentId: "s1",
      teacherId: "t1",
      roomId: "r1",
      instrument: "Piyano",
      startAt,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const lessonId = created.data.lessonId;

    const data = await readData();
    // Ön koşul: bu dersin HİÇ yoklama kaydı yok — kırık senaryonun tam koşulu.
    expect(data.attendances.some((a) => a.lessonId === lessonId)).toBe(false);

    const result = switchLessonOpsFlag(data, lessonId, "makeup", "u1", undefined, "veli bildirdi");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const request = result.data.makeupRequests.find((m) => m.sourceLessonId === lessonId);
    expect(request, "telafi talebi üretilmedi").toBeDefined();

    const attendance = result.data.attendances.find((a) => a.id === request!.attendanceId);
    expect(
      attendance,
      "attendanceId var olmayan bir kayda işaret ediyor — db modunda FK ihlali verir"
    ).toBeDefined();
    expect(attendance!.lessonId).toBe(lessonId);
    expect(attendance!.createsMakeupCredit).toBe(true);
  });

  it("yoklama kaydı VARSA yenisi üretilmez, mevcut kayda bağlanır", async () => {
    const data0 = await readData();
    const startAt = await findOpenLessonSlot(data0, "s1", "t1", "r1");
    const created = await createLessonTool(ctx, {
      studentId: "s1",
      teacherId: "t1",
      roomId: "r1",
      instrument: "Piyano",
      startAt,
    });
    if (!created.ok) return;
    const lessonId = created.data.lessonId;

    const base = await readData();
    const existing = {
      id: "att_mevcut",
      lessonId,
      studentId: "s1",
      status: "absent" as const,
      markedAt: new Date().toISOString(),
      createsMakeupCredit: true,
    };
    const withAttendance = { ...base, attendances: [...base.attendances, existing] };

    const result = switchLessonOpsFlag(withAttendance, lessonId, "makeup", "u1", undefined, "gerekçe");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const request = result.data.makeupRequests.find((m) => m.sourceLessonId === lessonId);
    expect(request!.attendanceId).toBe("att_mevcut");
    expect(result.data.attendances.filter((a) => a.lessonId === lessonId)).toHaveLength(1);
  });
});

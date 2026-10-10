import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import {
  computeLiveDisplayStatus,
  resolveLessonFinalStatus,
  startLesson,
  endLesson,
  correctLessonTimes,
  applyStartLesson,
  applyEndLesson,
  applyCorrectLessonTimes,
} from "../lesson-live-status";
import { startLessonTool, endLessonTool, correctLessonTimesTool } from "../services/tools";
import { readData } from "../store";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import type { AppData, Lesson } from "../types";

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

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
});

function lesson(overrides?: Partial<Lesson>): Lesson {
  return {
    id: "l_x",
    studentId: "s1",
    teacherId: "t1",
    roomId: "r1",
    branchId: "erzene",
    instrument: "Piyano",
    type: "regular",
    startAt: "2026-08-05T10:00:00+03:00",
    endAt: "2026-08-05T10:40:00+03:00",
    status: "scheduled",
    notes: "",
    ...overrides,
  } as Lesson;
}

describe("computeLiveDisplayStatus", () => {
  it("scheduled + startAt gelecekte ise 'scheduled' döner", () => {
    const now = new Date("2026-08-05T09:00:00+03:00");
    expect(computeLiveDisplayStatus(lesson({ status: "scheduled" }), now)).toBe("scheduled");
  });

  it("scheduled + startAt geçmişte ise 'delayed' döner (canlı durum, saklanmaz)", () => {
    const now = new Date("2026-08-05T10:30:00+03:00");
    expect(computeLiveDisplayStatus(lesson({ status: "scheduled" }), now)).toBe("delayed");
  });

  it("in_progress/completed/cancelled/no_show doğrudan yansır", () => {
    const now = new Date("2026-08-05T10:30:00+03:00");
    expect(computeLiveDisplayStatus(lesson({ status: "in_progress" }), now)).toBe("in_progress");
    expect(computeLiveDisplayStatus(lesson({ status: "completed" }), now)).toBe("completed");
    expect(computeLiveDisplayStatus(lesson({ status: "cancelled" }), now)).toBe("cancelled");
    expect(computeLiveDisplayStatus(lesson({ status: "no_show" }), now)).toBe("no_show");
  });
});

describe("resolveLessonFinalStatus", () => {
  const now = new Date("2026-09-10T12:00:00+03:00");

  it.each([
    [{ studentAttended: true }, "attended"],
    [{ lessonProcessed: true, studentAttended: true }, "processed"],
    [{ opsMakeupFlag: true, lessonProcessed: true, studentAttended: true }, "makeup"],
    [{ status: "cancelled", opsMakeupFlag: true, lessonProcessed: true, studentAttended: true }, "cancelled"],
  ] as const)("geçmiş ders için %j → %s önceliğini uygular", (overrides, expected) => {
    expect(resolveLessonFinalStatus(lesson(overrides), now)).toBe(expected);
  });

  it("P0-2: GELECEKTEKİ ders de işaretli statüsünü gösterir (aynı öncelik sırası)", () => {
    // 2026-09-09 owner kararı — bu test ÖNCEDEN "planned" bekliyordu ve
    // Yoklama Takvimi'nde işaretlenen rengin yenilemeden sonra kaybolmasının
    // kök nedeni tam olarak buydu: insanın açıkça girdiği bayraklar, ders
    // gelecekte diye gizleniyordu. Bkz. lesson-live-status.ts fonksiyon
    // yorumu ve attendance-status-parity.test.ts.
    expect(
      resolveLessonFinalStatus(
        lesson({
          startAt: "2026-09-11T10:00:00+03:00",
          status: "cancelled",
          opsMakeupFlag: true,
          lessonProcessed: true,
          studentAttended: true,
        }),
        now
      )
    ).toBe("cancelled");
  });

  it("P0-2: işaretlenmemiş gelecek ders HÂLÂ planned kalır (çıkarımla renk atanmaz)", () => {
    expect(resolveLessonFinalStatus(lesson({ startAt: "2026-09-11T10:00:00+03:00" }), now)).toBe("planned");
    // `completed` bir ÇIKARIMDIR, insanın işaretlemesi değil — gelecekte gösterilmez.
    expect(
      resolveLessonFinalStatus(lesson({ startAt: "2026-09-11T10:00:00+03:00", status: "completed" }), now)
    ).toBe("planned");
  });

  it("Gelmedi/Mazeretli geçmiş legacy alanları ayrı nihai statü üretmez", () => {
    expect(resolveLessonFinalStatus(lesson({ studentAbsent: true } as Partial<Lesson>), now)).toBe("planned");
    expect(resolveLessonFinalStatus(lesson({ studentExcused: true } as Partial<Lesson>), now)).toBe("planned");
  });
});

describe("startLesson", () => {
  it("scheduled -> in_progress geçişini kabul eder, actualStartAt'ı damgalar", () => {
    const now = new Date("2026-08-05T10:05:00+03:00");
    const result = startLesson(lesson({ status: "scheduled" }), now);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.patch.status).toBe("in_progress");
    expect(result.patch.actualStartAt).toBe(now.toISOString());
  });

  it("erken/geç başlatma toleransı: planlanandan çok önce/sonra olsa da kabul eder", () => {
    const veryEarly = new Date("2026-08-05T08:00:00+03:00");
    const veryLate = new Date("2026-08-05T14:00:00+03:00");
    expect(startLesson(lesson({ status: "scheduled" }), veryEarly).ok).toBe(true);
    expect(startLesson(lesson({ status: "scheduled" }), veryLate).ok).toBe(true);
  });

  it("zaten in_progress ise reddeder", () => {
    const result = startLesson(lesson({ status: "in_progress" }));
    expect(result.ok).toBe(false);
  });

  it.each(["completed", "cancelled", "no_show"] as const)(
    "durum '%s' ise başlatmayı reddeder",
    (status) => {
      const result = startLesson(lesson({ status }));
      expect(result.ok).toBe(false);
    }
  );
});

describe("endLesson", () => {
  it("in_progress -> completed geçişini kabul eder, actualEndAt'ı damgalar", () => {
    const now = new Date("2026-08-05T10:45:00+03:00");
    const result = endLesson(lesson({ status: "in_progress" }), now);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.patch.status).toBe("completed");
    expect(result.patch.actualEndAt).toBe(now.toISOString());
  });

  it.each(["scheduled", "completed", "cancelled", "no_show"] as const)(
    "in_progress DIŞINDA bir durumdan (%s) bitirmeyi reddeder",
    (status) => {
      const result = endLesson(lesson({ status }));
      expect(result.ok).toBe(false);
    }
  );
});

describe("correctLessonTimes", () => {
  it("not olmadan reddeder", () => {
    const result = correctLessonTimes({
      actualStartAt: "2026-08-05T10:03:00+03:00",
      correctedBy: "admin1",
      note: "   ",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/zorunlu/);
  });

  it("ne actualStartAt ne actualEndAt verilmezse reddeder", () => {
    const result = correctLessonTimes({ correctedBy: "admin1", note: "Yanlış saat girildi" });
    expect(result.ok).toBe(false);
  });

  it("geçerli düzeltmede correctedBy/not alanlarını damgalar", () => {
    const result = correctLessonTimes({
      actualStartAt: "2026-08-05T10:03:00+03:00",
      correctedBy: "admin1",
      note: "Öğretmen yanlış saatte başlattı, düzeltildi",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.patch.actualStartAt).toBe("2026-08-05T10:03:00+03:00");
    expect(result.patch.startCorrectedBy).toBe("admin1");
    expect(result.patch.startCorrectionNote).toBe("Öğretmen yanlış saatte başlattı, düzeltildi");
    expect(result.patch.endCorrectedBy).toBeUndefined();
  });

  it("hem başlangıç hem bitiş verilirse ikisini de damgalar", () => {
    const result = correctLessonTimes({
      actualStartAt: "2026-08-05T10:03:00+03:00",
      actualEndAt: "2026-08-05T10:41:00+03:00",
      correctedBy: "admin1",
      note: "İkisi de düzeltildi",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.patch.startCorrectedBy).toBe("admin1");
    expect(result.patch.endCorrectedBy).toBe("admin1");
  });
});

describe("applyStartLesson / applyEndLesson / applyCorrectLessonTimes (AppData sarmalayıcılar)", () => {
  function dataWith(lessons: Lesson[]): AppData {
    const base = { lessons } as unknown as AppData;
    return base;
  }

  it("ders bulunamazsa NOT_FOUND benzeri hata döner", () => {
    const data = dataWith([]);
    const result = applyStartLesson(data, "missing", new Date());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/bulunamadı/);
  });

  it("applyStartLesson AppData içindeki dersi in_progress yapar, diğerlerine dokunmaz", () => {
    const data = dataWith([lesson({ id: "l_a", status: "scheduled" }), lesson({ id: "l_b", status: "scheduled" })]);
    const result = applyStartLesson(data, "l_a", new Date("2026-08-05T10:05:00+03:00"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lesson.status).toBe("in_progress");
    const other = result.data.lessons.find((l) => l.id === "l_b")!;
    expect(other.status).toBe("scheduled");
  });

  it("applyEndLesson yalnızca in_progress dersi bitirir", () => {
    const data = dataWith([lesson({ id: "l_a", status: "in_progress" })]);
    const result = applyEndLesson(data, "l_a", new Date("2026-08-05T10:45:00+03:00"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lesson.status).toBe("completed");
    expect(result.lesson.actualEndAt).toBe(new Date("2026-08-05T10:45:00+03:00").toISOString());
  });

  it("applyCorrectLessonTimes notsuz çağrıda AppData'yı DEĞİŞTİRMEZ", () => {
    const data = dataWith([lesson({ id: "l_a", status: "completed" })]);
    const result = applyCorrectLessonTimes(data, "l_a", {
      actualStartAt: "2026-08-05T10:03:00+03:00",
      correctedBy: "admin1",
      note: "",
    });
    expect(result.ok).toBe(false);
  });
});

describe("startLessonTool / endLessonTool — yalnız yönetici (2026-09-19 owner kararı)", () => {
  it("TEACHER kendi dersini bile başlatamaz/bitiremez: FORBIDDEN + Türkçe neden, ders değişmez", async () => {
    const startRes = await startLessonTool(ctx({ role: "TEACHER", teacherId: "t2" }), { lessonId: "l8" });
    expect(startRes.ok).toBe(false);
    if (!startRes.ok) {
      expect(startRes.error.code).toBe("FORBIDDEN");
      expect(startRes.error.message).toContain("yalnız kurum yöneticisi");
    }
    const endRes = await endLessonTool(ctx({ role: "TEACHER", teacherId: "t2" }), { lessonId: "l8" });
    expect(endRes.ok).toBe(false);
    if (!endRes.ok) expect(endRes.error.code).toBe("FORBIDDEN");

    const l8 = (await readData()).lessons.find((l) => l.id === "l8")!;
    expect(l8.status).toBe("scheduled");
    expect(l8.actualStartAt).toBeFalsy();
  });

  it("SCHOOL_ADMIN dersi başlatıp bitirebilir", async () => {
    const admin = ctx({ role: "SCHOOL_ADMIN", teacherId: undefined });
    const startRes = await startLessonTool(admin, { lessonId: "l8" });
    expect(startRes.ok).toBe(true);
    if (startRes.ok) expect(startRes.data.status).toBe("in_progress");
    const endRes = await endLessonTool(admin, { lessonId: "l8" });
    expect(endRes.ok).toBe(true);
    if (endRes.ok) expect(endRes.data.status).toBe("completed");
  });

  it("STUDENT dersi başlatamaz", async () => {
    const res = await startLessonTool(ctx({ role: "STUDENT", teacherId: undefined }), { lessonId: "l8" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("FORBIDDEN");
  });

  it("zaten tamamlanmış bir dersi (l1) başlatmaya çalışmak VALIDATION_ERROR döner", async () => {
    const result = await startLessonTool(ctx({ role: "SCHOOL_ADMIN", teacherId: undefined }), { lessonId: "l1" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("correctLessonTimesTool — yalnızca SCHOOL_ADMIN/SUPER_ADMIN, not zorunlu", () => {
  it("TEACHER düzeltme yapamaz (FORBIDDEN)", async () => {
    const result = await correctLessonTimesTool(ctx({ role: "TEACHER" }), {
      lessonId: "l8",
      actualStartAt: "2026-08-04T16:05:00+03:00",
      note: "Öğretmen kendi düzeltemez",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
  });

  it("SCHOOL_ADMIN not olmadan düzeltme gönderirse VALIDATION_ERROR döner", async () => {
    const result = await correctLessonTimesTool(ctx({ role: "SCHOOL_ADMIN", teacherId: undefined }), {
      lessonId: "l8",
      actualStartAt: "2026-08-04T16:05:00+03:00",
      note: "",
    });
    expect(result.ok).toBe(false);
  });

  it("SCHOOL_ADMIN geçerli notla düzeltme yapabilir ve audit'e yazılır", async () => {
    const result = await correctLessonTimesTool(ctx({ role: "SCHOOL_ADMIN", userId: "admin1", teacherId: undefined }), {
      lessonId: "l8",
      actualStartAt: "2026-08-04T16:05:00+03:00",
      note: "Öğretmen saati yanlış girmiş, düzeltildi",
    });
    expect(result.ok).toBe(true);

    const data = await readData();
    const l8 = data.lessons.find((l) => l.id === "l8")!;
    expect(l8.actualStartAt).toBe("2026-08-04T16:05:00+03:00");
    expect(l8.startCorrectedBy).toBe("admin1");
    expect(l8.startCorrectionNote).toBe("Öğretmen saati yanlış girmiş, düzeltildi");
  });
});

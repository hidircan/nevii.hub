import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { setLessonOpsFlagTool, getAttendanceReportTool } from "../services/tools";
import { readData } from "../store";
import { readData as readDataJson, writeData as writeDataJson } from "../store-json";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import type { Lesson } from "../types";
import { uid } from "../utils";

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

describe("getAttendanceReportTool — RBAC", () => {
  it("TEACHER göremez (FORBIDDEN)", async () => {
    const res = await getAttendanceReportTool(ctx({ role: "TEACHER", teacherId: "t1" }), {});
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("FORBIDDEN");
  });

  it("STUDENT göremez (FORBIDDEN)", async () => {
    const res = await getAttendanceReportTool(ctx({ role: "STUDENT", teacherId: undefined }), {});
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("FORBIDDEN");
  });

  it("SCHOOL_ADMIN/SUPER_ADMIN erişebilir", async () => {
    const res = await getAttendanceReportTool(ctx(), {});
    expect(res.ok).toBe(true);
  });
});

/**
 * `resolveLessonFinalStatus` (lesson-live-status.ts) KASITLI olarak
 * gelecekteki dersleri ops-bayrağı ne olursa olsun her zaman "planned"
 * gösterir (bkz. lesson-live-status.test.ts "future ders legacy alanları
 * dolu olsa da planlı kalır") — bu yüzden "işlendi" statüsünün rapora
 * yansıdığını doğrulayan test GEÇMİŞ bir derse ihtiyaç duyar.
 * `createLessonTool`/`findOpenLessonSlot` yalnız GELECEK bir slot üretir
 * (gerçek kullanıcı hatalarını önleyen kasıtlı korumadır) — scripts/seed-*.ts
 * ile AYNI, önceden kabul edilmiş desenle `store-json`'a doğrudan yazılır;
 * ops-flag geçişi yine GERÇEK `setLessonOpsFlagTool` çağrısıyla yapılır.
 */
async function createPastTestLesson(): Promise<string> {
  const startAt = "2026-08-05T10:00:00.000Z"; // Çarşamba — Güz/Yaz kapalı gün kuralına takılmaz
  const lesson: Lesson = {
    id: uid("les"),
    studentId: "s1",
    teacherId: "t1",
    roomId: "r1",
    branchId: "erzene",
    instrument: "Piyano",
    startAt,
    endAt: new Date(new Date(startAt).getTime() + 40 * 60_000).toISOString(),
    type: "regular",
    status: "scheduled",
  } as Lesson;
  const data = await readDataJson();
  data.lessons.push(lesson);
  await writeDataJson(data);
  return lesson.id;
}

describe("getAttendanceReportTool — içerik", () => {
  it("işlenmiş ders gerekçesi ve öğrenci/öğretmen adları satırda görünür", async () => {
    const lessonId = await createPastTestLesson();
    const marked = await setLessonOpsFlagTool(ctx(), {
      lessonId,
      flag: "processed",
      reason: "Ders fiilen işlendi",
    });
    expect(marked.ok).toBe(true);

    const data = await readData();
    const lesson = data.lessons.find((l) => l.id === lessonId)!;
    const [y, m] = lesson.startAt.slice(0, 7).split("-").map(Number);

    const res = await getAttendanceReportTool(ctx(), {
      datePreset: "custom",
      from: `${y}-${String(m).padStart(2, "0")}-01`,
      to: `${y}-${String(m).padStart(2, "0")}-28`,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const row = res.data.rows.find((r) => r.lessonId === lessonId);
    expect(row?.status).toBe("processed");
    expect(row?.processedReason).toBe("Ders fiilen işlendi");
    expect(row?.studentName).toBeTruthy();
    expect(row?.teacherName).toBeTruthy();
  });

  // Not: `Lesson` (json/memory AppData) kayıt başına bir `tenantId` alanı
  // TAŞIMAZ — tenant izolasyonu `readData()`'nın ALS/tenant-context
  // çözümlemesinden miras alınır (bu tool, `getAttendanceCalendarMonthTool`
  // dahil TÜM ders-okuyan tool'larla AYNI mekanizma). Doğrudan tool
  // çağrısıyla (gerçek HTTP/middleware olmadan) sahte bir ikinci tenant
  // simüle etmek bu store mimarisinde anlamlı bir izolasyon testi ÜRETMEZ
  // (readData() zaten aynı varsayılan tenant'ı döner) — bkz.
  // `contracts.test.ts`'deki AYNI desenin yalnız kendi `tenantId` alanı
  // TAŞIYAN kayıtlarda (StudentContract) geçerli olduğu not.

  it("geçersiz özel tarih aralığı VALIDATION_ERROR döner", async () => {
    const res = await getAttendanceReportTool(ctx(), { datePreset: "custom", from: "2026-09-15", to: "2026-09-01" });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VALIDATION_ERROR");
  });

  /**
   * Regresyon — kullanıcı raporu: "öğrenci filtresinden öğrenci seçildiğinde
   * Invalid input hatası alıyorum". Kök neden burada değil (schema kendisi
   * her zaman doğruydu) — kök neden `yoklama-raporu/page.tsx`'in TEK bir
   * `<form method="get">` GÖNDERDİĞİ, her zaman DOM'da bulunan boş
   * `from`/`to` <input type="date">'lerini `|| undefined` İLE
   * NORMALİZE ETMEDEN doğrudan bu tool'a iletmesiydi. Aşağıdaki ilk test bu
   * şemanın boş string'i GERÇEKTEN reddettiğini (sayfanın normalize etmek
   * ZORUNDA olduğunu) belgeler; ikinci test sayfanın düzeltilmiş
   * davranışını (boş → undefined) gerçek bir öğrenci filtresiyle doğrular.
   */
  it("regresyon — boş string from/to (düzeltme ÖNCESİ sayfa davranışı) VALIDATION_ERROR ('Invalid input') döner", async () => {
    const res = await getAttendanceReportTool(ctx(), {
      datePreset: "this_month",
      from: "",
      to: "",
      studentId: "s1",
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VALIDATION_ERROR");
    expect(res.error.message).toBe("Invalid input");
  });

  it("regresyon — from/to undefined'a normalize edilince (düzeltme SONRASI sayfa davranışı) gerçek öğrenci filtresi hatasız çalışır", async () => {
    const res = await getAttendanceReportTool(ctx(), {
      datePreset: "this_month",
      from: undefined,
      to: undefined,
      studentId: "s1",
    });
    expect(res.ok).toBe(true);
  });
});

describe("getAttendanceReportTool — sayfalama (11. tur iş #4)", () => {
  async function seedLessons(count: number): Promise<void> {
    const data = await readDataJson();
    for (let i = 0; i < count; i++) {
      const startAt = new Date(Date.UTC(2026, 7, 5 + i, 10, 0, 0)).toISOString();
      data.lessons.push({
        id: uid("les-page"),
        studentId: "s1",
        teacherId: "t1",
        roomId: "r1",
        branchId: "erzene",
        instrument: "Piyano",
        startAt,
        endAt: new Date(new Date(startAt).getTime() + 40 * 60_000).toISOString(),
        type: "regular",
        status: "scheduled",
      } as Lesson);
    }
    await writeDataJson(data);
  }

  const monthFilter = { datePreset: "custom", from: "2026-08-01", to: "2026-08-31" } as const;

  it("varsayılan çağrıda total == rows.length (sayfalama geriye uyumlu)", async () => {
    await seedLessons(3);
    const res = await getAttendanceReportTool(ctx(), { ...monthFilter });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.total).toBe(3);
    expect(res.data.rows).toHaveLength(3);
    expect(res.data.page).toBe(1);
  });

  it("rows dilimlenir ama summary TÜM satırlar üzerinden hesaplanır", async () => {
    await seedLessons(5);
    const res = await getAttendanceReportTool(ctx(), { ...monthFilter, page: 2, pageSize: 2 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.total).toBe(5);
    expect(res.data.page).toBe(2);
    expect(res.data.rows).toHaveLength(2);
    // Özet dilimden etkilenmez — 5 dersin tamamını sayar.
    expect(res.data.summary.totalPlanned).toBe(5);
    // Sayfalar çakışmaz, sıralama startAt artanıdır.
    const p1 = await getAttendanceReportTool(ctx(), { ...monthFilter, page: 1, pageSize: 2 });
    expect(p1.ok).toBe(true);
    if (!p1.ok) return;
    const ids1 = new Set(p1.data.rows.map((r) => r.lessonId));
    for (const r of res.data.rows) expect(ids1.has(r.lessonId)).toBe(false);
  });

  it("aralık dışı sayfa son sayfaya kırpılır", async () => {
    await seedLessons(3);
    const res = await getAttendanceReportTool(ctx(), { ...monthFilter, page: 99, pageSize: 10 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.page).toBe(1);
    expect(res.data.rows).toHaveLength(3);
  });

  it("geçersiz sayfa VALIDATION_ERROR döner", async () => {
    const res = await getAttendanceReportTool(ctx(), { ...monthFilter, page: 0 });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VALIDATION_ERROR");
  });
});

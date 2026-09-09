import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { createLessonTool, setLessonOpsFlagTool, getAttendanceCalendarMonthTool } from "../services/tools";
import { readData } from "../store";
import { readData as readDataJson, writeData as writeDataJson } from "../store-json";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import { validateLessonSlot } from "../makeup-engine";
import { uid } from "../utils";
import type { Lesson } from "../types";

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

/**
 * Aday günü hem ARAMA hem KULLANIM için AYNI (UTC) takvim gününden çözer.
 *
 * Düzeltme (2026-09-09): bu iki yardımcı, hafta gününü YEREL saatle
 * (`d.getDay()`) eliyor ama `dateKey`'i UTC ile (`toISOString()`) üretiyordu.
 * Europe/Istanbul UTC+3 olduğu için gece 00:00–03:00 arasında ikisi FARKLI
 * güne düşer: yerel Salı = UTC Pazartesi. Test o saatlerde çalıştığında
 * Pazartesi (Güz döneminde kurum kapalı) seçiliyor ve `setLessonOpsFlagTool`
 * haklı olarak "Bu gün kapalı (Pazartesi)" diyerek reddediyordu — ürün
 * hatası DEĞİL, günün saatine bağlı bir test kusuru. Artık hafta günü,
 * kullanılacak `dateKey`'in KENDİSİNDEN (UTC) okunur.
 */
function weekdayOfDateKey(dateKey: string): number {
  return new Date(`${dateKey}T00:00:00Z`).getUTCDay();
}

async function findFreeDay(direction: 1 | -1, requiredHoursUtc: number[] = []): Promise<string> {
  const data = await readData();
  const busyDates = new Set(
    data.lessons.filter((l) => l.studentId === "s1" || l.teacherId === "t1").map((l) => l.startAt.slice(0, 10))
  );
  for (let offset = 1; offset <= 20; offset++) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + direction * offset);
    const dateKey = d.toISOString().slice(0, 10);
    const weekday = weekdayOfDateKey(dateKey);
    if (weekday === 0 || weekday === 1) continue; // Pazar kapalı, Pazartesi Güz döneminde kapalı
    if (busyDates.has(dateKey)) continue;
    // Düzeltme (2026-09-09): gün "boş" olması TEK BAŞINA yetmiyordu — çağıran
    // testler o günde BELİRLİ saatlerde ders oluşturuyor ve slotun geçerli
    // olmasını bekliyor. Öğretmen müsaitliği hafta gününe göre değiştiği için
    // (ör. Cumartesi 14:00 t1 için kapalı) helper, saatleri DOĞRULAMADAN gün
    // döndürdüğünde test günün saatine göre "bazen kırmızı" oluyordu.
    // Artık gün, KULLANILACAK saatlerle birlikte doğrulanır.
    const allSlotsValid = requiredHoursUtc.every((hour) => {
      const startAt = `${dateKey}T${String(hour).padStart(2, "0")}:00:00.000Z`;
      return validateLessonSlot(
        data,
        { instrument: "Piyano", studentId: "s1" },
        { teacherId: "t1", roomId: "r1", startAt }
      ).ok;
    });
    if (!allSlotsValid) continue;
    return dateKey;
  }
  throw new Error(`no free ${direction === 1 ? "future" : "past"} weekday found`);
}

/** t1 (Turgay Hoşbaş) için o gün hiç ders olmayan bir Salı/Perşembe/vb. iş günü bulur. */
async function findFreeWeekday(): Promise<string> {
  return findFreeDay(1, [10, 14]);
}

/** `findFreeWeekday` ile AYNI, yalnız GEÇMİŞE doğru arar (ops-flag testleri geçmiş bir ders ister). */
async function findFreePastWeekday(): Promise<string> {
  // Geçmiş günler `validateLessonSlot`tan geçmez (geçmişe ders oluşturulamaz);
  // bu testler dersi zaten doğrudan store'a yazıyor, saat doğrulaması İSTENMEZ.
  return findFreeDay(-1);
}

/**
 * İş 2 — aynı öğrencinin aynı günde birden fazla dersi olduğunda takvim
 * her birini AYRI, kimliklenebilir bir satır olarak döner ve statü
 * güncellemeleri birbirinden bağımsız kalır.
 */
describe("getAttendanceCalendarMonthTool — aynı gün birden fazla ders (İş 2)", () => {
  it("aynı öğrencinin aynı gün 2 dersi ayrı satırlar olarak, saat/öğretmen/enstrüman/oda/süre bilgisiyle döner", async () => {
    const dateKey = await findFreeWeekday();
    const morning = `${dateKey}T10:00:00.000Z`;
    const afternoon = `${dateKey}T14:00:00.000Z`;

    const data0 = await readData();
    for (const startAt of [morning, afternoon]) {
      const check = validateLessonSlot(
        data0,
        { instrument: "Piyano", studentId: "s1" },
        { teacherId: "t1", roomId: "r1", startAt }
      );
      expect(check.ok, `slot ${startAt} beklenmedik şekilde geçersiz`).toBe(true);
    }

    const l1 = await createLessonTool(ctx(), { studentId: "s1", teacherId: "t1", roomId: "r1", instrument: "Piyano", startAt: morning });
    expect(l1.ok).toBe(true);
    if (!l1.ok) return;
    const l2 = await createLessonTool(ctx(), { studentId: "s1", teacherId: "t1", roomId: "r1", instrument: "Piyano", startAt: afternoon });
    expect(l2.ok).toBe(true);
    if (!l2.ok) return;

    const [year, month] = dateKey.split("-").map(Number) as [number, number];
    const monthRes = await getAttendanceCalendarMonthTool(ctx(), { studentId: "s1", year, month });
    expect(monthRes.ok).toBe(true);
    if (!monthRes.ok) return;

    const day = monthRes.data.days.find((d) => d.date === dateKey);
    expect(day).toBeDefined();
    expect(day?.lessonIds).toHaveLength(2);
    expect(day?.lessons).toHaveLength(2);

    const [first, second] = day!.lessons;
    expect(first!.startAt < second!.startAt).toBe(true); // saat sırasına göre sıralı
    expect(first!.teacherName).toBe("Turgay Hoşbaş");
    expect(first!.instrument).toBe("Piyano");
    expect(first!.roomName).toBeDefined();
    expect(first!.durationMinutes).toBeGreaterThan(0);
  });

  it("bir dersi 'telafi', diğerini 'geldi' işaretlemek birbirinden bağımsız kalır", async () => {
    // `resolveLessonFinalStatus` (lesson-live-status.ts) KASITLI olarak
    // gelecekteki dersleri ops-bayrağı ne olursa olsun her zaman "planned"
    // gösterir (bkz. lesson-live-status.test.ts "future ders legacy alanları
    // dolu olsa da planlı kalır") — bu yüzden bu test GEÇMİŞ bir derse ihtiyaç
    // duyar. `createLessonTool` geçmiş `startAt`'ı reddettiğinden (gerçek
    // kullanıcı hatalarını önleyen kasıtlı korumadır), scripts/seed-*.ts'in
    // AYNI, önceden kabul edilmiş deseniyle `addLesson` (store.ts) doğrudan
    // çağrılır — yalnız ders OLUŞTURMA adımı için; ops-flag geçişleri yine
    // GERÇEK `setLessonOpsFlagTool` çağrılarıyla yapılır.
    const dateKey = await findFreePastWeekday();
    const morning = `${dateKey}T10:00:00.000Z`;
    const afternoon = `${dateKey}T14:00:00.000Z`;

    function pastLesson(startAt: string): Lesson {
      return {
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
    }
    const l1 = pastLesson(morning);
    const l2 = pastLesson(afternoon);
    const jsonData = await readDataJson();
    jsonData.lessons.push(l1, l2);
    await writeDataJson(jsonData);

    const flag1 = await setLessonOpsFlagTool(ctx(), { lessonId: l1.id, flag: "attended" });
    expect(flag1.ok).toBe(true);
    const flag2 = await setLessonOpsFlagTool(ctx(), {
      lessonId: l2.id,
      flag: "makeup",
      reason: "Öğrenci hastaydı",
    });
    expect(flag2.ok).toBe(true);

    const [year, month] = dateKey.split("-").map(Number) as [number, number];
    const monthRes = await getAttendanceCalendarMonthTool(ctx(), { studentId: "s1", year, month });
    expect(monthRes.ok).toBe(true);
    if (!monthRes.ok) return;
    const day = monthRes.data.days.find((d) => d.date === dateKey)!;

    const status1 = day.lessons.find((l) => l.lessonId === l1.id)?.opsStatus;
    const status2 = day.lessons.find((l) => l.lessonId === l2.id)?.opsStatus;
    expect(status1).toBe("attended");
    expect(status2).toBe("makeup");
  });
});

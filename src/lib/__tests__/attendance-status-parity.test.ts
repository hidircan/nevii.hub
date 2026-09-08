/**
 * P0-2 (2026-09-09) — YOKLAMA STATÜSÜ KALICILIĞI + EKRANLAR ARASI PARITY.
 *
 * Owner bulgusu: Yoklama Takvimi'nde seçilen Geldi/İşlendi/Telafi/İptal
 * statüsü ilgili gün hücresinde kalıcı görünmüyor; sayfa yenilenince,
 * ay değişince veya ekrana tekrar gelince kayboluyor.
 *
 * Kök neden: takvim sunucusu (`getAttendanceCalendarMonthTool`)
 * `resolveLessonFinalStatus` kullanıyordu ve o fonksiyon, İNSANIN AÇIKÇA
 * işaretlediği bayrakları okumadan ÖNCE "ders gelecekteyse koşulsuz planned"
 * diyordu. İstemci iyimser olarak rengi değiştiriyor, sunucudan taze veri
 * gelince statü "planned"a geri dönüyordu — yani hata istemcinin iyimser
 * güncellemesinde DEĞİL, sunucunun kalıcı statüyü GİZLEMESİNDEYDİ.
 *
 * Bu dosya hem kalıcılığı hem de dört yüzeyin (Ders Programı, Yoklama
 * Takvimi, Telafi Merkezi, Yoklama Raporu) AYNI kanonik statü kaynağını
 * kullandığını kilitler.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { createLessonTool, setLessonOpsFlagTool, getAttendanceCalendarMonthTool } from "../services/tools";
import { readData } from "../store";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import { validateLessonSlot } from "../makeup-engine";
import { resolveLessonFinalStatus } from "../lesson-live-status";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

function ctx(): ServiceContext {
  return { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web" };
}

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
});

/** s1/t1 için o gün HİÇ dersi olmayan, GELECEKTEKİ bir slot. */
async function findFutureOpenSlot(): Promise<string> {
  const data = await readData();
  const busyDates = new Set(
    data.lessons.filter((l) => l.studentId === "s1" || l.teacherId === "t1").map((l) => l.startAt.slice(0, 10))
  );
  for (let offset = 1; offset <= 14; offset++) {
    for (let hour = 9; hour <= 16; hour++) {
      const d = new Date();
      d.setDate(d.getDate() + offset);
      d.setHours(hour, 0, 0, 0);
      if (d.getDay() === 1) continue; // Pazartesi kurum kapalı
      const candidate = d.toISOString();
      if (busyDates.has(candidate.slice(0, 10))) continue;
      const check = validateLessonSlot(
        data,
        { instrument: "Piyano", studentId: "s1" },
        { teacherId: "t1", roomId: "r1", startAt: candidate }
      );
      if (check.ok) return candidate;
    }
  }
  throw new Error("no open future slot found");
}

async function createFutureLesson(): Promise<{ lessonId: string; startAt: string }> {
  const startAt = await findFutureOpenSlot();
  const res = await createLessonTool(ctx(), {
    studentId: "s1",
    teacherId: "t1",
    roomId: "r1",
    instrument: "Piyano",
    startAt,
  });
  if (!res.ok) throw new Error("lesson could not be created");
  return { lessonId: res.data.lessonId, startAt };
}

/** Takvimi SIFIRDAN yeniden okur — "sayfa yenilendi / aya tekrar girildi" ile aynı yol. */
async function reloadCalendarStatus(startAt: string, lessonId: string): Promise<string | undefined> {
  const [y, m] = startAt.slice(0, 7).split("-").map(Number);
  const monthRes = await getAttendanceCalendarMonthTool(ctx(), { studentId: "s1", year: y!, month: m! });
  if (!monthRes.ok) throw new Error("calendar month could not be read");
  const day = monthRes.data.days.find((d) => d.date === startAt.slice(0, 10));
  return day?.lessons.find((l) => l.lessonId === lessonId)?.opsStatus;
}

describe("P0-2 — işaretlenen statü sunucuda KALICIDIR (yenileme/ay değişimi sonrası kaybolmaz)", () => {
  it("Geldi işaretli gelecek ders, takvim yeniden okunduğunda 'attended' kalır", async () => {
    const { lessonId, startAt } = await createFutureLesson();
    const setRes = await setLessonOpsFlagTool(ctx(), { lessonId, flag: "attended" });
    expect(setRes.ok).toBe(true);
    expect(await reloadCalendarStatus(startAt, lessonId)).toBe("attended");
  });

  it("İşlendi işaretli gelecek ders, takvim yeniden okunduğunda 'processed' kalır", async () => {
    const { lessonId, startAt } = await createFutureLesson();
    await setLessonOpsFlagTool(ctx(), { lessonId, flag: "attended" });
    const setRes = await setLessonOpsFlagTool(ctx(), {
      lessonId,
      flag: "processed",
      confirmSwitch: true,
      reason: "Ders fiilen işlendi",
    });
    expect(setRes.ok).toBe(true);
    expect(await reloadCalendarStatus(startAt, lessonId)).toBe("processed");
  });

  it("Telafi işaretli gelecek ders, takvim yeniden okunduğunda 'makeup' kalır", async () => {
    const { lessonId, startAt } = await createFutureLesson();
    const setRes = await setLessonOpsFlagTool(ctx(), { lessonId, flag: "makeup", reason: "Öğrenci hastaydı" });
    expect(setRes.ok).toBe(true);
    expect(await reloadCalendarStatus(startAt, lessonId)).toBe("makeup");
  });

  it("hiç işaretlenmemiş gelecek ders 'planned' KALIR (çıkarım yoluyla renk atanmaz)", async () => {
    const { lessonId, startAt } = await createFutureLesson();
    expect(await reloadCalendarStatus(startAt, lessonId)).toBe("planned");
  });

  it("statü DEĞİŞTİRİLDİĞİNDE takvim en son statüyü döner (eskimez)", async () => {
    const { lessonId, startAt } = await createFutureLesson();
    await setLessonOpsFlagTool(ctx(), { lessonId, flag: "attended" });
    expect(await reloadCalendarStatus(startAt, lessonId)).toBe("attended");
    await setLessonOpsFlagTool(ctx(), {
      lessonId,
      flag: "makeup",
      confirmSwitch: true,
      reason: "Öğrenci gelemedi, telafiye alındı",
    });
    expect(await reloadCalendarStatus(startAt, lessonId)).toBe("makeup");
  });

  it("aynı gündeki İKİ ders birbirinden bağımsız kalıcıdır", async () => {
    const startAt1 = await findFutureOpenSlot();
    const d2 = new Date(startAt1);
    d2.setHours(new Date(startAt1).getHours() + 3, 0, 0, 0);
    const res1 = await createLessonTool(ctx(), {
      studentId: "s1", teacherId: "t1", roomId: "r1", instrument: "Piyano", startAt: startAt1,
    });
    const res2 = await createLessonTool(ctx(), {
      studentId: "s1", teacherId: "t1", roomId: "r1", instrument: "Piyano", startAt: d2.toISOString(),
    });
    expect(res1.ok && res2.ok).toBe(true);
    if (!res1.ok || !res2.ok) return;
    await setLessonOpsFlagTool(ctx(), { lessonId: res1.data.lessonId, flag: "attended" });
    await setLessonOpsFlagTool(ctx(), { lessonId: res2.data.lessonId, flag: "makeup", reason: "Öğrenci hastaydı" });

    expect(await reloadCalendarStatus(startAt1, res1.data.lessonId)).toBe("attended");
    expect(await reloadCalendarStatus(startAt1, res2.data.lessonId)).toBe("makeup");
  });
});

describe("P0-2 — EKRANLAR ARASI PARITY (brief §B.4: tek kanonik statü kaynağı)", () => {
  it("takvimin döndüğü statü, ortak çözümleyicinin ders kaydından ürettiğiyle BİREBİR aynıdır", async () => {
    for (const flag of ["attended", "processed", "makeup"] as const) {
      await fs.rm(DATA_FILE, { force: true });
      const { lessonId, startAt } = await createFutureLesson();
      if (flag === "processed") {
        await setLessonOpsFlagTool(ctx(), { lessonId, flag: "attended" });
        await setLessonOpsFlagTool(ctx(), { lessonId, flag, confirmSwitch: true, reason: "Ders fiilen işlendi" });
      } else {
        await setLessonOpsFlagTool(ctx(), { lessonId, flag, reason: "Öğrenci hastaydı" });
      }

      const calendarStatus = await reloadCalendarStatus(startAt, lessonId);
      const data = await readData();
      const lesson = data.lessons.find((l) => l.id === lessonId)!;
      // Ders Programı kartı, Yoklama Raporu ve panel rozetleri bu fonksiyonu
      // kullanır; takvim de AYNI sonucu vermelidir.
      expect(calendarStatus).toBe(resolveLessonFinalStatus(lesson));
    }
  });
});

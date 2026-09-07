import { describe, it, expect } from "vitest";
import { resolveLessonMarkedStatus, resolveLessonFinalStatus } from "../lesson-live-status";
import { lessonCardFillStyle, ATTENDANCE_CALENDAR_COLORS } from "../attendance-calendar";
import type { Lesson } from "../types";

/**
 * P0 UAT REGRESYONU (2026-09-07) — "statü değiştirince ders kutusunun TAM
 * arka planı istenen renge dönmüyor".
 *
 * KÖK NEDEN: `resolveLessonFinalStatus` GELECEKTEKİ her ders için koşulsuz
 * "planned" dönüyordu; yöneticinin az önce işaretlediği Geldi/İşlendi/Telafi
 * ekranda hiç görünmüyordu. Gerçek tarayıcıda doğrulandı: işaretli üç dersin
 * kart arka planı da #ffffff kalıyordu.
 *
 * Düzeltme, Yoklama Takvimi'nin BİLİNÇLİ davranışını (gelecek gün nötr, bkz.
 * attendance-calendar-tools.test.ts) bozmadan yapıldı: Ders Programı kartı
 * artık `resolveLessonMarkedStatus` kullanır.
 *
 * Düzeltme sonrası GERÇEK tarayıcı ölçümü (139x40 kart, tam dolgu):
 *   Geldi #15803d · İşlendi #b91c1c · Telafi #ca8a04 · İptal #475569 · Planlandı #ffffff
 */
const FUTURE = "2099-01-01T10:00:00.000Z";
const PAST = "2020-01-01T10:00:00.000Z";

function lesson(over: Partial<Lesson>): Lesson {
  return {
    id: "l_test", studentId: "s1", teacherId: "t1", roomId: "r1", branchId: "erzene",
    instrument: "Piyano", startAt: FUTURE, endAt: FUTURE, type: "regular", status: "scheduled",
    ...over,
  } as Lesson;
}

describe("resolveLessonMarkedStatus — insanın işaretlediği statü hep görünür", () => {
  it("GELECEKTEKİ ders 'Geldi' işaretliyse attended döner", () => {
    expect(resolveLessonMarkedStatus(lesson({ studentAttended: true }))).toBe("attended");
  });
  it("GELECEKTEKİ ders 'İşlendi' işaretliyse processed döner", () => {
    expect(resolveLessonMarkedStatus(lesson({ lessonProcessed: true }))).toBe("processed");
  });
  it("GELECEKTEKİ ders 'Telafi' işaretliyse makeup döner", () => {
    expect(resolveLessonMarkedStatus(lesson({ opsMakeupFlag: true }))).toBe("makeup");
  });
  it("GELECEKTEKİ iptal edilmiş ders cancelled döner", () => {
    expect(resolveLessonMarkedStatus(lesson({ status: "cancelled" }))).toBe("cancelled");
  });
  it("işaretlenmemiş gelecek ders planned kalır", () => {
    expect(resolveLessonMarkedStatus(lesson({}))).toBe("planned");
  });
  it("ÇIKARIM yoluyla gelen 'completed' gelecekte GÖSTERİLMEZ (zamana bağlı kalır)", () => {
    expect(resolveLessonMarkedStatus(lesson({ status: "completed" }))).toBe("planned");
    expect(resolveLessonMarkedStatus(lesson({ status: "completed", startAt: PAST }))).toBe("attended");
  });

  it("Yoklama Takvimi'nin bilinçli davranışı DEĞİŞMEDİ (gelecek = planned)", () => {
    // Regresyon koruması: paylaşılan fonksiyonun semantiği korunmalı.
    expect(resolveLessonFinalStatus(lesson({ studentAttended: true }))).toBe("planned");
    expect(resolveLessonFinalStatus(lesson({ lessonProcessed: true }))).toBe("planned");
  });
});

describe("Kart dolgusu — TAM arka plan, owner renk kararı", () => {
  const cases = [
    ["attended", ATTENDANCE_CALENDAR_COLORS.attended],
    ["processed", ATTENDANCE_CALENDAR_COLORS.processed],
    ["makeup", ATTENDANCE_CALENDAR_COLORS.makeup],
    ["cancelled", ATTENDANCE_CALENDAR_COLORS.cancelled],
  ] as const;

  for (const [status, expected] of cases) {
    it(`${status} → ${expected} tam dolgu`, () => {
      const fill = lessonCardFillStyle(status);
      expect(fill.backgroundColor).toBe(expected);
      expect(fill.color).toBeTruthy();
    });
  }

  it("işaretli gelecek ders, kartta NÖTR değil statü rengini alır (uçtan uca)", () => {
    const visual = resolveLessonMarkedStatus(lesson({ studentAttended: true }));
    expect(lessonCardFillStyle(visual).backgroundColor).toBe(ATTENDANCE_CALENDAR_COLORS.attended);
  });
});

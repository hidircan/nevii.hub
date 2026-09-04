import { describe, it, expect } from "vitest";
import {
  assertCanCreateMakeup,
  formatMakeupQuotaLabel,
  getStudentMakeupQuota,
  resolveMonthlyMakeupAllowance,
  TERM_MAKEUP_LIMIT,
} from "../makeup-quota";
import type { AppData, MakeupRequest } from "../types";

function mk(partial: Partial<MakeupRequest> & Pick<MakeupRequest, "id" | "studentId" | "status" | "createdAt">): Partial<MakeupRequest> {
  return {
    teacherId: "t1",
    branchId: "erzene",
    instrument: "Piyano",
    sourceLessonId: "l1",
    reason: "test",
    expiresAt: "2026-12-01T00:00:00.000Z",
    suggestedSlots: [],
    ...partial,
  };
}

// Dönem-bazlı kota her isteğin `sourceLessonId`'sinin gösterdiği gerçek
// derse bağlıdır; testlerde aksi belirtilmedikçe her istek AYNI (Ağustos
// 2026 = "2026-yaz" dönemi) derse bağlanır.
const SAME_PERIOD_LESSON = {
  id: "l1",
  studentId: "s1",
  teacherId: "t1",
  branchId: "erzene",
  roomId: "r1",
  instrument: "Piyano",
  startAt: "2026-08-10T10:00:00.000Z",
  endAt: "2026-08-10T10:40:00.000Z",
  type: "regular" as const,
  status: "scheduled" as const,
};

function baseData(requests: Partial<MakeupRequest>[], allowance?: number): AppData {
  return {
    settings: {
      tenantId: "t",
      name: "T",
      shortName: "T",
      city: "",
      website: "",
      email: "",
      phone: "",
      logoUrl: "",
      makeupWindowDays: 14,
      monthlyMakeupAllowance: allowance,
      lessonDurationMinutes: 40,
      workingHours: { start: "09:00", end: "21:00" },
      workingDays: [1, 2, 3, 4, 5, 6],
      currency: "TRY",
      branches: [],
      feeRoundingMode: "exact_minutes",
    },
    teachers: [],
    students: [],
    rooms: [],
    lessons: [SAME_PERIOD_LESSON],
    lessonSeries: [],
    attendances: [],
    makeupRequests: requests as unknown as MakeupRequest[],
    payments: [],
    teacherFeeRules: [],
    teacherPayouts: [],
  } as unknown as AppData;
}

describe("makeup-quota — dönem başına 2 telafi hakkı", () => {
  it("varsayılan hak 2", () => {
    expect(resolveMonthlyMakeupAllowance({})).toBe(TERM_MAKEUP_LIMIT);
  });

  it("aktif dönemde 0 telafi → 0 / 2 kullanıldı", () => {
    const snap = getStudentMakeupQuota(baseData([], 2), "s1", new Date("2026-08-12T12:00:00.000Z"));
    expect(snap.used).toBe(0);
    expect(snap.remaining).toBe(2);
    expect(formatMakeupQuotaLabel(snap)).toBe("0 / 2 kullanıldı · 2 hak kaldı");
  });

  it("aktif dönemde 1 confirmed telafi → 1 / 2 kullanıldı", () => {
    const data = baseData([mk({ id: "1", studentId: "s1", status: "confirmed", createdAt: "2026-08-05T10:00:00.000Z" })], 2);
    const snap = getStudentMakeupQuota(data, "s1", new Date("2026-08-12T12:00:00.000Z"));
    expect(snap.used).toBe(1);
    expect(snap.remaining).toBe(1);
    expect(formatMakeupQuotaLabel(snap)).toBe("1 / 2 kullanıldı · 1 hak kaldı");
  });

  it("aktif dönemde 2 confirmed telafi → limit dolu, hak kalmadı", () => {
    const data = baseData(
      [
        mk({ id: "1", studentId: "s1", status: "confirmed", createdAt: "2026-08-01T10:00:00.000Z" }),
        mk({ id: "2", studentId: "s1", status: "confirmed", createdAt: "2026-08-05T10:00:00.000Z" }),
      ],
      2
    );
    const snap = getStudentMakeupQuota(data, "s1", new Date("2026-08-12T12:00:00.000Z"));
    expect(formatMakeupQuotaLabel(snap)).toBe("2 / 2 kullanıldı · Hak kalmadı");
    const res = assertCanCreateMakeup(data, "s1", new Date("2026-08-12T12:00:00.000Z"));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toContain("2 telafi hakkını kullanmıştır");
  });

  it("1 confirmed + 1 pending → kullanıldı/rezerve edildi/yeni hak yok ayrımı", () => {
    const data = baseData(
      [
        mk({ id: "1", studentId: "s1", status: "confirmed", createdAt: "2026-08-01T10:00:00.000Z" }),
        mk({ id: "2", studentId: "s1", status: "pending", createdAt: "2026-08-05T10:00:00.000Z" }),
      ],
      2
    );
    const snap = getStudentMakeupQuota(data, "s1", new Date("2026-08-12T12:00:00.000Z"));
    expect(snap.confirmedUsed).toBe(1);
    expect(snap.reservedUsed).toBe(1);
    expect(formatMakeupQuotaLabel(snap)).toBe("1 / 2 kullanıldı · 1 hak rezerve edildi · Yeni telafi hakkı yok");
  });

  it("pending bir kayıt 'kullanıldı' olarak sayılmaz, yalnız confirmed sayılır", () => {
    const data = baseData([mk({ id: "1", studentId: "s1", status: "pending", createdAt: "2026-08-01T10:00:00.000Z" })], 2);
    const snap = getStudentMakeupQuota(data, "s1", new Date("2026-08-12T12:00:00.000Z"));
    expect(snap.confirmedUsed).toBe(0);
    expect(snap.reservedUsed).toBe(1);
    expect(snap.remaining).toBe(1);
  });

  it("0 hak telafiyi kapatır", () => {
    const data = baseData([], 0);
    const res = assertCanCreateMakeup(data, "s1", new Date("2026-08-12T12:00:00.000Z"));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toMatch(/kapalı/);
  });

  it("aynı eğitim dönemi içinde ay değişse bile kota sıfırlanmaz", () => {
    const data = baseData(
      [
        mk({ id: "1", studentId: "s1", status: "pending", createdAt: "2026-07-31T10:00:00.000Z" }),
        mk({ id: "2", studentId: "s1", status: "confirmed", createdAt: "2026-07-15T10:00:00.000Z" }),
      ],
      2
    );
    // sourceLessonId hâlâ Ağustos 2026 = "2026-yaz" dönemindeki l1'e bağlı;
    // ay Temmuz→Ağustos'a geçse de dönem AYNI kaldığı için kota TÜKENMİŞ kalmalı.
    const res = assertCanCreateMakeup(data, "s1", new Date("2026-08-01T12:00:00.000Z"));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.snapshot.used).toBe(2);
  });

  it("yeni eğitim dönemi kotayı 2'ye getirir — Güz ve Yaz ayrı sayaçlardır", () => {
    // Güz dersi (Ekim 2026 → academicYearStart=2026, term=guz) — 2 hak kullanılmış.
    const guzLesson = {
      ...SAME_PERIOD_LESSON,
      id: "l_guz",
      startAt: "2026-10-05T10:00:00.000Z",
      endAt: "2026-10-05T10:40:00.000Z",
    };
    // Yaz dersi AYNI akademik yılda (Ağustos 2026 → academicYearStart=2026, term=yaz) — ayrı dönem, dolu değil.
    const yazLesson = {
      ...SAME_PERIOD_LESSON,
      id: "l_yaz",
      startAt: "2026-08-20T10:00:00.000Z",
      endAt: "2026-08-20T10:40:00.000Z",
    };
    const data = baseData(
      [
        mk({ id: "1", studentId: "s1", status: "confirmed", createdAt: "2026-10-05T10:00:00.000Z", sourceLessonId: "l_guz" }),
        mk({ id: "2", studentId: "s1", status: "confirmed", createdAt: "2026-10-06T10:00:00.000Z", sourceLessonId: "l_guz" }),
      ],
      2
    );
    data.lessons = [guzLesson, yazLesson] as unknown as AppData["lessons"];
    const res = assertCanCreateMakeup(data, "s1", new Date("2026-08-21T12:00:00.000Z"), "l_yaz");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.snapshot.used).toBe(0);
  });

  it("önceki dönemin telafileri aktif dönem kotasına dahil edilmez", () => {
    const guzLesson = { ...SAME_PERIOD_LESSON, id: "l2", startAt: "2025-10-10T10:00:00.000Z", endAt: "2025-10-10T10:40:00.000Z" };
    const data = baseData(
      [mk({ id: "1", studentId: "s1", status: "confirmed", createdAt: "2025-10-10T10:00:00.000Z", sourceLessonId: "l2" })],
      2
    );
    data.lessons.push(guzLesson as unknown as AppData["lessons"][number]);
    const res = assertCanCreateMakeup(data, "s1", new Date("2026-08-12T12:00:00.000Z"));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.snapshot.used).toBe(0);
  });

  it("cancelled/expired telafi sayılmaz", () => {
    const data = baseData(
      [
        mk({ id: "1", studentId: "s1", status: "cancelled", createdAt: "2026-08-01T10:00:00.000Z" }),
        mk({ id: "2", studentId: "s1", status: "expired", createdAt: "2026-08-02T10:00:00.000Z" }),
      ],
      2
    );
    const snap = getStudentMakeupQuota(data, "s1", new Date("2026-08-12T12:00:00.000Z"));
    expect(snap.used).toBe(0);
  });

  it("suggested ve awaiting_info rezerve edilmiş olarak sayılır", () => {
    const data = baseData(
      [
        mk({ id: "1", studentId: "s1", status: "suggested", createdAt: "2026-08-01T10:00:00.000Z" }),
        mk({ id: "2", studentId: "s1", status: "awaiting_info", createdAt: "2026-08-02T10:00:00.000Z" }),
      ],
      2
    );
    const snap = getStudentMakeupQuota(data, "s1", new Date("2026-08-12T12:00:00.000Z"));
    expect(snap.reservedUsed).toBe(2);
    expect(snap.confirmedUsed).toBe(0);
  });

  it("başka öğrencinin talebi kotayı etkilemez", () => {
    const data = baseData(
      [
        mk({ id: "1", studentId: "s2", status: "pending", createdAt: "2026-08-01T10:00:00.000Z" }),
        mk({ id: "2", studentId: "s2", status: "confirmed", createdAt: "2026-08-02T10:00:00.000Z" }),
      ],
      2
    );
    const res = assertCanCreateMakeup(data, "s1", new Date("2026-08-12T12:00:00.000Z"));
    expect(res.ok).toBe(true);
  });

  it("sourceLessonId verilip kaynak ders bulunamazsa aktif dönem çözülemez", () => {
    const data = baseData([], 2);
    const res = assertCanCreateMakeup(data, "s1", new Date("2026-08-12T12:00:00.000Z"), "silinmis-ders-id");
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.snapshot.periodResolved).toBe(false);
      expect(res.message).toBe("Aktif eğitim dönemi belirlenemediği için telafi hakkı hesaplanamadı.");
    }
  });
});

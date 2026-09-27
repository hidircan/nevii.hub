import { describe, it, expect, beforeEach, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import {
  createRoomTool,
  createTrialLessonTool,
  deleteRoomTool,
  teacherDayAvailabilityTool,
  updateRoomTool,
  updateTeacherProfileTool,
} from "../services/tools";
import { resolveContractPlanForMonth } from "../attendance-calendar-plan";
import { createSeedData } from "../seed";
import { dayFillStyle } from "../../components/attendance-calendar-panel";
import { suggestMakeupSlots, validateLessonSlot } from "../makeup-engine";
import { AUDIT_CATEGORY_LABELS, auditBreadcrumb, auditCategoryOf, compactAuditDiff } from "../audit/humanize";
import { filterTeacherRows, type TeacherListRow } from "../teacher-list-filter";
import { freeRanges, nearestFreeStart, slotAdvice } from "../teacher-day-availability";
import { DEFAULT_APP_TIMEZONE, toZonedYmd, zonedHm } from "../timezone";
import { readData } from "../store";
import { teacherServesBranch } from "../teacher-branches";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

vi.mock("../audit/log", () => ({ recordAuditLog: vi.fn().mockResolvedValue(undefined) }));

const admin: ServiceContext = { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web" };

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
});

describe("8. tur A — öğretmen birden fazla şube", () => {
  it("birincil şube değiştirilebilir, ek şubeler birincili tekrar içermez", async () => {
    const data = await readData();
    const t = data.teachers[0];
    const other = data.settings.branches.find((b) => b.id !== t.branchId)!;
    const res = await updateTeacherProfileTool(admin, {
      teacherId: t.id,
      branchId: other.id,
      branchIds: [other.id, t.branchId],
    });
    expect(res.ok).toBe(true);
    const after = (await readData()).teachers.find((x) => x.id === t.id)!;
    expect(after.branchId).toBe(other.id);
    expect(after.branchIds).toEqual([t.branchId]);
    expect(teacherServesBranch(after, t.branchId)).toBe(true);
    expect(teacherServesBranch(after, other.id)).toBe(true);
  });

  it("geçersiz birincil şube Türkçe hata ile reddedilir", async () => {
    const t = (await readData()).teachers[0];
    const res = await updateTeacherProfileTool(admin, { teacherId: t.id, branchId: "yok-boyle-sube" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toContain("bulunamadı");
  });
});

describe("8. tur B — öğretmen müsaitlik kartı", () => {
  const day = { windows: [{ start: "14:00", end: "18:00" }], busy: [{ start: "14:00", end: "15:30" }] };

  it("boş aralık = pencere − dersler", () => {
    expect(freeRanges(day)).toEqual([{ start: "15:30", end: "18:00" }]);
  });

  it("çakışan saatte yol gösterici Türkçe uyarı + en yakın boş slot", () => {
    const a = slotAdvice("Pınar Çelik", day, "14:30", 40);
    expect(a.tone).toBe("warn");
    expect(a.message).toBe("Pınar Çelik 14:00–15:30 arası başka bir derste. En yakın boş slot: 15:30.");
    expect(a.suggestion).toBe("15:30");
  });

  it("pencere dışında: günün müsait aralığı söylenir", () => {
    const a = slotAdvice("Pınar Çelik", { windows: [{ start: "14:00", end: "15:30" }], busy: [] }, "10:00", 40);
    expect(a.message).toBe("Pınar Çelik bu günde 14:00–15:30 arası müsait. En yakın boş slot: 14:00.");
  });

  it("uygun saatte olumlu mesaj, süreyi sığdırmayan aralık önerilmez", () => {
    expect(slotAdvice("X", day, "16:00", 40).tone).toBe("ok");
    expect(nearestFreeStart({ windows: [{ start: "10:00", end: "10:30" }], busy: [] }, "10:00", 40)).toBeNull();
  });

  it("tool tek çağrıda şubedeki öğretmenlerin gününü döner; meşgul aralık gerçek dersten gelir", async () => {
    const data = await readData();
    const lesson = data.lessons.find((l) => l.status !== "cancelled")!;
    const teacher = data.teachers.find((t) => t.id === lesson.teacherId)!;
    const date = toZonedYmd(new Date(lesson.startAt), DEFAULT_APP_TIMEZONE);
    const res = await teacherDayAvailabilityTool(admin, { date, branchId: teacher.branchId });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const row = res.data.teachers.find((t) => t.teacherId === teacher.id)!;
    expect(row.busy.some((b) => b.start <= zonedHm(new Date(lesson.startAt), DEFAULT_APP_TIMEZONE))).toBe(true);
  });

  it("TEACHER müsaitlik kartını çağıramaz", async () => {
    const res = await teacherDayAvailabilityTool({ ...admin, role: "TEACHER" }, { date: "2026-10-01", branchId: "erzene" });
    expect(res.ok).toBe(false);
  });
});

describe("8. tur J2 — deneme oluştururken çakışma kontrolü", () => {
  it("öğretmenin dersiyle çakışan deneme reddedilir (onayla bile)", async () => {
    const data = await readData();
    // 9. tur: tarihe bağlı kırmızı — ilk gelecek ders Güz'ün kapalı günü Pazartesi'ye düşünce
    // çakışma yerine "kapalı gün" hatası dönüyordu. Açık bir günde ders seçilir (İstanbul günü).
    const istanbulWeekday = (iso: string) => new Date(new Date(iso).getTime() + 3 * 3600_000).getUTCDay();
    const lesson = data.lessons.find(
      (l) => l.status !== "cancelled" && new Date(l.startAt) > new Date() && istanbulWeekday(l.startAt) !== 1
    )!;
    const teacher = data.teachers.find((t) => t.id === lesson.teacherId)!;
    const res = await createTrialLessonTool(admin, {
      name: "Aday",
      phone: "05551234567",
      instrument: teacher.instruments[0],
      branchId: teacher.branchId,
      teacherId: teacher.id,
      startAt: lesson.startAt,
      durationMinutes: 15,
      allowAvailabilityOverride: true,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toContain("başka bir derste");
  });
});

describe("8. tur D — öğretmen listesi filtreleri", () => {
  const rows: TeacherListRow[] = [
    { id: "a", displayId: "T00001", name: "Pınar Çelik", email: "pinar@x.com", phone: "0532 111 22 33", branchId: "erzene", branchIds: ["evka3"], instruments: ["Piyano"], active: true, studentCount: 5 },
    { id: "b", displayId: "T00002", name: "Olcay Özdemir", email: "olcay@x.com", phone: "0533 444 55 66", branchId: "erzene", instruments: ["Gitar"], active: true, studentCount: 9 },
    { id: "c", displayId: "T00003", name: "Eski Hoca", email: "eski@x.com", phone: "0534 000 00 00", branchId: "evka3", instruments: ["Piyano"], active: false, studentCount: 0 },
  ];
  const base = { query: "", branches: [], instrument: "", status: "active" as const, sort: "name" as const };

  it("ad/e-posta/telefon araması (Türkçe harf duyarsız)", () => {
    expect(filterTeacherRows(rows, { ...base, query: "pınar" }).map((r) => r.id)).toEqual(["a"]);
    expect(filterTeacherRows(rows, { ...base, query: "olcay@" }).map((r) => r.id)).toEqual(["b"]);
    expect(filterTeacherRows(rows, { ...base, query: "444 55" }).map((r) => r.id)).toEqual(["b"]);
  });

  it("şube filtresi ek şubeleri de kapsar (teacherServesBranch)", () => {
    expect(filterTeacherRows(rows, { ...base, branches: ["evka3"] }).map((r) => r.id)).toEqual(["a"]);
    expect(filterTeacherRows(rows, { ...base, branches: ["evka3"], status: "all" }).map((r) => r.id).sort()).toEqual(["a", "c"]);
  });

  it("durum, enstrüman ve sıralama", () => {
    expect(filterTeacherRows(rows, { ...base, status: "inactive" }).map((r) => r.id)).toEqual(["c"]);
    expect(filterTeacherRows(rows, { ...base, instrument: "Gitar" }).map((r) => r.id)).toEqual(["b"]);
    expect(filterTeacherRows(rows, { ...base, sort: "students_desc" }).map((r) => r.id)).toEqual(["b", "a"]);
    expect(filterTeacherRows(rows, { ...base, status: "all", sort: "created_desc" }).map((r) => r.id)).toEqual(["c", "b", "a"]);
  });
});

describe("8. tur E — pasif oda silme (soft delete)", () => {
  it("aktif oda silinemez; pasif oda silinir, satır kalır (geçmiş ders oda adını korur)", async () => {
    const created = await createRoomTool(admin, { name: "Silinecek Oda", branchId: "erzene", capacity: 1, instruments: ["Piyano"] });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const roomId = created.data.roomId;
    const active = await deleteRoomTool(admin, { roomId });
    expect(active.ok).toBe(false);
    if (!active.ok) expect(active.error.message).toContain("yalnız pasif odalar silinebilir");

    expect((await updateRoomTool(admin, { roomId, active: false })).ok).toBe(true);
    expect((await deleteRoomTool(admin, { roomId })).ok).toBe(true);
    const after = (await readData()).rooms.find((r) => r.id === roomId);
    expect(after?.deletedAt).toBeTruthy();
    expect(after?.name).toBe("Silinecek Oda");
    expect((await deleteRoomTool(admin, { roomId })).ok).toBe(false);
  });

  it("ileri tarihli planlı dersi olan pasif oda silinemez", async () => {
    const data = await readData();
    const now = new Date().toISOString();
    const lesson = data.lessons.find((l) => l.status !== "cancelled" && l.startAt > now);
    if (!lesson) return;
    await updateRoomTool(admin, { roomId: lesson.roomId, active: false });
    const res = await deleteRoomTool(admin, { roomId: lesson.roomId });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toContain("ileri tarihli");
  });
});

describe("8. tur — sözleşmesiz öğrencinin ödeme planı yoklama takviminde görünür (Alp Arslan Doğan vakası)", () => {
  const reg = {
    id: "pay_reg",
    amount: 4470,
    paidAmount: 4470,
    dueDate: "2026-09-03",
    status: "paid",
    source: "registration_first_payment",
  };

  it("sözleşme yok + kayıt ilk tahsilatı: o ayda satırın gerçek tutarı gösterilir", () => {
    const plan = resolveContractPlanForMonth({ contracts: [], installments: [reg], year: 2026, month: 9, studentMonthlyFee: 5950 });
    expect(plan.state).toBe("student_plan");
    if (plan.state !== "student_plan") return;
    expect(plan.paymentIds).toEqual(["pay_reg"]);
    expect(plan.amount).toBe(4470);
    expect(plan.remaining).toBe(0);
    expect(plan.monthlyFee).toBe(5950);
  });

  it("satırı olmayan ayda borç uydurulmaz; yalnız aylık ücret bilgi olarak taşınır", () => {
    const plan = resolveContractPlanForMonth({ contracts: [], installments: [reg], year: 2026, month: 10, studentMonthlyFee: 5950 });
    expect(plan.state).toBe("student_plan");
    if (plan.state !== "student_plan") return;
    expect(plan.paymentIds).toEqual([]);
    expect(plan.amount).toBe(0);
    expect(plan.message).toContain("henüz ödeme kaydı yok");
  });

  it("ücret ve satır yoksa eski 'plan yok' durumu korunur; sözleşmeye bağlı satır sözleşmesiz plana karışmaz", () => {
    expect(resolveContractPlanForMonth({ contracts: [], installments: [], year: 2026, month: 10 }).state).toBe("no_active_contract");
    const linked = { ...reg, contractId: "c1", installmentSequence: 1 };
    expect(resolveContractPlanForMonth({ contracts: [], installments: [linked], year: 2026, month: 9 }).state).toBe("no_active_contract");
  });
});

describe("8. tur F — denetim kaydı Türkçe kategori + bağlam (sunum katmanı, eski kayıtlar bozulmaz)", () => {
  it("eski teknik kodların varlık türleri Türkçe kategoriye eşlenir", () => {
    expect(AUDIT_CATEGORY_LABELS[auditCategoryOf("Student")]).toBe("Öğrenci işlemleri");
    expect(AUDIT_CATEGORY_LABELS[auditCategoryOf("StudentContract")]).toBe("Sözleşme işlemleri");
    expect(AUDIT_CATEGORY_LABELS[auditCategoryOf("Payment")]).toBe("Ödeme işlemleri");
    expect(AUDIT_CATEGORY_LABELS[auditCategoryOf("Lesson")]).toBe("Ders işlemleri");
    expect(AUDIT_CATEGORY_LABELS[auditCategoryOf("Auth")]).toBe("Kullanıcı işlemleri");
    expect(AUDIT_CATEGORY_LABELS[auditCategoryOf("BilinmeyenTur")]).toBe("Sistem işlemleri");
  });

  it("bağlam satırı ve kompakt diff; bilinmeyen parça uydurulmaz", () => {
    expect(auditBreadcrumb(["Öğrenciler", "Gülce Özalp", undefined, "Ödeme planı güncellendi."])).toBe(
      "Öğrenciler → Gülce Özalp → Ödeme planı güncellendi."
    );
    expect(compactAuditDiff([{ field: "monthlyFee", from: 1500, to: 1700 }])).toMatch(/1\.500 → 1\.700$/);
  });
});

describe("8. tur G — telafi uygun saat önerisi performansı", () => {
  function bigData() {
    const data = createSeedData();
    const base = data.lessons;
    const now = Date.now();
    data.lessons = Array.from({ length: 6000 }, (_, i) => {
      const start = new Date(now + ((i % 60) - 20) * 86_400_000 + (i % 10) * 3_600_000);
      return { ...base[i % base.length], id: `bl${i}`, startAt: start.toISOString(), endAt: new Date(start.getTime() + 40 * 60_000).toISOString() };
    });
    return data;
  }

  it("6000 derste öneri 41 sn yerine 1,5 sn altında (ölçülen ~150 ms)", () => {
    const data = bigData();
    const t = data.teachers[0];
    const req = {
      id: "m1", studentId: data.students[0].id, teacherId: t.id, instrument: t.instruments[0], branchId: t.branchId,
      reason: "hasta", status: "pending", expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      sourceLessonId: data.lessons[0].id, createdAt: new Date().toISOString(), suggestedSlots: [],
    } as unknown as Parameters<typeof suggestMakeupSlots>[1];
    const t0 = performance.now();
    suggestMakeupSlots(data, req, { maxSlots: 6 });
    expect(performance.now() - t0).toBeLessThan(1500);
  });

  it("indeks davranışı değiştirmez: dersin kendi saati hariç tutulunca uygun, tutulmazsa TEACHER_CONFLICT", () => {
    const data = createSeedData();
    const opts = { allowAvailabilityOverride: true, now: new Date(0) };
    const l = data.lessons.find((x) => {
      if (x.status === "cancelled") return false;
      const ctx = { instrument: x.instrument, studentId: x.studentId };
      return validateLessonSlot(data, ctx, x, { ...opts, excludeLessonId: x.id, durationMinutes: 30 }).ok;
    });
    expect(l).toBeDefined();
    const res = validateLessonSlot(data, { instrument: l!.instrument, studentId: l!.studentId }, l!, { ...opts, durationMinutes: 30 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("TEACHER_CONFLICT");
  });
});

describe("8. tur I — yoklama takvimi aynı statü ayırıcı", () => {
  it("aynı gün iki 'geldi' dersi iki şerit + aralarında 2px siyah çizgi", () => {
    const day = { status: "open", lessons: [{ lessonId: "a", opsStatus: "attended" }, { lessonId: "b", opsStatus: "attended" }] } as unknown as Parameters<typeof dayFillStyle>[0];
    const { style, segmentCount } = dayFillStyle(day);
    expect(segmentCount).toBe(2);
    expect(String(style.backgroundImage)).toContain("#000 calc(50% - 1px), #000 calc(50% + 1px)");
  });

  it("tek ders düz renk kalır", () => {
    const day = { status: "open", lessons: [{ lessonId: "a", opsStatus: "attended" }] } as unknown as Parameters<typeof dayFillStyle>[0];
    expect(dayFillStyle(day).segmentCount).toBe(1);
  });
});

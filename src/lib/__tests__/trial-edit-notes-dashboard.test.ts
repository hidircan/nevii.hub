import { describe, it, expect, beforeEach, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { createTrialLessonTool, updateTrialLessonTool } from "../services/tools";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import { isWeeklyClosedDayForTerm } from "../attendance-calendar";
import { getTrialLesson, TRIAL_LESSONS_FILE } from "../trial-lessons";
import { validateTrialSlot } from "../makeup-engine";
import { buildTrialDigest, trialFollowUpAction } from "../dashboard/trial-digest";
import { DEFAULT_TRIAL_LIST_FILTER, filterTrialRows, type TrialListRow } from "../trial-list-filter";
import {
  resolveDashboardLayout,
  sanitizeDashboardLayoutPatch,
  mergeDashboardPreferences,
} from "../dashboard/layout-prefs";
import { SCREEN_WIDGETS, permittedScreenWidgets, screenWidgetMetric } from "../dashboard/screen-widgets";
import type { AppData, Teacher, TrialLesson } from "../types";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");
vi.mock("../audit/log", () => ({ recordAuditLog: vi.fn().mockResolvedValue(undefined) }));

function ctx(overrides?: Partial<ServiceContext>): ServiceContext {
  return { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web", ...overrides };
}

function openDay(daysAhead: number, hour = 11): string {
  const d = new Date();
  let added = 0;
  while (added < daysAhead) {
    d.setDate(d.getDate() + 1);
    if (!isWeeklyClosedDayForTerm(d)) added++;
  }
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
  await fs.rm(TRIAL_LESSONS_FILE, { force: true });
});

async function plan(notes = "Seviye: başlangıç") {
  const res = await createTrialLessonTool(ctx(), {
    name: "Aday Bir",
    phone: "05551234567",
    instrument: "Piyano",
    branchId: "erzene",
    teacherId: "t1",
    startAt: openDay(3),
    durationMinutes: 15,
    notes,
    allowAvailabilityOverride: true,
  });
  if (!res.ok) throw new Error(res.error.message);
  return res.data.trialId;
}

describe("deneme dersi notları — hazırlık ve sonuç ayrı", () => {
  it("planlamada girilen hazırlık notu saklanır ve planlama öncesi düzenlenebilir", async () => {
    const id = await plan();
    const res = await updateTrialLessonTool(ctx(), { trialId: id, notes: "Seviye: orta, nota getirsin" });
    expect(res.ok).toBe(true);
    expect((await getTrialLesson(DEFAULT_TENANT_ID, id))?.notes).toBe("Seviye: orta, nota getirsin");
  });

  // Sahip emri (2026-09-28, d0a6f04): deneme dersinde KİLİT YOK — geçmiş/kayıtlı/iptal denemede plan ve notların
  // tamamı her zaman düzenlenebilir. Korunan kural: sonuç notu hazırlık notunun ÜZERİNE YAZMAZ (ayrı alan).
  it("sonuç notu ders başlamadan da girilebilir (kilit yok)", async () => {
    const id = await plan();
    const res = await updateTrialLessonTool(ctx(), { trialId: id, resultNotes: "Kayıt olacak" });
    expect(res.ok).toBe(true);
    const saved = (await getTrialLesson(DEFAULT_TENANT_ID, id))!;
    expect(saved.resultNotes).toBe("Kayıt olacak");
    expect(saved.notes).toBe("Seviye: başlangıç");
  });

  it("ders sonrası sonuç notu hazırlık notunun üzerine YAZMAZ; hazırlık notu ve plan sonradan da düzenlenir", async () => {
    const id = await plan("Hazırlık metni");
    const t = (await getTrialLesson(DEFAULT_TENANT_ID, id))!;
    const after = new Date(new Date(t.endAt).getTime() + 60_000);
    const res = await updateTrialLessonTool(ctx(), { trialId: id, resultNotes: "Veliyle görüşüldü" }, after);
    expect(res.ok).toBe(true);
    const saved = (await getTrialLesson(DEFAULT_TENANT_ID, id))!;
    expect(saved.notes).toBe("Hazırlık metni");
    expect(saved.resultNotes).toBe("Veliyle görüşüldü");
    expect(saved.resultNotesByUserId).toBe("u1");

    const edited = await updateTrialLessonTool(ctx(), { trialId: id, notes: "Düzeltilmiş hazırlık" }, after);
    expect(edited.ok).toBe(true);
    const target = openDay(6);
    const moved = await updateTrialLessonTool(ctx(), { trialId: id, startAt: target, allowAvailabilityOverride: true }, after);
    expect(moved.ok, moved.ok ? "" : moved.error.message).toBe(true);
    const final = (await getTrialLesson(DEFAULT_TENANT_ID, id))!;
    expect(final.notes).toBe("Düzeltilmiş hazırlık");
    expect(final.resultNotes).toBe("Veliyle görüşüldü");
    expect(final.startAt).toBe(target);
  });

  it("kayda dönüşmüş denemenin planı da düzenlenebilir (kilit yok)", async () => {
    const id = await plan();
    const { markTrialConverted } = await import("../trial-lessons");
    await markTrialConverted(DEFAULT_TENANT_ID, id, { studentId: "s1", userId: "u1" });
    const target = openDay(5);
    const res = await updateTrialLessonTool(ctx(), { trialId: id, startAt: target, allowAvailabilityOverride: true });
    expect(res.ok, res.ok ? "" : res.error.message).toBe(true);
    expect((await getTrialLesson(DEFAULT_TENANT_ID, id))!.startAt).toBe(target);
  });

  it("öğretmen denemeyi başka öğretmene devredemez", async () => {
    const id = await plan();
    const res = await updateTrialLessonTool(ctx({ role: "TEACHER", teacherId: "t1" }), { trialId: id, teacherId: "t2" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("FORBIDDEN");
  });

  it("yeni saat öğretmenin başka denemesiyle çakışırsa reddedilir", async () => {
    const a = await plan();
    const b = await createTrialLessonTool(ctx(), {
      name: "Aday İki",
      phone: "05550000000",
      instrument: "Piyano",
      branchId: "erzene",
      teacherId: "t1",
      startAt: openDay(4),
      durationMinutes: 15,
      allowAvailabilityOverride: true,
    });
    if (!b.ok) throw new Error(b.error.message);
    const aRow = (await getTrialLesson(DEFAULT_TENANT_ID, a))!;
    const res = await updateTrialLessonTool(ctx(), {
      trialId: b.data.trialId,
      startAt: aRow.startAt,
      allowAvailabilityOverride: true,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toMatch(/başka bir deneme/);
  });
});

describe("validateTrialSlot — normal ders öğretmen kuralları", () => {
  const teacher: Teacher = {
    id: "tx",
    name: "Öğretmen X",
    branchId: "erzene",
    instruments: ["Piyano"],
    availability: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dayOfWeek: d, start: "09:00", end: "21:00" })),
    maxDailyLessons: 8,
    active: true,
  } as unknown as Teacher;
  const data = {
    teachers: [teacher],
    lessons: [],
    settings: {},
    closedDayOverrides: [],
  } as unknown as Pick<AppData, "teachers" | "lessons" | "settings" | "closedDayOverrides">;
  const start = openDay(3, 12);
  const base = { teacherId: "tx", branchId: "erzene", instrument: "Piyano", startAt: start, durationMinutes: 15 };

  it("uygun slot geçer", () => {
    expect(validateTrialSlot(data, base, []).ok).toBe(true);
  });
  it("enstrüman uyuşmazlığı açık mesajla reddedilir", () => {
    const r = validateTrialSlot(data, { ...base, instrument: "Keman" }, []);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("TEACHER_INSTRUMENT_MISMATCH");
  });
  it("öğretmenin vermediği şube reddedilir", () => {
    const r = validateTrialSlot(data, { ...base, branchId: "evka3" }, []);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("TEACHER_BRANCH_MISMATCH");
  });
  it("pasif öğretmen reddedilir", () => {
    const r = validateTrialSlot({ ...data, teachers: [{ ...teacher, active: false }] }, base, []);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("TEACHER_INACTIVE");
  });
  it("aynı saatte normal ders varsa reddedilir", () => {
    const lessons = [{ id: "l1", teacherId: "tx", status: "scheduled", startAt: start, endAt: new Date(new Date(start).getTime() + 30 * 60_000).toISOString() }];
    const r = validateTrialSlot({ ...data, lessons } as never, base, []);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("TEACHER_CONFLICT");
  });
});

describe("Günlük Özet — deneme özeti", () => {
  const now = new Date("2026-09-26T09:00:00.000Z");
  const mk = (id: string, startAt: string, extra: Partial<TrialLesson> = {}): TrialLesson => ({
    id,
    name: `Aday ${id}`,
    phone: "0555",
    instrument: "Piyano",
    branchId: "erzene",
    teacherId: "t1",
    startAt,
    endAt: new Date(new Date(startAt).getTime() + 15 * 60_000).toISOString(),
    durationMinutes: 15,
    status: "planned",
    createdBy: "u1",
    createdAt: startAt,
    updatedAt: startAt,
    ...extra,
  });
  const trials = [
    mk("today", "2026-09-26T12:00:00.000Z", { notes: "nota getirsin" }),
    mk("soon", "2026-09-28T12:00:00.000Z"),
    mk("far", "2026-10-20T12:00:00.000Z"),
    mk("past-planned", "2026-09-20T12:00:00.000Z"),
    mk("past-done", "2026-09-19T12:00:00.000Z", { status: "attended", resultNotes: "iyi" }),
    mk("other-branch", "2026-09-26T13:00:00.000Z", { branchId: "evka3" }),
    mk("cancelled", "2026-09-26T14:00:00.000Z", { status: "cancelled" }),
  ];
  const opts = { now, teachers: [{ id: "t1", name: "T" }], branches: [{ id: "erzene", shortName: "Erzene" }] };

  it("bugün / 7 gün / takip bekleyen ayrılır; şube süzgeci uygulanır; iptal görünmez", () => {
    const d = buildTrialDigest(trials, { ...opts, branchId: "erzene" });
    expect(d.today.map((t) => t.id)).toEqual(["today"]);
    expect(d.today[0]!.prepNote).toBe("nota getirsin");
    expect(d.today[0]!.href).toBe("/panel/deneme?deneme=today");
    expect(d.upcoming.map((t) => t.id)).toEqual(["soon"]);
    expect(d.needsAction.map((t) => t.id)).toEqual(["past-planned"]);
    const all = buildTrialDigest(trials, { ...opts, branchId: "all" });
    expect(all.today.map((t) => t.id)).toEqual(["today", "other-branch"]);
  });

  it("takip aksiyonu: statü → kayıt kararı → sonuç notu", () => {
    expect(trialFollowUpAction({ status: "planned" })).toMatch(/Durum/);
    expect(trialFollowUpAction({ status: "awaiting_enrollment" })).toMatch(/Kayda/);
    expect(trialFollowUpAction({ status: "attended" })).toMatch(/Sonuç notu/);
    expect(trialFollowUpAction({ status: "attended", resultNotes: "x" })).toBeUndefined();
    expect(trialFollowUpAction({ status: "will_continue", convertedStudentId: "s1" })).toBeUndefined();
  });
});

describe("deneme listesi filtresi", () => {
  const row = (id: string, o: Partial<TrialListRow>): TrialListRow => ({
    id,
    name: id,
    phone: "0555 111 22 33",
    instrument: "Piyano",
    teacherId: "t1",
    teacherName: "Turgay",
    branchId: "erzene",
    branchName: "Erzene",
    startAt: "2026-09-26T10:00:00.000Z",
    dayYmd: "2026-09-26",
    status: "planned",
    isPast: false,
    ...o,
  });
  const rows = [
    row("Ayşe", { startAt: "2026-09-01T10:00:00.000Z", dayYmd: "2026-09-01", isPast: true, status: "attended" }),
    row("Can", { teacherId: "t2", teacherName: "Olcay", branchId: "evka3" }),
    row("Deniz", { status: "cancelled", notes: "veli arayacak" }),
  ];
  it("varsayılan görünüm Tümü — hiçbir kayıt gizlenmez, tarih yeniden eskiye", () => {
    expect(DEFAULT_TRIAL_LIST_FILTER.view).toBe("all");
    expect(filterTrialRows(rows, DEFAULT_TRIAL_LIST_FILTER).map((r) => r.id)).toEqual(["Can", "Deniz", "Ayşe"]);
  });
  it("arama not/telefon/öğretmen içinde; filtreler birlikte uygulanır", () => {
    const f = DEFAULT_TRIAL_LIST_FILTER;
    expect(filterTrialRows(rows, { ...f, query: "arayacak" }).map((r) => r.id)).toEqual(["Deniz"]);
    expect(filterTrialRows(rows, { ...f, query: "111 22" }).length).toBe(3);
    expect(filterTrialRows(rows, { ...f, teacherId: "t2" }).map((r) => r.id)).toEqual(["Can"]);
    expect(filterTrialRows(rows, { ...f, branchId: "erzene", status: "cancelled" }).map((r) => r.id)).toEqual(["Deniz"]);
    expect(filterTrialRows(rows, { ...f, from: "2026-09-10" }).map((r) => r.id).sort()).toEqual(["Can", "Deniz"]);
    expect(filterTrialRows(rows, { ...f, view: "open" }).map((r) => r.id).sort()).toEqual(["Ayşe", "Can"]);
  });
});

describe("Günlük Özet — menü ekranı widget'ları", () => {
  const ownerAccess = { role: "SUPER_ADMIN", canViewTeacherEarnings: true, canViewFinanceAndStaffSummary: true };
  const adminAccess = { role: "SCHOOL_ADMIN", canViewTeacherEarnings: false, canViewFinanceAndStaffSummary: false };

  it("katalog menüden gelir, kategorilidir, Özet ve Deneme ekranını içermez", () => {
    expect(SCREEN_WIDGETS.length).toBeGreaterThan(10);
    expect(SCREEN_WIDGETS.some((w) => w.href === "/panel" || w.href === "/panel/deneme")).toBe(false);
    expect(new Set(SCREEN_WIDGETS.map((w) => w.category)).size).toBeGreaterThanOrEqual(4);
  });

  it("yetki sidebar ile aynı: SCHOOL_ADMIN personel/finans özeti/hakediş widget'ını göremez", () => {
    const hrefs = permittedScreenWidgets(adminAccess).map((w) => w.href);
    expect(hrefs).not.toContain("/panel/personel");
    expect(hrefs).not.toContain("/panel/finans-ozeti");
    expect(hrefs).not.toContain("/panel/hakedisler");
    expect(permittedScreenWidgets(ownerAccess).map((w) => w.href)).toContain("/panel/personel");
  });

  it("eski kayıtlı düzen (widget'sız) aynen çalışır; yeni deneme bölümü eklenir", () => {
    const layout = resolveDashboardLayout(
      { sectionOrder: ["metrics", "actions"], hiddenSections: ["tasks"], sectionSpans: { metrics: 6 } },
      "SCHOOL_ADMIN",
      adminAccess
    );
    expect(layout.order.slice(0, 2)).toEqual(["metrics", "actions"]);
    expect(layout.order).toContain("trials");
    expect(layout.hidden).toEqual(["tasks"]);
    expect(layout.spans.metrics).toBe(6);
    expect(layout.addedWidgets).toEqual([]);
    expect(layout.order.some((k) => k.startsWith("screen:"))).toBe(false);
  });

  it("eklenen widget kaydedilir; yetkisiz olan kaydedilmez ve eski kayıttan da düşer", () => {
    const patch = sanitizeDashboardLayoutPatch(
      {
        addedWidgets: ["screen:telafi", "screen:personel", "screen:yok-boyle-ekran"],
        sectionOrder: ["screen:telafi", "actions", "screen:personel"],
        sectionSpans: { "screen:telafi": 6 },
      },
      "SCHOOL_ADMIN",
      adminAccess
    );
    expect("clearLayout" in patch).toBe(false);
    if ("clearLayout" in patch) return;
    expect(patch.addedWidgets).toEqual(["screen:telafi"]);
    expect(patch.sectionOrder![0]).toBe("screen:telafi");
    expect(patch.sectionOrder).not.toContain("screen:personel");
    const prefs = mergeDashboardPreferences({ defaultBranchId: "evka3" }, patch);
    expect(prefs.defaultBranchId).toBe("evka3");
    const layout = resolveDashboardLayout(prefs, "SCHOOL_ADMIN", adminAccess);
    expect(layout.visible[0]).toMatchObject({ key: "screen:telafi", span: 6, label: "Telafi Merkezi" });

    // Kullanıcının yetkisi düşerse (ör. owner iken eklediği Personel) widget görünmez.
    const stale = resolveDashboardLayout({ addedWidgets: ["screen:personel"] }, "SCHOOL_ADMIN", adminAccess);
    expect(stale.order).not.toContain("screen:personel");
  });

  it("varsayılana dön eklenen widget'ları temizler, şube tercihini korur", () => {
    const next = mergeDashboardPreferences(
      { defaultBranchId: "erzene", addedWidgets: ["screen:telafi"] },
      sanitizeDashboardLayoutPatch({ resetToDefault: true }, "SCHOOL_ADMIN", adminAccess)
    );
    expect(next).toEqual({ defaultBranchId: "erzene" });
  });

  it("anlamlı özeti olan ekran sayı verir, olmayan kısayoldur", () => {
    const s = { todayLessons: 4, activeStudents: 10, activeTeachers: 3, openMakeups: 2, overdueTotal: 0, overdueTotalLabel: "0 ₺", openTasks: 1, collectedThisMonth: 5000, collectedThisMonthLabel: "5.000 ₺" };
    const telafi = SCREEN_WIDGETS.find((w) => w.href === "/panel/telafi")!;
    expect(screenWidgetMetric(telafi, s)).toMatchObject({ value: "2", tone: "warning" });
    const kvkk = SCREEN_WIDGETS.find((w) => w.href === "/panel/ayarlar/kvkk")!;
    expect(screenWidgetMetric(kvkk, s)).toBeNull();
    // 10. tur iş #6 — finans widget'ı tek sayı: bu ay tahsilat.
    const finans = SCREEN_WIDGETS.find((w) => w.href === "/panel/finans-ozeti")!;
    expect(screenWidgetMetric(finans, s)).toMatchObject({ value: "5.000 ₺", caption: "bu ay tahsilat" });
  });
});

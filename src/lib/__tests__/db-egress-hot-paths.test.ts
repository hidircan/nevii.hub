/**
 * DB egress + UserSession gecikmesi (2026-10-10) — sıcak yollar artık tam `readData()` yerine hedefli okuma
 * yapar. Bu dosya kilitler:
 * - tek satır okumaları (`readLessonById`/`readPaymentById`/`readTeacherPayoutsForTeacher`) tam okumayla aynı;
 * - yeni ders doğrulamasının dar dilimi (`narrowSlotScope`) tam veriyle AYNI kararı verir;
 * - dar dilimle çalışan yazımlar (ders oluştur/başlat/bitir/iptal, öğretmen katılımı, tahsilat) hedef dışındaki
 *   hiçbir satırı silmez/değiştirmez (json/memory tam veriye birleştirerek yazar);
 * - oturum: uzatma/presence DB'de koşullu ve aralıklı yazılır, iptal edilmiş oturum asla yeniden açılmaz.
 * db kolu (Prisma dilimleri) yerel PostgreSQL'de `scripts/bench/verify-db-slices.ts` + `bench-tool-egress.ts` ile.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { DEFAULT_TENANT_ID } from "../auth/config";
import { runWithTenantAsync } from "../tenant-context";
import type { ServiceContext } from "../services/context";
import type { AppData, Lesson, Payment, TeacherPayout } from "../types";
import { writeData } from "../store-json";
import { readData, readLessonById, readPaymentById, readTeacherPayoutsForTeacher } from "../store";
import { narrowSlotScope } from "../lesson-scope";
import { validateLessonSlot } from "../makeup-engine";
import {
  cancelLessonTool,
  createLessonTool,
  createPaymentTool,
  endLessonTool,
  setLessonOpsFlagTool,
  startLessonTool,
} from "../services/tools";

const DIR = resolveDataDir(path.join(process.cwd(), "data"));
const { resetPlatformStoreForTests } = await import("../platform/store");
const reg = await import("../auth/session-registry");
const { getUserSession, saveUserSession, patchOpenUserSession } = await import("../platform/store-ext");

function ctx(overrides?: Partial<ServiceContext>): ServiceContext {
  return { role: "SUPER_ADMIN", userId: "user_owner_nilufer", tenantId: DEFAULT_TENANT_ID, channel: "web", ...overrides };
}

function lesson(id: string, studentId: string, start: string, patch: Partial<Lesson> = {}): Lesson {
  const s = new Date(start);
  return {
    id,
    studentId,
    teacherId: "t1",
    roomId: "r1",
    branchId: "erzene",
    instrument: "Piyano",
    startAt: s.toISOString(),
    endAt: new Date(s.getTime() + 40 * 60_000).toISOString(),
    type: "regular",
    status: "scheduled",
    ...patch,
  } as Lesson;
}

const run = <T>(fn: () => Promise<T>) => runWithTenantAsync(DEFAULT_TENANT_ID, fn);

/** Çarşamba 2026-10-14 (açık gün) etrafında t1/r1 dersleri + başka gün/başka öğretmen dersleri + ödemeler. */
async function seed(): Promise<AppData> {
  const data = await readData();
  const lessons: Lesson[] = [
    lesson("hp_a", "s1", "2026-10-14T11:00:00Z"),
    lesson("hp_b", "s2", "2026-10-14T12:00:00Z"),
    lesson("hp_c", "s2", "2026-10-21T12:00:00Z"),
    lesson("hp_d", "s2", "2026-10-14T13:00:00Z", { teacherId: "t2", roomId: "r2" }),
    lesson("hp_e", "s1", "2026-11-04T11:00:00Z"),
  ];
  const payments: Payment[] = [
    { id: "hp_p1", studentId: "s1", amount: 3200, paidAmount: 0, status: "pending", dueDate: "2026-10-05T09:00:00.000Z", description: "Ekim", source: "manual" } as Payment,
    { id: "hp_p2", studentId: "s2", amount: 3200, paidAmount: 3200, status: "paid", dueDate: "2026-10-05T09:00:00.000Z", paidAt: "2026-10-04T09:00:00.000Z", description: "Ekim", source: "manual" } as Payment,
  ];
  const teacherPayouts = [
    { id: "hp_tp1", teacherId: "t1", periodStart: "2026-09-01", periodEnd: "2026-09-30", totalMinutes: 0, totalAmount: 0, status: "pending", generatedAt: "2026-10-01T00:00:00.000Z", revisionCount: 0 },
    { id: "hp_tp2", teacherId: "t2", periodStart: "2026-09-01", periodEnd: "2026-09-30", totalMinutes: 0, totalAmount: 0, status: "pending", generatedAt: "2026-10-01T00:00:00.000Z", revisionCount: 0 },
  ] as TeacherPayout[];
  const next = { ...data, lessons: [...data.lessons, ...lessons], payments: [...data.payments, ...payments], teacherPayouts: [...data.teacherPayouts, ...teacherPayouts] };
  await writeData(next);
  return run(() => readData());
}

/** Hedef dersler/ödemeler dışındaki her koleksiyon satırı birebir aynı mı. */
function expectOnlyChanged(before: AppData, after: AppData, changed: { lessons?: string[]; payments?: string[]; addedLessons?: number }) {
  // json/memory dar dilimi bütüne birleştirirken satır SIRASI değişebilir (mergeLessonScope) — içerik karşılaştırılır.
  const keep = <T extends { id: string }>(rows: T[], ids: string[] = []) =>
    rows.filter((r) => !ids.includes(r.id)).sort((a, b) => a.id.localeCompare(b.id));
  const beforeLessons = keep(before.lessons, changed.lessons);
  const afterLessons = keep(after.lessons, changed.lessons).filter((l) => before.lessons.some((b) => b.id === l.id));
  expect(afterLessons).toEqual(beforeLessons);
  expect(after.lessons.length).toBe(before.lessons.length + (changed.addedLessons ?? 0));
  expect(keep(after.payments, changed.payments)).toEqual(keep(before.payments, changed.payments));
  // Hedef derse bağlı yoklama satırı (Geldi → present) iş kuralıdır; başka dersin yoklaması değişmemeli.
  const otherAttendances = (d: AppData) => d.attendances.filter((a) => !(changed.lessons ?? []).includes(a.lessonId));
  expect(keep(otherAttendances(after))).toEqual(keep(otherAttendances(before)));
  for (const k of ["students", "teachers", "rooms", "makeupRequests", "lessonSeries", "teacherPayouts"] as const) {
    expect(keep(after[k] as { id: string }[])).toEqual(keep(before[k] as { id: string }[]));
  }
  expect(after.settings).toEqual(before.settings);
}

beforeEach(async () => {
  await fs.rm(path.join(DIR, "store.json"), { force: true });
  await fs.rm(path.join(DIR, "closed-days.json"), { force: true });
  await resetPlatformStoreForTests();
  reg.__resetPresenceForTests();
});

describe("hedefli tek satır okumaları — tam okumayla aynı", () => {
  it("ders / ödeme / öğretmen hakedişleri; boş kimlik hiçbir satır döndürmez", async () => {
    const full = await run(() => seed());
    expect(await run(() => readLessonById("hp_b"))).toEqual(full.lessons.find((l) => l.id === "hp_b"));
    expect(await run(() => readPaymentById("hp_p2"))).toEqual(full.payments.find((p) => p.id === "hp_p2"));
    expect(await run(() => readTeacherPayoutsForTeacher("t1"))).toEqual(full.teacherPayouts.filter((p) => p.teacherId === "t1"));
    expect(await run(() => readLessonById(""))).toBeUndefined();
    expect(await run(() => readPaymentById("yok"))).toBeUndefined();
    expect(await run(() => readTeacherPayoutsForTeacher(""))).toEqual([]);
  });
});

describe("yeni ders doğrulaması — dar dilim tam veriyle aynı kararı verir", () => {
  it("öğretmen/oda/öğrenci çakışması, boş saat, gece yarısı payı", async () => {
    const full = await run(() => seed());
    const cases = [
      { studentId: "s3", teacherId: "t1", roomId: "r1", startAt: "2026-10-14T11:10:00.000Z" }, // öğretmen + oda dolu
      { studentId: "s1", teacherId: "t2", roomId: "r2", startAt: "2026-10-14T13:10:00.000Z" }, // t2/r2 dolu
      { studentId: "s2", teacherId: "t1", roomId: "r1", startAt: "2026-10-14T13:05:00.000Z" }, // öğrenci (hp_d) dolu
      { studentId: "s1", teacherId: "t1", roomId: "r1", startAt: "2026-10-14T15:00:00.000Z" }, // boş
      { studentId: "s1", teacherId: "t1", roomId: "r1", startAt: "2026-10-14T21:30:00.000Z" }, // gün sonu
    ];
    for (const c of cases) {
      const scope = narrowSlotScope(full, c);
      for (const allowAvailabilityOverride of [false, true]) {
        const a = validateLessonSlot(full, { instrument: "Piyano", studentId: c.studentId }, c, { allowAvailabilityOverride });
        const b = validateLessonSlot(scope, { instrument: "Piyano", studentId: c.studentId }, c, { allowAvailabilityOverride });
        expect(b).toEqual(a);
      }
      // Dilimde: öğrencinin tüm dersleri + öğretmen/odanın hedef gün ±1 dersleri; başka gün başka öğrenci yok.
      expect(scope.lessons.some((l) => l.id === "hp_c")).toBe(c.studentId === "s2");
      expect(scope.payments).toEqual([]);
      expect(scope.settings.logoUrl).toBe("");
    }
  });
});

describe("dar dilimle yazım — hedef dışında hiçbir satır değişmez/silinmez", () => {
  it("ders oluştur: kimlikle tek ders eklenir; aynı saate ikinci ders çakışma ile reddedilir", async () => {
    const before = await run(() => seed());
    const res = await run(() =>
      createLessonTool(ctx(), { studentId: "s1", teacherId: "t1", roomId: "r1", instrument: "Piyano", startAt: "2026-10-14T18:00", durationMinutes: 40, overrideAvailability: true, overrideReason: "test" })
    );
    expect(res.ok).toBe(true);
    const after = await run(() => readData());
    const created = after.lessons.find((l) => !before.lessons.some((b) => b.id === l.id));
    expect(res.ok && res.data.lessonId).toBe(created?.id);
    expect(created).toMatchObject({ studentId: "s1", teacherId: "t1", roomId: "r1", status: "scheduled" });
    expectOnlyChanged(before, after, { addedLessons: 1 });
    const again = await run(() =>
      createLessonTool(ctx(), { studentId: "s2", teacherId: "t1", roomId: "r1", instrument: "Piyano", startAt: "2026-10-14T18:00", durationMinutes: 40, overrideAvailability: true, overrideReason: "test" })
    );
    expect(again.ok).toBe(false);
    expect((await run(() => readData())).lessons.length).toBe(after.lessons.length);
  });

  it("ders başlat → bitir, iptal: yalnız hedef ders değişir", async () => {
    const before = await run(() => seed());
    expect((await run(() => startLessonTool(ctx(), { lessonId: "hp_a" }))).ok).toBe(true);
    expect((await run(() => endLessonTool(ctx(), { lessonId: "hp_a" }))).ok).toBe(true);
    expect((await run(() => cancelLessonTool(ctx(), { lessonId: "hp_b" }))).ok).toBe(true);
    const after = await run(() => readData());
    expect(after.lessons.find((l) => l.id === "hp_a")).toMatchObject({ status: "completed" });
    expect(after.lessons.find((l) => l.id === "hp_a")?.actualStartAt).toBeTruthy();
    expect(after.lessons.find((l) => l.id === "hp_b")?.status).toBe("cancelled");
    expectOnlyChanged(before, after, { lessons: ["hp_a", "hp_b"] });
    expect((await run(() => startLessonTool(ctx(), { lessonId: "yok" }))).ok).toBe(false);
  });

  it("yoklama (kayıtlı ödenmemiş hakediş dönemi dışında): tam okuma olmadan işaretlenir, başka satır değişmez", async () => {
    const before = await run(() => seed());
    const res = await run(() => setLessonOpsFlagTool(ctx({ role: "SCHOOL_ADMIN" }), { lessonId: "hp_b", flag: "attended" }));
    expect(res.ok).toBe(true);
    const after = await run(() => readData());
    expect(after.lessons.find((l) => l.id === "hp_b")?.studentAttended).toBe(true);
    // Geldi otomatik ders bazlı tahsilat açabilir (lesson_ops) — yalnız bu derse bağlı satır.
    const newPayments = after.payments.filter((p) => !before.payments.some((b) => b.id === p.id));
    expect(newPayments.every((p) => p.lessonId === "hp_b")).toBe(true);
    expectOnlyChanged({ ...before, payments: before.payments }, { ...after, payments: after.payments.filter((p) => !newPayments.includes(p)) }, { lessons: ["hp_b"] });
  });

  it("tahsilat: yalnız tahsil edilen ödeme satırı değişir", async () => {
    const before = await run(() => seed());
    const res = await run(() => createPaymentTool(ctx(), { paymentId: "hp_p1", method: "cash" }));
    expect(res.ok && res.data.status).toBe("paid");
    const after = await run(() => readData());
    expect(after.payments.find((p) => p.id === "hp_p1")).toMatchObject({ status: "paid", paidAmount: 3200 });
    expectOnlyChanged(before, after, { payments: ["hp_p1"] });
    expect((await run(() => createPaymentTool(ctx(), { paymentId: "yok" }))).ok).toBe(false);
  });
});

describe("UserSession — koşullu, aralıklı yazım; iptal kalıcı", () => {
  async function openSession(minutesAgo: number) {
    const sid = (await reg.startUserSession({ userId: "user_owner_nilufer", tenantId: DEFAULT_TENANT_ID, role: "SUPER_ADMIN" }))!;
    const row = (await getUserSession(sid))!;
    const at = Date.now() - minutesAgo * 60_000;
    await saveUserSession({ ...row, lastSeenAt: new Date(at).toISOString(), expiresAt: new Date(at + 7 * 86_400_000).toISOString() });
    reg.__resetPresenceForTests();
    return sid;
  }

  it("yakın zamanda uzatılmış oturum: refresh geçerli ama satır yazılmaz; 10 dk sonra yazılır", async () => {
    const fresh = await openSession(1);
    const r0 = (await getUserSession(fresh))!;
    expect(await reg.extendUserSession(fresh)).toBe(true);
    expect((await getUserSession(fresh))!.expiresAt).toBe(r0.expiresAt);

    const stale = await openSession(10);
    const r1 = (await getUserSession(stale))!;
    expect(await reg.extendUserSession(stale)).toBe(true);
    const r2 = (await getUserSession(stale))!;
    expect(new Date(r2.expiresAt).getTime()).toBeGreaterThan(new Date(r1.expiresAt).getTime());
    // Eşzamanlı ikinci refresh (başka sekme/instance): geçerli, ikinci yazım yok.
    reg.__resetPresenceForTests();
    expect(await reg.extendUserSession(stale)).toBe(true);
    expect((await getUserSession(stale))!.expiresAt).toBe(r2.expiresAt);
  });

  it("presence: aynı istekte refresh sonrası dokunuş ve başka instance'ın dokunuşu ikinci kez yazmaz", async () => {
    const sid = await openSession(10);
    expect(await reg.extendUserSession(sid)).toBe(true);
    reg.touchSessionPresence(sid, { path: "/panel/program" }); // aynı istek → yazım yok
    await new Promise((r) => setTimeout(r, 30));
    expect((await getUserSession(sid))!.lastPath).toBeNull();
    reg.__resetPresenceForTests(); // başka instance: süreç belleği boş, DB koşulu engeller
    reg.touchSessionPresence(sid, { path: "/panel/odemeler" });
    await new Promise((r) => setTimeout(r, 30));
    expect((await getUserSession(sid))!.lastPath).toBeNull();
    // Satır 5 dk'dan eskiyse presence yazılır.
    expect(await patchOpenUserSession(sid, { lastPath: "/x" }, { lastSeenBefore: new Date(Date.now() + 1) })).toBe(true);
    expect((await getUserSession(sid))!.lastPath).toBe("/x");
  });

  it("iptal edilmiş oturum: refresh false, presence/refresh satırı yeniden açmaz", async () => {
    const sid = await openSession(10);
    await reg.revokeUserSession(sid, "user_hyper_admin", "test");
    reg.touchSessionPresence(sid, { path: "/panel" });
    await new Promise((r) => setTimeout(r, 30));
    expect(await reg.extendUserSession(sid)).toBe(false);
    expect(await patchOpenUserSession(sid, { lastPath: "/y" })).toBe(false);
    expect((await getUserSession(sid))!.revokedAt).not.toBeNull();
    expect(await reg.extendUserSession("sess_yok")).toBe(false);
  });
});

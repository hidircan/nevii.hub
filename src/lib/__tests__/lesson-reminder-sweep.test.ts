/**
 * Per-offset ders hatırlatma sweep'i (`sweepLessonReminders`) — negatif testler.
 *
 * Kapsam (ürün kararı):
 * - SELF: kendi studentId'si. Guardian: TÜM aktif çocukları (server
 *   `listActiveAccessForTenant` + GUARDIAN filtresi; invited/revoked ASLA).
 *   Öğretmen: yalnız 1s/15dk (1g YOK). Seçili-çocuk UI bağlamı push
 *   kapsamını SINIRLAMAZ (sweep'te seçili-çocuk parametresi YOK).
 * - Gönderim-öncesi yeniden doğrulama: iptal/geçmiş ders, düşmüş erişim,
 *   kapalı tercih → gönderim YOK.
 * - Idempotency: olay başına (ders + alıcı + kategori + occurrence) TEK satır.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { DEFAULT_TENANT_ID } from "../auth/config";
import { sweepLessonReminders } from "../lesson-notifications";
import { listNotificationsForUser, NOTIFICATIONS_FILE } from "../notifications";
import { NOTIFICATION_PREFERENCES_FILE, setNotificationPreferences } from "../notification-preferences";
import {
  STUDENT_PORTAL_ACCESS_FILE,
  grantActiveStudentPortalAccess,
  inviteStudentPortalAccess,
  revokeStudentPortalAccess,
} from "../student-portal-access";
import { DEVICE_PUSH_TOKENS_FILE } from "../device-push-tokens";
import { createSeedData } from "../seed";
import { writeData as writeJson } from "../store-json";
import type { Lesson } from "../types";

const T = DEFAULT_TENANT_ID;
const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

const SELF_USER = "rem_self_1";
const GUARDIAN_USER = "rem_guardian_1";
const TEACHER_USER = "user_teacher_t1"; // seed t1 öğretmenin portal kullanıcısı

function lessonAt(startInMin: number, overrides?: Partial<Lesson>): Lesson {
  const seed = createSeedData();
  const now = Date.now();
  const base = seed.lessons[0]!;
  return {
    ...base,
    id: `rem_${Math.random().toString(36).slice(2, 8)}`,
    studentId: "s1",
    teacherId: "t1",
    branchId: "erzene",
    instrument: "Piyano",
    startAt: new Date(now + startInMin * 60000).toISOString(),
    endAt: new Date(now + (startInMin + 45) * 60000).toISOString(),
    status: "scheduled",
    ...overrides,
  };
}

async function seedWith(lessons: Lesson[]) {
  const seed = createSeedData();
  // Seed dersleri sabit tarihli — reminder pencerelerine düşmemeleri için
  // yalnız bu testin dersleri yazılır.
  await writeJson({ ...seed, lessons });
}

async function grant(userId: string, studentId: string, accessType: "SELF" | "GUARDIAN") {
  await grantActiveStudentPortalAccess({ tenantId: T, userId, studentId, accessType, invitedBy: "test" });
}

async function kindsFor(userId: string) {
  const notes = await listNotificationsForUser({ tenantId: T, userId });
  return notes.map((n) => n.kind);
}

async function cleanState() {
  await fs.rm(DATA_FILE, { force: true });
  await fs.rm(NOTIFICATIONS_FILE, { force: true });
  await fs.rm(NOTIFICATION_PREFERENCES_FILE, { force: true });
  await fs.rm(STUDENT_PORTAL_ACCESS_FILE, { force: true });
  await fs.rm(DEVICE_PUSH_TOKENS_FILE, { force: true });
}

beforeEach(cleanState);
// Paylaşılan json store'da kalıntı BIRAKMA (dosya-sıralı suite'te
// sonraki dosyaları kirletmemek için) — eksik store okumada tohumlanır.
afterEach(cleanState);

describe("sweepLessonReminders — kapsam ve idempotency", () => {
  it("1s penceresindeki ders SELF + guardian'a in-app üretir; ikinci sweep duplicate (çift satır YOK)", async () => {
    await grant(SELF_USER, "s1", "SELF");
    await grant(GUARDIAN_USER, "s1", "GUARDIAN");
    await seedWith([lessonAt(60)]);
    const first = await sweepLessonReminders(new Date());
    expect(first.created).toBeGreaterThanOrEqual(2);
    const second = await sweepLessonReminders(new Date());
    expect(second.created).toBe(0);
    expect(second.duplicate).toBeGreaterThan(0);
    expect(await kindsFor(SELF_USER)).toContain("lesson_reminder_1h");
    expect(await kindsFor(GUARDIAN_USER)).toContain("lesson_reminder_1h");
    expect(await kindsFor(TEACHER_USER)).toContain("lesson_reminder_1h");
  });

  it("iptal edilmiş ders hatırlatma üretmez", async () => {
    await grant(SELF_USER, "s1", "SELF");
    await grant(GUARDIAN_USER, "s1", "GUARDIAN");
    await seedWith([lessonAt(60, { status: "cancelled" })]);
    const summary = await sweepLessonReminders(new Date());
    expect(summary.created).toBe(0);
    expect(await kindsFor(SELF_USER)).not.toContain("lesson_reminder_1h");
    expect(await kindsFor(GUARDIAN_USER)).not.toContain("lesson_reminder_1h");
    expect(await kindsFor(TEACHER_USER)).not.toContain("lesson_reminder_1h");
  });

  it("öğretmen 1g hatırlatması ALMAZ; SELF/guardian alır", async () => {
    await grant(SELF_USER, "s1", "SELF");
    await grant(GUARDIAN_USER, "s1", "GUARDIAN");
    await seedWith([lessonAt(24 * 60)]);
    const summary = await sweepLessonReminders(new Date());
    expect(summary.created).toBeGreaterThanOrEqual(2);
    expect(await kindsFor(TEACHER_USER)).not.toContain("lesson_reminder_1d");
    expect(await kindsFor(SELF_USER)).toContain("lesson_reminder_1d");
    expect(await kindsFor(GUARDIAN_USER)).toContain("lesson_reminder_1d");
  });

  it("tercihi kapalı kullanıcıya yazılmaz", async () => {
    await grant(SELF_USER, "s1", "SELF");
    await grant(GUARDIAN_USER, "s1", "GUARDIAN");
    await setNotificationPreferences(T, GUARDIAN_USER, [{ category: "lesson_reminder_1h", inAppEnabled: false }]);
    await seedWith([lessonAt(60)]);
    await sweepLessonReminders(new Date());
    expect(await kindsFor(GUARDIAN_USER)).not.toContain("lesson_reminder_1h");
    expect(await kindsFor(SELF_USER)).toContain("lesson_reminder_1h");
  });

  it("revoked guardian'a gönderim YOK; invited erişim active gibi davranmaz", async () => {
    await grant(SELF_USER, "s1", "SELF");
    await grant(GUARDIAN_USER, "s1", "GUARDIAN");
    await revokeStudentPortalAccess(T, GUARDIAN_USER, "s1");
    await inviteStudentPortalAccess({
      tenantId: T,
      userId: "rem_invited",
      studentId: "s1",
      accessType: "GUARDIAN",
      invitedBy: "test",
    });
    await seedWith([lessonAt(60)]);
    await sweepLessonReminders(new Date());
    expect(await kindsFor(GUARDIAN_USER)).not.toContain("lesson_reminder_1h");
    expect(await kindsFor("rem_invited")).not.toContain("lesson_reminder_1h");
    expect(await kindsFor(SELF_USER)).toContain("lesson_reminder_1h");
  });

  it("guardian TÜM aktif çocukları için alır (seçili-çocuk bağlamı kapsamı sınırlamaz)", async () => {
    await grant(GUARDIAN_USER, "s1", "GUARDIAN");
    await grant(GUARDIAN_USER, "s2", "GUARDIAN");
    const seed = createSeedData();
    const now = Date.now();
    const mk = (id: string, studentId: string): Lesson => ({
      ...seed.lessons[0]!,
      id,
      studentId,
      teacherId: "t1",
      branchId: "erzene",
      instrument: "Piyano",
      startAt: new Date(now + 60 * 60000).toISOString(),
      endAt: new Date(now + 105 * 60000).toISOString(),
      status: "scheduled",
    });
    await seedWith([mk("rem_multi_1", "s1"), mk("rem_multi_2", "s2")]);
    await sweepLessonReminders(new Date());
    const notes = await listNotificationsForUser({ tenantId: T, userId: GUARDIAN_USER });
    const hits = notes.filter((n) => n.kind === "lesson_reminder_1h");
    expect(hits.length).toBe(2);
  });
});

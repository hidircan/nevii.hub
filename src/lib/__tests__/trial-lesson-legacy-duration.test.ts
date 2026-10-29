/**
 * 11. tur iş #1 — kaybolan deneme revizyonu (süre dede kuralı).
 *
 * Kök neden: 9070140 (2026-09-01) oluşturmayı 10/15/20 dk ile sınırladı;
 * 6e27662 (7. tur) düzenleme formunu getirdi ama form her kayıtta mevcut
 * süreyi aynen geri gönderir ve güncelleme şeması 10/15/20 dışı her değeri
 * reddeder. Sonuç: 30/45/60 dk'lık tarihsel denemelerin HİÇBİR alanı
 * (not dahil) kaydedilemiyordu — revize işlevi fiilen kaybolmuştu.
 *
 * Kural: mevcut süre aynen korunursa kabul edilir (tarihçe değişmez);
 * 10/15/20 zorunluluğu YALNIZCA süre gerçekten değiştirilirken uygulanır.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import {
  createTrialLessonTool,
  updateTrialLessonTool,
  listTrialLessonsTool,
} from "../services/tools";
import { updateTrialLesson, TRIAL_LESSONS_FILE } from "../trial-lessons";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

vi.mock("../audit/log", () => ({ recordAuditLog: vi.fn().mockResolvedValue(undefined) }));

function adminCtx(overrides?: Partial<ServiceContext>): ServiceContext {
  return { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web", ...overrides };
}

function openStartAt(daysAhead: number): string {
  const d = new Date("2026-10-06T12:00:00.000Z");
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString();
}

const baseInput = {
  name: "Aday Öğrenci",
  phone: "05551234567",
  instrument: "Piyano",
  branchId: "erzene",
  teacherId: "t1",
  notes: "",
  allowAvailabilityOverride: true,
};

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
  await fs.rm(TRIAL_LESSONS_FILE, { force: true });
  vi.clearAllMocks();
});

/** 2026-09-01 öncesi normal değeri simüle et: 30 dk. */
async function seedLegacy30Min(): Promise<string> {
  const created = await createTrialLessonTool(adminCtx(), {
    ...baseInput,
    startAt: openStartAt(0),
    durationMinutes: 20,
  });
  expect(created.ok).toBe(true);
  if (!created.ok) throw new Error("kurulum başarısız");
  await updateTrialLesson(DEFAULT_TENANT_ID, created.data.trialId, { durationMinutes: 30 });
  return created.data.trialId;
}

describe("trial revise — süre dede kuralı", () => {
  it("eski süreli denemede not değişikliği kaydedilir, süre korunur", async () => {
    const id = await seedLegacy30Min();
    // Düzenleme formu mevcut süreyi aynen geri gönderir:
    const upd = await updateTrialLessonTool(adminCtx(), {
      trialId: id,
      notes: "hazırlık notu eklendi",
      durationMinutes: 30,
    });
    expect(upd.ok).toBe(true);
    if (!upd.ok) return;
    const listed = await listTrialLessonsTool(adminCtx());
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    const row = listed.data.trials.find((t) => t.id === id);
    expect(row?.notes).toBe("hazırlık notu eklendi");
    expect(row?.durationMinutes).toBe(30);
  });

  it("eski süre 20 dakikaya ÇEKİLEBİLİR (değişiklik + kurala uygun)", async () => {
    const id = await seedLegacy30Min();
    const upd = await updateTrialLessonTool(adminCtx(), {
      trialId: id,
      durationMinutes: 20,
    });
    expect(upd.ok).toBe(true);
    if (!upd.ok) return;
    const listed = await listTrialLessonsTool(adminCtx());
    if (!listed.ok) return;
    const row = listed.data.trials.find((t) => t.id === id);
    expect(row?.durationMinutes).toBe(20);
    // Bitiş yeni süreye göre yeniden hesaplanır.
    expect(row?.endAt).toBe(new Date(new Date(row!.startAt).getTime() + 20 * 60000).toISOString());
  });

  it("süre kural-dışı bir değere DEĞİŞTİRİLEMEZ (20→30 reddedilir)", async () => {
    const created = await createTrialLessonTool(adminCtx(), {
      ...baseInput,
      startAt: openStartAt(1),
      durationMinutes: 20,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const upd = await updateTrialLessonTool(adminCtx(), {
      trialId: created.data.trialId,
      durationMinutes: 30,
    });
    expect(upd.ok).toBe(false);
    if (upd.ok) return;
    expect(upd.error.code).toBe("VALIDATION_ERROR");
    expect(upd.error.message).toContain("10, 15 veya 20");
  });

  it("öğretmen başkasının denemesini revize edemez; başka tenant NOT_FOUND", async () => {
    const id = await seedLegacy30Min();
    const teacherCtx: ServiceContext = {
      role: "TEACHER", userId: "u9", tenantId: DEFAULT_TENANT_ID, teacherId: "t9", channel: "web",
    };
    const forbidden = await updateTrialLessonTool(teacherCtx, { trialId: id, notes: "x" });
    expect(forbidden.ok).toBe(false);
    const otherTenant = await updateTrialLessonTool(adminCtx({ tenantId: "tenant-b" }), {
      trialId: id,
      notes: "x",
    });
    expect(otherTenant.ok).toBe(false);
    if (!otherTenant.ok) expect(otherTenant.error.code).toBe("NOT_FOUND");
  });
});

describe("trial revise — UI kalıcılık kilidi", () => {
  it("düzenleme formu eski süreyi '(mevcut kayıt)' seçeneğiyle korur", async () => {
    const { readFileSync } = await import("fs");
    const src = readFileSync("src/components/trial-lessons-table.tsx", "utf-8");
    // Form mevcut değeri seçeneklere eklemezse select boş kalır, kayıt reddedilir.
    expect(src).toContain("mevcut kayıt");
    expect(src).toContain("durationOptions");
  });
});

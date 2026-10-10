/**
 * Performans ağırlıkları — kurum sahibi ayarı, 0 = pasif, toplam 100.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { DEFAULT_TENANT_ID } from "../auth/config";
import { readData } from "../store";
import { updatePerformanceWeightsTool } from "../services/tools";
import type { ServiceContext } from "../services/context";
import {
  DEFAULT_PERFORMANCE_WEIGHTS,
  resolvePerformanceWeights,
  validateWeightMap,
  weightedScore,
} from "../performance-weights";
import { computeStaffPerformanceScore, type StaffPerformanceMetrics } from "../staff-performance";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

function ctx(over: Partial<ServiceContext> = {}): ServiceContext {
  return { role: "SUPER_ADMIN", userId: "owner", tenantId: DEFAULT_TENANT_ID, channel: "web", ...over };
}

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
});

describe("performance weights", () => {
  it("varsayılanlar 100'e tamamlanır ve yeni kayıt metriği düşük ağırlıklıdır", () => {
    for (const audience of ["teacher", "staff"] as const) {
      const sum = Object.values(DEFAULT_PERFORMANCE_WEIGHTS[audience]).reduce((s, n) => s + n, 0);
      expect(sum).toBe(100);
    }
    expect(DEFAULT_PERFORMANCE_WEIGHTS.teacher.enrollmentFromSchedule).toBeLessThanOrEqual(10);
  });

  it("toplam 100 değilse Türkçe açıklamayla reddeder", () => {
    const res = validateWeightMap("staff", { tasks: 50, onTime: 10 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toMatch(/toplamı 100/);
  });

  it("geçersiz kayıt varsayılana düşer", () => {
    expect(resolvePerformanceWeights({ teacher: { attendance: 5 }, staff: {} })).toEqual(DEFAULT_PERFORMANCE_WEIGHTS);
  });

  it("0 ağırlıklı metrik puana girmez", () => {
    const { score, contributions } = weightedScore([
      { key: "a", normalized: 100, weightPercent: 100 },
      { key: "b", normalized: 0, weightPercent: 0 },
    ]);
    expect(score).toBe(100);
    expect(contributions.b).toBeNull();
  });

  it("personel puanı ağırlıkları uygular", () => {
    const metrics = {
      taskCompletionRate: 1,
      onTimeRate: 0,
      paymentsCollectedCount: 0,
      lessonsPlanned: 0,
      newStudentRegistrations: { attributable: false, count: 3, label: "" },
    } as unknown as StaffPerformanceMetrics;
    expect(computeStaffPerformanceScore(metrics, { tasks: 100, onTime: 0, collections: 0, newStudents: 0, lessonsPlanned: 0 })).toBe(100);
    expect(computeStaffPerformanceScore(metrics, { tasks: 50, onTime: 50, collections: 0, newStudents: 0, lessonsPlanned: 0 })).toBe(50);
  });
});

describe("updatePerformanceWeightsTool", () => {
  const valid = {
    teacher: { attendance: 40, feedback: 30, tasks: 30, homework: 0, enrollmentFromSchedule: 0 },
    staff: { tasks: 60, onTime: 20, collections: 10, newStudents: 5, lessonsPlanned: 5 },
  };

  it("kurum sahibi olmayan rol değiştiremez", async () => {
    const res = await updatePerformanceWeightsTool(ctx({ role: "SCHOOL_ADMIN" }), valid);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("FORBIDDEN");
  });

  it("kurum sahibi kaydeder, 0 pasif kalır ve kalıcıdır", async () => {
    const res = await updatePerformanceWeightsTool(ctx(), valid);
    expect(res.ok).toBe(true);
    const data = await readData();
    expect(data.settings.performanceWeights?.teacher.homework).toBe(0);
    expect(resolvePerformanceWeights(data.settings.performanceWeights).staff.tasks).toBe(60);
  });

  it("toplamı bozuk yamayı reddeder", async () => {
    const res = await updatePerformanceWeightsTool(ctx(), { ...valid, staff: { tasks: 10 } });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toMatch(/Personel metrikleri/);
  });
});

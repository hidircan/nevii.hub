import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { updateMakeupWindowDaysTool, updateMonthlyMakeupAllowanceTool } from "../services/tools";
import { readData } from "../store";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";

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

describe("Telafi Merkezi politika penceresi (makeupWindowDays) — Paket 5", () => {
  it("geçerli bir gün değeriyle günceller", async () => {
    const res = await updateMakeupWindowDaysTool(ctx(), { makeupWindowDays: 45 });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.makeupWindowDays).toBe(45);

    const data = await readData();
    expect(data.settings.makeupWindowDays).toBe(45);
  });

  it("1-365 dışındaki değerleri reddeder", async () => {
    const tooLow = await updateMakeupWindowDaysTool(ctx(), { makeupWindowDays: 0 });
    expect(tooLow.ok).toBe(false);
    const tooHigh = await updateMakeupWindowDaysTool(ctx(), { makeupWindowDays: 400 });
    expect(tooHigh.ok).toBe(false);
  });

  it("yalnız SCHOOL_ADMIN/SUPER_ADMIN değiştirebilir (RBAC)", async () => {
    const res = await updateMakeupWindowDaysTool(ctx({ role: "TEACHER" }), { makeupWindowDays: 30 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("FORBIDDEN");
  });
});

describe("Aylık telafi hakkı (monthlyMakeupAllowance)", () => {
  it("geçerli değeri kaydeder", async () => {
    const res = await updateMonthlyMakeupAllowanceTool(ctx(), { monthlyMakeupAllowance: 4 });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.monthlyMakeupAllowance).toBe(4);
    const data = await readData();
    expect(data.settings.monthlyMakeupAllowance).toBe(4);
  });

  it("0-31 dışını reddeder", async () => {
    expect((await updateMonthlyMakeupAllowanceTool(ctx(), { monthlyMakeupAllowance: -1 })).ok).toBe(false);
    expect((await updateMonthlyMakeupAllowanceTool(ctx(), { monthlyMakeupAllowance: 32 })).ok).toBe(false);
  });

  it("öğretmen güncelleyemez", async () => {
    const res = await updateMonthlyMakeupAllowanceTool(ctx({ role: "TEACHER" }), {
      monthlyMakeupAllowance: 3,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("FORBIDDEN");
  });
});

describe("2026-10-20 — pencere artırımı açık talebin son gününü de uzatır (hak ↔ planlama tek kural)", () => {
  it("eski pencereyle reddedilen tarih, pencere artırılınca planlanabilir; iptal edilmiş talep uzamaz; asla kısalmaz", async () => {
    const { writeData } = await import("../store-json");
    const { makeupPlanningDeadline, expiresAtForPolicyWindow } = await import("../makeup-deadline");
    const now = Date.now();
    const day = 86_400_000;
    const createdAt = new Date(now - 20 * day).toISOString();
    const oldExpires = new Date(now + 10 * day).toISOString(); // 30 günlük eski pencere
    const base = await readData();
    const [a, b] = base.makeupRequests;
    expect(a && b).toBeTruthy();
    await writeData({
      ...base,
      // Son gün kaynak dersten hesaplanır (makeupExpiresAtFromSource): kaynak ders 20 gün önce.
      lessons: base.lessons.map((l) => (l.id === a!.sourceLessonId ? { ...l, startAt: createdAt } : l)),
      makeupRequests: base.makeupRequests.map((m) =>
        m.id === a!.id
          ? { ...m, status: "pending", createdAt, expiresAt: oldExpires, confirmedLessonId: undefined }
          : m.id === b!.id
            ? { ...m, status: "cancelled", createdAt, expiresAt: oldExpires }
            : m
      ),
    });
    const slotEnd = now + 25 * day;
    expect(slotEnd > makeupPlanningDeadline(oldExpires).getTime()).toBe(true); // AFTER_EXPIRY

    expect((await updateMakeupWindowDaysTool(ctx(), { makeupWindowDays: 60 })).ok).toBe(true);
    const after = await readData();
    const open = after.makeupRequests.find((m) => m.id === a!.id)!;
    const cancelled = after.makeupRequests.find((m) => m.id === b!.id)!;
    expect(open.status).toBe("pending");
    expect(slotEnd < makeupPlanningDeadline(open.expiresAt).getTime()).toBe(true); // artık planlanabilir
    expect(cancelled.expiresAt).toBe(oldExpires); // hakkı olmayan iki yerde de yok

    // Kısaltma mevcut son günü (ör. yöneticinin elle uzattığı) geri almaz.
    expect(expiresAtForPolicyWindow(open, 5)).toBe(open.expiresAt);
  });
});

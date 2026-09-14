import { describe, expect, it } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { guardianMakeupA11yLabel, toGuardianMakeupItems } from "../makeup-view";
import type { MakeupRequest } from "../../../types/api";

const APP_PARENT_DIR = path.join(__dirname, "../../../../app/(parent)");
const MAKEUP_SCREEN = path.join(__dirname, "../makeup-screen.tsx");

function item(overrides: Partial<MakeupRequest> = {}): MakeupRequest {
  return {
    id: "m1",
    studentId: "s1",
    teacherId: "t1",
    sourceLessonId: "l1",
    status: "pending",
    reason: "Hasta",
    expiresAt: "2026-10-01T00:00:00.000Z",
    createdAt: "2026-09-01T10:00:00.000Z",
    suggestedSlots: [],
    ...overrides,
  };
}

describe("toGuardianMakeupItems", () => {
  it("null/undefined yanıtta boş dizi döner (fake kayıt yok)", () => {
    expect(toGuardianMakeupItems(null)).toEqual([]);
    expect(toGuardianMakeupItems(undefined)).toEqual([]);
  });

  it("açık kayıtları önce, sonra en yeniyi sıralar", () => {
    const list = [
      item({ id: "old-open", status: "pending", createdAt: "2026-08-01T10:00:00.000Z" }),
      item({ id: "closed", status: "completed", createdAt: "2026-09-10T10:00:00.000Z" }),
      item({ id: "new-open", status: "confirmed", createdAt: "2026-09-05T10:00:00.000Z" }),
    ];
    expect(toGuardianMakeupItems(list).map((m) => m.id)).toEqual(["new-open", "old-open", "closed"]);
  });

  it("kayıt uydurmaz, düşürmez (uzunluk korunur)", () => {
    const list = [item({ id: "a" }), item({ id: "b" })];
    expect(toGuardianMakeupItems(list)).toHaveLength(2);
  });
});

describe("guardianMakeupA11yLabel", () => {
  it("statü ve bağlamı Türkçe özetler", () => {
    const label = guardianMakeupA11yLabel(item({ studentName: "Ali", instrument: "Piyano" }), "Bekliyor");
    expect(label).toContain("Ali");
    expect(label).toContain("Bekliyor");
  });
});

describe("guardian makeup route/ekran kilitleri", () => {
  it("telafiler route'u ParentMakeupScreen render eder", async () => {
    const content = await fs.readFile(path.join(APP_PARENT_DIR, "telafiler.tsx"), "utf-8");
    expect(content).toContain("ParentMakeupScreen");
    expect(content).toContain("features/parent/makeup-screen");
  });

  it("ekran canonical useMakeupRequests hook'unu kullanır", async () => {
    const content = await fs.readFile(MAKEUP_SCREEN, "utf-8");
    expect(content).toContain("useMakeupRequests");
    expect(content).toContain("api/hooks");
  });

  it("istemcide kapsam parametresi üretilmez (ID tahmini yok)", async () => {
    const content = await fs.readFile(MAKEUP_SCREEN, "utf-8");
    expect(content).not.toMatch(/studentId=|teacherId=|tenantId=|branchId=/);
    expect(content).not.toMatch(/\/api\/v1\/makeup\?/);
  });

  it("mutation/teacher CTA yoktur (read-only)", async () => {
    const content = await fs.readFile(MAKEUP_SCREEN, "utf-8");
    expect(content).not.toMatch(/\bapiPost\b|\bapiDelete\b|\bapiPatch\b/);
    expect(content).not.toMatch(/<Button[^>]*label="[^"]*(Onayla|İptal|Oluştur|Planla|Düzenle)/);
  });

  it("empty state canonical metni kullanır", async () => {
    const content = await fs.readFile(MAKEUP_SCREEN, "utf-8");
    expect(content).toContain("Gösterilecek telafi dersi bulunmuyor.");
  });

  it("fake kayıt/statü üretilmez", async () => {
    const content = await fs.readFile(MAKEUP_SCREEN, "utf-8");
    expect(content).not.toMatch(/fake|mock|placeholder|örnek veri|sample/i);
  });
});

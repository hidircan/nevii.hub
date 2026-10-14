import { describe, expect, it } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { guardianMakeupA11yLabel, toGuardianMakeupItems } from "../makeup-view";
import type { MakeupRequest } from "../../../types/api";

const APP_PARENT_DIR = path.join(__dirname, "../../../../app/(parent)");
const SHARED_SCREEN = path.join(__dirname, "../../student-scope/makeup-screen.tsx");

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
  it("telafiler stack'i paylaşılan listeyi render eder", async () => {
    const content = await fs.readFile(path.join(APP_PARENT_DIR, "telafiler", "index.tsx"), "utf-8");
    expect(content).toContain("StudentScopeMakeupListScreen");
    const detail = await fs.readFile(path.join(APP_PARENT_DIR, "telafiler", "[makeupId].tsx"), "utf-8");
    expect(detail).toContain("StudentScopeMakeupDetailScreen");
  });

  it("liste seçili öğrenci ledger'ından beslenir", async () => {
    const content = await fs.readFile(SHARED_SCREEN, "utf-8");
    expect(content).toContain("useSelectedStudentId");
    expect(content).toContain("makeup-ledger");
  });

  it("istemcide kapsam parametresi üretilmez (ID tahmini yok)", async () => {
    const content = await fs.readFile(SHARED_SCREEN, "utf-8");
    expect(content).not.toMatch(/studentId=|teacherId=|tenantId=|branchId=/);
    expect(content).not.toMatch(/\/api\/v1\/makeup\?/);
  });

  it("mutation/teacher CTA yoktur (read-only)", async () => {
    const content = await fs.readFile(SHARED_SCREEN, "utf-8");
    expect(content).not.toMatch(/\bapiPost\b|\bapiDelete\b|\bapiPatch\b/);
    expect(content).not.toMatch(/<Button[^>]*label="[^"]*(Onayla|İptal|Oluştur|Planla|Düzenle)/);
  });

  it("fake kayıt/statü üretilmez", async () => {
    const content = await fs.readFile(SHARED_SCREEN, "utf-8");
    expect(content).not.toMatch(/fake|mock|placeholder|örnek veri|sample/i);
  });
});

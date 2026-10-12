import { describe, expect, it } from "vitest";
import { isOpenMakeup, makeupLedgerA11yLabel, toMakeupLedgerItems } from "../makeup-view";
import type { MakeupLedgerItem } from "../../../types/api";

function item(overrides: Partial<MakeupLedgerItem> = {}): MakeupLedgerItem {
  return {
    id: "m1",
    studentId: "s1",
    status: "pending",
    reason: "",
    policyNote: "",
    decisionNote: null,
    decidedAt: null,
    expiresAt: "2026-10-01T00:00:00.000Z",
    createdAt: "2026-09-01T10:00:00.000Z",
    sourceLesson: null,
    confirmedLesson: null,
    attendanceId: "a1",
    instrument: "Piyano",
    ...overrides,
  };
}

describe("toMakeupLedgerItems", () => {
  it("null/undefined yanıtta boş dizi döner", () => {
    expect(toMakeupLedgerItems(null)).toEqual([]);
    expect(toMakeupLedgerItems(undefined)).toEqual([]);
  });

  it("açık kayıtları önce, sonra en yeniyi sıralar", () => {
    const list = [
      item({ id: "old-open", status: "pending", createdAt: "2026-08-01T10:00:00.000Z" }),
      item({ id: "closed", status: "completed", createdAt: "2026-09-10T10:00:00.000Z" }),
      item({ id: "new-open", status: "confirmed", createdAt: "2026-09-05T10:00:00.000Z" }),
    ];
    expect(toMakeupLedgerItems(list).map((m) => m.id)).toEqual(["new-open", "old-open", "closed"]);
  });

  it("isOpenMakeup kapalı statüleri eler", () => {
    expect(isOpenMakeup("pending")).toBe(true);
    expect(isOpenMakeup("confirmed")).toBe(true);
    expect(isOpenMakeup("completed")).toBe(false);
    expect(isOpenMakeup("expired")).toBe(false);
    expect(isOpenMakeup("cancelled")).toBe(false);
  });
});

describe("makeupLedgerA11yLabel", () => {
  it("statü ve bağlamı Türkçe özetler", () => {
    const label = makeupLedgerA11yLabel(item({ teacherName: "Ayşe", instrument: "Piyano" }), "Bekliyor");
    expect(label).toContain("Ayşe");
    expect(label).toContain("Bekliyor");
  });
});

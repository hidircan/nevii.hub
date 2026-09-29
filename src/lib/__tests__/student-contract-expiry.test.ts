/**
 * 2026-09-30 — öğrenci sözleşmesi bitiş bildirimi: aday seçimi, tekilleştirme, bitiş tarihi değişimi.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { NOTIFICATIONS_FILE, listAllNotifications } from "../notifications";
import { DEFAULT_TENANT_ID } from "../auth/config";
import { runWithTenantAsync } from "../tenant-context";
import { readData } from "../store";

const summaries = new Map<string, { contractId: string; status: string; enrollmentEndDate: string }>();
vi.mock("../contracts", async (orig) => ({
  ...(await orig<typeof import("../contracts")>()),
  listContractSummariesByStudent: async () => summaries,
}));

import { findExpiringStudentContracts, runStudentContractExpiryCheck } from "../student-contract-expiry";

const DIR = resolveDataDir(path.join(process.cwd(), "data"));
beforeEach(async () => {
  summaries.clear();
  await fs.rm(NOTIFICATIONS_FILE, { force: true });
  await fs.rm(path.join(DIR, "store.json"), { force: true });
});

const TODAY = "2026-10-01";
const s = (id: string, active = true) => ({ id, name: `Öğrenci ${id}`, active });

describe("findExpiringStudentContracts", () => {
  it("yalnız 0..N gün kalan güncel sözleşme; sözleşmesiz/bitişsiz/taslak/iptal/pasif güvenle atlanır", () => {
    const m = new Map([
      ["a", { contractId: "c-a", status: "signed", enrollmentEndDate: "2026-10-16" }], // 15 gün
      ["b", { contractId: "c-b", status: "signed", enrollmentEndDate: "2026-10-17" }], // 16 gün
      ["c", { contractId: "c-c", status: "signed", enrollmentEndDate: "2026-09-30" }], // geçmiş
      ["d", { contractId: "c-d", status: "cancelled", enrollmentEndDate: "2026-10-05" }],
      ["e", { contractId: "c-e", status: "draft", enrollmentEndDate: "2026-10-05" }],
      ["f", { contractId: "c-f", status: "recorded", enrollmentEndDate: "" }],
      ["g", { contractId: "c-g", status: "generated", enrollmentEndDate: "2026-10-01" }], // bugün
      ["h", { contractId: "c-h", status: "signed", enrollmentEndDate: "2026-10-03" }],
    ]);
    const out = findExpiringStudentContracts([s("a"), s("b"), s("c"), s("d"), s("e"), s("f"), s("g"), s("h", false), s("x")], m, TODAY, 15);
    expect(out.map((c) => [c.studentId, c.daysLeft])).toEqual([
      ["a", 15],
      ["g", 0],
    ]);
  });
});

describe("runStudentContractExpiryCheck — tekilleştirme ve tarih değişikliği", () => {
  it("aynı sözleşme/bitiş için bir kez; bitiş değişince yeni tarih için yeniden; yöneticilere, uygulama içi", async () => {
    await runWithTenantAsync(DEFAULT_TENANT_ID, async () => {
      const student = (await readData()).students.find((x) => x.active !== false)!;
      const now = new Date("2026-10-01T09:00:00Z");
      summaries.set(student.id, { contractId: "c1", status: "signed", enrollmentEndDate: "2026-10-10" });

      const first = await runStudentContractExpiryCheck(DEFAULT_TENANT_ID, now);
      expect(first.candidates).toBe(1);
      expect(first.created).toBeGreaterThan(0);

      const again = await runStudentContractExpiryCheck(DEFAULT_TENANT_ID, new Date("2026-10-02T09:00:00Z"));
      expect(again.created).toBe(0);
      expect(again.duplicates).toBe(first.created);

      // Bitiş tarihi değişti → 12 Ekim, hâlâ 15 gün içinde → yeni tarih için bildirim.
      summaries.set(student.id, { contractId: "c1", status: "signed", enrollmentEndDate: "2026-10-12" });
      const moved = await runStudentContractExpiryCheck(DEFAULT_TENANT_ID, new Date("2026-10-02T09:00:00Z"));
      expect(moved.created).toBe(first.created);

      // Uzatma pencere dışına taşıdı → aday yok.
      summaries.set(student.id, { contractId: "c2", status: "signed", enrollmentEndDate: "2027-06-30" });
      expect((await runStudentContractExpiryCheck(DEFAULT_TENANT_ID, now)).candidates).toBe(0);

      const rows = (await listAllNotifications(DEFAULT_TENANT_ID)).filter((n) => n.kind === "student_contract_expiring");
      expect(rows.length).toBe(first.created * 2);
      expect(rows.every((n) => n.targetUserId && !n.targetStudentId)).toBe(true);
      expect(rows[0].body).toContain(`/panel/ogrenciler/${student.id}`);
    });
  });
});

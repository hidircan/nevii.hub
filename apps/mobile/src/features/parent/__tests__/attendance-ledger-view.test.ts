import { describe, expect, it } from "vitest";
import { toAttendanceViewFromLedger } from "../attendance-summary";
import type { AttendanceLedgerResponse } from "../../../types/api";

function ledger(counts: Partial<AttendanceLedgerResponse["counts"]>, total: number): AttendanceLedgerResponse {
  return {
    studentId: "s1",
    total,
    limit: 1,
    offset: 0,
    counts: {
      attended: 0,
      processed: 0,
      makeup: 0,
      absent: 0,
      excused: 0,
      cancelled: 0,
      in_progress: 0,
      pending: 0,
      upcoming: 0,
      ...counts,
    },
    items: [],
  };
}

describe("toAttendanceViewFromLedger", () => {
  it("Katıldı = Geldi + İşlendi", () => {
    const view = toAttendanceViewFromLedger(ledger({ attended: 5, processed: 3 }, 10));
    expect(view?.attended).toBe(8);
    expect(view?.rate).toBe(80);
    expect(view?.hasRecords).toBe(true);
  });

  it("Bekleyen = sonuçlanmamış + planlanan", () => {
    const view = toAttendanceViewFromLedger(ledger({ pending: 2, upcoming: 4 }, 6));
    expect(view?.pending).toBe(6);
  });

  it("boş ledger güvenli görünüm üretir", () => {
    const view = toAttendanceViewFromLedger(ledger({}, 0));
    expect(view?.hasRecords).toBe(false);
    expect(view?.rate).toBe(0);
  });

  it("null yanıtta kart üretilmez", () => {
    expect(toAttendanceViewFromLedger(null)).toBeNull();
    expect(toAttendanceViewFromLedger(undefined)).toBeNull();
  });
});

import { describe, it, expect } from "vitest";
import { toPaymentStatusRows, toStudentRef, type PaymentStatusRow } from "../reference-data";
import { summarizeStudentDebt } from "../payment-profile";
import { REFERENCE_STUDENT_OMIT, type Student } from "../types";

/** DB egress (2026-10-18) — öğrenci listesi ödeme özeti ham satırlarla aynı borç sonucunu verir; referans öğrenci tek-öğrenci kolonlarını taşımaz. */
describe("öğrenci listesi dilimi", () => {
  const row = (status: PaymentStatusRow["status"], amount: number, paidAmount: number, contractId?: string): PaymentStatusRow => ({ studentId: "s1", status, amount, paidAmount, contractId });
  const raw = [
    row("pending", 1000, 0, "c1"), row("pending", 1000, 0, "c1"), row("partial", 1000, 400, "c1"), row("overdue", 500, 0, "c2"),
    row("pending", 800, 900, "c1"), row("voided", 700, 0, "c1"), row("paid", 1000, 1000, "c1"), row("paid", 1000, 1000, "c2"),
  ];

  it("özet, her sözleşme durumu için ham satırlarla aynı borcu verir ve idempotenttir", () => {
    const rows = toPaymentStatusRows(raw);
    expect(rows).toHaveLength(4);
    expect(toPaymentStatusRows(rows)).toEqual(rows);
    for (const terminal of [new Set<string>(), new Set(["c1"]), new Set(["c1", "c2"])]) {
      const a = summarizeStudentDebt(raw, terminal);
      const b = summarizeStudentDebt(rows, terminal);
      expect({ ...b, openCount: b.openCount > 0 }).toEqual({ ...a, openCount: a.openCount > 0 });
    }
  });

  it("referans öğrenci tek-öğrenci kolonlarını taşımaz", () => {
    const s = { id: "s1", name: "A", notes: "not", address: "adres", nationalIdCipher: "x", phone: "1" } as unknown as Student;
    const ref = toStudentRef(s);
    expect(ref).toEqual({ id: "s1", name: "A", phone: "1" });
    for (const k of REFERENCE_STUDENT_OMIT) expect(k in ref).toBe(false);
  });
});

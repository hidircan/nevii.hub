import { describe, it, expect } from "vitest";
import {
  PLAN_PAYMENT_METHOD_UNDETERMINED,
  buildContractPlanViewRows,
  findTeacherDisplayNameForUser,
  humanizeEmailLocalPart,
  isCollectedPayment,
  resolveCollectorDisplayName,
  resolvePlanRowPaymentMethodLabel,
  resolveStatementMonthPaymentMethodLabel,
} from "../contract-payment-plan-view";
import type { ContractInstallmentSnapshot, Payment } from "../types";

function payment(overrides: Partial<Payment> & { id: string }): Payment {
  return {
    studentId: "stu-1",
    amount: 5950,
    paidAmount: 0,
    status: "pending",
    dueDate: "2026-09-01T00:00:00.000Z",
    description: "test",
    ...overrides,
  };
}

function installment(sequence: number): ContractInstallmentSnapshot {
  return { sequence, dueDate: `2026-0${sequence}-01T00:00:00.000Z`, amount: 5950 };
}

describe("resolvePlanRowPaymentMethodLabel — yalnız gerçek tahsilatın yöntemi", () => {
  it("paid kaydın yöntem etiketini gösterir", () => {
    expect(resolvePlanRowPaymentMethodLabel(payment({ id: "p1", status: "paid", method: "cash" }))).toBe("Nakit");
    expect(resolvePlanRowPaymentMethodLabel(payment({ id: "p2", status: "paid", method: "credit_card" }))).toBe(
      "Kredi Kartı"
    );
    expect(resolvePlanRowPaymentMethodLabel(payment({ id: "p3", status: "paid", method: "transfer" }))).toBe(
      "Havale / EFT"
    );
  });

  it("partial kaydın yöntemini gösterir", () => {
    expect(
      resolvePlanRowPaymentMethodLabel(payment({ id: "p4", status: "partial", paidAmount: 2000, method: "transfer" }))
    ).toBe("Havale / EFT");
  });

  it("bekleyen (pending/overdue) satırda PLANLANAN yöntem bile olsa '—' gösterir (uydurma yok)", () => {
    // Bekleyen taksit satırları sözleşme yöntemini taşır (plan) — bu,
    // tahsilat DEĞİLDİR, gösterilmez.
    expect(resolvePlanRowPaymentMethodLabel(payment({ id: "p5", status: "pending", method: "cash" }))).toBe(
      PLAN_PAYMENT_METHOD_UNDETERMINED
    );
    expect(resolvePlanRowPaymentMethodLabel(payment({ id: "p6", status: "overdue", method: "credit_card" }))).toBe(
      PLAN_PAYMENT_METHOD_UNDETERMINED
    );
  });

  it("kayıt yoksa '—' gösterir", () => {
    expect(resolvePlanRowPaymentMethodLabel(undefined)).toBe("—");
    expect(resolvePlanRowPaymentMethodLabel(null)).toBe("—");
  });
});

describe("buildContractPlanViewRows — sözleşme + döküm tek kaynak", () => {
  it("1. satırda gerçek ilk tahsilatın yöntemi, ödenmemiş satırlarda '—'", () => {
    const rows = buildContractPlanViewRows({
      installments: [installment(1), installment(2), installment(3)],
      payments: [
        payment({ id: "first", status: "paid", paidAmount: 5950, paidAt: "2026-09-05T10:00:00.000Z", method: "cash", contractId: "c1", installmentSequence: 1 }),
        payment({ id: "p2", status: "pending", method: "cash", contractId: "c1", installmentSequence: 2 }),
        payment({ id: "p3", status: "pending", method: "cash", contractId: "c1", installmentSequence: 3 }),
      ],
      contractId: "c1",
    });
    expect(rows.map((r) => r.paymentMethodLabel)).toEqual(["Nakit", "—", "—"]);
  });

  it("sonradan ödenen taksitin yöntemi görünür olur", () => {
    const rows = buildContractPlanViewRows({
      installments: [installment(1), installment(2)],
      payments: [
        payment({ id: "first", status: "paid", method: "cash", contractId: "c1", installmentSequence: 1 }),
        payment({ id: "p2", status: "paid", paidAmount: 5950, paidAt: "2026-10-03T10:00:00.000Z", method: "transfer", contractId: "c1", installmentSequence: 2 }),
      ],
      contractId: "c1",
    });
    expect(rows.map((r) => r.paymentMethodLabel)).toEqual(["Nakit", "Havale / EFT"]);
  });

  it("başka sözleşmenin kaydı karışmaz", () => {
    const rows = buildContractPlanViewRows({
      installments: [installment(1)],
      payments: [payment({ id: "x", status: "paid", method: "credit_card", contractId: "other", installmentSequence: 1 })],
      contractId: "c1",
    });
    expect(rows[0]!.paymentMethodLabel).toBe("—");
  });
});

describe("resolveStatementMonthPaymentMethodLabel — döküm ay satırı", () => {
  it("ayın tahsil edilmiş kaydının yöntemini gösterir", () => {
    const payments = [
      payment({ id: "m1", status: "paid", paidAmount: 5950, paidAt: "2026-09-05T10:00:00.000Z", method: "transfer" }),
    ];
    expect(resolveStatementMonthPaymentMethodLabel({ paymentIds: ["m1"], payments })).toBe("Havale / EFT");
  });

  it("tahsilat yoksa '—'", () => {
    const payments = [payment({ id: "m1", status: "pending", method: "cash" })];
    expect(resolveStatementMonthPaymentMethodLabel({ paymentIds: ["m1"], payments })).toBe("—");
    expect(resolveStatementMonthPaymentMethodLabel({ paymentIds: undefined, payments })).toBe("—");
  });
});

describe("isCollectedPayment", () => {
  it("paid/partial her zaman tahsilat sayılır", () => {
    expect(isCollectedPayment(payment({ id: "a", status: "paid" }))).toBe(true);
    expect(isCollectedPayment(payment({ id: "b", status: "partial" }))).toBe(true);
  });

  it("pending/overdue tahsilat sayılmaz", () => {
    expect(isCollectedPayment(payment({ id: "c", status: "pending" }))).toBe(false);
    expect(isCollectedPayment(payment({ id: "d", status: "overdue" }))).toBe(false);
  });
});

describe("tahsil eden görünen adı — e-posta gösterilmez", () => {
  const teachers = [{ id: "t1", name: "Ezgi Güçlü", email: "ezgi.guclu@niluferacar.com.tr" }];

  it("öğretmen adı bulunur (teacherId bağı)", () => {
    expect(findTeacherDisplayNameForUser(teachers, { teacherId: "t1", email: "baska@x.com" })).toBe("Ezgi Güçlü");
  });

  it("öğretmen adı bulunur (e-posta eşleşmesi)", () => {
    expect(findTeacherDisplayNameForUser(teachers, { email: "Ezgi.Guclu@niluferacar.com.tr" })).toBe("Ezgi Güçlü");
  });

  it("ad bulunamazsa undefined", () => {
    expect(findTeacherDisplayNameForUser(teachers, { email: "bilinmeyen@x.com" })).toBeUndefined();
    expect(findTeacherDisplayNameForUser(teachers, null)).toBeUndefined();
  });

  it("öğretmen adı önceliklidir", () => {
    expect(resolveCollectorDisplayName({ teacherName: "Ezgi Güçlü", email: "ezgi.guclu@niluferacar.com.tr", active: true })).toBe(
      "Ezgi Güçlü"
    );
  });

  it("pasif kullanıcıda iz korunur", () => {
    expect(resolveCollectorDisplayName({ email: "x@y.z", active: false })).toBe("Pasif/silinmiş kullanıcı");
  });

  it("aktif ama adsız kullanıcıda e-posta aynen yazılmaz", () => {
    const label = resolveCollectorDisplayName({ email: "ezgi.guclu@niluferacar.com.tr", active: true });
    expect(label).not.toContain("@");
    expect(label.length).toBeGreaterThan(0);
  });
});

describe("humanizeEmailLocalPart", () => {
  it("yerel parçayı ad-soyad tahminine çevirir", () => {
    expect(humanizeEmailLocalPart("ezgi.guclu@niluferacar.com.tr")).toBe("Ezgi Guclu");
    expect(humanizeEmailLocalPart("nihal-kaya@x.com")).toBe("Nihal Kaya");
  });

  it("boş/sayısal girdide undefined", () => {
    expect(humanizeEmailLocalPart(undefined)).toBeUndefined();
    expect(humanizeEmailLocalPart("12345@x.com")).toBeUndefined();
  });
});

describe("işlemi yapan — personel kaydındaki ad soyad (e-postadan türetilmez)", () => {
  it("portal hesabı personele bağlı değilse e-posta eşleşmesiyle personel adı yazılır", async () => {
    const { promises: fs } = await import("fs");
    const { STAFF_FILE, createStaffMember } = await import("../staff");
    const { DEFAULT_TENANT_ID } = await import("../auth/config");
    const { resolveActorLabels } = await import("../contract-payment-plan-view");
    await fs.rm(STAFF_FILE, { force: true });
    try {
      // Bootstrap kullanıcı `user_manager_ezgi` = ezgi.guclu@…; e-postadan tahmin "Ezgi Guclu" (ü/ç kaybolur) olurdu.
      const created = await createStaffMember({
        tenantId: DEFAULT_TENANT_ID,
        createdBy: "test",
        name: "Ezgi Güçlü Kaya",
        position: "Kurum Müdürü",
        email: "EZGI.GUCLU@niluferacar.com.tr",
      } as Parameters<typeof createStaffMember>[0]);
      expect(created.ok).toBe(true);
      const names = await resolveActorLabels({ tenantId: DEFAULT_TENANT_ID, userIds: ["user_manager_ezgi"], teachers: [] });
      expect(names.get("user_manager_ezgi")).toBe("Ezgi Güçlü Kaya");
    } finally {
      await fs.rm(STAFF_FILE, { force: true });
    }
  });
});

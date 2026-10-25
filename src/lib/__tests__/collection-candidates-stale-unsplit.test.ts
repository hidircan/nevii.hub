/**
 * 2026-10-24 — tahsilat adayları ve "Ödenmiş taksit sayısı" (Ediz A. H. vakası, sentetik veri).
 *
 * Kök neden: kayıt ilk tahsilatı sonradan tek aya düzeltilmiş ama "takip eden ayı da ekle" işareti açık kalmıştı.
 * Sözleşme Ekim'i ayrı taksitle borçlandırdığı hâlde işaret Ekim'e 0 TL'lik bir "unsplit" pay ekliyordu:
 * Ekim'de iki aday → tahsilat engeli; sayaç Ekim'i ödenmiş sayıyordu (1 yerine 2).
 */
import { describe, it, expect } from "vitest";
import {
  resolveContractPlanForMonth,
  paidInstallmentCount,
  installmentMonthShares,
  contractInstallmentProgressDescription,
  type CalendarPlanContract,
  type CalendarPlanInstallment,
} from "../attendance-calendar-plan";
import { paidInstallmentCountsByStudent } from "../payment-profile";
import { buildPaymentMonthView } from "../payment-month-view";

const ctr = (id: string, status: CalendarPlanContract["status"], start = "2026-09-01"): CalendarPlanContract => ({
  id,
  contractNumber: `NO-${id}`,
  status,
  enrollmentStartDate: start,
  enrollmentEndDate: "2027-06-30",
});

const row = (over: Partial<CalendarPlanInstallment> & { id: string }): CalendarPlanInstallment => ({
  contractId: "v1",
  installmentSequence: 2,
  amount: 7950,
  paidAmount: 0,
  dueDate: "2026-10-15T00:00:00.000Z",
  status: "pending",
  source: "contract",
  ...over,
});

/** Ödenmiş ilk tahsilat: tek ay etiketi + açık kalmış "takip eden ay" işareti. */
const staleFirst = (contractId = "v1") =>
  row({
    id: "first",
    contractId,
    installmentSequence: 1,
    paidAmount: 7950,
    status: "paid",
    dueDate: "2026-08-31T00:00:00.000Z",
    source: "registration_first_payment",
    installmentPeriodLabel: "19–30 Eylül 2026",
    firstCollectionIncludesNextMonth: true,
  });

const v1Ekim = row({ id: "v1-ekim", installmentPeriodLabel: "Ekim 2026" });
const v3Rows = [
  row({ id: "v3-eylul", contractId: "v3", installmentSequence: 1, amount: 3975, dueDate: "2026-09-15T00:00:00.000Z", installmentPeriodLabel: "Eylül 2026" }),
  row({ id: "v3-ekim", contractId: "v3", installmentSequence: 2, installmentPeriodLabel: "Ekim 2026" }),
];
const plan = (contracts: CalendarPlanContract[], installments: CalendarPlanInstallment[], month = 10) =>
  resolveContractPlanForMonth({ contracts, installments, year: 2026, month });

describe("tahsilat adayı", () => {
  it("revize edilmiş iki sözleşme + bir geçerli sözleşme → Ekim'de tek aday (engel yok)", () => {
    const p = plan(
      [ctr("v1", "superseded", "2026-09-19"), ctr("v2", "superseded", "2026-09-19"), ctr("v3", "generated")],
      [staleFirst(), v1Ekim, row({ id: "v2-ekim", contractId: "v2", amount: 3975 }), ...v3Rows]
    );
    expect(p.state).toBe("ok");
    if (p.state !== "ok") return;
    expect(p.paymentIds).toEqual(["v3-ekim"]);
    expect(p.openPaymentIds).toEqual(["v3-ekim"]);
  });

  it("kök neden: aynı sözleşmenin Ekim taksiti varken ilk tahsilatın bayat 'takip eden ay' payı aday olmaz", () => {
    const p = plan([ctr("v1", "signed", "2026-09-19")], [staleFirst(), v1Ekim]);
    expect(p.state).toBe("ok");
    if (p.state !== "ok") return;
    expect(p.paymentIds).toEqual(["v1-ekim"]);
    expect(p.openPaymentIds).toEqual(["v1-ekim"]);
    expect(p.remaining).toBe(7950);
  });

  it("işaret geçerliyse (sözleşmede o ayın kendi taksiti YOK) ay ilk tahsilatla karşılanmış kalır", () => {
    const p = plan([ctr("v1", "signed")], [staleFirst(), row({ id: "kasim", installmentSequence: 2, installmentPeriodLabel: "Kasım 2026" })]);
    expect(p.state).toBe("ok");
    if (p.state !== "ok") return;
    expect(p.paymentIds).toEqual(["first"]);
    expect(p.openPaymentIds).toEqual([]);
    expect(p.remaining).toBe(0);
  });

  it("gerçekten iki açık taksit → ikisi de aday kalır (seçim zorunluluğu korunur)", () => {
    const p = plan([ctr("v1", "signed")], [v1Ekim, row({ id: "ekim-ek", installmentSequence: 3, amount: 1000, installmentPeriodLabel: "Ekim 2026" })]);
    expect(p.state).toBe("ok");
    if (p.state !== "ok") return;
    expect(p.openPaymentIds).toEqual(["v1-ekim", "ekim-ek"]);
  });

  it("tamamen ödenmiş ve iptal (voided) taksit aday olmaz; tutarlar korunur", () => {
    const p = plan(
      [ctr("v1", "signed")],
      [
        v1Ekim,
        row({ id: "ekim-odendi", installmentSequence: 3, amount: 1000, paidAmount: 1000, status: "paid", installmentPeriodLabel: "Ekim 2026" }),
        row({ id: "ekim-void", installmentSequence: 4, amount: 500, status: "voided", installmentPeriodLabel: "Ekim 2026" }),
      ]
    );
    expect(p.state).toBe("ok");
    if (p.state !== "ok") return;
    expect(p.paymentIds).toEqual(["v1-ekim", "ekim-odendi"]);
    expect(p.openPaymentIds).toEqual(["v1-ekim"]);
    expect(p.amount).toBe(8950);
    expect(p.paidAmount).toBe(1000);
  });

  it("iptal edilmiş sözleşmeden kalan ÖDENMİŞ tahsilat kaybolmaz: geçmiş ve tahsilat toplamında kalır", () => {
    const view = buildPaymentMonthView(
      [staleFirst(), v1Ekim, ...v3Rows].map((p) => ({ ...p, studentId: "s1" })) as never,
      { month: "2026-09", todayYmd: "2026-10-24", terminalContractIds: new Set(["v1"]), studentName: () => "Öğrenci" }
    );
    expect(view.rows.find((r) => r.id === "first")?.collected).toBe(7950);
    expect(view.summary.collected).toBe(7950);
  });
});

describe("Ödenmiş taksit sayısı (öğrencinin tüm geçmişi, benzersiz kapanmış dönem)", () => {
  it("Ediz vakası: bayat 'takip eden ay' Ekim'i ödenmiş saymaz → 1 (eskiden 2)", () => {
    expect(paidInstallmentCount([staleFirst(), v1Ekim, ...v3Rows])).toBe(1);
  });

  it("işaret geçerliyse birleşik ilk tahsilat iki dönem sayılır", () => {
    expect(paidInstallmentCount([staleFirst()])).toBe(2);
  });

  it("iki kısmi tahsilat tek taksidi kapatır → 1; kısmi kalan taksit 0", () => {
    // Satırda kısmi tahsilatlar toplanır (paidAmount); işlem sayısı değil, kapanan dönem sayılır.
    expect(paidInstallmentCount([row({ id: "a", paidAmount: 4000 + 3950, status: "paid" })])).toBe(1);
    expect(paidInstallmentCount([row({ id: "b", paidAmount: 4000, status: "partial" })])).toBe(0);
  });

  it("tek tahsilat iki döneme dağıtılmışsa (kırılım) iki dönem sayılır", () => {
    const combined = row({
      id: "c",
      installmentSequence: 1,
      amount: 11925,
      paidAmount: 11925,
      status: "paid",
      installmentBreakdown: [
        { periodLabel: "19–30 Eylül 2026", amount: 3975 },
        { periodLabel: "Ekim 2026", amount: 7950 },
      ],
    });
    expect(paidInstallmentCount([combined])).toBe(2);
  });

  it("iade/ters kayıt sonrası (tahsilat geri alındı) ve iptal satırı sayılmaz", () => {
    expect(paidInstallmentCount([row({ id: "geri", paidAmount: 0, status: "pending" })])).toBe(0);
    expect(paidInstallmentCount([row({ id: "void", paidAmount: 7950, status: "voided" })])).toBe(0);
  });

  it("başka öğrencinin satırları karışmaz", () => {
    const counts = paidInstallmentCountsByStudent([
      { ...staleFirst(), studentId: "s1" },
      { ...v1Ekim, studentId: "s1" },
      { ...row({ id: "x", contractId: "other", paidAmount: 7950, status: "paid" }), studentId: "s2" },
    ]);
    expect(counts).toEqual({ s1: 1, s2: 1 });
  });
});

describe("2026-10-24 — ilk tahsilatın dönem dağılımı (Seres K. vakası, sentetik veri)", () => {
  // Sözleşme planı birleşik ilk tahsilatta kırılıma OTOMATİK bileşenleri yazar (kıst Ekim 1.737 + Kasım 6.950);
  // satır tutarı elle girilen 10.425'tir.
  const combined = (over: Partial<CalendarPlanInstallment> = {}) =>
    row({
      id: "seres-ilk",
      installmentSequence: 1,
      amount: 10425,
      paidAmount: 10425,
      status: "paid",
      dueDate: "2026-10-23T00:00:00.000Z",
      source: "registration_first_payment",
      installmentKind: "first_collection_combined",
      installmentPeriodLabel: "23–31 Ekim 2026 + Kasım 2026",
      installmentBreakdown: [
        { periodLabel: "23–31 Ekim 2026", amount: 1737 },
        { periodLabel: "Kasım 2026", amount: 6950 },
      ],
      firstCollectionIncludesNextMonth: true,
      ...over,
    });
  const shares = (p: CalendarPlanInstallment) => installmentMonthShares(p).map((s) => [s.month, s.amount, s.paidAmount]);

  it("elle girilen ilk ay tutarı yeniden kıst yapılmaz: Ekim 3.475 + Kasım 6.950 (eskiden 1.737 / 8.688)", () => {
    expect(shares(combined())).toEqual([["2026-10", 3475, 3475], ["2026-11", 6950, 6950]]);
    // Aynı veri tekrar okununca dağılım değişmez.
    expect(shares(combined())).toEqual(shares(combined()));
  });

  it("elle tutar girilmemişse otomatik kıst kuralı aynen kalır", () => {
    expect(shares(combined({ amount: 8687, paidAmount: 8687 }))).toEqual([["2026-10", 1737, 1737], ["2026-11", 6950, 6950]]);
  });

  it("kısmi tahsilat taksit borcunu değiştirmez; tahsilat en eski döneme mahsup edilir", () => {
    expect(shares(combined({ paidAmount: 5000, status: "partial" }))).toEqual([["2026-10", 3475, 3475], ["2026-11", 6950, 1525]]);
  });

  it("takvim: gerçek iki aylık tahsilatın Kasım payı korunur; sayaç 2", () => {
    const aralik = row({ id: "aralik", installmentSequence: 3, amount: 6950, installmentPeriodLabel: "Aralık 2026", dueDate: "2026-12-05T00:00:00.000Z" });
    const p = plan([ctr("v1", "generated", "2026-10-23")], [combined(), aralik], 11);
    expect(p.state).toBe("ok");
    if (p.state !== "ok") return;
    expect([p.paymentIds, p.amount, p.paidAmount, p.remaining]).toEqual([["seres-ilk"], 6950, 6950, 0]);
    expect(paidInstallmentCount([combined(), aralik])).toBe(2);
  });

  it("Ediz/Seres ayrımı: sözleşmenin TEK dönem saydığı satırda açık kalmış işaret ay eklemez; birleşik satırda Kasım kalır", () => {
    const ediz = { ...staleFirst(), installmentKind: "first_collection" as const };
    expect(installmentMonthShares(ediz).map((s) => s.month)).toEqual(["2026-09"]);
    expect(paidInstallmentCount([ediz])).toBe(1);
    expect(installmentMonthShares(combined()).map((s) => s.month)).toEqual(["2026-10", "2026-11"]);
  });

  it("taksit etiketi: Ediz satırı '1/10' (eskiden 2/10); birleşik iki dönem kapattığı için '2/3'", () => {
    const ediz = { ...staleFirst(), installmentKind: "first_collection" as const, description: "Sözleşme taksiti 1/10 — Kayıt anında tahsil edildi" };
    expect(contractInstallmentProgressDescription(ediz)).toBe("Sözleşme taksiti 1/10 — Kayıt anında tahsil edildi");
    expect(contractInstallmentProgressDescription(combined({ description: "Sözleşme taksiti 1/3 — Kayıt anında tahsil edildi" }))).toBe(
      "Sözleşme taksiti 2/3 — Kayıt anında tahsil edildi"
    );
  });
});

describe("2026-10-25 — revizyonda mahsupla kapanan ay önceki sürüm tahsilatını gösterir", () => {
  it("v3'te Eylül satırı yok/iptal; v1 Eylül tahsilatı gösterilir, kalan 0; yenileme zincirinde gösterilmez", () => {
    const chain = [
      { ...ctr("v1", "superseded", "2026-09-19"), contractType: "initial" },
      { ...ctr("v3", "generated"), contractType: "amendment", previousContractId: "v1" },
    ];
    const v1Paid = { ...staleFirst(), installmentKind: "first_collection" as const, paidAt: "2026-09-01T00:00:00.000Z", method: "transfer" };
    const v3Sept = { ...v3Rows[0]!, status: "voided" };
    const p = plan(chain, [v1Paid, v1Ekim, v3Sept, v3Rows[1]!], 9);
    expect(p.state).toBe("no_installment_for_month");
    if (p.state !== "no_installment_for_month") return;
    expect(p.coveredByPriorVersion?.paidAmount).toBe(7950);
    expect(p.coveredByPriorVersion?.collections.map((c) => c.paymentId)).toEqual(["first"]);
    // Ekim kendi taksitinden okunur (aktarım yok).
    const ekim = plan(chain, [v1Paid, v1Ekim, v3Sept, v3Rows[1]!], 10);
    expect(ekim.state === "ok" && [ekim.paymentIds, ekim.remaining]).toEqual([["v3-ekim"], 7950]);
    const renewal = chain.map((c) => (c.id === "v3" ? { ...c, contractType: "renewal" } : c));
    const r = plan(renewal, [v1Paid, v3Sept], 9);
    expect(r.state === "no_installment_for_month" && r.coveredByPriorVersion).toBeFalsy();
  });
});

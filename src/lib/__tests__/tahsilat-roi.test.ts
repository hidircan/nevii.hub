import { describe, it, beforeEach } from "vitest";
import { expect } from "vitest";
import { promises as fs } from "fs";
import {
  listFollowUpCases,
  upsertFollowUpCase,
  getCollectionRoi,
  mergeCollectionRoi,
  markPaymentCasesPaid,
  clearFollowUpCases,
  FOLLOW_UP_CASES_FILE,
} from "../tahsilat/cases";
import { createSeedData } from "../seed";

beforeEach(async () => {
  await fs.rm(FOLLOW_UP_CASES_FILE, { force: true });
});

describe("tahsilat vaka takibi", () => {
  it("vaka oluşturur, durum ilerletir ve ödeme ile kapatır", async () => {
    const c = await upsertFollowUpCase({
      tenantId: "demo-tenant",
      paymentId: "p1",
      studentId: "s1",
      status: "draft",
      messageDraft: "hatırlatma",
      attributedAmount: 0,
    });
    expect((await listFollowUpCases("demo-tenant")).length).toBe(1);

    await upsertFollowUpCase({
      id: c.id,
      tenantId: "demo-tenant",
      paymentId: "p1",
      studentId: "s1",
      status: "sent",
      messageDraft: "hatırlatma",
      attributedAmount: 0,
    });
    await markPaymentCasesPaid({
      tenantId: "demo-tenant",
      paymentId: "p1",
      amount: 3000,
    });

    const roi = await getCollectionRoi("demo-tenant");
    expect(roi.resolvedThisMonth).toBe(1);
    expect(roi.attributedThisMonth).toBe(3000);
    expect(roi.activeCases).toBe(0);
  });

  it("tenant izolasyonu: başka tenant vakaları görmez", async () => {
    await upsertFollowUpCase({
      tenantId: "a",
      paymentId: "p1",
      studentId: "s1",
      status: "draft",
      messageDraft: "",
      attributedAmount: 0,
    });
    expect((await listFollowUpCases("b")).length).toBe(0);
  });

  it("markPaymentCasesPaid kapalı vakaları yeniden açmaz", async () => {
    await upsertFollowUpCase({
      tenantId: "demo-tenant",
      paymentId: "p1",
      studentId: "s1",
      status: "sent",
      messageDraft: "hatırlatma",
      attributedAmount: 0,
    });
    await markPaymentCasesPaid({
      tenantId: "demo-tenant",
      paymentId: "p1",
      amount: 3000,
    });
    const closed = await markPaymentCasesPaid({
      tenantId: "demo-tenant",
      paymentId: "p1",
      amount: 3000,
    });
    expect(closed.length).toBe(0);
    expect((await getCollectionRoi("demo-tenant")).resolvedThisMonth).toBe(1);
  });

  it("aynı ödeme için id'siz ikinci çağrı yeni vaka açmaz (çift takip koruması)", async () => {
    const first = await upsertFollowUpCase({
      tenantId: "demo-tenant",
      paymentId: "p1",
      studentId: "s1",
      status: "approved",
      messageDraft: "ilk taslak",
      attributedAmount: 0,
    });
    const second = await upsertFollowUpCase({
      tenantId: "demo-tenant",
      paymentId: "p1",
      studentId: "s1",
      status: "approved",
      messageDraft: "duzenlenmis taslak",
      attributedAmount: 0,
    });

    expect(second.id).toBe(first.id);
    const casesForPayment = (await listFollowUpCases("demo-tenant")).filter(
      (c) => c.paymentId === "p1"
    );
    expect(casesForPayment).toHaveLength(1);
    expect(casesForPayment[0].messageDraft).toBe("duzenlenmis taslak");
  });

  it("clearFollowUpCases demo sıfırlama sonrası tenant vakalarını temizler", async () => {
    await upsertFollowUpCase({
      tenantId: "demo-tenant",
      paymentId: "p1",
      studentId: "s1",
      status: "draft",
      messageDraft: "",
      attributedAmount: 0,
    });
    await upsertFollowUpCase({
      tenantId: "other-tenant",
      paymentId: "p1",
      studentId: "s1",
      status: "draft",
      messageDraft: "",
      attributedAmount: 0,
    });

    await clearFollowUpCases("demo-tenant");

    expect(await listFollowUpCases("demo-tenant")).toHaveLength(0);
    expect(await listFollowUpCases("other-tenant")).toHaveLength(1);
  });

  it("'lost' (sonuçsuz) durumuna geçen vaka activeCases'ten düşer ama resolvedThisMonth'a girmez", async () => {
    const c = await upsertFollowUpCase({
      tenantId: "demo-tenant",
      paymentId: "p1",
      studentId: "s1",
      status: "sent",
      messageDraft: "hatırlatma",
      attributedAmount: 0,
    });
    await upsertFollowUpCase({
      id: c.id,
      tenantId: "demo-tenant",
      paymentId: "p1",
      studentId: "s1",
      status: "lost",
      messageDraft: "hatırlatma",
      attributedAmount: 0,
    });

    const roi = await getCollectionRoi("demo-tenant");
    expect(roi.activeCases).toBe(0);
    expect(roi.resolvedThisMonth).toBe(0);
    expect(roi.attributedThisMonth).toBe(0);
  });

  it("'lost' durumuna geçen vaka için resolvedAt set edilmezse ROI'de bu ay sayılmaz", async () => {
    // upsertFollowUpCase'e resolvedAt vermeden doğrudan çağrı (API route'un
    // normalde otomatik doldurduğu alan) — ROI hesaplaması yalnızca
    // resolvedAt bu ay içindeyse sayar, eksik veri sessizce yanlış sayılmaz.
    await upsertFollowUpCase({
      tenantId: "demo-tenant",
      paymentId: "p1",
      studentId: "s1",
      status: "lost",
      messageDraft: "",
      attributedAmount: 0,
    });
    const roi = await getCollectionRoi("demo-tenant");
    expect(roi.lostThisMonth).toBe(0);
    expect(roi.closedThisMonth).toBe(0);
  });
});

describe("getCollectionRoi — genişletilmiş metrikler (lostThisMonth/closedThisMonth/successRate)", () => {
  it("hiç kapanan vaka yoksa successRate null döner (0/0 belirsizliği)", async () => {
    const roi = await getCollectionRoi("demo-tenant");
    expect(roi.closedThisMonth).toBe(0);
    expect(roi.successRate).toBeNull();
  });

  it("bir kazanılan bir kaybedilen vaka: closedThisMonth=2, successRate=0.5", async () => {
    const now = new Date().toISOString();
    await upsertFollowUpCase({
      tenantId: "demo-tenant",
      paymentId: "p1",
      studentId: "s1",
      status: "paid",
      messageDraft: "",
      attributedAmount: 3000,
      resolvedAt: now,
    });
    await upsertFollowUpCase({
      tenantId: "demo-tenant",
      paymentId: "p2",
      studentId: "s2",
      status: "lost",
      messageDraft: "",
      attributedAmount: 0,
      resolvedAt: now,
    });

    const roi = await getCollectionRoi("demo-tenant");
    expect(roi.resolvedThisMonth).toBe(1);
    expect(roi.lostThisMonth).toBe(1);
    expect(roi.closedThisMonth).toBe(2);
    expect(roi.successRate).toBe(0.5);
  });

  it("yalnızca kazanılan vakalar varsa successRate 1 olur", async () => {
    const now = new Date().toISOString();
    await upsertFollowUpCase({
      tenantId: "demo-tenant",
      paymentId: "p1",
      studentId: "s1",
      status: "paid",
      messageDraft: "",
      attributedAmount: 1000,
      resolvedAt: now,
    });
    const roi = await getCollectionRoi("demo-tenant");
    expect(roi.successRate).toBe(1);
  });

  it("geçen ay kapanan vakalar bu ayın closedThisMonth'una girmez", async () => {
    const lastMonth = new Date();
    lastMonth.setDate(0); // setMonth(-1) ayın 31'inde aynı aya taşar
    await upsertFollowUpCase({
      tenantId: "demo-tenant",
      paymentId: "p1",
      studentId: "s1",
      status: "lost",
      messageDraft: "",
      attributedAmount: 0,
      resolvedAt: lastMonth.toISOString(),
    });
    const roi = await getCollectionRoi("demo-tenant");
    expect(roi.closedThisMonth).toBe(0);
    expect(roi.lostThisMonth).toBe(0);
  });
});

describe("tahsilat vaka takibi · Lara & Ali demo senaryoları", () => {
  it("Lara: gecikmiş ödeme -> takip başlat -> onayla -> gönderildi -> ödendi -> ROI'ye yansır", async () => {
    const seed = createSeedData();
    const laraPayment = seed.payments.find((p) => p.status === "overdue");
    expect(laraPayment).toBeDefined();
    const laraStudent = seed.students.find((s) => s.id === laraPayment!.studentId);
    expect(laraStudent?.name).toBe("Lara Yıldız");

    const tenantId = "demo-tenant";
    const remaining = Math.max(laraPayment!.amount - laraPayment!.paidAmount, 0);

    // Takip başlat — id'siz ilk çağrı yeni vaka açar.
    const started = await upsertFollowUpCase({
      tenantId,
      paymentId: laraPayment!.id,
      studentId: laraStudent!.id,
      status: "approved",
      messageDraft: `Merhaba, ${laraStudent!.name} için gecikmiş ödeme hatırlatması.`,
      attributedAmount: 0,
    });

    // Sistemde gönderildi olarak kaydet.
    await upsertFollowUpCase({
      id: started.id,
      tenantId,
      paymentId: laraPayment!.id,
      studentId: laraStudent!.id,
      status: "sent",
      messageDraft: `Merhaba, ${laraStudent!.name} için gecikmiş ödeme hatırlatması.`,
      attributedAmount: 0,
    });

    // Veli ödeme yaptı — admin "Ödendi işaretle" der (payments/pay route'unun yaptığı gibi).
    const closed = await markPaymentCasesPaid({
      tenantId,
      paymentId: laraPayment!.id,
      amount: remaining,
    });
    expect(closed).toHaveLength(1);
    expect(closed[0].status).toBe("paid");

    const roi = await getCollectionRoi(tenantId);
    expect(roi.resolvedThisMonth).toBeGreaterThanOrEqual(1);
    expect(roi.attributedThisMonth).toBeGreaterThanOrEqual(remaining);
    expect(roi.activeCases).toBe(0);
  });

  it("Ali: kısmi ödeme -> kalan tutar doğru, ödeme tamamen kapanmadan vaka açık kalır", async () => {
    const seed = createSeedData();
    const aliPayment = seed.payments.find((p) => p.status === "partial");
    expect(aliPayment).toBeDefined();
    const aliStudent = seed.students.find((s) => s.id === aliPayment!.studentId);
    expect(aliStudent).toBeDefined();

    const remaining = Math.max(aliPayment!.amount - aliPayment!.paidAmount, 0);
    expect(remaining).toBe(aliPayment!.amount - aliPayment!.paidAmount);
    expect(remaining).toBeGreaterThan(0);

    const tenantId = "demo-tenant";
    const started = await upsertFollowUpCase({
      tenantId,
      paymentId: aliPayment!.id,
      studentId: aliStudent!.id,
      status: "approved",
      messageDraft: `Merhaba, ${aliStudent!.name} için kalan ${remaining} TL bakiye hatırlatması.`,
      attributedAmount: 0,
    });
    await upsertFollowUpCase({
      id: started.id,
      tenantId,
      paymentId: aliPayment!.id,
      studentId: aliStudent!.id,
      status: "sent",
      messageDraft: `Merhaba, ${aliStudent!.name} için kalan ${remaining} TL bakiye hatırlatması.`,
      attributedAmount: 0,
    });

    // Ödeme henüz tamamen kapanmadı (kısmi ödeme durumu sürüyor) — "Ödendi işaretle" çağrılmadı.
    const cases = await listFollowUpCases(tenantId);
    const aliCase = cases.find((c) => c.paymentId === aliPayment!.id);
    expect(aliCase?.status).toBe("sent");
    expect(aliCase?.status).not.toBe("paid");

    const roi = await getCollectionRoi(tenantId);
    expect(roi.activeCases).toBeGreaterThanOrEqual(1);
  });
});

describe("EPIC 1 — getCollectionRoi genişletilmiş metrikler (sentThisMonth/respondedThisMonth)", () => {
  it("sentAt bu ay içindeyse sentThisMonth'a girer", async () => {
    const now = new Date().toISOString();
    await upsertFollowUpCase({
      tenantId: "demo-tenant",
      paymentId: "p1",
      studentId: "s1",
      status: "sent",
      messageDraft: "",
      attributedAmount: 0,
      sentAt: now,
    });
    const roi = await getCollectionRoi("demo-tenant");
    expect(roi.sentThisMonth).toBe(1);
  });

  it("geçen ay gönderilen vaka bu ayın sentThisMonth'una girmez", async () => {
    const lastMonth = new Date();
    lastMonth.setDate(0); // setMonth(-1) ayın 31'inde aynı aya taşar
    await upsertFollowUpCase({
      tenantId: "demo-tenant",
      paymentId: "p1",
      studentId: "s1",
      status: "sent",
      messageDraft: "",
      attributedAmount: 0,
      sentAt: lastMonth.toISOString(),
    });
    const roi = await getCollectionRoi("demo-tenant");
    expect(roi.sentThisMonth).toBe(0);
  });

  it("replied/paid/lost durumuna bu ay geçen vaka respondedThisMonth'a girer", async () => {
    const c = await upsertFollowUpCase({
      tenantId: "demo-tenant",
      paymentId: "p1",
      studentId: "s1",
      status: "sent",
      messageDraft: "",
      attributedAmount: 0,
    });
    await upsertFollowUpCase({
      id: c.id,
      tenantId: "demo-tenant",
      paymentId: "p1",
      studentId: "s1",
      status: "replied",
      messageDraft: "",
      attributedAmount: 0,
    });
    const roi = await getCollectionRoi("demo-tenant");
    expect(roi.respondedThisMonth).toBe(1);
  });

  it("hâlâ draft/approved/sent durumundaki vaka respondedThisMonth'a girmez", async () => {
    await upsertFollowUpCase({
      tenantId: "demo-tenant",
      paymentId: "p1",
      studentId: "s1",
      status: "sent",
      messageDraft: "",
      attributedAmount: 0,
    });
    const roi = await getCollectionRoi("demo-tenant");
    expect(roi.respondedThisMonth).toBe(0);
  });

  it("mergeCollectionRoi sentThisMonth/respondedThisMonth alanlarını doğru toplar", () => {
    const merged = mergeCollectionRoi([
      {
        activeCases: 1,
        resolvedThisMonth: 1,
        attributedThisMonth: 100,
        lostThisMonth: 0,
        closedThisMonth: 1,
        successRate: 1,
        sentThisMonth: 2,
        respondedThisMonth: 1,
      },
      {
        activeCases: 0,
        resolvedThisMonth: 0,
        attributedThisMonth: 0,
        lostThisMonth: 1,
        closedThisMonth: 1,
        successRate: 0,
        sentThisMonth: 3,
        respondedThisMonth: 2,
      },
    ]);
    expect(merged.sentThisMonth).toBe(5);
    expect(merged.respondedThisMonth).toBe(3);
  });
});

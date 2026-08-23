import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import {
  upsertFollowUpCase,
  listFollowUpCases,
  getFollowUpCase,
  syncFollowUpCasesFromPayment,
  recordFollowUpAttempt,
  applyFollowUpDelivery,
  findAttemptByIdempotency,
  getCollectionsDashboard,
  clearFollowUpCases,
  FOLLOW_UP_CASES_FILE,
} from "../tahsilat/cases";
import { canTransitionFollowUp } from "../tahsilat/status";
import { buildDeterministicCollectionsDraft } from "../tahsilat/message";
import { approveFollowUpCaseTool, sendFollowUpMessageTool } from "../tahsilat/service";
import { normalizeToE164, maskE164, parseAllowlist } from "../sms/e164";
import { setSmsTransportForTests } from "../sms/transport";
import type { SmsSendInput, SmsTransport } from "../sms/types";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import { createSeedData } from "../seed";
import { writeData } from "../store-json";
import { resolveDataDir } from "../config";
import path from "path";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

function ctx(overrides?: Partial<ServiceContext>): ServiceContext {
  return {
    role: "SCHOOL_ADMIN",
    userId: "user_admin",
    tenantId: DEFAULT_TENANT_ID,
    channel: "web",
    ...overrides,
  };
}

beforeEach(async () => {
  await fs.rm(FOLLOW_UP_CASES_FILE, { force: true });
  await fs.rm(DATA_FILE, { force: true });
  setSmsTransportForTests(null);
  delete process.env.SMS_TEST_MODE;
  delete process.env.SMS_TEST_ALLOWED_RECIPIENTS;
});

afterEach(() => {
  setSmsTransportForTests(null);
});

describe("tahsilat v3 durum makinesi", () => {
  it("draft → approved → sending → sent → partial/paid geçişlerine izin verir", () => {
    expect(canTransitionFollowUp("draft", "approved")).toBe(true);
    expect(canTransitionFollowUp("approved", "sending")).toBe(true);
    expect(canTransitionFollowUp("sending", "sent")).toBe(true);
    expect(canTransitionFollowUp("sent", "partial")).toBe(true);
    expect(canTransitionFollowUp("partial", "paid")).toBe(true);
    expect(canTransitionFollowUp("paid", "draft")).toBe(false);
  });
});

describe("eşzamanlı tarama / tenant / idempotency", () => {
  it("aynı tenant+ödeme için paralel upsert tek açık vaka üretir", async () => {
    const results = await Promise.all(
      [1, 2, 3].map((i) =>
        upsertFollowUpCase({
          tenantId: "t1",
          paymentId: "pay1",
          studentId: "s1",
          status: "draft",
          messageDraft: `taslak-${i}`,
          attributedAmount: 0,
        })
      )
    );
    expect(new Set(results.map((r) => r.id)).size).toBe(1);
    expect((await listFollowUpCases("t1")).filter((c) => c.paymentId === "pay1")).toHaveLength(1);
  });

  it("farklı tenant vakaları karışmaz", async () => {
    await upsertFollowUpCase({
      tenantId: "a",
      paymentId: "p1",
      studentId: "s1",
      status: "draft",
      messageDraft: "a",
      attributedAmount: 0,
    });
    expect(await getFollowUpCase("b", (await listFollowUpCases("a"))[0]!.id)).toBeNull();
    expect(await listFollowUpCases("b")).toHaveLength(0);
  });
});

describe("kanal denemeleri birbirini bozmaz", () => {
  it("WhatsApp ve SMS denemeleri aynı vakada ayrı kalır", async () => {
    const c = await upsertFollowUpCase({
      tenantId: "t1",
      paymentId: "p1",
      studentId: "s1",
      status: "approved",
      messageDraft: "merhaba",
      approvedMessage: "merhaba",
      attributedAmount: 0,
    });
    await recordFollowUpAttempt("t1", c.id, {
      id: "a1",
      channel: "whatsapp",
      status: "manual_send_pending",
      approvedContent: "merhaba",
      recipientMasked: "+90***0000",
      idempotencyKey: "wa",
      deliveryConfidence: "none",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await recordFollowUpAttempt("t1", c.id, {
      id: "a2",
      channel: "sms",
      status: "failed",
      approvedContent: "merhaba",
      recipientMasked: "+90***0000",
      idempotencyKey: "sms",
      deliveryConfidence: "none",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const next = await getFollowUpCase("t1", c.id);
    expect(next?.attempts).toHaveLength(2);
    expect(next?.attempts?.find((a) => a.channel === "whatsapp")?.status).toBe("manual_send_pending");
    expect(next?.attempts?.find((a) => a.channel === "sms")?.status).toBe("failed");
  });

  it("aynı idempotency key ikinci denemeyi ezmez / yeni satır açmaz", async () => {
    const c = await upsertFollowUpCase({
      tenantId: "t1",
      paymentId: "p1",
      studentId: "s1",
      status: "approved",
      messageDraft: "x",
      approvedMessage: "x",
      attributedAmount: 0,
    });
    const attempt = {
      id: "a1",
      channel: "sms" as const,
      status: "sent" as const,
      approvedContent: "x",
      recipientMasked: "+90***1111",
      idempotencyKey: "same",
      deliveryConfidence: "provider_accepted" as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await recordFollowUpAttempt("t1", c.id, attempt);
    await recordFollowUpAttempt("t1", c.id, { ...attempt, id: "a2", status: "sent" });
    const found = await findAttemptByIdempotency("t1", c.id, "same");
    const all = (await getFollowUpCase("t1", c.id))?.attempts ?? [];
    expect(all.filter((a) => a.idempotencyKey === "same")).toHaveLength(1);
    expect(found?.id).toBe("a1");
  });
});

describe("AI fallback", () => {
  it("deterministic taslak üretir (ağ yok)", () => {
    const text = buildDeterministicCollectionsDraft({
      studentName: "Ada",
      parentName: "Ayşe",
      remaining: 1200,
      paymentStatus: "overdue",
    });
    expect(text).toContain("Ada");
    expect(text).toContain("1.200");
    expect(text.toLowerCase()).toContain("gecikmiş");
  });
});

describe("E.164 ve SMS politikası", () => {
  it("TR yerel numarayı +90... yapar", () => {
    const n = normalizeToE164("5551112233");
    expect(n.ok && n.e164).toBe("+905551112233");
  });

  it("geçersiz telefonu reddeder", () => {
    expect(normalizeToE164("12").ok).toBe(false);
    expect(normalizeToE164("").ok).toBe(false);
  });

  it("maske tam numarayı gizler", () => {
    const masked = maskE164("+905551112233");
    expect(masked.includes("511122")).toBe(false);
    expect(masked.endsWith("2233")).toBe(true);
  });

  it("test allowlist dışı FORBIDDEN", async () => {
    process.env.SMS_TEST_MODE = "true";
    process.env.SMS_TEST_ALLOWED_RECIPIENTS = "+905550000001";
    const calls: SmsSendInput[] = [];
    setSmsTransportForTests({
      name: "fake",
      async send(input) {
        calls.push(input);
        return { ok: true, messageId: "SM_FAKE" };
      },
    } satisfies SmsTransport);

    const seed = createSeedData();
    seed.students[0]!.parentPhone = "05550000002";
    seed.students[0]!.communicationOptOut = false;
    await writeData(seed);
    const payment = seed.payments.find((p) => p.studentId === seed.students[0]!.id && p.status !== "paid") ?? seed.payments[0]!;
    const created = await upsertFollowUpCase({
      tenantId: DEFAULT_TENANT_ID,
      paymentId: payment.id,
      studentId: seed.students[0]!.id,
      status: "approved",
      messageDraft: "ödeme hatırlatması",
      approvedMessage: "ödeme hatırlatması",
      attributedAmount: 0,
    });
    const res = await sendFollowUpMessageTool(ctx(), {
      caseId: created.id,
      channel: "sms",
      confirm: true,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("FORBIDDEN");
    expect(calls).toHaveLength(0);
  });

  it("iletişim izni kapalıysa SMS gitmez", async () => {
    const seed = createSeedData();
    seed.students[0]!.parentPhone = "05551112233";
    seed.students[0]!.communicationOptOut = true;
    await writeData(seed);
    const payment = seed.payments[0]!;
    const created = await upsertFollowUpCase({
      tenantId: DEFAULT_TENANT_ID,
      paymentId: payment.id,
      studentId: seed.students[0]!.id,
      status: "approved",
      messageDraft: "x",
      approvedMessage: "x",
      attributedAmount: 0,
    });
    const res = await sendFollowUpMessageTool(ctx(), { caseId: created.id, channel: "sms", confirm: true });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("FORBIDDEN");
  });

  it("test allowlist + onay ile yalnızca fake transport çağrılır", async () => {
    process.env.SMS_TEST_MODE = "true";
    process.env.SMS_TEST_ALLOWED_RECIPIENTS = "+905551112233";
    const calls: SmsSendInput[] = [];
    setSmsTransportForTests({
      name: "fake",
      async send(input) {
        calls.push(input);
        return { ok: true, messageId: "SM_OK" };
      },
    });
    const seed = createSeedData();
    seed.students[0]!.parentPhone = "05551112233";
    seed.students[0]!.communicationOptOut = false;
    await writeData(seed);
    const created = await upsertFollowUpCase({
      tenantId: DEFAULT_TENANT_ID,
      paymentId: seed.payments[0]!.id,
      studentId: seed.students[0]!.id,
      status: "approved",
      messageDraft: "kısa hatırlatma",
      approvedMessage: "kısa hatırlatma",
      attributedAmount: 0,
    });
    const first = await sendFollowUpMessageTool(ctx(), { caseId: created.id, channel: "sms", confirm: true });
    const second = await sendFollowUpMessageTool(ctx(), { caseId: created.id, channel: "sms", confirm: true });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(JSON.stringify(calls[0])).not.toMatch(/TWILIO|SK/);
  });
});

describe("ödeme senkronu ve ROI", () => {
  it("tam ödeme vakayı paid yapar; tekrar saymaz", async () => {
    const c = await upsertFollowUpCase({
      tenantId: "t1",
      paymentId: "p1",
      studentId: "s1",
      status: "sent",
      messageDraft: "x",
      attributedAmount: 0,
    });
    const once = await syncFollowUpCasesFromPayment({
      tenantId: "t1",
      paymentId: "p1",
      paidAmount: 3000,
      remaining: 0,
      paymentStatus: "paid",
    });
    const twice = await syncFollowUpCasesFromPayment({
      tenantId: "t1",
      paymentId: "p1",
      paidAmount: 3000,
      remaining: 0,
      paymentStatus: "paid",
    });
    expect(once[0]?.status).toBe("paid");
    expect(twice).toHaveLength(0);
    const again = await getFollowUpCase("t1", c.id);
    expect(again?.attributedAmount).toBe(3000);
  });

  it("kısmi ödeme partial bırakır; void attribution sıfırlar", async () => {
    const c = await upsertFollowUpCase({
      tenantId: "t1",
      paymentId: "p2",
      studentId: "s1",
      status: "sent",
      messageDraft: "x",
      attributedAmount: 0,
    });
    await syncFollowUpCasesFromPayment({
      tenantId: "t1",
      paymentId: "p2",
      paidAmount: 1000,
      remaining: 2000,
      paymentStatus: "partial",
    });
    let row = await getFollowUpCase("t1", c.id);
    expect(row?.status).toBe("partial");
    expect(row?.attributedAmount).toBe(1000);
    await syncFollowUpCasesFromPayment({
      tenantId: "t1",
      paymentId: "p2",
      paidAmount: 0,
      remaining: 3000,
      paymentStatus: "voided",
    });
    row = await getFollowUpCase("t1", c.id);
    expect(row?.attributedAmount).toBe(0);
    expect(row?.status).toBe("sent");
  });

  it("ROI yalnızca atfedilen tutarı sayar", async () => {
    await upsertFollowUpCase({
      tenantId: "t1",
      paymentId: "p3",
      studentId: "s1",
      status: "sent",
      messageDraft: "x",
      attributedAmount: 0,
    });
    await syncFollowUpCasesFromPayment({
      tenantId: "t1",
      paymentId: "p3",
      paidAmount: 500,
      remaining: 0,
      paymentStatus: "paid",
    });
    const dash = await getCollectionsDashboard("t1");
    expect(dash.attributedThisMonth).toBe(500);
    expect(dash.collectedPaidAmount).toBe(500);
    expect(dash.activeCases).toBe(0);
  });
});

describe("yetki / delivery / audit sızıntısı", () => {
  it("TEACHER onaylayamaz", async () => {
    const seed = createSeedData();
    await writeData(seed);
    const res = await approveFollowUpCaseTool(ctx({ role: "TEACHER", teacherId: "t1" }), {
      paymentId: seed.payments[0]!.id,
      studentId: seed.students[0]!.id,
      message: "lütfen ödeyin",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("FORBIDDEN");
  });

  it("delivery callback aynı messageId için idempotent günceller", async () => {
    const c = await upsertFollowUpCase({
      tenantId: "t1",
      paymentId: "p9",
      studentId: "s1",
      status: "sent",
      messageDraft: "x",
      approvedMessage: "x",
      attributedAmount: 0,
    });
    await recordFollowUpAttempt("t1", c.id, {
      id: "att1",
      channel: "sms",
      status: "sent",
      approvedContent: "x",
      recipientMasked: "+90***0000",
      providerMessageId: "SM1",
      idempotencyKey: "k",
      deliveryConfidence: "provider_accepted",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await applyFollowUpDelivery({
      tenantId: "t1",
      providerMessageId: "SM1",
      status: "delivered",
      deliveryConfidence: "delivered",
    });
    await applyFollowUpDelivery({
      tenantId: "t1",
      providerMessageId: "SM1",
      status: "delivered",
      deliveryConfidence: "delivered",
    });
    const row = await getFollowUpCase("t1", c.id);
    expect(row?.attempts?.filter((a) => a.providerMessageId === "SM1")).toHaveLength(1);
    expect(row?.attempts?.[0]?.status).toBe("delivered");
  });

  it("maske ve allowlist parse secret sızdırmaz", () => {
    const set = parseAllowlist("+905551112233, 05551112233");
    expect(set.size).toBe(1);
    expect(JSON.stringify([...set])).not.toMatch(/AUTH|TOKEN|SECRET/i);
  });
});

describe("onay idempotent", () => {
  it("aynı metinle ikinci onay yeni durum üretmez", async () => {
    const seed = createSeedData();
    seed.students[0]!.communicationOptOut = false;
    await writeData(seed);
    const first = await approveFollowUpCaseTool(ctx(), {
      paymentId: seed.payments[0]!.id,
      studentId: seed.students[0]!.id,
      message: "lütfen ödemeyi tamamlayın",
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = await approveFollowUpCaseTool(ctx(), {
      caseId: first.data.caseId,
      paymentId: seed.payments[0]!.id,
      studentId: seed.students[0]!.id,
      message: "lütfen ödemeyi tamamlayın",
    });
    expect(second.ok).toBe(true);
    const cases = await listFollowUpCases(DEFAULT_TENANT_ID);
    expect(cases.filter((c) => c.paymentId === seed.payments[0]!.id)).toHaveLength(1);
  });
});

describe("temizlik", () => {
  it("clearFollowUpCases tenant izolasyonu", async () => {
    await upsertFollowUpCase({
      tenantId: "keep",
      paymentId: "p",
      studentId: "s",
      status: "draft",
      messageDraft: "",
      attributedAmount: 0,
    });
    await upsertFollowUpCase({
      tenantId: "drop",
      paymentId: "p",
      studentId: "s",
      status: "draft",
      messageDraft: "",
      attributedAmount: 0,
    });
    await clearFollowUpCases("drop");
    expect(await listFollowUpCases("keep")).toHaveLength(1);
    expect(await listFollowUpCases("drop")).toHaveLength(0);
  });
});

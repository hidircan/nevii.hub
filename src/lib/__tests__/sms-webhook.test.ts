import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { computeTwilioSignature, verifyTwilioSignature } from "../sms/twilio-signature";
import { processInboundSms } from "../sms/inbound";
import { writeData } from "../store-json";
import { readData } from "../store";
import { createSeedData } from "../seed";
import { upsertFollowUpCase, recordFollowUpAttempt, getFollowUpCase, FOLLOW_UP_CASES_FILE } from "../tahsilat/cases";
import { DEFAULT_TENANT_ID } from "../auth/config";
import { sendFollowUpMessageTool } from "../tahsilat/service";
import { setSmsTransportForTests } from "../sms/transport";
import { POST as webhookPost } from "../../app/api/v1/sms/webhook/route";
import type { ServiceContext } from "../services/context";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");
const INBOUND_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "sms-inbound-events.json");

function ctx(): ServiceContext {
  return {
    role: "SCHOOL_ADMIN",
    userId: "user_admin",
    tenantId: DEFAULT_TENANT_ID,
    channel: "web",
  };
}

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
  await fs.rm(FOLLOW_UP_CASES_FILE, { force: true });
  await fs.rm(INBOUND_FILE, { force: true });
  setSmsTransportForTests(null);
  process.env.TWILIO_AUTH_TOKEN = "test-token";
  process.env.SMS_WEBHOOK_PUBLIC_URL = "https://example.test/api/v1/sms/webhook";
});

describe("Twilio imza", () => {
  it("geçerli imzayı kabul, bozuk imzayı reddeder", () => {
    const params = { Body: "IPTAL", From: "+905551112233", MessageSid: "SM1" };
    const url = "https://example.test/api/v1/sms/webhook";
    const sig = computeTwilioSignature("test-token", url, params);
    expect(verifyTwilioSignature({ authToken: "test-token", url, params, signature: sig })).toBe(true);
    expect(verifyTwilioSignature({ authToken: "test-token", url, params, signature: "aaaa" })).toBe(false);
  });
});

describe("public webhook", () => {
  it("imzasız/yanlış imzayı 401 ile reddeder ve state değiştirmez", async () => {
    const req = new Request("https://example.test/api/v1/sms/webhook", {
      method: "POST",
      headers: { "content-type": "application/json", "x-twilio-signature": "nope" },
      body: JSON.stringify({ Body: "IPTAL", From: "+905551112233", MessageSid: "SMX" }),
    });
    const res = await webhookPost(req);
    expect(res.status).toBe(401);
    const json = (await res.json()) as { error?: { message?: string } };
    expect(JSON.stringify(json)).not.toMatch(/test-token/);
  });

  it("imzalı IPTAL opt-out uygular; replay tek işler", async () => {
    const seed = createSeedData();
    seed.students[0]!.parentPhone = "05551112233";
    seed.students[0]!.communicationOptOut = false;
    await writeData(seed);
    const params = { Body: "IPTAL", From: "+905551112233", MessageSid: "SMOPT1" };
    const url = "https://example.test/api/v1/sms/webhook";
    const sig = computeTwilioSignature("test-token", url, params);
    const makeReq = () =>
      new Request(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-twilio-signature": sig },
        body: JSON.stringify(params),
      });
    const first = await webhookPost(makeReq());
    const second = await webhookPost(makeReq());
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const d1 = (await first.json()) as { data: { optOut: string } };
    const d2 = (await second.json()) as { data: { optOut: string } };
    expect(d1.data.optOut).toBe("applied");
    expect(d2.data.optOut).toBe("duplicate");
    const after = await readData();
    expect(after.students[0]!.communicationOptOut).toBe(true);

    const created = await upsertFollowUpCase({
      tenantId: DEFAULT_TENANT_ID,
      paymentId: seed.payments[0]!.id,
      studentId: seed.students[0]!.id,
      status: "approved",
      messageDraft: "x",
      approvedMessage: "x",
      attributedAmount: 0,
    });
    const send = await sendFollowUpMessageTool(ctx(), { caseId: created.id, channel: "sms", confirm: true });
    expect(send.ok).toBe(false);
  });

  it("aynı SID delivery replay tek uygulanır", async () => {
    const c = await upsertFollowUpCase({
      tenantId: DEFAULT_TENANT_ID,
      paymentId: "p1",
      studentId: "s1",
      status: "sent",
      messageDraft: "x",
      approvedMessage: "x",
      attributedAmount: 0,
    });
    await recordFollowUpAttempt(DEFAULT_TENANT_ID, c.id, {
      id: "att1",
      channel: "sms",
      status: "sent",
      approvedContent: "x",
      recipientMasked: "+90***2233",
      providerMessageId: "SMDEL1",
      idempotencyKey: "k",
      deliveryConfidence: "provider_accepted",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const first = await processInboundSms({
      messageSid: "SMDEL1",
      from: "",
      body: "",
      messageStatus: "delivered",
    });
    const second = await processInboundSms({
      messageSid: "SMDEL1",
      from: "",
      body: "",
      messageStatus: "delivered",
    });
    expect(first.delivery).toBe("applied");
    expect(second.delivery).toBe("duplicate");
    const row = await getFollowUpCase(DEFAULT_TENANT_ID, c.id);
    expect(row?.attempts?.filter((a) => a.providerMessageId === "SMDEL1")).toHaveLength(1);
    expect(row?.attempts?.[0]?.status).toBe("delivered");
  });
});

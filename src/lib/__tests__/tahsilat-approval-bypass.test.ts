import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { upsertFollowUpCase, FOLLOW_UP_CASES_FILE } from "../tahsilat/cases";
import { sendFollowUpMessageTool } from "../tahsilat/service";
import { setSmsTransportForTests } from "../sms/transport";
import type { SmsSendInput, SmsTransport } from "../sms/types";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import { createSeedData } from "../seed";
import { writeData } from "../store-json";
import { resolveDataDir } from "../config";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

function ctx(): ServiceContext {
  return { role: "SCHOOL_ADMIN", userId: "user_admin", tenantId: DEFAULT_TENANT_ID, channel: "web" };
}

beforeEach(async () => {
  await fs.rm(FOLLOW_UP_CASES_FILE, { force: true });
  await fs.rm(DATA_FILE, { force: true });
  setSmsTransportForTests(null);
});

afterEach(() => {
  setSmsTransportForTests(null);
});

describe("Tahsilat mesaj onay bypass düzeltmesi", () => {
  it("draft durumdaki vaka gönderim denemesi provider mock'a hiç ulaşmaz", async () => {
    const seed = createSeedData();
    seed.students[0]!.parentPhone = "05551112233";
    seed.students[0]!.communicationOptOut = false;
    await writeData(seed);

    const calls: SmsSendInput[] = [];
    const fakeTransport: SmsTransport = {
      name: "fake",
      async send(input: SmsSendInput) {
        calls.push(input);
        return { ok: true, messageId: "SM_should_never_happen" };
      },
    };
    setSmsTransportForTests(fakeTransport);

    const created = await upsertFollowUpCase({
      tenantId: DEFAULT_TENANT_ID,
      paymentId: seed.payments[0]!.id,
      studentId: seed.students[0]!.id,
      status: "draft",
      messageDraft: "henüz onaylanmamış taslak",
      approvedMessage: undefined,
      attributedAmount: 0,
    });

    const res = await sendFollowUpMessageTool(ctx(), { caseId: created.id, channel: "sms", confirm: true });
    expect(res.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("mesaj onaylanmış ama durum hâlâ draft ise (yarım kalmış onay) gönderim reddedilir", async () => {
    const seed = createSeedData();
    seed.students[0]!.parentPhone = "05551112233";
    seed.students[0]!.communicationOptOut = false;
    await writeData(seed);

    const calls: SmsSendInput[] = [];
    const fakeTransport: SmsTransport = {
      name: "fake",
      async send(input: SmsSendInput) {
        calls.push(input);
        return { ok: true, messageId: "SM_should_never_happen" };
      },
    };
    setSmsTransportForTests(fakeTransport);

    // approvedMessage set but status wasn't actually transitioned to "approved" —
    // this is exactly the gap the fix closes: presence of approvedMessage alone
    // must not be treated as authorization to send.
    const created = await upsertFollowUpCase({
      tenantId: DEFAULT_TENANT_ID,
      paymentId: seed.payments[0]!.id,
      studentId: seed.students[0]!.id,
      status: "draft",
      messageDraft: "taslak",
      approvedMessage: "taslak ama onay adımı çalışmadı",
      attributedAmount: 0,
    });

    const res = await sendFollowUpMessageTool(ctx(), { caseId: created.id, channel: "sms", confirm: true });
    expect(res.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("dismissed vakada gönderim reddedilir", async () => {
    const seed = createSeedData();
    seed.students[0]!.parentPhone = "05551112233";
    await writeData(seed);
    setSmsTransportForTests({
      name: "fake",
      async send() {
        throw new Error("should never be called");
      },
    });

    const created = await upsertFollowUpCase({
      tenantId: DEFAULT_TENANT_ID,
      paymentId: seed.payments[0]!.id,
      studentId: seed.students[0]!.id,
      status: "dismissed",
      messageDraft: "x",
      approvedMessage: "x",
      attributedAmount: 0,
    });

    const res = await sendFollowUpMessageTool(ctx(), { caseId: created.id, channel: "sms", confirm: true });
    expect(res.ok).toBe(false);
  });

  it("approved durumda gönderim tek provider çağrısı yapar", async () => {
    const seed = createSeedData();
    seed.students[0]!.parentPhone = "05551112233";
    seed.students[0]!.communicationOptOut = false;
    await writeData(seed);

    const calls: SmsSendInput[] = [];
    setSmsTransportForTests({
      name: "fake",
      async send(input: SmsSendInput) {
        calls.push(input);
        return { ok: true, messageId: "SM123" };
      },
    });

    const created = await upsertFollowUpCase({
      tenantId: DEFAULT_TENANT_ID,
      paymentId: seed.payments[0]!.id,
      studentId: seed.students[0]!.id,
      status: "approved",
      messageDraft: "x",
      approvedMessage: "onaylanmış mesaj",
      attributedAmount: 0,
    });

    const res = await sendFollowUpMessageTool(ctx(), { caseId: created.id, channel: "sms", confirm: true });
    expect(res.ok).toBe(true);
    expect(calls).toHaveLength(1);
  });
});

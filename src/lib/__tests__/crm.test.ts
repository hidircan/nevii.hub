import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import { createHmac } from "crypto";
import {
  listCallLogsTool,
  createCallLogTool,
  assignCallContactTool,
  markCallbackDoneTool,
  listMessageLogsTool,
  getMessageLogTool,
  createMessageLogTool,
  assignMessageContactTool,
  setMessageStatusTool,
} from "../services/tools";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import { CALL_LOG_FILE } from "../call-log";
import { MESSAGE_LOG_FILE } from "../message-log";
import { normalizePhone, matchContactByPhone } from "../crm-contact-matching";
import { hmacCommunicationProvider } from "../communication-provider/providers/hmac";
import { readData } from "../store";

function adminCtx(overrides?: Partial<ServiceContext>): ServiceContext {
  return { role: "SCHOOL_ADMIN", userId: "admin1", tenantId: DEFAULT_TENANT_ID, channel: "web", ...overrides };
}

beforeEach(async () => {
  await fs.rm(CALL_LOG_FILE, { force: true });
  await fs.rm(MESSAGE_LOG_FILE, { force: true });
});

describe("crm-contact-matching (pure)", () => {
  it("normalizePhone yalnızca rakamları bırakır", () => {
    expect(normalizePhone("0555 000 00 00")).toBe("05550000000");
    expect(normalizePhone("+90 (555) 000-00-00")).toBe("905550000000");
  });

  it("tekil eşleşme: öğrenci telefonu", () => {
    const students = [{ id: "s1", name: "Ada", phone: "05550000000", parentPhone: "" } as never];
    const result = matchContactByPhone("0555 000 00 00", students, []);
    expect(result.status).toBe("matched");
    if (result.status === "matched") {
      expect(result.match.contactType).toBe("student");
      expect(result.match.contactId).toBe("s1");
    }
  });

  it("tekil eşleşme: veli telefonu", () => {
    const students = [{ id: "s1", name: "Ada", phone: "", parentPhone: "05559998877" } as never];
    const result = matchContactByPhone("05559998877", students, []);
    expect(result.status).toBe("matched");
    if (result.status === "matched") expect(result.match.contactType).toBe("parent");
  });

  it("çoklu eşleşme: 'belirsiz' döner, otomatik atama YAPILMAZ", () => {
    const students = [
      { id: "s1", name: "Ada", phone: "05550000000", parentPhone: "" } as never,
      { id: "s2", name: "Deniz", phone: "05550000000", parentPhone: "" } as never,
    ];
    const result = matchContactByPhone("05550000000", students, []);
    expect(result.status).toBe("ambiguous");
    if (result.status === "ambiguous") expect(result.candidates).toHaveLength(2);
  });

  it("hiç eşleşme yoksa 'none' döner", () => {
    const result = matchContactByPhone("05559999999", [{ id: "s1", name: "Ada", phone: "05550000000", parentPhone: "" } as never], []);
    expect(result.status).toBe("none");
  });

  it("boş numara için 'none' döner (çökme yok)", () => {
    expect(matchContactByPhone("", [], []).status).toBe("none");
  });
});

describe("communication-provider — jenerik HMAC webhook doğrulama", () => {
  const ORIGINAL_SECRET = process.env.COMMUNICATION_WEBHOOK_SECRET;

  beforeEach(() => {
    process.env.COMMUNICATION_WEBHOOK_SECRET = "test-secret";
  });
  afterEach(() => {
    if (ORIGINAL_SECRET === undefined) delete process.env.COMMUNICATION_WEBHOOK_SECRET;
    else process.env.COMMUNICATION_WEBHOOK_SECRET = ORIGINAL_SECRET;
  });

  it("doğru imza kabul edilir", async () => {
    const provider = hmacCommunicationProvider();
    const rawBody = JSON.stringify({ event: "test" });
    const signature = createHmac("sha256", "test-secret").update(rawBody, "utf8").digest("hex");
    const result = await provider.verifyWebhook({ rawBody, signatureHeader: `sha256=${signature}` });
    expect(result.ok).toBe(true);
  });

  it("yanlış imza reddedilir", async () => {
    const provider = hmacCommunicationProvider();
    const result = await provider.verifyWebhook({ rawBody: "{}", signatureHeader: "sha256=deadbeef" });
    expect(result.ok).toBe(false);
  });

  it("imza header'ı hiç yoksa reddedilir", async () => {
    const provider = hmacCommunicationProvider();
    const result = await provider.verifyWebhook({ rawBody: "{}", signatureHeader: null });
    expect(result.ok).toBe(false);
  });

  it("aynı ham gövde için providerMessageId DETERMİNİSTİKTİR (idempotency claim'in temeli)", async () => {
    const provider = hmacCommunicationProvider();
    const rawBody = "identical-payload";
    const signature = createHmac("sha256", "test-secret").update(rawBody, "utf8").digest("hex");
    const r1 = await provider.verifyWebhook({ rawBody, signatureHeader: `sha256=${signature}` });
    const r2 = await provider.verifyWebhook({ rawBody, signatureHeader: `sha256=${signature}` });
    expect(r1.ok && r2.ok).toBe(true);
    if (r1.ok && r2.ok) expect(r1.providerMessageId).toBe(r2.providerMessageId);
  });
});

describe("Faz 11 — RBAC: yalnızca SCHOOL_ADMIN/SUPER_ADMIN erişir", () => {
  it("TEACHER hiçbir CRM aracına erişemez", async () => {
    const teacherCtx = adminCtx({ role: "TEACHER", teacherId: "t1" });
    const results = await Promise.all([
      listCallLogsTool(teacherCtx, {}),
      createCallLogTool(teacherCtx, { callerNumber: "0555", direction: "inbound", answered: true, occurredAt: new Date().toISOString() }),
      listMessageLogsTool(teacherCtx, {}),
      createMessageLogTool(teacherCtx, { channel: "sms", senderIdentifier: "0555", occurredAt: new Date().toISOString(), contentOrSummary: "x" }),
    ]);
    for (const r of results) {
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("FORBIDDEN");
    }
  });
});

describe("Faz 11 — CallLog: otomatik eşleştirme + manuel atama + geri arama", () => {
  it("tekil eşleşen numarayla arama kaydı OTOMATİK kişiye atanır", async () => {
    const data = await readData();
    const student = data.students.find((s) => s.phone);
    expect(student).toBeDefined();
    if (!student?.phone) return;

    const created = await createCallLogTool(adminCtx(), {
      callerNumber: student.phone,
      direction: "inbound",
      answered: true,
      occurredAt: new Date().toISOString(),
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.data.matchStatus).toBe("matched");

    const list = await listCallLogsTool(adminCtx(), {});
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    const entry = list.data.calls.find((c) => c.id === created.data.callId);
    expect(entry?.contactType).toBe("student");
    expect(entry?.contactId).toBe(student.id);
  });

  it("eşleşmeyen numarayla oluşturulan kayıt kişisiz kalır, manuel atanabilir", async () => {
    const created = await createCallLogTool(adminCtx(), {
      callerNumber: "09999999999",
      direction: "inbound",
      answered: false,
      occurredAt: new Date().toISOString(),
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.data.matchStatus).toBe("none");

    const assigned = await assignCallContactTool(adminCtx(), { callId: created.data.callId, contactType: "lead", contactId: "lead-1" });
    expect(assigned.ok).toBe(true);

    const list = await listCallLogsTool(adminCtx(), {});
    if (!list.ok) return;
    const entry = list.data.calls.find((c) => c.id === created.data.callId);
    expect(entry?.contactType).toBe("lead");
    expect(entry?.contactId).toBe("lead-1");
  });

  it("cevapsız aramada geri arama tamamlandı işaretlenebilir", async () => {
    const created = await createCallLogTool(adminCtx(), {
      callerNumber: "09999999999",
      direction: "inbound",
      answered: false,
      occurredAt: new Date().toISOString(),
    });
    if (!created.ok) return;
    const marked = await markCallbackDoneTool(adminCtx(), { callId: created.data.callId });
    expect(marked.ok).toBe(true);

    const list = await listCallLogsTool(adminCtx(), {});
    if (!list.ok) return;
    const entry = list.data.calls.find((c) => c.id === created.data.callId);
    expect(entry?.callbackDone).toBe(true);
    expect(entry?.callbackByUserId).toBe("admin1");
  });

  it("olmayan bir arama kaydına atama NOT_FOUND döner", async () => {
    const res = await assignCallContactTool(adminCtx(), { callId: "does-not-exist", contactType: "lead", contactId: "x" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("NOT_FOUND");
  });
});

describe("Faz 11 — MessageLog: liste kırpılmış özet taşır, detay tam içerik + audit", () => {
  it("liste görünümü uzun içeriği kırpar, detay (getMessageLogTool) tam içeriği döner", async () => {
    const longContent = "A".repeat(200);
    const created = await createMessageLogTool(adminCtx(), {
      channel: "sms",
      senderIdentifier: "09999999999",
      occurredAt: new Date().toISOString(),
      contentOrSummary: longContent,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const list = await listMessageLogsTool(adminCtx(), {});
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    const entry = list.data.messages.find((m) => m.id === created.data.messageId);
    expect(entry?.contentOrSummary.length).toBeLessThan(longContent.length);

    const full = await getMessageLogTool(adminCtx(), { messageId: created.data.messageId });
    expect(full.ok).toBe(true);
    if (full.ok) expect(full.data.message.contentOrSummary).toBe(longContent);
  });

  it("kısa içerik listede KIRPILMAZ (zaten sınırın altında)", async () => {
    const created = await createMessageLogTool(adminCtx(), {
      channel: "sms",
      senderIdentifier: "09999999999",
      occurredAt: new Date().toISOString(),
      contentOrSummary: "kısa mesaj",
    });
    if (!created.ok) return;
    const list = await listMessageLogsTool(adminCtx(), {});
    if (!list.ok) return;
    const entry = list.data.messages.find((m) => m.id === created.data.messageId);
    expect(entry?.contentOrSummary).toBe("kısa mesaj");
  });

  it("durum akışı: unread → read → replied", async () => {
    const created = await createMessageLogTool(adminCtx(), {
      channel: "whatsapp",
      senderIdentifier: "09999999999",
      occurredAt: new Date().toISOString(),
      contentOrSummary: "merhaba",
    });
    if (!created.ok) return;

    const list1 = await listMessageLogsTool(adminCtx(), {});
    if (list1.ok) expect(list1.data.messages.find((m) => m.id === created.data.messageId)?.status).toBe("unread");

    await setMessageStatusTool(adminCtx(), { messageId: created.data.messageId, status: "read" });
    const replied = await setMessageStatusTool(adminCtx(), { messageId: created.data.messageId, status: "replied" });
    expect(replied.ok).toBe(true);

    const list2 = await listMessageLogsTool(adminCtx(), {});
    if (!list2.ok) return;
    const entry = list2.data.messages.find((m) => m.id === created.data.messageId);
    expect(entry?.status).toBe("replied");
  });

  it("manuel kişi ataması çalışır", async () => {
    const created = await createMessageLogTool(adminCtx(), {
      channel: "email",
      senderIdentifier: "test@example.com",
      occurredAt: new Date().toISOString(),
      contentOrSummary: "merhaba",
    });
    if (!created.ok) return;
    const assigned = await assignMessageContactTool(adminCtx(), {
      messageId: created.data.messageId,
      contactType: "lead",
      contactId: "lead-2",
    });
    expect(assigned.ok).toBe(true);
  });

  it("olmayan bir mesaj kaydı için getMessageLogTool NOT_FOUND döner", async () => {
    const res = await getMessageLogTool(adminCtx(), { messageId: "does-not-exist" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("NOT_FOUND");
  });
});

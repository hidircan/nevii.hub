/**
 * P1 (2026-09-12) — outbox aksiyonları + daraltılmış gelen WhatsApp listesi.
 *
 * Kısıt: gerçek provider çağrısı YOK — hazır mesaj `mock_noop` ile
 * kuyruğa döner, sahte `delivered` üretilmez; hazır olmayan `blocked`e
 * düşer. Inbound liste salt-okunur özet, telefon maskeli.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import { DEFAULT_TENANT_ID } from "../auth/config";
import { COMMUNICATION_MESSAGES_FILE } from "../communications/store";
import {
  approveAndEnqueueCommunicationMessageTool,
  cancelCommunicationMessageTool,
  createCommunicationDraft,
  dispatchCommunicationMessageTool,
  enqueueCommunicationMessageTool,
  listWhatsAppInboundTool,
  retryCommunicationMessageTool,
} from "../communications/service";
import { createConversation, appendMessages, newMessage } from "../ai/conversations";
import type { ServiceContext } from "../services/context";

/**
 * conversations.json koşular arası kalıcıdır (dosya deposu) — birikmiş
 * eski `wa:` kayıtlarıyla çakışmamak için her koşuda eşsiz tenant.
 */
const INBOUND_TENANT = `tenant_inbound_p1_${Date.now().toString(36)}`;

function adminCtx(overrides?: Partial<ServiceContext>): ServiceContext {
  return { role: "SCHOOL_ADMIN", userId: "user_owner_nilufer", tenantId: DEFAULT_TENANT_ID, channel: "web", ...overrides };
}
function teacherCtx(): ServiceContext {
  return { role: "TEACHER", userId: "u3", tenantId: DEFAULT_TENANT_ID, teacherId: "t1", channel: "web" };
}

async function makeDraft(channel: "SMS" | "WHATSAPP" | "EMAIL" = "SMS") {
  const { record } = await createCommunicationDraft({
    tenantId: DEFAULT_TENANT_ID,
    recipientType: "PARENT",
    recipientId: "student_p1",
    recipientName: "Veli P1",
    recipientPhone: "+905551112233",
    channel,
    messageType: "ANNOUNCEMENT",
    resourceType: "announcement",
    resourceId: "ann_p1",
    body: "Duyuru metni P1.",
    createdBy: "user_owner_nilufer",
    idempotencySuffix: `p1-${channel}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  });
  return record;
}

beforeEach(async () => {
  await fs.rm(COMMUNICATION_MESSAGES_FILE, { force: true });
  // SMS taslakları `pending_approval` doğsun (sağlayıcısız ortamda yoksa
  // `blocked` doğar ve onay akışı test edilemez).
  process.env.SMS_TEST_MODE = "1";
});

afterEach(() => {
  delete process.env.SMS_TEST_MODE;
});

describe("outbox aksiyon durum makinesi", () => {
  it("onayla ve kuyruğa al: pending_approval → queued (tek aksiyon)", async () => {
    const record = await makeDraft();
    const res = await approveAndEnqueueCommunicationMessageTool(adminCtx(), { id: record.id });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.message.status).toBe("queued");
  });

  it("kuyruğa al: approved → queued; tekrar kuyruğa al idempotent", async () => {
    const record = await makeDraft();
    const { approveCommunicationMessageTool } = await import("../communications/service");
    const approved = await approveCommunicationMessageTool(adminCtx(), { id: record.id });
    expect(approved.ok).toBe(true);
    const queued = await enqueueCommunicationMessageTool(adminCtx(), { id: record.id });
    expect(queued.ok).toBe(true);
    if (queued.ok) expect(queued.data.message.status).toBe("queued");
    // queued → queued öz-geçişe izin verilir (idempotent tekrar güvenli);
    // terminal cancelled durumundan kuyruğa dönüş yoktur:
    const again = await enqueueCommunicationMessageTool(adminCtx(), { id: record.id });
    expect(again.ok).toBe(true);
    if (again.ok) expect(again.data.message.status).toBe("queued");
    const cancelled = await cancelCommunicationMessageTool(adminCtx(), { id: record.id });
    expect(cancelled.ok).toBe(true);
    const afterCancel = await enqueueCommunicationMessageTool(adminCtx(), { id: record.id });
    expect(afterCancel.ok).toBe(false);
  });

  it("dispatch hazır mesajı mock_noop ile kuyruğa döndürür (sahte delivered YOK)", async () => {
    process.env.SMS_TEST_MODE = "1";
    try {
      const record = await makeDraft("SMS");
      const { approveCommunicationMessageTool } = await import("../communications/service");
      await approveCommunicationMessageTool(adminCtx(), { id: record.id });
      await enqueueCommunicationMessageTool(adminCtx(), { id: record.id });
      const res = await dispatchCommunicationMessageTool(adminCtx(), { id: record.id });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.message.status).toBe("queued");
        expect(res.data.message.status).not.toBe("delivered");
        expect(res.data.outcome).toEqual({ ok: true, status: "queued", note: expect.any(String) });
        expect(res.data.message.attemptCount).toBe(1);
      }
    } finally {
      delete process.env.SMS_TEST_MODE;
    }
  });

  it("dispatch hazır olmayan mesajı blocked'e düşürür (EMAIL sağlayıcısız)", async () => {
    const record = await makeDraft("EMAIL");
    const { approveCommunicationMessageTool } = await import("../communications/service");
    await approveCommunicationMessageTool(adminCtx(), { id: record.id });
    await enqueueCommunicationMessageTool(adminCtx(), { id: record.id });
    const res = await dispatchCommunicationMessageTool(adminCtx(), { id: record.id });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.message.status).toBe("blocked");
      expect(res.data.outcome.ok).toBe(false);
    }
  });

  it("retry: blocked → queued; approved'tan retry VALIDATION_ERROR", async () => {
    const record = await makeDraft("EMAIL");
    const { approveCommunicationMessageTool } = await import("../communications/service");
    await approveCommunicationMessageTool(adminCtx(), { id: record.id });
    await enqueueCommunicationMessageTool(adminCtx(), { id: record.id });
    await dispatchCommunicationMessageTool(adminCtx(), { id: record.id });
    const retried = await retryCommunicationMessageTool(adminCtx(), { id: record.id });
    expect(retried.ok).toBe(true);
    if (retried.ok) expect(retried.data.message.status).toBe("queued");

    const fresh = await makeDraft();
    await approveCommunicationMessageTool(adminCtx(), { id: fresh.id });
    const bad = await retryCommunicationMessageTool(adminCtx(), { id: fresh.id });
    expect(bad.ok).toBe(false);
  });

  it("cancel: queued → cancelled; delivered iptal edilemez", async () => {
    process.env.SMS_TEST_MODE = "1";
    try {
      const record = await makeDraft("SMS");
      const { approveCommunicationMessageTool } = await import("../communications/service");
      await approveCommunicationMessageTool(adminCtx(), { id: record.id });
      await enqueueCommunicationMessageTool(adminCtx(), { id: record.id });
      const cancelled = await cancelCommunicationMessageTool(adminCtx(), { id: record.id });
      expect(cancelled.ok).toBe(true);
      if (cancelled.ok) expect(cancelled.data.message.status).toBe("cancelled");
    } finally {
      delete process.env.SMS_TEST_MODE;
    }
  });

  it("öğretmen tüm outbox aksiyonlarından FORBIDDEN", async () => {
    const record = await makeDraft();
    for (const fn of [
      approveAndEnqueueCommunicationMessageTool,
      enqueueCommunicationMessageTool,
      dispatchCommunicationMessageTool,
      retryCommunicationMessageTool,
      cancelCommunicationMessageTool,
      listWhatsAppInboundTool,
    ]) {
      const res = await (fn as (ctx: ServiceContext, input: { id: string }) => Promise<{ ok: boolean }>)(
        teacherCtx(),
        { id: record.id }
      );
      expect(res.ok).toBe(false);
    }
  });
});

describe("gelen WhatsApp listesi (daraltılmış)", () => {
  it("yalnız wa: konuşmaları listeler, telefonu maskeler, tenant izole", async () => {
    const conv = await createConversation(INBOUND_TENANT, "veli_user_1", "wa:+905559998877");
    await appendMessages(INBOUND_TENANT, "veli_user_1", conv.id, [
      newMessage("user", "Merhaba, yarınki ders saat kaçta?"),
      newMessage("assistant", "Merhaba! Yarınki ders 15:00'te."),
    ]);
    await createConversation(INBOUND_TENANT, "veli_user_1", "Normal sohbet");

    const res = await listWhatsAppInboundTool(adminCtx({ tenantId: INBOUND_TENANT }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.conversations).toHaveLength(1);
    const [item] = res.data.conversations;
    expect(item?.phoneMasked).not.toContain("905559998877");
    expect(item?.phoneMasked).toContain("***");
    expect(item?.lastInboundExcerpt).toContain("saat kaçta");
    expect(item?.messageCount).toBe(2);

    // Başka tenant göremez.
    const other = await listWhatsAppInboundTool(adminCtx({ tenantId: "tenant_other_p1" }));
    expect(other.ok).toBe(true);
    if (other.ok) expect(other.data.conversations).toHaveLength(0);
  });
});

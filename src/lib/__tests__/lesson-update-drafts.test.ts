/**
 * 11. tur iş #2/#6 — ders güncelleme WhatsApp taslakları + wa.me manuel akışı.
 *
 * Kapsar:
 * 1. `createLessonUpdateCommunicationDrafts` — `update:` idempotency ekiyle
 *    veli (SMS+WA) + öğretmen (WA) kaydı üretir; `{degisiklik}` gövdeye işlenir;
 *    aynı ek tekrar çağrılırsa duplicate oluşmaz.
 * 2. wa.me manuel akışı — approve → manual-send (wa.me linki) → delivered
 *    (kullanıcı onaylı); çift tıklama olayı tekrarlamaz, SMS kanalı reddedilir.
 * 3. `dispatchCommunicationMessageTool` — uygun olmayan durumda fırlatmak
 *    yerine VALIDATION_ERROR döner (iş #6'daki "Gönderim denemesi başarısız"ın kökü).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import {
  LESSON_PLAN_PREVIEW_VARS,
  LESSON_UPDATE_PARENT_TEMPLATE,
  LESSON_UPDATE_TEACHER_TEMPLATE,
  renderLessonPlanTemplate,
} from "../communications/lesson-plan-templates";
import {
  approveCommunicationMessageTool,
  buildWhatsAppDeepLink,
  createCommunicationDraft,
  createLessonUpdateCommunicationDrafts,
  dispatchCommunicationMessageTool,
  markCommunicationDeliveredTool,
  markCommunicationManualSendTool,
} from "../communications/service";
import { COMMUNICATION_MESSAGES_FILE, listCommunicationMessages } from "../communications/store";

function adminCtx(overrides?: Partial<ServiceContext>): ServiceContext {
  return { role: "SCHOOL_ADMIN", userId: "user_owner_nilufer", tenantId: DEFAULT_TENANT_ID, channel: "web", ...overrides };
}

beforeEach(async () => {
  await fs.rm(COMMUNICATION_MESSAGES_FILE, { force: true });
});

const VARS = { ...LESSON_PLAN_PREVIEW_VARS };

describe("güncelleme şablon render", () => {
  it("veli + öğretmen şablonları {degisiklik} ile hatasız render olur", () => {
    const parent = renderLessonPlanTemplate(LESSON_UPDATE_PARENT_TEMPLATE, VARS);
    expect(parent.ok).toBe(true);
    if (parent.ok) {
      expect(parent.body).toContain("saat 14:00 → 15:30");
      expect(parent.body).not.toMatch(/\{[a-zA-ZçÇğĞıİöÖşŞüÜ]+\}/);
    }
    const teacher = renderLessonPlanTemplate(LESSON_UPDATE_TEACHER_TEMPLATE, VARS);
    expect(teacher.ok).toBe(true);
    if (teacher.ok) expect(teacher.body).toContain("saat 14:00 → 15:30");
  });

  it("{degisiklik} boşsa gönderim öncesi reddedilir", () => {
    const res = renderLessonPlanTemplate(LESSON_UPDATE_PARENT_TEMPLATE, { ...VARS, degisiklik: "" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toContain("degisiklik");
  });
});

describe("güncelleme taslakları (update: idempotency)", () => {
  const base = {
    tenantId: DEFAULT_TENANT_ID,
    lessonId: "lesson-update-1",
    createdBy: "user_owner_nilufer",
    vars: VARS,
    degisiklik: "saat 14:00 → 15:30",
    idempotencySuffix: "update:2026-09-20T12:00:t1:r1:erzene",
    parent: { name: "Veli Adı", phone: "+905551112233", studentId: "student-1" },
    teacher: { name: "Öğretmen Adı", phone: "+905554443322", teacherId: "teacher-1" },
  };

  it("veli SMS+WhatsApp, öğretmen WhatsApp kaydı oluşur; gövdede değişiklik özeti vardır", async () => {
    const { records } = await createLessonUpdateCommunicationDrafts(base);
    expect(records).toHaveLength(3);
    const channels = records.map((r) => `${r.recipientType}:${r.channel}`).sort();
    expect(channels).toEqual(["PARENT:SMS", "PARENT:WHATSAPP", "TEACHER:WHATSAPP"]);
    for (const r of records) {
      expect(r.messageType).toBe("LESSON");
      expect(r.resourceType).toBe("lesson");
      expect(r.resourceId).toBe("lesson-update-1");
      expect(r.draftBody).toContain("saat 14:00 → 15:30");
    }
  });

  it("aynı update eki tekrar çağrılırsa duplicate oluşmaz", async () => {
    await createLessonUpdateCommunicationDrafts(base);
    await createLessonUpdateCommunicationDrafts(base);
    const rows = await listCommunicationMessages(DEFAULT_TENANT_ID);
    expect(rows).toHaveLength(3);
  });
});

describe("wa.me manuel akışı (çift tıklama güvenliği)", () => {
  async function approvedWhatsAppId(): Promise<string> {
    const { record } = await createCommunicationDraft({
      tenantId: DEFAULT_TENANT_ID,
      recipientType: "PARENT",
      recipientId: "student-wa-1",
      recipientName: "Veli WA",
      recipientPhone: "+905551112233",
      channel: "WHATSAPP",
      messageType: "LESSON",
      resourceType: "lesson",
      resourceId: "lesson-wa-1",
      body: "Ders güncellemesi test gövdesi.",
      createdBy: "user_owner_nilufer",
    });
    const approved = await approveCommunicationMessageTool(adminCtx(), { id: record.id });
    expect(approved.ok).toBe(true);
    return record.id;
  }

  it("approve → manual-send wa.me linki üretir; ikinci çağrı olayı tekrarlamaz", async () => {
    const id = await approvedWhatsAppId();
    const first = await markCommunicationManualSendTool(adminCtx(), { id });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.data.waUrl).toMatch(/^https:\/\/wa\.me\//);
    expect(first.data.message.status).toBe("manual_send_pending");

    const second = await markCommunicationManualSendTool(adminCtx(), { id });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.data.waUrl).toBe(first.data.waUrl);
    expect(second.data.message.status).toBe("manual_send_pending");
  });

  it("SMS mesajı manuel WhatsApp akışına sokulamaz", async () => {
    const { record } = await createCommunicationDraft({
      tenantId: DEFAULT_TENANT_ID,
      recipientType: "PARENT",
      recipientId: "student-sms-1",
      recipientName: "Veli SMS",
      recipientPhone: "+905551112233",
      channel: "SMS",
      messageType: "LESSON",
      resourceType: "lesson",
      resourceId: "lesson-sms-1",
      body: "SMS gövdesi.",
      createdBy: "user_owner_nilufer",
    });
    await approveCommunicationMessageTool(adminCtx(), { id: record.id });
    const res = await markCommunicationManualSendTool(adminCtx(), { id: record.id });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("VALIDATION_ERROR");
  });

  it("manual_send_pending → delivered yalnız açık onayla; tekrarı aynı kaydı döner", async () => {
    const id = await approvedWhatsAppId();
    const opened = await markCommunicationManualSendTool(adminCtx(), { id });
    expect(opened.ok).toBe(true);

    const done = await markCommunicationDeliveredTool(adminCtx(), { id, confirm: true });
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    expect(done.data.message.status).toBe("delivered");

    const again = await markCommunicationDeliveredTool(adminCtx(), { id, confirm: true });
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.data.message.status).toBe("delivered");
  });

  it("açılmamış mesaj gönderildi olarak işaretlenemez", async () => {
    const id = await approvedWhatsAppId();
    const res = await markCommunicationDeliveredTool(adminCtx(), { id, confirm: true });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("dispatch hata yüzeyi (iş #6)", () => {
  it("taslak durumundaki mesaja dispatch VALIDATION_ERROR döner, fırlatmaz", async () => {
    const { record } = await createCommunicationDraft({
      tenantId: DEFAULT_TENANT_ID,
      recipientType: "PARENT",
      recipientId: "student-d-1",
      recipientName: "Veli D",
      recipientPhone: "+905551112233",
      channel: "SMS",
      messageType: "LESSON",
      resourceType: "lesson",
      resourceId: "lesson-d-1",
      body: "Dispatch test gövdesi.",
      createdBy: "user_owner_nilufer",
    });
    const res = await dispatchCommunicationMessageTool(adminCtx(), { id: record.id });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("VALIDATION_ERROR");
      expect(res.error.code).not.toBe("INTERNAL_ERROR");
    }
  });

  it("bulunamayan mesaja dispatch NOT_FOUND döner", async () => {
    const res = await dispatchCommunicationMessageTool(adminCtx(), { id: "yok-boyle-id" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("NOT_FOUND");
  });

  it("wa.me derin bağlantısı telefonu ve metni kodlar", () => {
    const url = buildWhatsAppDeepLink("+90 555 111 22 33", "Merhaba, ders 15:00'e alındı.");
    expect(url.startsWith("https://wa.me/905551112233?text=")).toBe(true);
    expect(url).toContain(encodeURIComponent("Merhaba, ders 15:00'e alındı."));
  });
});

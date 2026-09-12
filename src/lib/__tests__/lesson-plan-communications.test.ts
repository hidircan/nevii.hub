import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import { readFileSync } from "fs";
import path from "path";
import {
  LESSON_PLAN_PARENT_TEMPLATE,
  LESSON_PLAN_PREVIEW_VARS,
  LESSON_PLAN_TEACHER_TEMPLATE,
  renderLessonPlanTemplate,
} from "../communications/lesson-plan-templates";
import {
  createCommunicationDraft,
  createLessonPlanCommunicationDrafts,
} from "../communications/service";
import {
  COMMUNICATION_MESSAGES_FILE,
  listCommunicationMessages,
} from "../communications/store";
import { DEFAULT_TENANT_ID } from "../auth/config";

/**
 * P1 (2026-09-11) — ders planı → İletişim Merkezi akışı.
 * Veli (SMS+WhatsApp) + öğretmen (WhatsApp) kayıtları idempotent oluşur;
 * şablon placeholder sistemi gönderim öncesi doğrular.
 */
beforeEach(async () => {
  await fs.rm(COMMUNICATION_MESSAGES_FILE, { force: true });
});

const VARS = { ...LESSON_PLAN_PREVIEW_VARS };

describe("ders planı şablon render", () => {
  it("varsayılan şablonlar örnek değerlerle hatasız render olur", () => {
    const parent = renderLessonPlanTemplate(LESSON_PLAN_PARENT_TEMPLATE, VARS);
    expect(parent.ok).toBe(true);
    if (parent.ok) {
      expect(parent.body).toContain("Örnek Öğrenci");
      expect(parent.body).not.toMatch(/\{[a-zA-ZçÇğĞıİöÖşŞüÜ]+\}/);
    }
    const teacher = renderLessonPlanTemplate(LESSON_PLAN_TEACHER_TEMPLATE, VARS);
    expect(teacher.ok).toBe(true);
  });

  it("bilinmeyen yer tutucu gönderim öncesi reddedilir", () => {
    const res = renderLessonPlanTemplate("Merhaba {veliSoyadi}, ders {dersAdi}.", VARS);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toContain("veliSoyadi");
  });

  it("eksik değer gönderim öncesi reddedilir", () => {
    const res = renderLessonPlanTemplate(LESSON_PLAN_PARENT_TEMPLATE, { ...VARS, saat: "" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toContain("saat");
  });
});

describe("ders planı → iletişim kayıtları", () => {
  const base = {
    tenantId: DEFAULT_TENANT_ID,
    lessonId: "lesson-plan-1",
    createdBy: "user_owner_nilufer",
    vars: VARS,
    parent: { name: "Veli Adı", phone: "+905551112233", studentId: "student-1" },
    teacher: { name: "Öğretmen Adı", phone: "+905554443322", teacherId: "teacher-1" },
  };

  it("veli SMS+WhatsApp, öğretmen WhatsApp kaydı oluşur (toplam 3)", async () => {
    const { records } = await createLessonPlanCommunicationDrafts(base);
    expect(records).toHaveLength(3);
    const channels = records.map((r) => `${r.recipientType}:${r.channel}`).sort();
    expect(channels).toEqual(["PARENT:SMS", "PARENT:WHATSAPP", "TEACHER:WHATSAPP"]);
    for (const r of records) {
      expect(r.messageType).toBe("LESSON");
      expect(r.resourceType).toBe("lesson");
      expect(r.resourceId).toBe("lesson-plan-1");
    }
  });

  it("aynı ders tekrar tetiklenirse duplicate oluşmaz", async () => {
    await createLessonPlanCommunicationDrafts(base);
    const second = await createLessonPlanCommunicationDrafts(base);
    expect(second.records).toHaveLength(3);
    const all = await listCommunicationMessages(DEFAULT_TENANT_ID);
    expect(all).toHaveLength(3);
    expect(second.records.every((r) => r.id === all.find((a) => a.id === r.id)?.id)).toBe(true);
  });

  it("opt-out'lu veli kaydolarak `blocked` düşer (kaybolmaz)", async () => {
    const { records } = await createLessonPlanCommunicationDrafts({
      ...base,
      lessonId: "lesson-plan-optout",
      parent: { ...base.parent, optOut: true },
    });
    const parentRecords = records.filter((r) => r.recipientType === "PARENT");
    expect(parentRecords.length).toBeGreaterThan(0);
    for (const r of parentRecords) {
      expect(r.status).toBe("blocked");
      expect(r.blockedReasonCode).toBe("opt_out");
    }
  });

  it("kuyruk bileşeninde durum sekmeleri var (Bekleyen/Taslak/Gönderildi/Başarısız/Engellendi/Tümü)", () => {
    const code = readFileSync(
      path.resolve(import.meta.dirname, "../../components/communication-queue.tsx"),
      "utf-8"
    );
    for (const label of ["Bekleyen", "Taslak", "Gönderildi", "Başarısız", "Engellendi", "Tümü"]) {
      expect(code).toContain(label);
    }
    expect(code).toContain("role=\"tablist\"");
  });

  it("idempotency anahtarı ders+alıcı+kanal+tip içerir", async () => {
    const { records } = await createLessonPlanCommunicationDrafts({ ...base, lessonId: "lesson-plan-key" });
    for (const r of records) {
      expect(r.idempotencyKey).toContain("lesson-plan-key");
      expect(r.idempotencyKey).toContain(r.channel);
    }
    // Doğrudan aynı anahtarla ikinci taslak → yeni kayıt yok.
    const again = await createCommunicationDraft({
      tenantId: DEFAULT_TENANT_ID,
      recipientType: "PARENT",
      recipientId: "student-1",
      recipientName: "Veli Adı",
      recipientPhone: "+905551112233",
      channel: "SMS",
      messageType: "LESSON",
      resourceType: "lesson",
      resourceId: "lesson-plan-key",
      body: "farklı gövde",
      createdBy: "user_owner_nilufer",
      idempotencySuffix: "plan",
    });
    expect(again.created).toBe(false);
  });
});

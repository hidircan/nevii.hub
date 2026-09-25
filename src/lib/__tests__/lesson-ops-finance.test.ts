import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { createLessonTool, setLessonOpsFlagTool, cancelLessonTool, collectAttendanceCalendarPaymentTool } from "../services/tools";
import { readData } from "../store";
import { STUDENT_CONTRACTS_FILE } from "../contracts";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import { applyLessonOpsFlag } from "../lesson-ops";
import { findOpenLessonSlot } from "./helpers/lesson-slot";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

function ctx(overrides?: Partial<ServiceContext>): ServiceContext {
  return {
    role: "SCHOOL_ADMIN",
    userId: "u1",
    tenantId: DEFAULT_TENANT_ID,
    channel: "web",
    ...overrides,
  };
}

beforeEach(async () => {
  // Sözleşmesiz öğrenci varsayımı: önceki test dosyalarının sözleşmeleri taşınmasın (takvim tahsilatı sözleşme varken serbest satır açmaz).
  await fs.rm(STUDENT_CONTRACTS_FILE, { force: true });
  await fs.rm(DATA_FILE, { force: true });
});

async function createTestLesson(): Promise<string> {
  const data = await readData();
  const startAt = await findOpenLessonSlot(data, "s1", "t1", "r1");
  const res = await createLessonTool(ctx(), {
    studentId: "s1",
    teacherId: "t1",
    roomId: "r1",
    instrument: "Piyano",
    startAt,
  });
  if (!res.ok) throw new Error(res.error.message);
  return res.data.lessonId;
}

/**
 * Package B — yoklama (Geldi/İşlendi/Telafi) hiçbir zaman Payment
 * oluşturmaz/değiştirmez; öğrenci aylık paket ücretiyle öder (source:
 * "monthly_plan", ayrı akış). Eski "ders bazlı otomatik tahsilat"
 * (`computeLessonChargeAmount`/`createLessonPaymentIfMissing`) kaldırıldı.
 */
describe("Geldi/İşlendi/Telafi — artık hiçbir Payment üretmez (Package B)", () => {
  it("Geldi işaretlenince yeni lesson_ops Payment oluşmaz", async () => {
    const lessonId = await createTestLesson();
    const before = await readData();
    expect(before.payments.filter((p) => p.lessonId === lessonId)).toHaveLength(0);

    const res = await setLessonOpsFlagTool(ctx(), { lessonId, flag: "attended" });
    expect(res.ok).toBe(true);

    const after = await readData();
    expect(after.payments.filter((p) => p.lessonId === lessonId)).toHaveLength(0);
  });

  it("İşlendi işaretlenince (Geldi olmadan) yeni lesson_ops Payment oluşmaz", async () => {
    const lessonId = await createTestLesson();
    const res = await setLessonOpsFlagTool(ctx(), { lessonId, flag: "processed", reason: "Ders fiilen işlendi" });
    expect(res.ok).toBe(true);

    const after = await readData();
    expect(after.payments.filter((p) => p.lessonId === lessonId)).toHaveLength(0);
  });

  it("Telafi işaretlenince yeni lesson_ops Payment oluşmaz — eski telafiChargesOnFlag ayarı kaldırıldı, ayar ne olursa olsun sonuç aynı", async () => {
    const lessonId = await createTestLesson();
    const data = await readData();
    // Eski ayar tipi artık şemadan kaldırıldı; herhangi bir ekstra alan
    // (legacy persisted veri) olsa bile davranış değişmemeli.
    const withLegacySetting = {
      ...data,
      settings: {
        ...data.settings,
        collectionsSettings: {
          ...(data.settings.collectionsSettings ?? { frequencyLimitDays: 3, autoSendEnabled: false }),
          telafiChargesOnFlag: true,
        },
      },
    };
    const result = applyLessonOpsFlag(withLegacySetting, lessonId, "makeup", "u1", undefined, "Öğrenci hastaydı");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.payments.filter((p) => p.lessonId === lessonId)).toHaveLength(0);
  });

  it("Geldi -> İşlendi geçişinde (confirmSwitch) hiç Payment oluşmaz", async () => {
    const lessonId = await createTestLesson();
    await setLessonOpsFlagTool(ctx(), { lessonId, flag: "attended" });
    const processed = await setLessonOpsFlagTool(ctx(), { lessonId, flag: "processed", confirmSwitch: true, reason: "Ders fiilen işlendi" });
    expect(processed.ok).toBe(true);

    const after = await readData();
    expect(after.payments.filter((p) => p.lessonId === lessonId)).toHaveLength(0);
  });

  it("aynı statüye tekrar tıklama (idempotent toggle) hiç Payment oluşturmaz", async () => {
    const lessonId = await createTestLesson();
    await setLessonOpsFlagTool(ctx(), { lessonId, flag: "attended" });
    const second = await setLessonOpsFlagTool(ctx(), { lessonId, flag: "attended" });
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.data.alreadySet).toBe(true);

    const after = await readData();
    expect(after.payments.filter((p) => p.lessonId === lessonId)).toHaveLength(0);
  });

  it("gerçekleşen telafi dersinin KENDİSİ Geldi/İşlendi işaretlense bile yeni Payment oluşmaz", async () => {
    const sourceLessonId = await createTestLesson();
    const makeupRes = await setLessonOpsFlagTool(ctx(), { lessonId: sourceLessonId, flag: "makeup", reason: "Öğrenci hastaydı" });
    expect(makeupRes.ok).toBe(true);
    const afterMakeup = await readData();
    expect(afterMakeup.payments.filter((p) => p.lessonId === sourceLessonId)).toHaveLength(0);

    const realizedMakeupStartAt = await findOpenLessonSlot(afterMakeup, "s1", "t1", "r1");
    const realizedLesson = await createLessonTool(ctx(), {
      studentId: "s1",
      teacherId: "t1",
      roomId: "r1",
      instrument: "Piyano",
      startAt: realizedMakeupStartAt,
    });
    expect(realizedLesson.ok).toBe(true);
    if (!realizedLesson.ok) return;
    const realizedProcessed = await setLessonOpsFlagTool(ctx(), {
      lessonId: realizedLesson.data.lessonId,
      flag: "processed",
      reason: "Ders fiilen işlendi",
    });
    expect(realizedProcessed.ok).toBe(true);

    const final = await readData();
    expect(final.payments.filter((p) => p.lessonId === realizedLesson.data.lessonId)).toHaveLength(0);
  });

  it("iki farklı ders için de hiçbir Payment oluşmaz — birbirini etkilemez", async () => {
    const lessonId1 = await createTestLesson();
    const data = await readData();
    const startAt2 = await findOpenLessonSlot(data, "s1", "t1", "r1");
    const created2 = await createLessonTool(ctx(), {
      studentId: "s1",
      teacherId: "t1",
      roomId: "r1",
      instrument: "Piyano",
      startAt: startAt2,
    });
    expect(created2.ok).toBe(true);
    if (!created2.ok) return;
    const lessonId2 = created2.data.lessonId;

    await setLessonOpsFlagTool(ctx(), { lessonId: lessonId1, flag: "attended" });
    await setLessonOpsFlagTool(ctx(), { lessonId: lessonId2, flag: "attended" });

    const after = await readData();
    expect(after.payments.filter((p) => p.lessonId === lessonId1)).toHaveLength(0);
    expect(after.payments.filter((p) => p.lessonId === lessonId2)).toHaveLength(0);
  });
});

describe("Geçmiş lesson_ops Payment kayıtları — dokunulmadan okunabilir kalır", () => {
  it("store'da önceden var olan (Package B öncesi simüle) lesson_ops kaydı yoklama işlemiyle silinmez/değişmez", async () => {
    const lessonId = await createTestLesson();
    // Package B öncesi otomatik oluşmuş olabilecek tarihsel bir kaydı simüle et.
    const data = await readData();
    const historicalPayment = {
      id: "pay_historical_lesson_ops",
      studentId: "s1",
      amount: 500,
      paidAmount: 0,
      status: "pending" as const,
      dueDate: new Date().toISOString(),
      description: "Ders ücreti — tarihsel (Package B öncesi)",
      lessonId,
      source: "lesson_ops" as const,
      createdAt: new Date().toISOString(),
    };
    const { writeData } = await import("../store-json");
    await writeData({ ...data, payments: [...data.payments, historicalPayment] });

    // Aynı ders üzerinde yeni bir yoklama işlemi (statü değişimi) yap.
    const res = await setLessonOpsFlagTool(ctx(), { lessonId, flag: "processed", confirmSwitch: true, reason: "Ders fiilen işlendi" });
    expect(res.ok).toBe(true);

    const after = await readData();
    const stillThere = after.payments.find((p) => p.id === "pay_historical_lesson_ops");
    expect(stillThere).toBeDefined();
    expect(stillThere?.amount).toBe(500);
    expect(stillThere?.status).toBe("pending");
    // Hâlâ tek kayıt — yeni bir lesson_ops kaydı EKLENMEDİ.
    expect(after.payments.filter((p) => p.lessonId === lessonId && p.source === "lesson_ops")).toHaveLength(1);
  });
});

describe("monthly_plan ve manual Payment akışları — Package B'den etkilenmez", () => {
  it("Yoklama Takvimi ay kutusu tahsilat akışı çalışmaya devam eder", async () => {
    const res = await collectAttendanceCalendarPaymentTool(ctx(), { studentId: "s1", month: "2026-09", amount: 3000 });
    expect(res.ok).toBe(true);

    const data = await readData();
    const row = data.payments.find((p) => p.studentId === "s1" && p.source === "monthly_plan");
    expect(row).toBeDefined();
    expect(row?.amount).toBe(3000);
    expect(row?.status).toBe("paid");
  });
});

describe("Ders iptali — yoklama akışından doğmayan geçmiş kaydı yanlışlıkla void etmez", () => {
  it("Geldi işaretlenmiş ama Package B ile artık Payment üretilmediği için iptal, o dersin (var olmayan) lesson_ops kaydını voidlemez", async () => {
    const lessonId = await createTestLesson();
    await setLessonOpsFlagTool(ctx(), { lessonId, flag: "attended" });
    const beforeCancel = await readData();
    expect(beforeCancel.payments.filter((p) => p.lessonId === lessonId)).toHaveLength(0);

    const cancelRes = await cancelLessonTool(ctx(), { lessonId });
    expect(cancelRes.ok).toBe(true);

    const after = await readData();
    expect(after.payments.filter((p) => p.lessonId === lessonId)).toHaveLength(0);
  });

  it("iptal edilen dersin GEÇMİŞ (Package B öncesi simüle) ödenmemiş lesson_ops kaydı yine voided olur — davranış korunur", async () => {
    const lessonId = await createTestLesson();
    const data = await readData();
    const historicalPayment = {
      id: "pay_historical_cancel",
      studentId: "s1",
      amount: 500,
      paidAmount: 0,
      status: "pending" as const,
      dueDate: new Date().toISOString(),
      description: "Ders ücreti — tarihsel",
      lessonId,
      source: "lesson_ops" as const,
      createdAt: new Date().toISOString(),
    };
    const { writeData } = await import("../store-json");
    await writeData({ ...data, payments: [...data.payments, historicalPayment] });

    const cancelRes = await cancelLessonTool(ctx(), { lessonId });
    expect(cancelRes.ok).toBe(true);

    const after = await readData();
    const voided = after.payments.find((p) => p.id === "pay_historical_cancel");
    expect(voided?.status).toBe("voided");
  });

  it("ödenmiş (paidAmount>0) geçmiş bir kayıt iptal ile asla otomatik voidlenmez", async () => {
    const lessonId = await createTestLesson();
    const data = await readData();
    const paidHistorical = {
      id: "pay_historical_paid",
      studentId: "s1",
      amount: 500,
      paidAmount: 500,
      status: "paid" as const,
      dueDate: new Date().toISOString(),
      description: "Ders ücreti — tarihsel, zaten ödenmiş",
      lessonId,
      source: "lesson_ops" as const,
      createdAt: new Date().toISOString(),
    };
    const { writeData } = await import("../store-json");
    await writeData({ ...data, payments: [...data.payments, paidHistorical] });

    const cancelRes = await cancelLessonTool(ctx(), { lessonId });
    expect(cancelRes.ok).toBe(true);

    const after = await readData();
    const stillPaid = after.payments.find((p) => p.id === "pay_historical_paid");
    expect(stillPaid?.status).toBe("paid");
    expect(stillPaid?.paidAmount).toBe(500);
  });
});

describe("Mali ayrım — RBAC (mevcut setLessonOpsFlagTool kurallarını miras alır)", () => {
  it("PARENT/STUDENT yoklama işaretleyemez, dolayısıyla mali kayıt da tetiklenmez", async () => {
    const lessonId = await createTestLesson();
    const res = await setLessonOpsFlagTool(ctx({ role: "STUDENT", studentId: "s1" }), {
      lessonId,
      flag: "attended",
    });
    expect(res.ok).toBe(false);

    const after = await readData();
    expect(after.payments.filter((p) => p.lessonId === lessonId)).toHaveLength(0);
  });

  it("başka bir öğretmen (IDOR) yoklama işaretleyemez, mali kayıt tetiklenmez", async () => {
    const lessonId = await createTestLesson(); // t1'e ait
    const res = await setLessonOpsFlagTool(ctx({ role: "TEACHER", teacherId: "t2", userId: "teacher2" }), {
      lessonId,
      flag: "attended",
    });
    expect(res.ok).toBe(false);

    const after = await readData();
    expect(after.payments.filter((p) => p.lessonId === lessonId)).toHaveLength(0);
  });
});

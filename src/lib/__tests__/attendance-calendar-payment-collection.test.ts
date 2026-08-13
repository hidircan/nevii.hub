import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import {
  createLessonTool,
  setLessonOpsFlagTool,
  createPaymentTool,
  getAttendanceCalendarMonthTool,
  cancelLessonTool,
} from "../services/tools";
import { readData } from "../store";
import { writeData } from "../store-json";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import type { Payment } from "../types";
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
 * Package B — yoklama (Geldi/İşlendi/Telafi) artık hiçbir Payment
 * oluşturmaz. Bu dosyanın testleri Yoklama Takvimi'nin GEÇMİŞ bir
 * `lesson_ops` Payment'ı (Package B öncesi otomatik oluşmuş olabilecek türde,
 * burada `writeData` ile simüle edilir) nasıl gösterdiğini/tahsil ettiğini
 * doğrular — takvimin "Tahsil Et" akışı hâlâ Ödemeler ekranıyla AYNI
 * `createPaymentTool`/`markPaymentPaid` yolunu kullanır, yeni bir tahsilat
 * yolu YOK. Yeni yoklama işlemlerinin Payment ÜRETMEDİĞİ ayrıca burada da
 * tekrar doğrulanır.
 */
async function seedLessonPayment(lessonId: string, studentId: string, amount = 500): Promise<Payment> {
  const data = await readData();
  const lesson = data.lessons.find((l) => l.id === lessonId)!;
  const payment: Payment = {
    id: `pay_seed_${lessonId}`,
    studentId,
    amount,
    paidAmount: 0,
    status: "pending",
    dueDate: new Date(lesson.startAt).toISOString(),
    description: "Ders ücreti — tarihsel (Package B öncesi simülasyon)",
    lessonId,
    source: "lesson_ops",
    createdAt: new Date().toISOString(),
  };
  await writeData({ ...data, payments: [...data.payments, payment] });
  return payment;
}

describe("Yoklama Takvimi — yeni Geldi/İşlendi/Telafi işlemleri artık Payment üretmez (Package B)", () => {
  it("Geldi işaretlenince takvimde payments boş kalır", async () => {
    const lessonId = await createTestLesson();
    await setLessonOpsFlagTool(ctx(), { lessonId, flag: "attended" });

    const data = await readData();
    const lesson = data.lessons.find((l) => l.id === lessonId)!;
    const [y, m] = lesson.startAt.slice(0, 7).split("-").map(Number);
    const monthRes = await getAttendanceCalendarMonthTool(ctx(), { studentId: "s1", year: y!, month: m! });
    expect(monthRes.ok).toBe(true);
    if (!monthRes.ok) return;
    const day = monthRes.data.days.find((d) => d.date === lesson.startAt.slice(0, 10))!;
    expect(day.payments).toHaveLength(0);
  });

  it("Telafi tek başına tahsilat oluşturmaz — takvimde payments boş kalır", async () => {
    const lessonId = await createTestLesson();
    const res = await setLessonOpsFlagTool(ctx(), { lessonId, flag: "makeup" });
    expect(res.ok).toBe(true);

    const data = await readData();
    const lesson = data.lessons.find((l) => l.id === lessonId)!;
    const [y, m] = lesson.startAt.slice(0, 7).split("-").map(Number);
    const monthRes = await getAttendanceCalendarMonthTool(ctx(), { studentId: "s1", year: y!, month: m! });
    expect(monthRes.ok).toBe(true);
    if (!monthRes.ok) return;
    const day = monthRes.data.days.find((d) => d.date === lesson.startAt.slice(0, 10))!;
    expect(day.payments).toHaveLength(0);
  });
});

describe("Yoklama Takvimi'nden tahsilat — GEÇMİŞ lesson_ops kaydı üzerinde mevcut Payment altyapısıyla iki yönlü senkron", () => {
  it("takvimden dönen paymentId, aynı öğrenci/tenant/kaynak derse bağlı gerçek bir Payment'tır", async () => {
    const lessonId = await createTestLesson();
    const seeded = await seedLessonPayment(lessonId, "s1");

    const data = await readData();
    const lesson = data.lessons.find((l) => l.id === lessonId)!;
    const [y, m] = lesson.startAt.slice(0, 7).split("-").map(Number);
    const monthRes = await getAttendanceCalendarMonthTool(ctx(), { studentId: "s1", year: y!, month: m! });
    expect(monthRes.ok).toBe(true);
    if (!monthRes.ok) return;
    const day = monthRes.data.days.find((d) => d.date === lesson.startAt.slice(0, 10))!;
    expect(day.payments).toHaveLength(1);
    const calendarPayment = day.payments[0]!;
    expect(calendarPayment.lessonId).toBe(lessonId);
    expect(calendarPayment.status).not.toBe("paid");

    const realPayment = data.payments.find((p) => p.id === calendarPayment.paymentId);
    expect(realPayment).toBeDefined();
    expect(realPayment?.id).toBe(seeded.id);
    expect(realPayment?.studentId).toBe("s1");
    expect(realPayment?.lessonId).toBe(lessonId);
  });

  it("takvimdeki paymentId üzerinden createPaymentTool (Ödemeler ekranıyla AYNI tool) çağrılınca takvim anında 'paid' gösterir", async () => {
    const lessonId = await createTestLesson();
    await seedLessonPayment(lessonId, "s1");

    const data = await readData();
    const lesson = data.lessons.find((l) => l.id === lessonId)!;
    const [y, m] = lesson.startAt.slice(0, 7).split("-").map(Number);
    const before = await getAttendanceCalendarMonthTool(ctx(), { studentId: "s1", year: y!, month: m! });
    if (!before.ok) throw new Error("setup failed");
    const paymentId = before.data.days.find((d) => d.date === lesson.startAt.slice(0, 10))!.payments[0]!.paymentId;

    const payRes = await createPaymentTool(ctx(), { paymentId });
    expect(payRes.ok).toBe(true);

    const after = await getAttendanceCalendarMonthTool(ctx(), { studentId: "s1", year: y!, month: m! });
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    const day = after.data.days.find((d) => d.date === lesson.startAt.slice(0, 10))!;
    expect(day.payments[0]!.status).toBe("paid");
    expect(day.payments[0]!.paidAmount).toBe(day.payments[0]!.amount);
  });

  it("aynı paymentId ile ikinci kez tahsil çağrısı çift tahsilata yol açmaz (idempotent — tutar iki katına çıkmaz)", async () => {
    const lessonId = await createTestLesson();
    const payment = await seedLessonPayment(lessonId, "s1");

    const first = await createPaymentTool(ctx(), { paymentId: payment.id });
    expect(first.ok).toBe(true);
    const second = await createPaymentTool(ctx(), { paymentId: payment.id });
    expect(second.ok).toBe(true);

    const after = await readData();
    const finalPayment = after.payments.find((p) => p.id === payment.id)!;
    expect(finalPayment.status).toBe("paid");
    expect(finalPayment.paidAmount).toBe(finalPayment.amount);
  });

  it("iptal edilen (voided) bir ders için mevcut otomatik void korunur — takvimde 'voided' görünür, yeniden tahsil edilemez görünmeli", async () => {
    const lessonId = await createTestLesson();
    await seedLessonPayment(lessonId, "s1");
    const data = await readData();
    const lesson = data.lessons.find((l) => l.id === lessonId)!;

    const cancelRes = await cancelLessonTool(ctx(), { lessonId });
    expect(cancelRes.ok).toBe(true);

    const [y, m] = lesson.startAt.slice(0, 7).split("-").map(Number);
    const monthRes = await getAttendanceCalendarMonthTool(ctx(), { studentId: "s1", year: y!, month: m! });
    expect(monthRes.ok).toBe(true);
    if (!monthRes.ok) return;
    const day = monthRes.data.days.find((d) => d.date === lesson.startAt.slice(0, 10))!;
    expect(day.payments[0]!.status).toBe("voided");
  });

  it("TEACHER/PARENT rolü tahsilat işaretleyemez (RBAC — mevcut finans yetki modeli)", async () => {
    const lessonId = await createTestLesson();
    const payment = await seedLessonPayment(lessonId, "s1");

    const teacherRes = await createPaymentTool(ctx({ role: "TEACHER", teacherId: "t1" }), { paymentId: payment.id });
    expect(teacherRes.ok).toBe(false);
    if (!teacherRes.ok) expect(teacherRes.error.code).toBe("FORBIDDEN");

    const parentRes = await createPaymentTool(ctx({ role: "PARENT", studentId: "s1" }), { paymentId: payment.id });
    expect(parentRes.ok).toBe(false);
  });
});

/**
 * Yoklama Takvimi tahsilat akışında ödeme yöntemi seçimi — takvim panelinin
 * "Tahsil Et" akışı Ödemeler ekranıyla AYNI `createPaymentTool`/`markPaymentPaid`
 * yolunu kullanır; burada yalnızca `method` girdisinin doğru yazıldığını ve
 * girilmediğinde mevcut güvenli varsayılan zincirinin (payment.method ??
 * student.paymentMethod ?? "Havale") bozulmadığını doğruluyoruz. Payment,
 * Geldi/İşlendi'den değil (Package B) `seedLessonPayment` ile (geçmiş kayıt
 * simülasyonu) üretilir.
 */
describe("Yoklama Takvimi'nden tahsilat — ödeme yöntemi seçimi", () => {
  async function setStudentPaymentMethod(studentId: string, method: string) {
    const data = await readData();
    const students = data.students.map((s) => (s.id === studentId ? { ...s, paymentMethod: method as never } : s));
    await writeData({ ...data, students });
  }

  it("öğrencinin kayıtlı paymentMethod değeri, takvimin döndürdüğü ödeme bilgisinde varsayılan olarak görünür", async () => {
    await setStudentPaymentMethod("s1", "cash");
    const lessonId = await createTestLesson();
    await seedLessonPayment(lessonId, "s1");

    const data = await readData();
    const lesson = data.lessons.find((l) => l.id === lessonId)!;
    const [y, m] = lesson.startAt.slice(0, 7).split("-").map(Number);
    const monthRes = await getAttendanceCalendarMonthTool(ctx(), { studentId: "s1", year: y!, month: m! });
    expect(monthRes.ok).toBe(true);
    if (!monthRes.ok) return;
    const day = monthRes.data.days.find((d) => d.date === lesson.startAt.slice(0, 10))!;
    expect(day.payments[0]!.method).toBe("cash");
    expect(day.payments[0]!.methodIsStudentDefault).toBe(true);
  });

  it("kullanıcının seçtiği ödeme yöntemi tahsilat kaydına yazılır", async () => {
    await setStudentPaymentMethod("s1", "cash");
    const lessonId = await createTestLesson();
    const payment = await seedLessonPayment(lessonId, "s1");

    const res = await createPaymentTool(ctx(), { paymentId: payment.id, method: "credit_card" });
    expect(res.ok).toBe(true);

    const after = await readData();
    const finalPayment = after.payments.find((p) => p.id === payment.id)!;
    expect(finalPayment.status).toBe("paid");
    expect(finalPayment.method).toBe("credit_card");
  });

  it("kullanıcı yöntem seçmeden kaydederse öğrencinin varsayılanı kullanılır", async () => {
    await setStudentPaymentMethod("s1", "transfer");
    const lessonId = await createTestLesson();
    const payment = await seedLessonPayment(lessonId, "s1");

    const res = await createPaymentTool(ctx(), { paymentId: payment.id });
    expect(res.ok).toBe(true);

    const after = await readData();
    const finalPayment = after.payments.find((p) => p.id === payment.id)!;
    expect(finalPayment.method).toBe("transfer");
  });

  it("öğrencinin varsayılan yöntemi yoksa mevcut güvenli davranış (fallback) korunur", async () => {
    const lessonId = await createTestLesson();
    const payment = await seedLessonPayment(lessonId, "s1");
    const data = await readData();
    expect(data.students.find((s) => s.id === "s1")?.paymentMethod).toBeUndefined();

    const res = await createPaymentTool(ctx(), { paymentId: payment.id });
    expect(res.ok).toBe(true);

    const after = await readData();
    const finalPayment = after.payments.find((p) => p.id === payment.id)!;
    expect(finalPayment.method).toBe("transfer");
  });

  it("geçersiz bir ödeme yöntemi değeri reddedilir", async () => {
    const lessonId = await createTestLesson();
    const payment = await seedLessonPayment(lessonId, "s1");

    const res = await createPaymentTool(ctx(), { paymentId: payment.id, method: "bitcoin" });
    expect(res.ok).toBe(false);
  });
});

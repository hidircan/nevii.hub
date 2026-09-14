import { z } from "zod";
import { readData } from "../store";
import { buildReceiptViewModel, canViewReceipt, receiptIneligibleReason } from "../receipt";
import type { MakeupRequest, MakeupSlot } from "../types";
import { assertStudentAccess, canAccessStudent, requireRole, type ServiceContext } from "./context";
import { fail, ok, type ServiceResult } from "./result";

/**
 * Mobil P0 salt-okunur tool'ları (GET /api/v1/makeup, GET /api/v1/payments/:id/receipt).
 * Kapsam YALNIZ oturumdan çözülür — istemci teacherId/studentId/tenantId göndermez.
 * Yazma yok. BRANCH_MANAGER (unified preset'te efektif SCHOOL_ADMIN dahil),
 * HYPER_ADMIN ve AI_AGENT mobil persona'sı olmadığı için fail-closed.
 */
function isMobileExcluded(ctx: ServiceContext): boolean {
  return ctx.loginRole === "BRANCH_MANAGER" || ctx.role === "BRANCH_MANAGER";
}

export type MakeupRequestView = {
  id: string;
  studentId: string;
  studentName?: string;
  teacherId: string;
  teacherName?: string;
  instrument: string;
  sourceLessonId: string;
  sourceLessonStartAt?: string;
  status: MakeupRequest["status"];
  reason: string;
  expiresAt: string;
  policyNote: string;
  suggestedSlots: MakeupSlot[];
  confirmedLessonId?: string;
  confirmedLessonStartAt?: string;
  createdAt: string;
};

export async function listMakeupRequestsTool(
  ctx: ServiceContext
): Promise<ServiceResult<{ makeupRequests: MakeupRequestView[] }>> {
  const auth = requireRole(ctx, ["TEACHER", "STUDENT", "SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok || isMobileExcluded(ctx)) return fail("FORBIDDEN", "Bu hesap telafi listesine erişemez.");

  const data = await readData();
  let rows: MakeupRequest[];
  if (ctx.role === "TEACHER") {
    if (!ctx.teacherId) return fail("FORBIDDEN", "Öğretmen kimliği bulunamadı.");
    rows = data.makeupRequests.filter((m) => m.teacherId === ctx.teacherId);
  } else if (ctx.role === "STUDENT") {
    // Öğrenci (SELF) ve veli (GUARDIAN): yalnız aktif StudentPortalAccess ile doğrulanan öğrenciler.
    const allowed = new Set<string>();
    for (const studentId of new Set(data.makeupRequests.map((m) => m.studentId))) {
      if (await canAccessStudent(ctx, studentId)) allowed.add(studentId);
    }
    rows = data.makeupRequests.filter((m) => allowed.has(m.studentId));
  } else {
    rows = data.makeupRequests;
  }

  const studentName = new Map(data.students.map((s) => [s.id, s.name]));
  const teacherName = new Map(data.teachers.map((t) => [t.id, t.name]));
  const lessonStart = new Map(data.lessons.map((l) => [l.id, l.startAt]));

  const makeupRequests = rows
    .map(
      (m): MakeupRequestView => ({
        id: m.id,
        studentId: m.studentId,
        studentName: studentName.get(m.studentId),
        teacherId: m.teacherId,
        teacherName: teacherName.get(m.teacherId),
        instrument: m.instrument,
        sourceLessonId: m.sourceLessonId,
        sourceLessonStartAt: lessonStart.get(m.sourceLessonId),
        status: m.status,
        reason: m.reason,
        expiresAt: m.expiresAt,
        policyNote: m.policyNote,
        suggestedSlots: m.suggestedSlots,
        confirmedLessonId: m.confirmedLessonId,
        confirmedLessonStartAt: m.confirmedLessonId ? lessonStart.get(m.confirmedLessonId) : undefined,
        createdAt: m.createdAt,
      })
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return ok({ makeupRequests });
}

export type PaymentReceiptView = {
  eligible: boolean;
  ineligibleReason?: string;
  receipt?: {
    reference: string;
    institutionName: string;
    branchName?: string;
    studentName: string;
    parentLine?: string;
    description: string;
    amount: number;
    paymentDateIso: string;
    method?: string;
  };
};

/** Web `/makbuz/[paymentId]` ile aynı kural: yalnız tamamen ödenmiş kayıt; STUDENT yalnız bağlı öğrencisinin ödemesi. */
export async function getPaymentReceiptTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<PaymentReceiptView>> {
  const auth = requireRole(ctx, ["STUDENT", "SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok || isMobileExcluded(ctx)) return fail("FORBIDDEN", "Bu hesap makbuz görüntüleyemez.");

  const v = z.object({ paymentId: z.string().min(1) }).safeParse(input);
  if (!v.success) return fail("VALIDATION_ERROR", "Geçersiz ödeme kimliği.");

  const data = await readData();
  const payment = data.payments.find((p) => p.id === v.data.paymentId);
  if (!payment) return fail("NOT_FOUND", "Ödeme kaydı bulunamadı.");

  const student = data.students.find((s) => s.id === payment.studentId);
  if (ctx.role === "STUDENT") {
    const access = await assertStudentAccess(ctx, student, payment.studentId);
    if (!access.ok) return fail(access.code, access.message);
  }

  if (!canViewReceipt(payment)) {
    return ok({ eligible: false, ineligibleReason: receiptIneligibleReason(payment) ?? undefined });
  }
  if (!student) return fail("NOT_FOUND", "Bu ödemeye bağlı öğrenci kaydı bulunamadı.");

  const branch = data.settings.branches.find((b) => b.id === student.branchId);
  const model = buildReceiptViewModel(payment, student, data.settings, branch);
  return ok({
    eligible: true,
    receipt: {
      reference: model.reference,
      institutionName: model.institutionName,
      branchName: model.branchName,
      studentName: model.studentName,
      parentLine: model.parentLine,
      description: model.description,
      amount: model.amount,
      paymentDateIso: model.paymentDateIso,
      method: model.method,
    },
  });
}

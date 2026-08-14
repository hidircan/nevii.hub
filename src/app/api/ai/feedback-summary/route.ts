import { z } from "zod";
import { withApiHandler } from "@/lib/api/handler";
import { ok, fail } from "@/lib/services/result";
import { planAiInvocation } from "@/lib/ai/plan-invocation";
import { executeWithProvider } from "@/lib/ai/provider-bridge";
import { recordAiAuditLog } from "@/lib/ai/audit-hook";
import { getCapability } from "@/lib/ai/capabilities";
import { uid } from "@/lib/utils";
import { listTeacherFeedback } from "@/lib/teacher-feedback";
import { listStudentFeedback } from "@/lib/student-feedback";
import { computeFeedbackSummaryStats, formatDeterministicFeedbackSummary } from "@/lib/feedback-summary";
import { TEACHER_FEEDBACK_CRITERIA } from "@/lib/teacher-feedback";
import { STUDENT_FEEDBACK_CRITERIA } from "@/lib/student-feedback";

export const dynamic = "force-dynamic";

const CAPABILITY_ID = "feedbackSummary" as const;

const bodySchema = z.object({
  subject: z.enum(["teacher", "student"]),
  /** teacherId (subject:"teacher") veya studentId (subject:"student") — ctx.tenantId ile birlikte kapsamlanır. */
  subjectId: z.string().min(1),
});

/**
 * POST /api/ai/feedback-summary — yalnızca SCHOOL_ADMIN/SUPER_ADMIN, yalnızca
 * açık düğme tetiklemesiyle (otomatik çalışmaz). AI'a yalnızca deterministik
 * olarak hesaplanmış toplulaştırılmış istatistik gönderilir — ham yorum,
 * isim, telefon, studentId/submittedBy asla prompt'a girmez.
 */
export const POST = withApiHandler(async ({ ctx, body }) => {
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return fail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Geçersiz istek");
  const { subject, subjectId } = parsed.data;

  const apiContext = { callerRole: ctx.role, tenantId: ctx.tenantId, operation: "feedback-summary" };
  const plan = planAiInvocation(CAPABILITY_ID, apiContext);
  if (!plan.allowed) return fail("FORBIDDEN", plan.reason);

  const criteriaDefs = subject === "teacher" ? TEACHER_FEEDBACK_CRITERIA : STUDENT_FEEDBACK_CRITERIA;
  const criteriaKeys = criteriaDefs.map((c) => c.key);
  const criteriaLabels = Object.fromEntries(criteriaDefs.map((c) => [c.key, c.label]));

  const rows =
    subject === "teacher"
      ? await listTeacherFeedback(ctx.tenantId, subjectId)
      : await listStudentFeedback(ctx.tenantId, { studentId: subjectId });

  const stats = computeFeedbackSummaryStats(rows, criteriaKeys);

  if (!stats.eligible) {
    // Eşik altı — AI'a hiç gitmez, deterministik uyarı döner.
    return ok({
      summary: formatDeterministicFeedbackSummary(stats, criteriaLabels),
      responseCount: stats.responseCount,
      eligible: false,
    });
  }

  const invocationId = uid("aiaudit");
  const t0 = Date.now();
  const capability = getCapability(CAPABILITY_ID);
  const prompt = capability?.description ?? CAPABILITY_ID;
  // Prompt bağlamı: yalnız sayısal/toplulaştırılmış istatistik — hiçbir ham
  // yorum, isim veya kimlik alanı yok.
  const aiContext = {
    criteriaAverages: stats.criteriaAverages,
    criteriaLabels,
    responseCount: stats.responseCount,
    commentCount: stats.commentCount,
    themes: stats.themes,
    subject,
  };

  try {
    const execution = await executeWithProvider(CAPABILITY_ID, { prompt, context: aiContext }, { ...apiContext, invocationId });
    // Gerçek bir LLM yoksa (heuristic'e düştüyse) heuristic'in genel amaçlı
    // metni yerine kendi deterministik 5-başlıklı formatımızı kullan —
    // "AI uydurması yapma" kuralı heuristic'in kapsamadığı bir yapı için de geçerli.
    const summary =
      execution.provider === "heuristic"
        ? formatDeterministicFeedbackSummary(stats, criteriaLabels)
        : execution.result.text;

    await recordAiAuditLog({
      id: invocationId,
      tenantId: ctx.tenantId,
      capabilityId: CAPABILITY_ID,
      callerRole: ctx.role,
      chosenProvider: execution.provider,
      usedFallback: execution.usedFallback,
      success: true,
      durationMs: Date.now() - t0,
      approvalStatus: "not_required",
    });

    return ok({ summary, responseCount: stats.responseCount, eligible: true });
  } catch (error) {
    await recordAiAuditLog({
      id: invocationId,
      tenantId: ctx.tenantId,
      capabilityId: CAPABILITY_ID,
      callerRole: ctx.role,
      chosenProvider: plan.chosenProvider,
      usedFallback: false,
      success: false,
      errorMessage: error instanceof Error ? error.message : "AI çağrısı başarısız oldu.",
      durationMs: Date.now() - t0,
      approvalStatus: "not_required",
    });
    // AI tamamen başarısız olsa bile deterministik özet döner — kullanıcı boş elle kalmaz.
    return ok({
      summary: formatDeterministicFeedbackSummary(stats, criteriaLabels),
      responseCount: stats.responseCount,
      eligible: true,
      aiFailed: true,
    });
  }
});

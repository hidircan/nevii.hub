"use server";

/**
 * Web UI server actions — thin adapters over the AI Tool Layer.
 * Auth context from HttpOnly session cookies (not WEB_ADMIN_CONTEXT).
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { logger } from "./logger";
import { KURUM_COOKIE, listAvailableKurumlar, pickInstitutionSelection } from "./institution/context";
import { resolveWriteScope, WriteScopeDeniedError } from "./institution/write-scope";
import {
  THEME_PROFILE_COOKIE,
  FONT_COOKIE,
  DENSITY_COOKIE,
  PORTAL_PRESENTATION_COOKIE,
  normalizeThemeProfile,
  normalizeFontChoice,
  normalizeDensity,
  normalizePortalPresentation,
} from "./theme";
import { auditLog } from "./auth/audit";
import { isFormalContractDuration } from "./contracts";
import { uid } from "./utils";
import {
  cancelMakeupLessonTool,
  confirmMakeupLessonTool,
  createPaymentTool,
  updatePaymentTool,
  createStudentTool,
  updateStudentProfileTool,
  pauseStudentLessonScheduleTool,
  reactivateStudentLessonScheduleTool,
  provisionStudentPortalAccessTool,
  inviteStudentPortalAccessTool,
  inviteTeacherAccountTool,
  getStudentPortalAccessTool,
  revokeStudentPortalAccessTool,
  reactivateStudentPortalAccessTool,
  sendStudentPortalPasswordResetTool,
  getTeacherAccountStatusTool,
  setTeacherAccountActiveTool,
  sendTeacherPasswordResetTool,
  updateStudentPaymentProfileTool,
  archiveStudentTool,
  listStudentListViewsTool,
  saveStudentListViewTool,
  deleteStudentListViewTool,
  createTeacherTool,
  createBranchTool,
  updateBranchTool,
  previewBranchImportTool,
  commitBranchImportTool,
  previewTeacherImportTool,
  commitTeacherImportTool,
  previewRoomImportTool,
  commitRoomImportTool,
  previewLessonImportTool,
  commitLessonImportTool,
  previewLessonScheduleImportTool,
  commitLessonScheduleImportTool,
  type LessonScheduleImportCommitResult,
  previewStudentImportTool,
  commitStudentImportTool,
  previewHistoricalContractImportTool,
  commitHistoricalContractImportTool,
  createRoomTool,
  createLessonTool,
  suggestLessonSlotsTool,
  updateLessonScheduleTool,
  cancelLessonTool,
  previewLessonSeriesTool,
  createLessonSeriesTool,
  cancelSeriesFromLessonTool,
  cancelEntireSeriesTool,
  changeLessonTeacherOrBranchTool,
  createPaymentRecordTool,
  createFeeRuleTool,
  updateFeeRuleTool,
  computeTeacherPayoutTool,
  createTeacherPayoutTool,
  markTeacherPayoutPaidTool,
  updateTeacherPayoutPaymentMethodTool,
  updateFeeRoundingModeTool,
  updateMakeupWindowDaysTool,
  updateSchoolLogoTool,
  updateMonthlyMakeupAllowanceTool,
  updateTermWeeklyClosedDaysTool,
  findAvailableSlotsTool,
  markAttendanceTool,
  updateCommunicationPreferenceTool,
  updateCollectionsSettingsTool,
  markNotificationReadTool,
  resetDemoTool,
  resetToCleanTemplateTool,
  setNationalIdTool,
  setSocialMediaConsentTool,
  getCurrentConsentTextVersionTool,
  createConsentTextVersionTool,
  grantKvkkConsentTool,
  withdrawKvkkConsentTool,
  withdrawSocialMediaConsentTool,
  generateKvkkNoticeDocumentTool,
  generatePhotoVideoConsentDocumentTool,
  updateConsentSettingsTool,
  createCallLogTool,
  assignCallContactTool,
  markCallbackDoneTool,
  createMessageLogTool,
  assignMessageContactTool,
  setMessageStatusTool,
  updateTeacherInstrumentsTool,
  updateTeacherProfileTool,
  createPackageTool,
  updatePackageTool,
  createDiscountCampaignTool,
  updateDiscountCampaignTool,
  archiveTeacherTool,
  updateRoomTool,
  createInstrumentCatalogTool,
  updateInstrumentCatalogTool,
  createStaffMemberTool,
  updateStaffMemberTool,
  createPayrollRecordTool,
  updatePayrollStatusTool,
  createLeaveRequestTool,
  decideLeaveRequestTool,
  createStaffAdvanceTool,
  decideStaffAdvanceTool,
  markStaffAdvancePaidTool,
  cancelStaffAdvanceTool,
  createExpenseTool,
  markExpensePaidTool,
  createRecurringExpenseRuleTool,
  setRecurringExpenseRuleActiveTool,
  tickRecurringExpenseRulesTool,
  upsertBudgetTool,
  createTaskTool,
  updateTaskTool,
  changeTaskStatusTool,
  addTaskChecklistItemTool,
  setTaskChecklistItemCompletedTool,
  archiveTaskChecklistItemTool,
  addTaskCommentTool,
  updateTaskCommentTool,
  deleteTaskCommentTool,
  addTaskFileAttachmentTool,
  addTaskLinkAttachmentTool,
  deleteTaskAttachmentTool,
  getTaskReminderPreferenceTool,
  updateTaskReminderPreferenceTool,
  getNotificationPreferencesTool,
  setNotificationPreferencesTool,
  resetNotificationPreferencesTool,
} from "./services/tools";
import { runWithTenantAsync } from "./tenant-context";
import { getSessionContext, requireSessionContext } from "./auth/session";
import { readData } from "./store";
import { buildLessonCommunicationDraft, type LessonCommunicationDraft } from "./whatsapp-templates";
import type { LessonSlotSuggestion } from "./lesson-scheduling";
import type { SeriesOccurrenceCheck } from "./lesson-series";
import type { TeacherEarningsResult, TeacherPayoutPaymentMethodInfo } from "./teacher-payout";
import type { FeeRoundingMode, TeacherFeeRule, TeacherPayout, TaskStatus, TaskPriority, TaskCategory, PaymentDueRange, StudentType } from "./types";
import type { ImportPreview } from "./import/types";
import type { ImportCommitResult } from "./import/commit-result";
import type { BranchImportRow } from "./import/branches";
import type { TeacherImportRow } from "./import/teachers";
import type { RoomImportRow } from "./import/rooms";
import type { StudentImportRow } from "./import/students";
import type { HistoricalContractImportRow } from "./import/historical-contracts";
import type { LessonImportRow } from "./import/lessons";
import type { LessonScheduleImportPreview } from "./import/lesson-schedule";
import type { ServiceContext } from "./services/context";

function revalidateAll() {
  revalidatePath("/", "layout");
  revalidatePath("/panel");
  revalidatePath("/panel/ogrenciler");
  revalidatePath("/panel/ogretmenler");
  revalidatePath("/panel/odalar");
  revalidatePath("/panel/subeler");
  revalidatePath("/panel/veri-aktar");
  revalidatePath("/panel/program");
  revalidatePath("/panel/telafi");
  revalidatePath("/panel/odemeler");
  revalidatePath("/panel/yoklama");
  revalidatePath("/panel/bildirimler");
  revalidatePath("/panel/kurulum");
  revalidatePath("/veli");
  revalidatePath("/ogretmen");
  revalidatePath("/ogretmen/program");
  revalidatePath("/ogrenci");
}

function assertOk<T>(result: { ok: true; data: T } | { ok: false; error: { message: string } }): T {
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
}

/**
 * Her yazma aksiyonunun TEK giriş noktası. Hangi kurumda çalışılacağını
 * (writeScope.tenantId) sunucu tarafında, taze oturum + cookie'den çözer —
 * istemciden gelen hiçbir tenant id'sine güvenilmez (bkz. write-scope.ts).
 * "Tüm kurumlar" görünümünde veya erişilemeyen bir kurumda YAZMA denenirse
 * mutasyon hiç çalıştırılmadan reddedilir. Her çağrı, ham payload/mesaj
 * içermeyen güvenli bir denetim (audit) kaydı bırakır: aktör, çözülen kurum,
 * kapsam modu, aksiyon adı, sonuç.
 */
async function withAuthContext<T>(
  actionName: string,
  fn: (ctx: ServiceContext) => Promise<T>
): Promise<T> {
  const ctx = await requireSessionContext();
  const requestId = uid("audit");
  const writeScope = await resolveWriteScope(ctx);

  if (writeScope.mode !== "single") {
    auditLog({
      action: actionName,
      requestId,
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      role: ctx.role,
      outcome: "denied",
      meta: { scopeMode: writeScope.mode },
    });
    throw new WriteScopeDeniedError(writeScope.reason);
  }

  try {
    const result = await runWithTenantAsync(writeScope.tenantId, () => fn(ctx));
    auditLog({
      action: actionName,
      requestId,
      userId: ctx.userId,
      tenantId: writeScope.tenantId,
      role: ctx.role,
      outcome: "success",
      meta: { scopeMode: "single" },
    });
    return result;
  } catch (error) {
    auditLog({
      action: actionName,
      requestId,
      userId: ctx.userId,
      tenantId: writeScope.tenantId,
      role: ctx.role,
      outcome: "error",
      meta: { scopeMode: "single" },
    });
    throw error;
  }
}

/**
 * Görünür kurum seçicinin tetiklediği aksiyon. Tercih yalnızca kullanıcının
 * erişebildiği kurumlardan biriyse (veya "Tüm kurumlar" ise ve kullanıcı
 * kurum sahibiyse) kabul edilir; geçersiz bir istekte sessizce varsayılana
 * döner. Panel'in tamamı yeniden render edilir ki her ekran yeni seçime göre
 * güncellensin.
 */
export async function actionSetKurum(selection: string): Promise<void> {
  const ctx = await requireSessionContext();
  const available = await listAvailableKurumlar(ctx);
  const resolved = pickInstitutionSelection(ctx.role, ctx.tenantId, available, selection);
  const jar = await cookies();
  jar.set(KURUM_COOKIE, resolved, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
}

/**
 * Görünüm tercihleri (tema profili / yazı tipi) — kimlik doğrulama veya
 * kurum kapsamından TAMAMEN bağımsızdır; oturum gerektirmez (login
 * ekranında da çalışsın diye) ve hiçbir yetki/kurum/veri kararını
 * etkilemez. Yalnızca kullanıcının kişisel görsel cookie'leridir.
 */
export async function actionSetThemeProfile(profile: string): Promise<void> {
  const normalized = normalizeThemeProfile(profile);
  const jar = await cookies();
  jar.set(THEME_PROFILE_COOKIE, normalized, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
}

export async function actionSetFont(font: string): Promise<void> {
  const normalized = normalizeFontChoice(font);
  const jar = await cookies();
  jar.set(FONT_COOKIE, normalized, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
}

/** Görünüm ayarlarını fabrika varsayılanına döndürür (Kurumsal Altın + Kurumsal Sans). */
export async function actionResetThemePreferences(): Promise<void> {
  const jar = await cookies();
  jar.delete(THEME_PROFILE_COOKIE);
  jar.delete(FONT_COOKIE);
  revalidatePath("/", "layout");
}

/** Yoğunluk tercihi (Rahat/Kompakt) — tema profili ile AYNI cookie mekanizması. */
export async function actionSetDensity(density: string): Promise<void> {
  const normalized = normalizeDensity(density);
  const jar = await cookies();
  jar.set(DENSITY_COOKIE, normalized, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
}

/**
 * İş 3 — öğretmen/veli/öğrenci portal mobil sunumu (Standart/Glass 3D
 * Mobile). Tema profili/yoğunlukla AYNI cookie mekanizması; kimlik/kurum
 * kapsamından bağımsız, oturum gerektirmez.
 */
export async function actionSetPortalPresentation(presentation: string): Promise<void> {
  const normalized = normalizePortalPresentation(presentation);
  const jar = await cookies();
  jar.set(PORTAL_PRESENTATION_COOKIE, normalized, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
}

/**
 * P0 (2026-08-29) — `actionAddStudent`/`actionAddTeacher` ile AYNI YAPISAL
 * kusur: `assertOk` throw ediyordu, form `useActionState` YOK bir
 * `<form action={actionMarkAttendance}>` ile bağlıydı. Bu action ÖZELLİKLE
 * yüksek risk taşıyor — öğretmenler tarafından HER ders için, GÜN İÇİNDE
 * ONLARCA KEZ tetiklenir (kayıt formlarının aksine, nadir bir admin eylemi
 * DEĞİL). Herhangi bir `markAttendanceTool` VALIDATION_ERROR'u (ör. dersin
 * zaten işaretlenmiş olması, geçersiz status) tüm öğretmen portalını
 * çökertirdi.
 */
export type MarkAttendanceFormState = { ok: false; message: string } | null;

export async function actionMarkAttendance(_prevState: MarkAttendanceFormState, formData: FormData): Promise<MarkAttendanceFormState> {
  try {
    await withAuthContext("actionMarkAttendance", async (ctx) => {
      const result = await markAttendanceTool(ctx, {
        lessonId: String(formData.get("lessonId") || ""),
        status: String(formData.get("status") || ""),
        reason: String(formData.get("reason") || "") || undefined,
      });
      if (!result.ok) {
        throw new ToolValidationFailure(result.error);
      }
    });
    revalidateAll();
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    if (error instanceof WriteScopeDeniedError) {
      return { ok: false, message: error.message };
    }
    if (error instanceof ToolValidationFailure) {
      logger.warn("actionMarkAttendance — doğrulama hatası (kullanıcıya gösterildi)", {
        code: error.serviceError.code,
        message: error.serviceError.message,
      });
      return { ok: false, message: error.serviceError.message };
    }
    logger.error("actionMarkAttendance failed", error);
    return { ok: false, message: "Yoklama kaydedilirken beklenmeyen bir hata oluştu. Lütfen tekrar deneyin." };
  }
  return null;
}

/** Bu dosyada tekrarlanan basit "hata mesajı YA DA başarı (null)" şekli — bkz. MarkAttendanceFormState ile AYNI. */
export type SimpleActionFormState = { ok: false; message: string } | null;

/** P0 (2026-08-29) — `actionAddStudent` ile AYNI çökme deseni taşıyordu; AYNI düzeltme uygulandı. */
export async function actionGenerateSuggestions(_prevState: SimpleActionFormState, formData: FormData): Promise<SimpleActionFormState> {
  try {
    const rawMaxSlots = Number(formData.get("maxSlots"));
    const maxSlots = Number.isFinite(rawMaxSlots) && rawMaxSlots > 0 ? rawMaxSlots : undefined;
    await withAuthContext("actionGenerateSuggestions", async (ctx) => {
      const result = await findAvailableSlotsTool(ctx, {
        requestId: String(formData.get("requestId") || ""),
        maxSlots,
      });
      if (!result.ok) {
        throw new ToolValidationFailure(result.error);
      }
    });
    revalidateAll();
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    if (error instanceof WriteScopeDeniedError) return { ok: false, message: error.message };
    if (error instanceof ToolValidationFailure) {
      logger.warn("actionGenerateSuggestions — doğrulama hatası (kullanıcıya gösterildi)", {
        code: error.serviceError.code,
        message: error.serviceError.message,
      });
      return { ok: false, message: error.serviceError.message };
    }
    logger.error("actionGenerateSuggestions failed", error);
    return { ok: false, message: "Uygun saatler aranırken beklenmeyen bir hata oluştu. Lütfen tekrar deneyin." };
  }
  return null;
}

/** P0 (2026-08-29) — AYNI düzeltme. */
export async function actionConfirmSlot(_prevState: SimpleActionFormState, formData: FormData): Promise<SimpleActionFormState> {
  try {
    await withAuthContext("actionConfirmSlot", async (ctx) => {
      const slotJson = String(formData.get("slot") || "");
      const slot = JSON.parse(slotJson);
      const result = await confirmMakeupLessonTool(ctx, {
        requestId: String(formData.get("requestId") || ""),
        slot,
        decisionNote: String(formData.get("decisionNote") || ""),
      });
      if (!result.ok) {
        throw new ToolValidationFailure(result.error);
      }
    });
    revalidateAll();
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    if (error instanceof WriteScopeDeniedError) return { ok: false, message: error.message };
    if (error instanceof ToolValidationFailure) {
      logger.warn("actionConfirmSlot — doğrulama hatası (kullanıcıya gösterildi)", {
        code: error.serviceError.code,
        message: error.serviceError.message,
      });
      return { ok: false, message: error.serviceError.message };
    }
    logger.error("actionConfirmSlot failed", error);
    return { ok: false, message: "Telafi planı onaylanırken beklenmeyen bir hata oluştu. Lütfen tekrar deneyin." };
  }
  return null;
}

/** P0 (2026-08-29) — AYNI düzeltme. */
export async function actionCancelMakeup(_prevState: SimpleActionFormState, formData: FormData): Promise<SimpleActionFormState> {
  try {
    await withAuthContext("actionCancelMakeup", async (ctx) => {
      const result = await cancelMakeupLessonTool(ctx, {
        requestId: String(formData.get("requestId") || ""),
        decisionNote: String(formData.get("decisionNote") || ""),
      });
      if (!result.ok) {
        throw new ToolValidationFailure(result.error);
      }
    });
    revalidateAll();
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    if (error instanceof WriteScopeDeniedError) return { ok: false, message: error.message };
    if (error instanceof ToolValidationFailure) {
      logger.warn("actionCancelMakeup — doğrulama hatası (kullanıcıya gösterildi)", {
        code: error.serviceError.code,
        message: error.serviceError.message,
      });
      return { ok: false, message: error.serviceError.message };
    }
    logger.error("actionCancelMakeup failed", error);
    return { ok: false, message: "Telafi iptal edilirken beklenmeyen bir hata oluştu. Lütfen tekrar deneyin." };
  }
  return null;
}


export type MarkPaymentPaidDetailedInput = {
  paymentId: string;
  method: "credit_card" | "cash" | "transfer";
  amount: number;
  paidAt: string;
  paymentNote?: string;
};

export type MarkPaymentPaidDetailedResult = { ok: true } | { ok: false; message: string };

/** Paket 5 — "Ödendi işaretle" modalı: yöntem + elle girilen tutar + tarih + not. */
export async function actionMarkPaymentPaidDetailed(
  input: MarkPaymentPaidDetailedInput
): Promise<MarkPaymentPaidDetailedResult> {
  try {
    const result = await withAuthContext("actionMarkPaymentPaidDetailed", (ctx) =>
      createPaymentTool(ctx, input)
    );
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true };
  } catch (error) {
    logger.error("actionMarkPaymentPaidDetailed failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    if (error instanceof WriteScopeDeniedError) return { ok: false, message: error.message };
    return { ok: false, message: "Ödeme kaydedilirken beklenmeyen bir hata oluştu." };
  }
}

export type UpdatePaymentInput = {
  paymentId: string;
  method: "credit_card" | "cash" | "transfer";
  amount: number;
  paymentNote?: string;
  /** ISO datetime veya yyyy-MM-dd — tahsilat anı. */
  paidAt?: string;
};

export type UpdatePaymentResult = { ok: true } | { ok: false; message: string };

/** Paket 5 — tamamlanmış bir ödeme için "Düzenle" akışı. */
export async function actionUpdatePayment(input: UpdatePaymentInput): Promise<UpdatePaymentResult> {
  try {
    const result = await withAuthContext("actionUpdatePayment", (ctx) => updatePaymentTool(ctx, input));
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true };
  } catch (error) {
    logger.error("actionUpdatePayment failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    if (error instanceof WriteScopeDeniedError) return { ok: false, message: error.message };
    return { ok: false, message: "Ödeme güncellenirken beklenmeyen bir hata oluştu." };
  }
}

export async function actionResetDemo() {
  try {
    await withAuthContext("actionResetDemo", async (ctx) => {
      assertOk(await resetDemoTool(ctx));
    });
    revalidateAll();
  } catch (error) {
    logger.error("actionResetDemo failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    throw error;
  }
}

/**
 * Kurulum Merkezi — "Boş şablona sıfırla". `actionResetDemo`'dan bilinçli
 * olarak ayrık: örnek veri BIRAKMAZ, yalnızca boş bir kurum iskeleti kurar.
 */
export async function actionResetToCleanTemplate() {
  try {
    await withAuthContext("actionResetToCleanTemplate", async (ctx) => {
      assertOk(await resetToCleanTemplateTool(ctx));
    });
    revalidateAll();
  } catch (error) {
    logger.error("actionResetToCleanTemplate failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    throw error;
  }
}

/**
 * P0-1/P0-2 (2026-08-29, "Invalid input" runtime hatası düzeltmesi) — bu
 * action ÖNCEDEN düz `<form action={actionAddStudent}>` (useActionState YOK)
 * ile bağlıydı; `assertOk` doğrulama hatasında `throw new Error(result.error.message)`
 * atıyordu ve bu THROW, sunucu action'ları için hiçbir hata sınırı olmayan bu
 * desende doğrudan istemciye "Runtime Error" olarak sızıyordu (kök neden:
 * enstrüman kataloğu — bkz. validation.ts studentSchema.instrument yorumu —
 * ile sabit zod enum'unun senkron dışı kalması; ama YAPISAL sorun her
 * `VALIDATION_ERROR`/beklenmeyen hata için AYNIYDI). Artık `useActionState`
 * ile çağrılır: normal kullanıcı hataları (eksik/geçersiz alan) ASLA THROW
 * ETMEZ, bunun yerine `NewStudentFormState` döner — form AÇIK kalır (React
 * DOM'u yeniden monte etmez), girilmiş değerler (uncontrolled input'lar)
 * KORUNUR, alan bazlı Türkçe hatalar `fieldErrors`'ta taşınır.
 */
export type NewStudentFormState = {
  ok: false;
  formError?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
} | null;

/**
 * `withAuthContext`'in generic dönüş tipini bozmadan `createStudentTool`
 * doğrulama hatasını dışarı (catch bloğuna) taşımak için kullanılan iç
 * işaretleyici — asla kullanıcıya bu sınıf adıyla gösterilmez, yalnızca
 * `error.details` (zod `.flatten()` çıktısı, VARSA) `fieldErrors`'a çevrilir.
 */
/** Yalnızca `actionAddStudent` DEĞİL — AYNI throw-based crash deseni taşıyan `actionAddTeacher` da bunu paylaşır. */
class ToolValidationFailure extends Error {
  readonly serviceError: { code: string; message: string; details?: unknown };
  constructor(serviceError: { code: string; message: string; details?: unknown }) {
    super(serviceError.message);
    this.serviceError = serviceError;
  }
}

/** zod `.flatten()` → `{field: "ilk Türkçe hata mesajı"}`; alan bilgisi yoksa (business-rule hatası) boş obje döner. */
function fieldErrorsFromZodFlatten(details: unknown): Record<string, string> {
  if (!details || typeof details !== "object" || !("fieldErrors" in details)) return {};
  const raw = (details as { fieldErrors: Record<string, string[] | undefined> }).fieldErrors;
  const out: Record<string, string> = {};
  for (const [key, messages] of Object.entries(raw)) {
    if (messages && messages.length > 0) out[key] = messages[0]!;
  }
  return out;
}

// P0-4 — React 19 form actions RESET uncontrolled fields after every
// submission (success OR failure), not just on success — so a validation
// error wipes every field that isn't explicitly re-fed back through
// `defaultValue`/`defaultChecked` from this captured state. Every field the
// form actually collects must be listed here; missing one means it silently
// goes blank on the next failed submit, which is exactly the bug being fixed.
const STUDENT_FORM_VALUE_KEYS = [
  "name",
  "nationalId",
  "motherName",
  "fatherName",
  "parentName",
  "parentPhone",
  "email",
  "phone",
  "accountResponsibility",
  "inviteToPortal",
  "invitePortalAccessType",
  "invitePortalEmail",
  "birthDate",
  "birthPlace",
  "schoolOrOccupation",
  "address",
  "branchId",
  "instrument",
  "teacherId",
  "weeklyLessonCount",
  "intendedDurationMonths",
  "packageName",
  "lessonDurationMinutes",
  "packageId",
  "monthlyFee",
  "discountType",
  "discountValue",
  "paymentMethod",
  "firstPaymentAmount",
  "firstPaymentMethod",
  "firstPaymentDate",
  "firstPaymentReference",
  "firstPaymentNote",
  "firstPaymentAdjustmentReason",
  "termType",
  "enrollmentStartDate",
  "level",
  "targetExam",
  "notes",
  "socialMediaConsent",
  "kvkkConsent",
] as const;

/** Aynı `name`'i birden çok checkbox paylaşan tek alan — virgülle birleştirilip taşınır (değerlerde virgül YOK, sabit STUDENT_TYPES enum'undan gelir). */
const STUDENT_FORM_MULTI_VALUE_KEYS = ["studentTypes", "lessonDays"] as const;

function captureStudentFormValues(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of STUDENT_FORM_VALUE_KEYS) {
    const value = String(formData.get(key) ?? "");
    if (value) out[key] = value;
  }
  for (const key of STUDENT_FORM_MULTI_VALUE_KEYS) {
    const values = formData.getAll(key).map(String).filter(Boolean);
    if (values.length > 0) out[key] = values.join(",");
  }
  return out;
}

export async function actionAddStudent(_prevState: NewStudentFormState, formData: FormData): Promise<NewStudentFormState> {
  // Faz 4 — kayıt başarılı olursa admin BOŞ forma değil, öğrenci detayındaki
  // "Kayıt ve Ödeme Planı / Sözleşmeler" bölümüne yönlendirilir (server action
  // dönüş değeri BAŞARI durumunda kullanılmaz — yönlendirme TEK geri bildirim
  // yoludur); HATA durumunda ise dönüş değeri ARTIK doğrudan `useActionState`
  // ile forma ulaşır (bkz. new-student-form.tsx).
  let newStudentId: string | undefined;
  let inviteWarning: string | undefined;
  try {
    await withAuthContext("actionAddStudent", async (ctx) => {
      // P0-C (2026-09-02) — "İlk ödeme türü seçilmelidir" alan-bazlı hata:
      // yöntem seçilmezse aşağıdaki `firstPaymentCollected` builder'ı TÜM
      // alt-alanları (yöntem/tutar/tarih) TEK bir `undefined`'a çöker,
      // `createStudentTool` yalnız JENERİK "tahsil edilmeden kayıt
      // tamamlanamaz" mesajı görür — HANGİ alanın eksik olduğunu bilemez.
      // Burada, istemcinin `required` attribute'una GÜVENMEDEN, yöntem
      // özel olarak ayrıca kontrol edilir ve gerçek bir öğrenci OLUŞMADAN
      // (createStudentTool'a hiç ulaşmadan) reddedilir.
      const firstPaymentMethodRaw = String(formData.get("firstPaymentMethod") || "");
      if (!firstPaymentMethodRaw) {
        throw new ToolValidationFailure({
          code: "VALIDATION_ERROR",
          message: "İlk ödeme türü seçilmelidir.",
          details: { fieldErrors: { firstPaymentMethod: ["İlk ödeme türü seçilmelidir."] } },
        });
      }

      // P0-C — haftalık ders sayısına karşılık gelen ders günleri seçilmeden
      // kayıt/ilk tahsilat planı KESİNLEŞTİRİLEMEZ (owner politikası).
      // `createStudentTool` bu alanı yalnız GÖNDERİLDİYSE şekil olarak
      // doğrular (geriye dönük uyum — testler/CSV/AI-agent çağrıları bunu
      // hiç bilmiyordu); GERÇEK kayıt formu akışı içinse burada AYRICA
      // kesin zorunlu kılınır.
      const lessonDaysRaw = formData.getAll("lessonDays").map(Number).filter((n) => Number.isInteger(n));
      const weeklyLessonCountRaw = Number(formData.get("weeklyLessonCount") || 1);
      if (lessonDaysRaw.length !== weeklyLessonCountRaw || new Set(lessonDaysRaw).size !== lessonDaysRaw.length) {
        const msg = `Haftalık ${weeklyLessonCountRaw} ders için ${weeklyLessonCountRaw} farklı ders günü seçmelisiniz.`;
        throw new ToolValidationFailure({
          code: "VALIDATION_ERROR",
          message: msg,
          details: { fieldErrors: { lessonDays: [msg] } },
        });
      }

      const createdResult = await createStudentTool(ctx, {
          name: String(formData.get("name") || ""),
          email: String(formData.get("email") || ""),
          phone: String(formData.get("phone") || ""),
          parentName: String(formData.get("parentName") || ""),
          parentPhone: String(formData.get("parentPhone") || ""),
          motherName: String(formData.get("motherName") || "") || undefined,
          fatherName: String(formData.get("fatherName") || "") || undefined,
          branchId: String(formData.get("branchId") || ""),
          instrument: String(formData.get("instrument") || "Piyano"),
          teacherId: String(formData.get("teacherId") || ""),
          packageName: String(formData.get("packageName") || "Bireysel Aylık — 4 ders"),
          weeklyLessonCount: Number(formData.get("weeklyLessonCount") || 1),
          lessonDays: lessonDaysRaw,
          monthlyFee: Number(formData.get("monthlyFee") || 3000),
          notes: String(formData.get("notes") || ""),
          // Faz 1B — çoklu seçim checkbox grubu; boşsa undefined (eski davranışla aynı).
          studentTypes: (() => {
            const values = formData.getAll("studentTypes").map(String).filter(Boolean);
            return values.length > 0 ? (values as StudentType[]) : undefined;
          })(),
          enrollmentStartDate: String(formData.get("enrollmentStartDate") || "") || undefined,
          level: String(formData.get("level") || "") || undefined,
          targetExam: String(formData.get("targetExam") || "") || undefined,
          termType: (() => {
            const raw = String(formData.get("termType") || "");
            return raw === "guz" || raw === "yaz" ? raw : undefined;
          })(),
          // ÖNCELİK 4 (devam) — Paket Yönetimi + ek profil alanları.
          packageId: String(formData.get("packageId") || "") || undefined,
          birthDate: String(formData.get("birthDate") || "") || undefined,
          birthPlace: String(formData.get("birthPlace") || "") || undefined,
          schoolOrOccupation: String(formData.get("schoolOrOccupation") || "") || undefined,
          address: String(formData.get("address") || "") || undefined,
          lessonDurationMinutes: (() => {
            const raw = Number(formData.get("lessonDurationMinutes") || 0);
            return raw === 30 || raw === 40 || raw === 50 ? raw : undefined;
          })(),
          // Package C — paket seçildiyse indirim/ödeme profili; paketsizse hiçbiri gönderilmez.
          discountType: (() => {
            const raw = String(formData.get("discountType") || "");
            return raw === "percent" || raw === "amount" ? raw : undefined;
          })(),
          discountValue: (() => {
            const raw = String(formData.get("discountValue") || "");
            return raw ? Number(raw) : undefined;
          })(),
          paymentMethod: (() => {
            const raw = String(formData.get("paymentMethod") || "");
            return raw === "cash" || raw === "transfer" || raw === "credit_card" ? raw : undefined;
          })(),
          paymentDueDay: (() => {
            const raw = String(formData.get("paymentDueDay") || "");
            return raw ? Number(raw) : undefined;
          })(),
          paymentDueRanges: (() => {
            const start = String(formData.get("paymentDueRangeStart") || "");
            const end = String(formData.get("paymentDueRangeEnd") || "");
            return start && end ? [{ start: Number(start), end: Number(end) }] : undefined;
          })(),
          accountResponsibility: (() => {
            const raw = String(formData.get("accountResponsibility") || "");
            return raw === "SELF_MANAGED" || raw === "PARENT_MANAGED" ? raw : undefined;
          })(),
          // Owner policy (2026-08-30) — "İlk Ödeme / Kayıt Anı Tahsilatı": kayıt bu
          // alanlar olmadan TAMAMLANAMAZ (bkz. createStudentTool gate). Tutar alanı
          // metin/inputMode="decimal" ile alınır (native number spinner yok).
          firstPaymentCollected: (() => {
            const method = String(formData.get("firstPaymentMethod") || "");
            const amountRaw = String(formData.get("firstPaymentAmount") || "").replace(/[^\d]/g, "");
            const collectedAt = String(formData.get("firstPaymentDate") || "");
            if (!method || !amountRaw || !collectedAt) return undefined;
            return {
              method: method as "credit_card" | "cash" | "transfer",
              amount: Number(amountRaw),
              collectedAt,
              reference: String(formData.get("firstPaymentReference") || "") || undefined,
              note: String(formData.get("firstPaymentNote") || "") || undefined,
            };
          })(),
          firstPaymentExceptionReason: String(formData.get("firstPaymentExceptionReason") || "") || undefined,
          // P0-B (2026-09-02) — kök neden: bu alan formda toplanıyor
          // (`new-student-form.tsx` `name="firstPaymentAdjustmentReason"`) ve
          // hata sonrası yeniden gösterim için `STUDENT_FORM_VALUE_KEYS`'e
          // dahildi, ama BURADA — asıl `createStudentTool` çağrı payload'ında —
          // hiç OKUNMUYORDU. Sonuç: `v.data.firstPaymentAdjustmentReason` sunucuda
          // HER ZAMAN undefined'dı, kullanıcı geçerli bir gerekçe yazsa bile
          // `resolveFirstPaymentAdjustment` gerekçeyi HİÇ GÖRMÜYOR ve otomatik≠
          // manuel farkında KOŞULSUZ "gerekçe zorunludur" hatası veriyordu.
          firstPaymentAdjustmentReason:
            String(formData.get("firstPaymentAdjustmentReason") || "") || undefined,
          // Karma Öğrenci Portalı — bu form (plain <form action=...>, dönüş
          // değeri UI'ya asla ulaşmaz) BİLİNÇLİ OLARAK giriş hesabı AÇMAZ —
          // tempLoginPassword burada üretilse admin'e hiç gösterilemez ve
          // hesap kalıcı olarak kullanılamaz kalırdı. Portal erişimi
          // YALNIZCA düzenleme ekranındaki `actionProvisionStudentPortalAccess`
          // (şifreyi bir kez, React state'te gösteren) üzerinden verilir.
          createPortalAccess: false,
        });
      if (!createdResult.ok) {
        throw new ToolValidationFailure(createdResult.error);
      }
      const created = createdResult.data;
      newStudentId = created.studentId;

      // T.C. kimlik — şifreli saklama, mevcut setNationalIdTool üzerinden
      // (asla düz metin Student.nationalIdCipher dışında bir yere yazılmaz).
      const nationalId = String(formData.get("nationalId") || "").trim();
      if (nationalId) {
        await setNationalIdTool(ctx, { entity: "student", entityId: created.studentId, nationalId });
      }

      // Sosyal medya izni — mevcut SocialMediaConsent modeli üzerinden.
      // Checkbox işaretliyse "granted", işaretsizse (FormData'da hiç yoksa)
      // "denied" — sessizce atlanmaz, her yeni öğrenci için açıkça kaydedilir.
      const socialMediaConsent = formData.get("socialMediaConsent") === "granted" ? "granted" : "denied";
      await setSocialMediaConsentTool(ctx, {
        studentId: created.studentId,
        status: socialMediaConsent,
        representativeName: String(formData.get("parentName") || ""),
        relationship: "Veli",
        // socialMediaConsentSchema en az 1 scope ister; "Hayır" durumunda
        // izin verilen kapsam yoktur ama şema formalitesi için "name" ile
        // kaydedilir — asıl karar `status` alanıdır (granted/denied).
        scopes: socialMediaConsent === "granted" ? (["photo", "video", "name"] as const) : (["name"] as const),
      });

      // Faz 8 (KVKK) — yalnızca tenant için yürürlükte bir "kvkk_general" metni
      // TANIMLIYSA rıza kaydedilir (henüz metin girilmemiş tenant'larda öğrenci
      // kaydı SESSİZCE ENGELLENMEZ — mevcut davranış korunur). Checkbox
      // işaretliyse "portal" kanalından, sistem tarafından (createdBy=admin)
      // ADMIN'in kaydı üzerinden alınmış rıza olarak işlenir.
      const kvkkConsent = formData.get("kvkkConsent") === "granted";
      if (kvkkConsent) {
        const currentVersion = await getCurrentConsentTextVersionTool(ctx, { consentType: "kvkk_general" });
        if (currentVersion.ok && currentVersion.data.version) {
          await grantKvkkConsentTool(ctx, {
            subjectType: "parent",
            subjectId: created.studentId,
            consentType: "kvkk_general",
            channel: "kayit_formu",
          });
        }
      }

      // Faz 1F — kayıt ekranından tek adımda GERÇEK e-posta daveti (düz metin
      // şifre YOK, mevcut inviteStudentPortalAccessTool — bkz. actionInviteStudentPortalAccess).
      // İşaretlenmediyse SESSİZCE atlanır — bu ekranda giriş hesabı açmak
      // DEFAULT DEĞİL, açıkça tercih edilmelidir.
      const inviteToPortal = formData.get("inviteToPortal") === "1";
      const invitePortalEmail = String(formData.get("invitePortalEmail") || "").trim();
      const invitePortalAccessTypeRaw = formData.get("invitePortalAccessType") === "SELF" ? "SELF" : "GUARDIAN";
      // P0-D (2026-09-02) — kayıt ARTIK OLUŞTU (bu blok `created.studentId`
      // sonrasında); portal daveti bu yüzden İSTEĞE BAĞLI "en iyi çaba"
      // olarak tasarlanmıştır (SMTP hatası vb. AYNI `inviteWarning`
      // deseniyle raporlanır) — davet e-postası boşsa kaydı GERİYE
      // ALMAK/bloklamak YERİNE, ÖNCEDEN sessizce atlanan bu durum artık
      // AÇIKÇA bir uyarı olarak raporlanır (istemci tarafında da
      // `new-student-form.tsx` bu durumu önden gösterir — bkz. P0-D).
      if (inviteToPortal && invitePortalAccessTypeRaw === "SELF" && !invitePortalEmail) {
        inviteWarning =
          "Öğrencinin kendisine portal daveti gönderilemedi: öğrenci e-postası boş. Öğrenci e-postasını girin veya farklı bir davet e-postası kullanın.";
      }
      if (inviteToPortal && invitePortalEmail) {
        const accessType = invitePortalAccessTypeRaw;
        try {
          const inviteResult = await inviteStudentPortalAccessTool(ctx, {
            studentId: created.studentId,
            email: invitePortalEmail,
            accessType,
          });
          // Hata düzeltmesi (2026-08-31): bu sonuç ÖNCEDEN hiç kontrol
          // edilmiyordu. inviteStudentPortalAccessTool bir ServiceResult
          // (ok/fail) döner, BEKLENEN hatalarda throw ETMEZ — bu yüzden
          // rate-limit / SMTP yapılandırılmamış / gönderim hatası gibi
          // durumlarda admin hiçbir uyarı görmüyordu, öğrenci "davet
          // gönderildi" sanıyordu. Artık sonuç `inviteWarning`'e yazılıp
          // aşağıdaki redirect query'siyle başarı paneline taşınıyor.
          if (!inviteResult.ok) {
            inviteWarning = inviteResult.error.message;
            logger.warn("actionAddStudent — portal daveti reddedildi", {
              code: inviteResult.error.code,
              message: inviteResult.error.message,
            });
          } else if (!inviteResult.data.delivered) {
            inviteWarning = inviteResult.data.blocked
              ? "E-posta sağlayıcısı yapılandırılmamış — davet e-postası gönderilemedi."
              : "Davet e-postası gönderilemedi (sunucu hatası) — lütfen tekrar deneyin.";
            logger.warn("actionAddStudent — davet e-postası teslim edilemedi", {
              blocked: inviteResult.data.blocked,
            });
          }
        } catch (e) {
          // Öğrenci kaydı zaten oluşturuldu — bu istisna kaydı geri almaz,
          // yalnızca daveti başarısız sayar ve admin'e görünür kılar.
          inviteWarning = "Davet e-postası gönderilirken beklenmeyen bir hata oluştu.";
          logger.warn("actionAddStudent — davet e-postası istisnası", {
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
    });
    revalidateAll();
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    // Diğer tüm action'larla AYNI, kurulu desen (bkz. actionUpdateStudentProfile
    // vb.) — kurum kapsamı reddi normal, beklenen bir kullanıcı durumudur
    // (ör. SUPER_ADMIN "Tüm kurumlar" görünümünde), teknik bir hata DEĞİLDİR.
    if (error instanceof WriteScopeDeniedError) {
      return { ok: false, formError: error.message, values: captureStudentFormValues(formData) };
    }
    if (error instanceof ToolValidationFailure) {
      // P0-2 — normal kullanıcı hatası: form AÇIK kalır, girilen değerler
      // (uncontrolled input) KORUNUR, alan bazlı Türkçe hata + üstte özet
      // gösterilir. Geçersiz kayıt/veri HİÇBİR ŞEKİLDE persist edilmedi —
      // `createStudentTool` doğrulamayı YAZMADAN ÖNCE reddetti.
      logger.warn("actionAddStudent — doğrulama hatası (kullanıcıya gösterildi)", {
        code: error.serviceError.code,
        message: error.serviceError.message,
      });
      const fieldErrors = fieldErrorsFromZodFlatten(error.serviceError.details);
      return {
        ok: false,
        formError:
          error.serviceError.message === "Invalid input"
            ? "Formda düzeltilmesi gereken alanlar var — aşağıda işaretlendi."
            : error.serviceError.message,
        fieldErrors,
        values: captureStudentFormValues(formData),
      };
    }
    // Beklenmeyen hata — P0-2: bu action'a bağlı `<form>` bir runtime overlay
    // GÖRMEMELİ; jenerik ama erişilebilir bir Türkçe hata döner, tam hata
    // sunucu loguna yazılır (bkz. logger.error).
    logger.error("actionAddStudent failed", error);
    return {
      ok: false,
      formError: "Kayıt oluşturulurken beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.",
      values: captureStudentFormValues(formData),
    };
  }
  if (newStudentId) {
    // Faz 3/4 (ENROLLMENT_PAYMENT_RENEWAL_VALIDATION_FIX) — Student modeline
    // İŞLENMEZ (yeni bir kolon/migration YOK); yalnızca başarı banner'ının
    // trial/formal sınıflandırmasını ve sözleşme formunun süre ön-doldurmasını
    // belirlemek için redirect query'sinde taşınır.
    const rawDuration = Number(formData.get("intendedDurationMonths") || 3);
    const intendedDurationMonths = Number.isInteger(rawDuration) && rawDuration >= 1 && rawDuration <= 12 ? rawDuration : 3;
    // FAZ (2026-2027 SÖZLEŞME KAYNAĞI) — formal kayıt (3-12 ay) doğrudan
    // Bağımsız Sözleşme Merkezi'ne (bkz. [studentId]/sozlesmeler) yönlendirilir;
    // tanışma paketi (1-2 ay) öğrenci detayında kalır (formal sözleşme
    // üretim CTA'sı GÖSTERİLMEZ — bkz. RegistrationSuccessPanel).
    const destination = isFormalContractDuration(intendedDurationMonths)
      ? `/panel/ogrenciler/${newStudentId}/sozlesmeler`
      : `/panel/ogrenciler/${newStudentId}`;
    const inviteWarningQuery = inviteWarning ? `&davetUyari=${encodeURIComponent(inviteWarning)}` : "";
    redirect(`${destination}?yeniKayit=1&sure=${intendedDurationMonths}${inviteWarningQuery}`);
  }
  return null;
}

export type UpdateStudentProfileActionResult = { ok: true } | { ok: false; message: string };

export async function actionUpdateStudentProfile(input: {
  studentId: string;
  studentType?: string;
  /** Faz 1B — verilirse tekil studentType'ın YERİNE birincil kaynak olur. */
  studentTypes?: StudentType[];
  enrollmentStartDate?: string;
  enrollmentEndDate?: string;
  level?: string;
  targetExam?: string;
  specialNotes?: string;
  /** ÖNCELİK 4 (devam) — yalnız SCHOOL_ADMIN/SUPER_ADMIN (updateStudentProfileTool RBAC'ı) set edebilir. */
  termType?: "guz" | "yaz";
  phone?: string;
  parentName?: string;
  parentPhone?: string;
  motherName?: string;
  fatherName?: string;
  address?: string;
  birthDate?: string;
  birthPlace?: string;
  schoolOrOccupation?: string;
  communicationOptOut?: boolean;
  name?: string;
  email?: string;
  branchId?: string;
  educationMethod?: string;
  /** ÖNCELİK 4 (devam) — Ödeme profili: paket, süre, indirim, ödeme günü/türü, override tutar. */
  packageId?: string;
  lessonDurationMinutes?: number;
  paymentMethod?: "credit_card" | "cash" | "transfer";
  paymentDueDay?: number;
  /** Faz 1A — verilirse tekil paymentDueDay'in yerine birincil kaynak olur. */
  paymentDueRanges?: PaymentDueRange[];
  discountType?: "percentage" | "fixed";
  discountValue?: number;
  paymentAmount?: number;
  accountResponsibility?: "PARENT_MANAGED" | "SELF_MANAGED";
}): Promise<UpdateStudentProfileActionResult> {
  try {
    const result = await withAuthContext("actionUpdateStudentProfile", (ctx) =>
      updateStudentProfileTool(ctx, input)
    );
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true };
  } catch (error) {
    logger.error("actionUpdateStudentProfile failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "Öğrenci profili güncellenirken beklenmeyen bir hata oluştu." };
  }
}

export type PauseStudentLessonScheduleActionResult = { ok: true } | { ok: false; message: string };

/** Nilüfer Acar politikası §1E — yetkili personelin, gecikmiş ödeme nedeniyle GEREKÇELİ ve BİLİNÇLİ kararıyla. */
export async function actionPauseStudentLessonSchedule(input: {
  studentId: string;
  reason: string;
  effectiveDate?: string;
}): Promise<PauseStudentLessonScheduleActionResult> {
  try {
    const result = await withAuthContext("actionPauseStudentLessonSchedule", (ctx) =>
      pauseStudentLessonScheduleTool(ctx, input)
    );
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true };
  } catch (error) {
    logger.error("actionPauseStudentLessonSchedule failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "Ders programı duraklatılırken beklenmeyen bir hata oluştu." };
  }
}

export async function actionReactivateStudentLessonSchedule(input: {
  studentId: string;
}): Promise<PauseStudentLessonScheduleActionResult> {
  try {
    const result = await withAuthContext("actionReactivateStudentLessonSchedule", (ctx) =>
      reactivateStudentLessonScheduleTool(ctx, input)
    );
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true };
  } catch (error) {
    logger.error("actionReactivateStudentLessonSchedule failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "Ders programı yeniden etkinleştirilirken beklenmeyen bir hata oluştu." };
  }
}

export type ProvisionStudentPortalAccessResult =
  | { ok: true; tempLoginPassword?: string }
  | { ok: false; message: string };

/**
 * Karma Öğrenci Portalı — öğrenci düzenleme ekranından "Portal erişimi
 * oluştur / davet gönder" aksiyonu. Bilinçli, ayrı bir admin tetikleyicisi
 * (task #34) — kayıt oluşturmadaki `createPortalAccess` checkbox'ından
 * bağımsız, sonradan da tetiklenebilir.
 */
export async function actionProvisionStudentPortalAccess(input: {
  studentId: string;
  email: string;
  accessType: "GUARDIAN" | "SELF";
}): Promise<ProvisionStudentPortalAccessResult> {
  try {
    const result = await withAuthContext("actionProvisionStudentPortalAccess", (ctx) =>
      provisionStudentPortalAccessTool(ctx, input)
    );
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true, tempLoginPassword: result.data.tempLoginPassword };
  } catch (error) {
    logger.error("actionProvisionStudentPortalAccess failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "Portal erişimi oluşturulurken beklenmeyen bir hata oluştu." };
  }
}

export type SendInvitationActionResult = { ok: true; delivered: boolean; blocked?: boolean } | { ok: false; message: string };

/**
 * Faz 4 — GERÇEK e-posta davet akışı (`actionProvisionStudentPortalAccess`'in
 * yanına eklenen ikinci, bağımsız aksiyon — hiçbir şifre admin'e gösterilmez,
 * kullanıcı linkle kendi şifresini belirler).
 */
export async function actionInviteStudentPortalAccess(input: {
  studentId: string;
  email: string;
  accessType: "GUARDIAN" | "SELF";
}): Promise<SendInvitationActionResult> {
  try {
    const result = await withAuthContext("actionInviteStudentPortalAccess", (ctx) =>
      inviteStudentPortalAccessTool(ctx, input)
    );
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true, delivered: result.data.delivered, blocked: result.data.blocked };
  } catch (error) {
    logger.error("actionInviteStudentPortalAccess failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "Davet gönderilirken beklenmeyen bir hata oluştu." };
  }
}

/** Faz 4 — öğretmen için GERÇEK e-posta davet akışı, AYNI desen. */
export async function actionInviteTeacherAccount(input: { teacherId: string }): Promise<SendInvitationActionResult> {
  try {
    const result = await withAuthContext("actionInviteTeacherAccount", (ctx) => inviteTeacherAccountTool(ctx, input));
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true, delivered: result.data.delivered, blocked: result.data.blocked };
  } catch (error) {
    logger.error("actionInviteTeacherAccount failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "Davet gönderilirken beklenmeyen bir hata oluştu." };
  }
}

/* ------------------------------------------------------------------ */
/* Portal erişim yönetimi kartı — öğrenci/öğretmen detay ekranı         */
/* ------------------------------------------------------------------ */

export type StudentPortalAccessListResult =
  | { ok: true; accounts: import("./services/tools").StudentPortalAccessSummaryRow[] }
  | { ok: false; message: string };

export async function actionGetStudentPortalAccess(input: { studentId: string }): Promise<StudentPortalAccessListResult> {
  try {
    const result = await withAuthContext("actionGetStudentPortalAccess", (ctx) => getStudentPortalAccessTool(ctx, input));
    if (!result.ok) return { ok: false, message: result.error.message };
    return { ok: true, accounts: result.data.accounts };
  } catch (error) {
    logger.error("actionGetStudentPortalAccess failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "Portal erişim durumu okunurken beklenmeyen bir hata oluştu." };
  }
}

export type PortalAccessActionResult = { ok: true } | { ok: false; message: string };

export async function actionRevokeStudentPortalAccess(input: { studentId: string; userId: string }): Promise<PortalAccessActionResult> {
  try {
    const result = await withAuthContext("actionRevokeStudentPortalAccess", (ctx) => revokeStudentPortalAccessTool(ctx, input));
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true };
  } catch (error) {
    logger.error("actionRevokeStudentPortalAccess failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "Erişim kapatılırken beklenmeyen bir hata oluştu." };
  }
}

export async function actionReactivateStudentPortalAccess(input: { studentId: string; userId: string }): Promise<PortalAccessActionResult> {
  try {
    const result = await withAuthContext("actionReactivateStudentPortalAccess", (ctx) => reactivateStudentPortalAccessTool(ctx, input));
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true };
  } catch (error) {
    logger.error("actionReactivateStudentPortalAccess failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "Erişim yeniden açılırken beklenmeyen bir hata oluştu." };
  }
}

export async function actionSendStudentPortalPasswordReset(input: { studentId: string; userId: string }): Promise<SendInvitationActionResult> {
  try {
    const result = await withAuthContext("actionSendStudentPortalPasswordReset", (ctx) => sendStudentPortalPasswordResetTool(ctx, input));
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true, delivered: result.data.delivered, blocked: result.data.blocked };
  } catch (error) {
    logger.error("actionSendStudentPortalPasswordReset failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "Şifre sıfırlama bağlantısı gönderilirken beklenmeyen bir hata oluştu." };
  }
}

export type TeacherAccountStatusResult =
  | { ok: true; status: import("./services/tools").TeacherAccountStatusSummary }
  | { ok: false; message: string };

export async function actionGetTeacherAccountStatus(input: { teacherId: string }): Promise<TeacherAccountStatusResult> {
  try {
    const result = await withAuthContext("actionGetTeacherAccountStatus", (ctx) => getTeacherAccountStatusTool(ctx, input));
    if (!result.ok) return { ok: false, message: result.error.message };
    return { ok: true, status: result.data };
  } catch (error) {
    logger.error("actionGetTeacherAccountStatus failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "Portal erişim durumu okunurken beklenmeyen bir hata oluştu." };
  }
}

export async function actionSetTeacherAccountActive(input: { teacherId: string; active: boolean }): Promise<PortalAccessActionResult> {
  try {
    const result = await withAuthContext("actionSetTeacherAccountActive", (ctx) => setTeacherAccountActiveTool(ctx, input));
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true };
  } catch (error) {
    logger.error("actionSetTeacherAccountActive failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "Erişim durumu güncellenirken beklenmeyen bir hata oluştu." };
  }
}

export async function actionSendTeacherPasswordReset(input: { teacherId: string }): Promise<SendInvitationActionResult> {
  try {
    const result = await withAuthContext("actionSendTeacherPasswordReset", (ctx) => sendTeacherPasswordResetTool(ctx, input));
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true, delivered: result.data.delivered, blocked: result.data.blocked };
  } catch (error) {
    logger.error("actionSendTeacherPasswordReset failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "Şifre sıfırlama bağlantısı gönderilirken beklenmeyen bir hata oluştu." };
  }
}

export type UpdateStudentPaymentProfileActionResult =
  | { ok: true; monthlyFee: number }
  | { ok: false; message: string };

/**
 * Package C — paket/süre/indirim/ödeme günü/türü + (yalnızca yetkili
 * yönetici) manuel nihai ücret override'ı. RBAC/hesap tek kaynağı
 * `updateStudentPaymentProfileTool`'dadır — bu action yalnız ince bir sarmalayıcı.
 */
export async function actionUpdateStudentPaymentProfile(input: {
  studentId: string;
  packageId?: string;
  lessonDurationMinutes?: number;
  discountType?: "percent" | "amount";
  discountValue?: number;
  paymentMethod?: "cash" | "transfer" | "credit_card";
  paymentDueDay?: number;
  monthlyFeeOverrideAmount?: number;
  monthlyFeeOverrideReason?: string;
}): Promise<UpdateStudentPaymentProfileActionResult> {
  try {
    const result = await withAuthContext("actionUpdateStudentPaymentProfile", (ctx) =>
      updateStudentPaymentProfileTool(ctx, input)
    );
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true, monthlyFee: result.data.monthlyFee };
  } catch (error) {
    logger.error("actionUpdateStudentPaymentProfile failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "Ödeme profili güncellenirken beklenmeyen bir hata oluştu." };
  }
}

export type ArchiveStudentActionResult = { ok: true } | { ok: false; message: string };

/** Pasife alma/aktifleştirme — hard delete yok, tool katmanı SCHOOL_ADMIN/SUPER_ADMIN'e kısıtlar. */
export async function actionArchiveStudent(input: {
  studentId: string;
  archived: boolean;
}): Promise<ArchiveStudentActionResult> {
  try {
    const result = await withAuthContext("actionArchiveStudent", (ctx) =>
      archiveStudentTool(ctx, input)
    );
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true };
  } catch (error) {
    logger.error("actionArchiveStudent failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "Öğrenci durumu güncellenirken beklenmeyen bir hata oluştu." };
  }
}

export type StudentListViewActionResult =
  | { ok: true; views: { id: string; name: string; columns: string[]; createdByUserId: string }[] }
  | { ok: false; message: string };

/** Öğrenciler ekranı "Sütunlar / Görünüm yönetimi" — tenant içindeki paylaşılan görünümleri listeler. */
export async function actionListStudentListViews(): Promise<StudentListViewActionResult> {
  try {
    const result = await withAuthContext("actionListStudentListViews", (ctx) => listStudentListViewsTool(ctx));
    if (!result.ok) return { ok: false, message: result.error.message };
    return { ok: true, views: result.data };
  } catch (error) {
    logger.error("actionListStudentListViews failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "Görünümler yüklenirken beklenmeyen bir hata oluştu." };
  }
}

export type SaveStudentListViewActionResult = { ok: true } | { ok: false; message: string };

/** İsimle kaydet — aynı isimde varsa günceller (upsert), tenant içindeki tüm yöneticiler görebilir. */
export async function actionSaveStudentListView(input: {
  name: string;
  columns: string[];
}): Promise<SaveStudentListViewActionResult> {
  try {
    const result = await withAuthContext("actionSaveStudentListView", (ctx) => saveStudentListViewTool(ctx, input));
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true };
  } catch (error) {
    logger.error("actionSaveStudentListView failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "Görünüm kaydedilirken beklenmeyen bir hata oluştu." };
  }
}

export async function actionDeleteStudentListView(input: { id: string }): Promise<SaveStudentListViewActionResult> {
  try {
    const result = await withAuthContext("actionDeleteStudentListView", (ctx) => deleteStudentListViewTool(ctx, input));
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true };
  } catch (error) {
    logger.error("actionDeleteStudentListView failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "Görünüm silinirken beklenmeyen bir hata oluştu." };
  }
}

export type ArchiveTeacherActionResult =
  | { ok: true }
  | { ok: false; message: string; futureLessonCount?: number };

/** ÖNCELİK 4 (devam) — öğretmen arşivleme/geri alma — hard delete yok. */
export async function actionArchiveTeacher(input: {
  teacherId: string;
  archived: boolean;
}): Promise<ArchiveTeacherActionResult> {
  try {
    const result = await withAuthContext("actionArchiveTeacher", (ctx) => archiveTeacherTool(ctx, input));
    if (!result.ok) {
      const details = result.error.details as { futureLessonCount?: number } | undefined;
      return { ok: false, message: result.error.message, futureLessonCount: details?.futureLessonCount };
    }
    revalidateAll();
    return { ok: true };
  } catch (error) {
    logger.error("actionArchiveTeacher failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "Öğretmen durumu güncellenirken beklenmeyen bir hata oluştu." };
  }
}

export type UpdateRoomActionResult = { ok: true } | { ok: false; message: string };

/** ÖNCELİK 4 (devam) — oda düzenleme/pasife alma — hard delete yok. */
export async function actionUpdateRoom(input: {
  roomId: string;
  name?: string;
  capacity?: number;
  branchId?: string;
  active?: boolean;
}): Promise<UpdateRoomActionResult> {
  try {
    const result = await withAuthContext("actionUpdateRoom", (ctx) => updateRoomTool(ctx, input));
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true };
  } catch (error) {
    logger.error("actionUpdateRoom failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "Oda güncellenirken beklenmeyen bir hata oluştu." };
  }
}

export type CreateInstrumentActionResult = { ok: true } | { ok: false; message: string };

/** ÖNCELİK 4 (devam) — Yönetilebilir Enstrüman Kataloğu: yeni ekleme. */
export async function actionCreateInstrument(formData: FormData): Promise<CreateInstrumentActionResult> {
  try {
    const result = await withAuthContext("actionCreateInstrument", (ctx) =>
      createInstrumentCatalogTool(ctx, { name: String(formData.get("name") || "") })
    );
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true };
  } catch (error) {
    logger.error("actionCreateInstrument failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "Enstrüman eklenirken beklenmeyen bir hata oluştu." };
  }
}

export type UpdateInstrumentActionResult = { ok: true } | { ok: false; message: string };

/** ÖNCELİK 4 (devam) — Yönetilebilir Enstrüman Kataloğu: ad/durum güncelleme. */
export async function actionUpdateInstrument(input: {
  entryId: string;
  name?: string;
  status?: "active" | "archived";
}): Promise<UpdateInstrumentActionResult> {
  try {
    const result = await withAuthContext("actionUpdateInstrument", (ctx) => updateInstrumentCatalogTool(ctx, input));
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true };
  } catch (error) {
    logger.error("actionUpdateInstrument failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "Enstrüman güncellenirken beklenmeyen bir hata oluştu." };
  }
}

export type CreateStaffActionResult = { ok: true } | { ok: false; message: string };

function staffFormFields(formData: FormData) {
  const str = (key: string) => String(formData.get(key) || "") || undefined;
  return {
    name: str("name"),
    position: str("position"),
    phone: str("phone"),
    email: str("email"),
    address: str("address"),
    birthDate: str("birthDate"),
    nationalId: str("nationalId"),
    employeeNumber: str("employeeNumber"),
    hireDate: str("hireDate"),
    terminationDate: str("terminationDate"),
    department: str("department"),
    reportsToStaffId: str("reportsToStaffId"),
    employmentType: str("employmentType") as "full_time" | "part_time" | "contract" | "intern" | undefined,
    branchId: str("branchId"),
    annualLeaveAllowanceDays: str("annualLeaveAllowanceDays") ? Number(str("annualLeaveAllowanceDays")) : undefined,
    personnelNotes: str("personnelNotes"),
    notes: str("notes"),
    monthlySalary: str("monthlySalary") ? Number(str("monthlySalary")) : undefined,
    hourlyRate: str("hourlyRate") ? Number(str("hourlyRate")) : undefined,
    defaultBonus: str("defaultBonus") ? Number(str("defaultBonus")) : undefined,
    defaultAllowances: str("defaultAllowances") ? Number(str("defaultAllowances")) : undefined,
    defaultDeductions: str("defaultDeductions") ? Number(str("defaultDeductions")) : undefined,
    emergencyContactName: str("emergencyContactName"),
    emergencyContactPhone: str("emergencyContactPhone"),
    contractStartDate: str("contractStartDate"),
    contractEndDate: str("contractEndDate"),
    sgkStatus: str("sgkStatus"),
    iban: str("iban"),
    annualAdvanceLimit: str("annualAdvanceLimit") ? Number(str("annualAdvanceLimit")) : undefined,
  };
}

/** Personel Modülü — yeni kayıt (tam özlük dosyası + maaş yapısı alanları). */
export async function actionCreateStaffMember(formData: FormData): Promise<CreateStaffActionResult> {
  try {
    const result = await withAuthContext("actionCreateStaffMember", (ctx) =>
      createStaffMemberTool(ctx, staffFormFields(formData))
    );
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true };
  } catch (error) {
    logger.error("actionCreateStaffMember failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "Personel eklenirken beklenmeyen bir hata oluştu." };
  }
}

export type UpdateStaffActionResult = { ok: true } | { ok: false; message: string };

/** Personel Modülü — düzenleme / durum değişikliği. */
export async function actionUpdateStaffMember(input: {
  staffId: string;
  status?: "active" | "on_leave" | "passive" | "terminated";
  [key: string]: unknown;
}): Promise<UpdateStaffActionResult> {
  try {
    const result = await withAuthContext("actionUpdateStaffMember", (ctx) => updateStaffMemberTool(ctx, input));
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true };
  } catch (error) {
    logger.error("actionUpdateStaffMember failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "Personel güncellenirken beklenmeyen bir hata oluştu." };
  }
}

/** Faz 9A — personel detay sayfasındaki özlük düzenleme formu (FormData, actionCreateStaffMember ile AYNI alan seti). */
export async function actionUpdateStaffMemberExtended(staffId: string, formData: FormData): Promise<UpdateStaffActionResult> {
  return actionUpdateStaffMember({ staffId, ...staffFormFields(formData) });
}

export type PayrollActionResult = { ok: true } | { ok: false; message: string };

/** İş 3B — Bordro oluştur. */
export async function actionCreatePayrollRecord(formData: FormData): Promise<PayrollActionResult> {
  try {
    const result = await withAuthContext("actionCreatePayrollRecord", (ctx) =>
      createPayrollRecordTool(ctx, {
        staffId: String(formData.get("staffId") || ""),
        month: String(formData.get("month") || ""),
        grossAmount: Number(formData.get("grossAmount") || 0),
        netAmount: Number(formData.get("netAmount") || 0),
        extraPayment: formData.get("extraPayment") ? Number(formData.get("extraPayment")) : undefined,
        deduction: formData.get("deduction") ? Number(formData.get("deduction")) : undefined,
        paymentMethod: String(formData.get("paymentMethod") || "") || undefined,
        note: String(formData.get("note") || "") || undefined,
      })
    );
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true };
  } catch (error) {
    logger.error("actionCreatePayrollRecord failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "Bordro oluşturulurken beklenmeyen bir hata oluştu." };
  }
}

/** İş 3B — Bordro statü ilerlet (draft→pending_approval→approved→paid, veya cancelled). */
export async function actionUpdatePayrollStatus(input: {
  payrollId: string;
  status: "draft" | "pending_approval" | "approved" | "paid" | "cancelled";
  paymentDate?: string;
  paymentMethod?: string;
  note?: string;
}): Promise<PayrollActionResult> {
  try {
    const result = await withAuthContext("actionUpdatePayrollStatus", (ctx) => updatePayrollStatusTool(ctx, input));
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true };
  } catch (error) {
    logger.error("actionUpdatePayrollStatus failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "Bordro güncellenirken beklenmeyen bir hata oluştu." };
  }
}

export type LeaveActionResult = { ok: true } | { ok: false; message: string };

/** İş 3C — İzin talebi oluştur. */
export async function actionCreateLeaveRequest(formData: FormData): Promise<LeaveActionResult> {
  try {
    const result = await withAuthContext("actionCreateLeaveRequest", (ctx) =>
      createLeaveRequestTool(ctx, {
        staffId: String(formData.get("staffId") || ""),
        type: String(formData.get("type") || "annual"),
        startDate: String(formData.get("startDate") || ""),
        endDate: String(formData.get("endDate") || ""),
        description: String(formData.get("description") || "") || undefined,
      })
    );
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true };
  } catch (error) {
    logger.error("actionCreateLeaveRequest failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "İzin talebi oluşturulurken beklenmeyen bir hata oluştu." };
  }
}

/** İş 3C — İzin talebini onayla/reddet. */
export async function actionDecideLeaveRequest(input: {
  leaveId: string;
  status: "approved" | "rejected";
}): Promise<LeaveActionResult> {
  try {
    const result = await withAuthContext("actionDecideLeaveRequest", (ctx) => decideLeaveRequestTool(ctx, input));
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true };
  } catch (error) {
    logger.error("actionDecideLeaveRequest failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "İzin talebi karara bağlanırken beklenmeyen bir hata oluştu." };
  }
}

export type StaffAdvanceActionResult = { ok: true } | { ok: false; message: string };

/** Faz 9B — Avans talebi oluştur. */
export async function actionCreateStaffAdvance(formData: FormData): Promise<StaffAdvanceActionResult> {
  try {
    const result = await withAuthContext("actionCreateStaffAdvance", (ctx) =>
      createStaffAdvanceTool(ctx, {
        staffId: String(formData.get("staffId") || ""),
        amount: Number(formData.get("amount") || 0),
        requestDate: String(formData.get("requestDate") || ""),
        description: String(formData.get("description") || "") || undefined,
      })
    );
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true };
  } catch (error) {
    logger.error("actionCreateStaffAdvance failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "Avans talebi oluşturulurken beklenmeyen bir hata oluştu." };
  }
}

/** Faz 9B — Avans talebini onayla/reddet. */
export async function actionDecideStaffAdvance(input: {
  advanceId: string;
  status: "approved" | "rejected";
}): Promise<StaffAdvanceActionResult> {
  try {
    const result = await withAuthContext("actionDecideStaffAdvance", (ctx) => decideStaffAdvanceTool(ctx, input));
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true };
  } catch (error) {
    logger.error("actionDecideStaffAdvance failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "Avans talebi karara bağlanırken beklenmeyen bir hata oluştu." };
  }
}

/** Faz 9B — Onaylanmış avansı ödenmiş olarak işaretle. */
export async function actionMarkStaffAdvancePaid(input: {
  advanceId: string;
  paymentMethod?: string;
}): Promise<StaffAdvanceActionResult> {
  try {
    const result = await withAuthContext("actionMarkStaffAdvancePaid", (ctx) => markStaffAdvancePaidTool(ctx, input));
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true };
  } catch (error) {
    logger.error("actionMarkStaffAdvancePaid failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "Avans ödenmiş işaretlenirken beklenmeyen bir hata oluştu." };
  }
}

/** Faz 9B — Avans talebini iptal et. */
export async function actionCancelStaffAdvance(input: { advanceId: string }): Promise<StaffAdvanceActionResult> {
  try {
    const result = await withAuthContext("actionCancelStaffAdvance", (ctx) => cancelStaffAdvanceTool(ctx, input));
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true };
  } catch (error) {
    logger.error("actionCancelStaffAdvance failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "Avans talebi iptal edilirken beklenmeyen bir hata oluştu." };
  }
}

export type ExpenseActionResult = { ok: true } | { ok: false; message: string };

/** İş 3D — Gider kaydı (kira/fatura/sarf/diğer). Faz 10 — genişletilmiş alanlar. */
export async function actionCreateExpense(formData: FormData): Promise<ExpenseActionResult> {
  try {
    const str = (key: string) => String(formData.get(key) || "") || undefined;
    const result = await withAuthContext("actionCreateExpense", (ctx) =>
      createExpenseTool(ctx, {
        category: String(formData.get("category") || "other"),
        amount: Number(formData.get("amount") || 0),
        date: String(formData.get("date") || ""),
        note: str("note"),
        subcategory: str("subcategory"),
        supplier: str("supplier"),
        branchId: str("branchId"),
        taxAmount: str("taxAmount") ? Number(str("taxAmount")) : undefined,
        dueDate: str("dueDate"),
        paymentStatus: str("paymentStatus") as "pending" | "paid" | undefined,
        paymentMethod: str("paymentMethod"),
      })
    );
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true };
  } catch (error) {
    logger.error("actionCreateExpense failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "Gider eklenirken beklenmeyen bir hata oluştu." };
  }
}

/** Faz 10 — bir gideri ödenmiş işaretle. */
export async function actionMarkExpensePaid(input: { expenseId: string }): Promise<ExpenseActionResult> {
  try {
    const result = await withAuthContext("actionMarkExpensePaid", (ctx) => markExpensePaidTool(ctx, input));
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true };
  } catch (error) {
    logger.error("actionMarkExpensePaid failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "Gider ödenmiş işaretlenirken beklenmeyen bir hata oluştu." };
  }
}

/** Faz 10 (adım 3) — tekrarlayan gider kuralı oluştur. */
export async function actionCreateRecurringExpenseRule(formData: FormData): Promise<ExpenseActionResult> {
  try {
    const str = (key: string) => String(formData.get(key) || "") || undefined;
    const result = await withAuthContext("actionCreateRecurringExpenseRule", (ctx) =>
      createRecurringExpenseRuleTool(ctx, {
        category: String(formData.get("category") || "other"),
        amount: Number(formData.get("amount") || 0),
        frequency: String(formData.get("frequency") || "monthly"),
        nextRunDate: String(formData.get("nextRunDate") || ""),
        subcategory: str("subcategory"),
        supplier: str("supplier"),
        branchId: str("branchId"),
        note: str("note"),
      })
    );
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true };
  } catch (error) {
    logger.error("actionCreateRecurringExpenseRule failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "Tekrarlayan gider kuralı oluşturulurken beklenmeyen bir hata oluştu." };
  }
}

/** Faz 10 (adım 3) — tekrarlayan gider kuralını aktif/pasif yap. */
export async function actionSetRecurringExpenseRuleActive(input: {
  ruleId: string;
  active: boolean;
}): Promise<ExpenseActionResult> {
  try {
    const result = await withAuthContext("actionSetRecurringExpenseRuleActive", (ctx) =>
      setRecurringExpenseRuleActiveTool(ctx, input)
    );
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true };
  } catch (error) {
    logger.error("actionSetRecurringExpenseRuleActive failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "Kural güncellenirken beklenmeyen bir hata oluştu." };
  }
}

/** Faz 10 (adım 3) — vadesi gelmiş tekrarlayan gider kurallarını şimdi çalıştır. */
export async function actionTickRecurringExpenseRules(): Promise<ExpenseActionResult> {
  try {
    const result = await withAuthContext("actionTickRecurringExpenseRules", (ctx) => tickRecurringExpenseRulesTool(ctx, {}));
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true };
  } catch (error) {
    logger.error("actionTickRecurringExpenseRules failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "Tekrarlayan giderler çalıştırılırken beklenmeyen bir hata oluştu." };
  }
}

/** Faz 10 (adım 3) — kategori/şube/dönem bazlı hedef gider tutarını oluştur/güncelle. */
export async function actionUpsertBudget(formData: FormData): Promise<ExpenseActionResult> {
  try {
    const str = (key: string) => String(formData.get(key) || "") || undefined;
    const result = await withAuthContext("actionUpsertBudget", (ctx) =>
      upsertBudgetTool(ctx, {
        category: String(formData.get("category") || "other"),
        branchId: str("branchId"),
        period: String(formData.get("period") || ""),
        targetAmount: Number(formData.get("targetAmount") || 0),
      })
    );
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true };
  } catch (error) {
    logger.error("actionUpsertBudget failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "Bütçe kaydedilirken beklenmeyen bir hata oluştu." };
  }
}

export type UpdateCommunicationPreferenceActionResult = { ok: true } | { ok: false; message: string };

/** EPIC 1 — veli kendi çocuğu için, admin herkes için çağırabilir (tool katmanı RBAC'ı uygular). */
export async function actionUpdateCommunicationPreference(input: {
  studentId: string;
  communicationOptOut: boolean;
}): Promise<UpdateCommunicationPreferenceActionResult> {
  try {
    const result = await withAuthContext("actionUpdateCommunicationPreference", (ctx) =>
      updateCommunicationPreferenceTool(ctx, input)
    );
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true };
  } catch (error) {
    logger.error("actionUpdateCommunicationPreference failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "İletişim tercihi güncellenirken beklenmeyen bir hata oluştu." };
  }
}

export type UpdateCollectionsSettingsActionResult = { ok: true } | { ok: false; message: string };

export async function actionUpdateCollectionsSettings(input: {
  frequencyLimitDays: number;
  autoSendEnabled: boolean;
  vakifbankIban?: string;
  halkbankIban?: string;
}): Promise<UpdateCollectionsSettingsActionResult> {
  try {
    const result = await withAuthContext("actionUpdateCollectionsSettings", (ctx) =>
      updateCollectionsSettingsTool(ctx, input)
    );
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true };
  } catch (error) {
    logger.error("actionUpdateCollectionsSettings failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return {
      ok: false,
      message: "Tahsilat otomasyon ayarları güncellenirken beklenmeyen bir hata oluştu.",
    };
  }
}

export type MarkNotificationReadActionResult = { ok: true } | { ok: false; message: string };

export async function actionMarkNotificationRead(
  notificationId: string
): Promise<MarkNotificationReadActionResult> {
  try {
    const result = await withAuthContext("actionMarkNotificationRead", (ctx) =>
      markNotificationReadTool(ctx, { notificationId })
    );
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidatePath("/veli");
    revalidatePath("/panel/bildirimler");
    return { ok: true };
  } catch (error) {
    logger.error("actionMarkNotificationRead failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "Bildirim okundu işaretlenirken beklenmeyen bir hata oluştu." };
  }
}

/**
 * P0 (2026-08-29) — `actionAddStudent` ile AYNI YAPISAL kusuru taşıyordu:
 * `assertOk` doğrulama hatasında throw ediyordu, form `useActionState` YOK
 * bir `<form action={actionAddTeacher}>` ile bağlıydı — herhangi bir
 * `createTeacherTool` VALIDATION_ERROR'u (ör. bu oturumda eklenen "Geçersiz
 * veya pasif enstrüman" kontrolü) doğrudan istemciye Runtime Error olarak
 * sızardı. `actionAddStudent` ile AYNI düzeltme uygulandı.
 */
export type NewTeacherFormState =
  | { ok: false; formError?: string; fieldErrors?: Record<string, string> }
  | { ok: true; inviteWarning: string }
  | null;

export async function actionAddTeacher(_prevState: NewTeacherFormState, formData: FormData): Promise<NewTeacherFormState> {
  let inviteWarning: string | undefined;
  try {
    await withAuthContext("actionAddTeacher", async (ctx) => {
      // ÖNCELİK 4 (devam) — çoklu enstrüman+seviye, "TeacherInstrumentsField"
      // client bileşeninin gizli JSON input'undan gelir; verilmezse (veya
      // geçersizse) legacy tek-enstrüman davranışı korunur.
      let instrumentLevels: { instrument: string; level: string }[] | undefined;
      const rawInstrumentLevels = String(formData.get("instrumentLevelsJson") || "");
      if (rawInstrumentLevels) {
        try {
          const parsed = JSON.parse(rawInstrumentLevels);
          if (Array.isArray(parsed) && parsed.length > 0) instrumentLevels = parsed;
        } catch {
          // geçersiz JSON — legacy tek-enstrüman davranışına düş
        }
      }
      // Oluşturma anında müsaitlik — "TeacherAvailabilityField" client
      // bileşeninin gizli JSON input'undan gelir; verilmezse (veya geçersizse)
      // createTeacherTool'daki varsayılan müsaitliğe düşülür.
      let availability: { dayOfWeek: number; start: string; end: string }[] | undefined;
      const rawAvailability = String(formData.get("availabilityJson") || "");
      if (rawAvailability) {
        try {
          const parsed = JSON.parse(rawAvailability);
          if (Array.isArray(parsed)) availability = parsed;
        } catch {
          // geçersiz JSON — varsayılan müsaitliğe düş
        }
      }
      const createdResult = await createTeacherTool(ctx, {
        name: String(formData.get("name") || ""),
        email: String(formData.get("email") || ""),
        phone: String(formData.get("phone") || ""),
        branchId: String(formData.get("branchId") || ""),
        instrument: String(formData.get("instrument") || "Piyano"),
        instrumentLevels,
        availability,
        highSchool: String(formData.get("highSchool") || "") || undefined,
        university: String(formData.get("university") || "") || undefined,
        graduationYear: (() => {
          const raw = String(formData.get("graduationYear") || "");
          return raw ? Number(raw) : undefined;
        })(),
        birthDate: String(formData.get("birthDate") || "") || undefined,
        address: String(formData.get("address") || "") || undefined,
        contractStartDate: String(formData.get("contractStartDate") || "") || undefined,
        contractEndDate: String(formData.get("contractEndDate") || "") || undefined,
        employmentType: (() => {
          const raw = String(formData.get("employmentType") || "");
          return raw === "tam_zamanli" || raw === "yari_zamanli" || raw === "serbest" ? raw : undefined;
        })(),
        hireDate: String(formData.get("hireDate") || "") || undefined,
        emergencyContactName: String(formData.get("emergencyContactName") || "") || undefined,
        emergencyContactPhone: String(formData.get("emergencyContactPhone") || "") || undefined,
        weeklyHoursThreshold: (() => {
          const raw = String(formData.get("weeklyHoursThreshold") || "");
          return raw ? Number(raw) : undefined;
        })(),
        personnelNotes: String(formData.get("personnelNotes") || "") || undefined,
      });
      if (!createdResult.ok) {
        throw new ToolValidationFailure(createdResult.error);
      }
      const created = createdResult.data;

      // T.C. kimlik — şifreli saklama, mevcut setNationalIdTool üzerinden
      // (öğrenci create formuyla aynı desen — asla düz metin bir yere yazılmaz).
      const nationalId = String(formData.get("nationalId") || "").trim();
      if (nationalId) {
        await setNationalIdTool(ctx, { entity: "teacher", entityId: created.teacherId, nationalId });
      }

      // Portal erişim yönetimi görevi — `actionAddStudent`'taki AYNI desen:
      // işaretlenmediyse SESSİZCE atlanır (bu ekranda giriş hesabı açmak
      // DEFAULT DEĞİL). Davet gönderimi BAŞARISIZ olursa öğretmen kaydı
      // BAŞARISIZ SAYILMAZ — yalnızca bir uyarı olarak taşınır.
      const inviteToPortal = formData.get("inviteToPortal") === "1";
      if (inviteToPortal) {
        try {
          const inviteResult = await inviteTeacherAccountTool(ctx, { teacherId: created.teacherId });
          if (!inviteResult.ok) {
            inviteWarning = inviteResult.error.message;
            logger.warn("actionAddTeacher — portal daveti reddedildi", {
              code: inviteResult.error.code,
              message: inviteResult.error.message,
            });
          } else if (!inviteResult.data.delivered) {
            inviteWarning =
              "Davet kaydı oluşturuldu ama e-posta gönderilemedi (e-posta sağlayıcısı yapılandırılmamış olabilir).";
          }
        } catch (inviteError) {
          inviteWarning = "Davet gönderilirken beklenmeyen bir hata oluştu.";
          logger.error("actionAddTeacher — portal daveti sırasında beklenmeyen hata", inviteError);
        }
      }
    });
    revalidateAll();
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    if (error instanceof WriteScopeDeniedError) {
      return { ok: false, formError: error.message };
    }
    if (error instanceof ToolValidationFailure) {
      logger.warn("actionAddTeacher — doğrulama hatası (kullanıcıya gösterildi)", {
        code: error.serviceError.code,
        message: error.serviceError.message,
      });
      const fieldErrors = fieldErrorsFromZodFlatten(error.serviceError.details);
      return {
        ok: false,
        formError:
          error.serviceError.message === "Invalid input"
            ? "Formda düzeltilmesi gereken alanlar var — aşağıda işaretlendi."
            : error.serviceError.message,
        fieldErrors,
      };
    }
    logger.error("actionAddTeacher failed", error);
    return { ok: false, formError: "Öğretmen oluşturulurken beklenmeyen bir hata oluştu. Lütfen tekrar deneyin." };
  }
  if (inviteWarning) return { ok: true, inviteWarning };
  return null;
}

export type UpdateTeacherInstrumentsActionResult = { ok: true } | { ok: false; message: string };

export async function actionUpdateTeacherInstruments(input: {
  teacherId: string;
  instrumentLevels: { instrument: string; level: string }[];
}): Promise<UpdateTeacherInstrumentsActionResult> {
  try {
    const result = await withAuthContext("actionUpdateTeacherInstruments", (ctx) =>
      updateTeacherInstrumentsTool(ctx, input)
    );
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true };
  } catch (error) {
    logger.error("actionUpdateTeacherInstruments failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "Enstrüman/seviye güncellenirken beklenmeyen bir hata oluştu." };
  }
}

export type UpdateTeacherProfileActionResult = { ok: true } | { ok: false; message: string };

/**
 * Package D — öğretmen özlük/idari alanları + ek şube ataması. RBAC/hesap
 * tek kaynağı `updateTeacherProfileTool`'dadır — bu action yalnız ince bir sarmalayıcı.
 */
export async function actionUpdateTeacherProfile(input: {
  teacherId: string;
  name?: string;
  email?: string;
  phone?: string;
  branchIds?: string[];
  employmentType?: "tam_zamanli" | "yari_zamanli" | "serbest";
  hireDate?: string;
  terminationDate?: string;
  contractStartDate?: string;
  contractEndDate?: string;
  birthDate?: string;
  address?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  personnelNotes?: string;
}): Promise<UpdateTeacherProfileActionResult> {
  try {
    const result = await withAuthContext("actionUpdateTeacherProfile", (ctx) =>
      updateTeacherProfileTool(ctx, input)
    );
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true };
  } catch (error) {
    logger.error("actionUpdateTeacherProfile failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "Öğretmen profili güncellenirken beklenmeyen bir hata oluştu." };
  }
}

export type SetNationalIdActionResult = { ok: true; masked: string } | { ok: false; message: string };

/** Öğrenci create formundakiyle aynı `setNationalIdTool` yolunu kullanan genel amaçlı action. */
export async function actionSetNationalId(input: {
  entity: "student" | "teacher";
  entityId: string;
  nationalId: string;
}): Promise<SetNationalIdActionResult> {
  try {
    const result = await withAuthContext("actionSetNationalId", (ctx) => setNationalIdTool(ctx, input));
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true, masked: result.data.masked };
  } catch (error) {
    logger.error("actionSetNationalId failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "T.C. kimlik kaydedilirken beklenmeyen bir hata oluştu." };
  }
}

export type CreatePackageActionResult = { ok: true; packageId: string } | { ok: false; message: string };

export async function actionCreatePackage(formData: FormData): Promise<CreatePackageActionResult> {
  try {
    return await withAuthContext("actionCreatePackage", async (ctx) => {
      const result = await createPackageTool(ctx, {
        title: String(formData.get("title") || ""),
        description: String(formData.get("description") || "") || undefined,
        price30Min: Number(formData.get("price30Min") || 0),
        price40Min: Number(formData.get("price40Min") || 0),
        price50Min: Number(formData.get("price50Min") || 0),
        termLabel: (() => {
          const raw = String(formData.get("termLabel") || "");
          return raw === "guz" || raw === "yaz" ? raw : undefined;
        })(),
        monthlyLessonCount: formData.get("monthlyLessonCount")
          ? Number(formData.get("monthlyLessonCount"))
          : undefined,
        groupLessonCount: formData.get("groupLessonCount") ? Number(formData.get("groupLessonCount")) : undefined,
        defaultDurationMinutes: (() => {
          const raw = String(formData.get("defaultDurationMinutes") || "");
          return raw === "30" || raw === "40" || raw === "50" ? Number(raw) : undefined;
        })(),
        defaultPaymentDueDay: formData.get("defaultPaymentDueDay")
          ? Number(formData.get("defaultPaymentDueDay"))
          : undefined,
        notes: String(formData.get("notes") || "") || undefined,
      });
      if (!result.ok) return { ok: false as const, message: result.error.message };
      revalidateAll();
      return { ok: true as const, packageId: result.data.packageId };
    });
  } catch (error) {
    logger.error("actionCreatePackage failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "Paket oluşturulurken beklenmeyen bir hata oluştu." };
  }
}

export type UpdatePackageActionResult = { ok: true } | { ok: false; message: string };

export async function actionUpdatePackage(input: {
  packageId: string;
  title?: string;
  description?: string;
  price30Min?: number;
  price40Min?: number;
  price50Min?: number;
  termLabel?: "guz" | "yaz";
  status?: "active" | "archived";
  monthlyLessonCount?: number;
  groupLessonCount?: number;
  defaultDurationMinutes?: number;
  defaultPaymentDueDay?: number;
  notes?: string;
}): Promise<UpdatePackageActionResult> {
  try {
    const result = await withAuthContext("actionUpdatePackage", (ctx) => updatePackageTool(ctx, input));
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true };
  } catch (error) {
    logger.error("actionUpdatePackage failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "Paket güncellenirken beklenmeyen bir hata oluştu." };
  }
}

export type CreateDiscountCampaignInput = {
  name: string;
  kind: "sibling";
  discountPercent: number;
  validFrom?: string;
  validTo?: string;
  branchId?: string;
};

export type CreateDiscountCampaignActionResult = { ok: true; campaignId: string } | { ok: false; message: string };

export async function actionCreateDiscountCampaign(
  input: CreateDiscountCampaignInput
): Promise<CreateDiscountCampaignActionResult> {
  try {
    const result = await withAuthContext("actionCreateDiscountCampaign", (ctx) =>
      createDiscountCampaignTool(ctx, input)
    );
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true, campaignId: result.data.campaignId };
  } catch (error) {
    logger.error("actionCreateDiscountCampaign failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "Kampanya oluşturulurken beklenmeyen bir hata oluştu." };
  }
}

export type UpdateDiscountCampaignInput = {
  campaignId: string;
  name?: string;
  discountPercent?: number;
  active?: boolean;
  validFrom?: string;
  validTo?: string;
};

export type UpdateDiscountCampaignActionResult = { ok: true } | { ok: false; message: string };

export async function actionUpdateDiscountCampaign(
  input: UpdateDiscountCampaignInput
): Promise<UpdateDiscountCampaignActionResult> {
  try {
    const result = await withAuthContext("actionUpdateDiscountCampaign", (ctx) =>
      updateDiscountCampaignTool(ctx, input)
    );
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true };
  } catch (error) {
    logger.error("actionUpdateDiscountCampaign failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "Kampanya güncellenirken beklenmeyen bir hata oluştu." };
  }
}

export type AddBranchFormState = {
  ok: false;
  formError?: string;
  fieldErrors?: Record<string, string>;
} | null;

/** P0 (2026-08-29) — `actionAddStudent` ile AYNI çökme deseni taşıyordu; AYNI düzeltme uygulandı. */
export async function actionAddBranch(_prevState: AddBranchFormState, formData: FormData): Promise<AddBranchFormState> {
  try {
    await withAuthContext("actionAddBranch", async (ctx) => {
      const result = await createBranchTool(ctx, {
        name: String(formData.get("name") || ""),
        shortName: String(formData.get("shortName") || ""),
        city: String(formData.get("city") || ""),
        phone: String(formData.get("phone") || ""),
        address: String(formData.get("address") || ""),
      });
      if (!result.ok) {
        throw new ToolValidationFailure(result.error);
      }
    });
    revalidateAll();
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    if (error instanceof WriteScopeDeniedError) {
      return { ok: false, formError: error.message };
    }
    if (error instanceof ToolValidationFailure) {
      logger.warn("actionAddBranch — doğrulama hatası (kullanıcıya gösterildi)", {
        code: error.serviceError.code,
        message: error.serviceError.message,
      });
      const fieldErrors = fieldErrorsFromZodFlatten(error.serviceError.details);
      return {
        ok: false,
        formError:
          error.serviceError.message === "Invalid input"
            ? "Formda düzeltilmesi gereken alanlar var — aşağıda işaretlendi."
            : error.serviceError.message,
        fieldErrors,
      };
    }
    logger.error("actionAddBranch failed", error);
    return { ok: false, formError: "Şube oluşturulurken beklenmeyen bir hata oluştu. Lütfen tekrar deneyin." };
  }
  return null;
}

export type UpdateBranchFormState = {
  ok: false;
  formError?: string;
  fieldErrors?: Record<string, string>;
} | null;

/** P0 (2026-08-29) — `actionAddBranch` ile AYNI düzeltme. */
export async function actionUpdateBranch(_prevState: UpdateBranchFormState, formData: FormData): Promise<UpdateBranchFormState> {
  try {
    await withAuthContext("actionUpdateBranch", async (ctx) => {
      const result = await updateBranchTool(ctx, {
        branchId: String(formData.get("branchId") || ""),
        name: String(formData.get("name") || ""),
        shortName: String(formData.get("shortName") || ""),
        city: String(formData.get("city") || ""),
        phone: String(formData.get("phone") || ""),
        address: String(formData.get("address") || ""),
      });
      if (!result.ok) {
        throw new ToolValidationFailure(result.error);
      }
    });
    revalidateAll();
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    if (error instanceof WriteScopeDeniedError) {
      return { ok: false, formError: error.message };
    }
    if (error instanceof ToolValidationFailure) {
      logger.warn("actionUpdateBranch — doğrulama hatası (kullanıcıya gösterildi)", {
        code: error.serviceError.code,
        message: error.serviceError.message,
      });
      const fieldErrors = fieldErrorsFromZodFlatten(error.serviceError.details);
      return {
        ok: false,
        formError:
          error.serviceError.message === "Invalid input"
            ? "Formda düzeltilmesi gereken alanlar var — aşağıda işaretlendi."
            : error.serviceError.message,
        fieldErrors,
      };
    }
    logger.error("actionUpdateBranch failed", error);
    return { ok: false, formError: "Şube güncellenirken beklenmeyen bir hata oluştu. Lütfen tekrar deneyin." };
  }
  return null;
}

export type ImportPreviewActionResult<T> =
  | { ok: true; preview: ImportPreview<T> }
  | { ok: false; message: string };

export type ImportCommitActionResult =
  | { ok: true; result: ImportCommitResult }
  | { ok: false; message: string };

export async function actionPreviewBranchImport(csvText: string): Promise<ImportPreviewActionResult<BranchImportRow>> {
  try {
    const result = await withAuthContext("actionPreviewBranchImport", (ctx) => previewBranchImportTool(ctx, { csvText }));
    if (!result.ok) return { ok: false, message: result.error.message };
    return { ok: true, preview: result.data };
  } catch (error) {
    logger.error("actionPreviewBranchImport failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    if (error instanceof WriteScopeDeniedError) return { ok: false, message: error.message };
    return { ok: false, message: "Önizleme sırasında beklenmeyen bir hata oluştu." };
  }
}

export async function actionCommitBranchImport(csvText: string): Promise<ImportCommitActionResult> {
  try {
    const result = await withAuthContext("actionCommitBranchImport", (ctx) => commitBranchImportTool(ctx, { csvText }));
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true, result: result.data };
  } catch (error) {
    logger.error("actionCommitBranchImport failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    if (error instanceof WriteScopeDeniedError) return { ok: false, message: error.message };
    return { ok: false, message: "İçe aktarım sırasında beklenmeyen bir hata oluştu." };
  }
}

export async function actionPreviewTeacherImport(csvText: string): Promise<ImportPreviewActionResult<TeacherImportRow>> {
  try {
    const result = await withAuthContext("actionPreviewTeacherImport", (ctx) => previewTeacherImportTool(ctx, { csvText }));
    if (!result.ok) return { ok: false, message: result.error.message };
    return { ok: true, preview: result.data };
  } catch (error) {
    logger.error("actionPreviewTeacherImport failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    if (error instanceof WriteScopeDeniedError) return { ok: false, message: error.message };
    return { ok: false, message: "Önizleme sırasında beklenmeyen bir hata oluştu." };
  }
}

export async function actionCommitTeacherImport(csvText: string): Promise<ImportCommitActionResult> {
  try {
    const result = await withAuthContext("actionCommitTeacherImport", (ctx) => commitTeacherImportTool(ctx, { csvText }));
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true, result: result.data };
  } catch (error) {
    logger.error("actionCommitTeacherImport failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    if (error instanceof WriteScopeDeniedError) return { ok: false, message: error.message };
    return { ok: false, message: "İçe aktarım sırasında beklenmeyen bir hata oluştu." };
  }
}

export async function actionPreviewRoomImport(csvText: string): Promise<ImportPreviewActionResult<RoomImportRow>> {
  try {
    const result = await withAuthContext("actionPreviewRoomImport", (ctx) => previewRoomImportTool(ctx, { csvText }));
    if (!result.ok) return { ok: false, message: result.error.message };
    return { ok: true, preview: result.data };
  } catch (error) {
    logger.error("actionPreviewRoomImport failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    if (error instanceof WriteScopeDeniedError) return { ok: false, message: error.message };
    return { ok: false, message: "Önizleme sırasında beklenmeyen bir hata oluştu." };
  }
}

export async function actionCommitRoomImport(csvText: string): Promise<ImportCommitActionResult> {
  try {
    const result = await withAuthContext("actionCommitRoomImport", (ctx) => commitRoomImportTool(ctx, { csvText }));
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true, result: result.data };
  } catch (error) {
    logger.error("actionCommitRoomImport failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    if (error instanceof WriteScopeDeniedError) return { ok: false, message: error.message };
    return { ok: false, message: "İçe aktarım sırasında beklenmeyen bir hata oluştu." };
  }
}

export async function actionPreviewLessonImport(csvText: string): Promise<ImportPreviewActionResult<LessonImportRow>> {
  try {
    const result = await withAuthContext("actionPreviewLessonImport", (ctx) => previewLessonImportTool(ctx, { csvText }));
    if (!result.ok) return { ok: false, message: result.error.message };
    return { ok: true, preview: result.data };
  } catch (error) {
    logger.error("actionPreviewLessonImport failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    if (error instanceof WriteScopeDeniedError) return { ok: false, message: error.message };
    return { ok: false, message: "Önizleme sırasında beklenmeyen bir hata oluştu." };
  }
}

export async function actionCommitLessonImport(csvText: string): Promise<ImportCommitActionResult> {
  try {
    const result = await withAuthContext("actionCommitLessonImport", (ctx) => commitLessonImportTool(ctx, { csvText }));
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true, result: result.data };
  } catch (error) {
    logger.error("actionCommitLessonImport failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    if (error instanceof WriteScopeDeniedError) return { ok: false, message: error.message };
    return { ok: false, message: "İçe aktarım sırasında beklenmeyen bir hata oluştu." };
  }
}

export type LessonScheduleImportPreviewActionResult =
  | { ok: true; preview: LessonScheduleImportPreview }
  | { ok: false; message: string };

/** İş 1 — Ders Programı CSV importu (tekrarlayan seri desteği). */
export async function actionPreviewLessonScheduleImport(csvText: string): Promise<LessonScheduleImportPreviewActionResult> {
  try {
    const result = await withAuthContext("actionPreviewLessonScheduleImport", (ctx) =>
      previewLessonScheduleImportTool(ctx, { csvText })
    );
    if (!result.ok) return { ok: false, message: result.error.message };
    return { ok: true, preview: result.data };
  } catch (error) {
    logger.error("actionPreviewLessonScheduleImport failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    if (error instanceof WriteScopeDeniedError) return { ok: false, message: error.message };
    return { ok: false, message: "Önizleme sırasında beklenmeyen bir hata oluştu." };
  }
}

export type LessonScheduleImportCommitActionResult =
  | { ok: true; result: LessonScheduleImportCommitResult }
  | { ok: false; message: string };

/** `allowAvailabilityOverride: true` yalnızca kullanıcı önizlemedeki uyarıları görüp AÇIKÇA onayladıysa gönderilmeli. */
export async function actionCommitLessonScheduleImport(
  csvText: string,
  allowAvailabilityOverride?: boolean
): Promise<LessonScheduleImportCommitActionResult> {
  try {
    const result = await withAuthContext("actionCommitLessonScheduleImport", (ctx) =>
      commitLessonScheduleImportTool(ctx, { csvText, allowAvailabilityOverride })
    );
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true, result: result.data };
  } catch (error) {
    logger.error("actionCommitLessonScheduleImport failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    if (error instanceof WriteScopeDeniedError) return { ok: false, message: error.message };
    return { ok: false, message: "İçe aktarım sırasında beklenmeyen bir hata oluştu." };
  }
}

export async function actionPreviewStudentImport(csvText: string): Promise<ImportPreviewActionResult<StudentImportRow>> {
  try {
    const result = await withAuthContext("actionPreviewStudentImport", (ctx) => previewStudentImportTool(ctx, { csvText }));
    if (!result.ok) return { ok: false, message: result.error.message };
    return { ok: true, preview: result.data };
  } catch (error) {
    logger.error("actionPreviewStudentImport failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    if (error instanceof WriteScopeDeniedError) return { ok: false, message: error.message };
    return { ok: false, message: "Önizleme sırasında beklenmeyen bir hata oluştu." };
  }
}

export async function actionCommitStudentImport(csvText: string): Promise<ImportCommitActionResult> {
  try {
    const result = await withAuthContext("actionCommitStudentImport", (ctx) => commitStudentImportTool(ctx, { csvText }));
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true, result: result.data };
  } catch (error) {
    logger.error("actionCommitStudentImport failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    if (error instanceof WriteScopeDeniedError) return { ok: false, message: error.message };
    return { ok: false, message: "İçe aktarım sırasında beklenmeyen bir hata oluştu." };
  }
}

export async function actionPreviewHistoricalContractImport(
  csvText: string
): Promise<ImportPreviewActionResult<HistoricalContractImportRow>> {
  try {
    const result = await withAuthContext("actionPreviewHistoricalContractImport", (ctx) =>
      previewHistoricalContractImportTool(ctx, { csvText })
    );
    if (!result.ok) return { ok: false, message: result.error.message };
    return { ok: true, preview: result.data };
  } catch (error) {
    logger.error("actionPreviewHistoricalContractImport failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    if (error instanceof WriteScopeDeniedError) return { ok: false, message: error.message };
    return { ok: false, message: "Önizleme sırasında beklenmeyen bir hata oluştu." };
  }
}

export async function actionCommitHistoricalContractImport(
  csvText: string
): Promise<{ ok: true; result: { created: number; updated: number; skipped: number } } | { ok: false; message: string }> {
  try {
    const result = await withAuthContext("actionCommitHistoricalContractImport", (ctx) =>
      commitHistoricalContractImportTool(ctx, { csvText })
    );
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true, result: { created: result.data.created, updated: 0, skipped: result.data.skipped } };
  } catch (error) {
    logger.error("actionCommitHistoricalContractImport failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    if (error instanceof WriteScopeDeniedError) return { ok: false, message: error.message };
    return { ok: false, message: "İçe aktarım sırasında beklenmeyen bir hata oluştu." };
  }
}

export type AddRoomFormState = {
  ok: false;
  formError?: string;
  fieldErrors?: Record<string, string>;
} | null;

/** P0 (2026-08-29) — `actionAddStudent` ile AYNI çökme deseni taşıyordu; AYNI düzeltme uygulandı. */
export async function actionAddRoom(_prevState: AddRoomFormState, formData: FormData): Promise<AddRoomFormState> {
  try {
    await withAuthContext("actionAddRoom", async (ctx) => {
      const result = await createRoomTool(ctx, {
        name: String(formData.get("name") || ""),
        branchId: String(formData.get("branchId") || ""),
        capacity: Number(formData.get("capacity") || 2),
        instruments: formData.getAll("instruments").map(String),
      });
      if (!result.ok) {
        throw new ToolValidationFailure(result.error);
      }
    });
    revalidateAll();
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    if (error instanceof WriteScopeDeniedError) {
      return { ok: false, formError: error.message };
    }
    if (error instanceof ToolValidationFailure) {
      logger.warn("actionAddRoom — doğrulama hatası (kullanıcıya gösterildi)", {
        code: error.serviceError.code,
        message: error.serviceError.message,
      });
      const fieldErrors = fieldErrorsFromZodFlatten(error.serviceError.details);
      return {
        ok: false,
        formError:
          error.serviceError.message === "Invalid input"
            ? "Formda düzeltilmesi gereken alanlar var — aşağıda işaretlendi."
            : error.serviceError.message,
        fieldErrors,
      };
    }
    logger.error("actionAddRoom failed", error);
    return { ok: false, formError: "Oda oluşturulurken beklenmeyen bir hata oluştu. Lütfen tekrar deneyin." };
  }
  return null;
}

export type LessonActionResult =
  | { ok: true; lessonId: string; communication: LessonCommunicationDraft | null }
  | { ok: false; message: string; overridable?: boolean };

/**
 * Hata durumunda fırlatmaz — Program Stüdyosu client bileşeni sonucu
 * doğrudan gösterip forma bağlamında Türkçe bir hata göstersin diye
 * `{ ok: false, message }` döner. Başarıda, ders için otomatik gönderim
 * yapılmayan veli/öğretmen iletişim taslağını da birlikte döndürür.
 */
export async function actionAddLesson(formData: FormData): Promise<LessonActionResult> {
  try {
    const result = await withAuthContext("actionAddLesson", async (ctx) => {
      const startAtRaw = String(formData.get("startAt") || "");
      const startAt = startAtRaw ? new Date(startAtRaw).toISOString() : "";
      const durationRaw = formData.get("durationMinutes");
      const termRaw = formData.get("term");
      const academicYearStartRaw = formData.get("academicYearStart");
      const created = await createLessonTool(ctx, {
        studentId: String(formData.get("studentId") || ""),
        teacherId: String(formData.get("teacherId") || ""),
        roomId: String(formData.get("roomId") || ""),
        instrument: String(formData.get("instrument") || "Piyano"),
        startAt,
        durationMinutes: durationRaw ? Number(durationRaw) : undefined,
        term: termRaw === "guz" || termRaw === "yaz" ? termRaw : undefined,
        academicYearStart: academicYearStartRaw ? Number(academicYearStartRaw) : undefined,
        overrideAvailability: formData.get("overrideAvailability") === "true",
      });
      if (!created.ok) {
        const details = created.error.details as { overridable?: boolean } | undefined;
        return { ok: false as const, message: created.error.message, overridable: details?.overridable };
      }

      const data = await readData();
      const lesson = data.lessons.find((l) => l.id === created.data.lessonId);
      const student = data.students.find((s) => s.id === lesson?.studentId);
      const teacher = data.teachers.find((t) => t.id === lesson?.teacherId);
      const branch = data.settings.branches.find((b) => b.id === lesson?.branchId);
      const communication =
        lesson && student && teacher
          ? buildLessonCommunicationDraft(
              data.settings.name,
              student,
              teacher,
              lesson,
              branch?.shortName ?? ""
            )
          : null;

      return { ok: true as const, lessonId: created.data.lessonId, communication };
    });
    if (result.ok) revalidateAll();
    return result;
  } catch (error) {
    logger.error("actionAddLesson failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    if (error instanceof WriteScopeDeniedError) return { ok: false, message: error.message };
    return { ok: false, message: "Ders planlanırken beklenmeyen bir hata oluştu." };
  }
}

export type SuggestLessonSlotsResult =
  | { ok: true; suggestions: LessonSlotSuggestion[] }
  | { ok: false; message: string };

export async function actionSuggestLessonSlots(input: {
  studentId: string;
  instrument: string;
  teacherId?: string;
  daysAhead?: number;
  maxSlots?: number;
}): Promise<SuggestLessonSlotsResult> {
  try {
    return await withAuthContext("actionSuggestLessonSlots", async (ctx) => {
      const result = await suggestLessonSlotsTool(ctx, input);
      if (!result.ok) return { ok: false as const, message: result.error.message };
      return { ok: true as const, suggestions: result.data.suggestions };
    });
  } catch (error) {
    logger.error("actionSuggestLessonSlots failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    if (error instanceof WriteScopeDeniedError) return { ok: false, message: error.message };
    return { ok: false, message: "Uygun saatler aranırken beklenmeyen bir hata oluştu." };
  }
}

export type LessonUpdateActionResult =
  | { ok: true; lessonId: string; startAt: string; endAt: string }
  | { ok: false; message: string };

/**
 * Sürükle-bırak taşıma, resize ve ileride manuel "dersi taşı" formu için TEK
 * ortak yol — hepsi aynı tool/store fonksiyonunu (dolayısıyla aynı
 * validateLessonSlot doğrulamasını) paylaşır. Hata durumunda fırlatmaz;
 * takvim UI'ı sonucu doğrudan gösterip kısa Türkçe hata verebilsin diye
 * `{ ok: false, message }` döner.
 */
export async function actionUpdateLessonSchedule(input: {
  lessonId: string;
  startAt?: string;
  durationMinutes?: number;
}): Promise<LessonUpdateActionResult> {
  try {
    const result = await withAuthContext("actionUpdateLessonSchedule", (ctx) => updateLessonScheduleTool(ctx, input));
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true, ...result.data };
  } catch (error) {
    logger.error("actionUpdateLessonSchedule failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    if (error instanceof WriteScopeDeniedError) return { ok: false, message: error.message };
    return { ok: false, message: "Ders güncellenirken beklenmeyen bir hata oluştu." };
  }
}

export type CancelLessonActionResult = { ok: true } | { ok: false; message: string };

export async function actionCancelLesson(input: { lessonId: string }): Promise<CancelLessonActionResult> {
  try {
    const result = await withAuthContext("actionCancelLesson", (ctx) => cancelLessonTool(ctx, input));
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true };
  } catch (error) {
    logger.error("actionCancelLesson failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    if (error instanceof WriteScopeDeniedError) return { ok: false, message: error.message };
    return { ok: false, message: "Ders iptal edilirken beklenmeyen bir hata oluştu." };
  }
}

export type LessonSeriesParamsInput = {
  studentId: string;
  teacherId: string;
  roomId: string;
  branchId: string;
  instrument: string;
  weekday: number;
  startTime: string;
  durationMinutes: number;
  startsOn: string;
  endsOn: string;
  /** ÖNCELİK 4 (devam) — opsiyonel akademik dönem etiketi; verilmezse legacy. */
  term?: "guz" | "yaz";
  academicYearStart?: number;
};

export type PreviewLessonSeriesActionResult =
  | { ok: true; previewText: string; occurrenceCount: number; conflictCount: number; checks: SeriesOccurrenceCheck[] }
  | { ok: false; message: string };

export async function actionPreviewLessonSeries(
  input: LessonSeriesParamsInput
): Promise<PreviewLessonSeriesActionResult> {
  try {
    const result = await withAuthContext("actionPreviewLessonSeries", (ctx) => previewLessonSeriesTool(ctx, input));
    if (!result.ok) return { ok: false, message: result.error.message };
    return { ok: true, ...result.data };
  } catch (error) {
    logger.error("actionPreviewLessonSeries failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    if (error instanceof WriteScopeDeniedError) return { ok: false, message: error.message };
    return { ok: false, message: "Önizleme sırasında beklenmeyen bir hata oluştu." };
  }
}

export type CreateLessonSeriesActionResult =
  | {
      ok: true;
      seriesId: string;
      createdLessonIds: string[];
      skippedOccurrences: { startAt: string; code: string; message: string }[];
    }
  | { ok: false; message: string; conflicts?: SeriesOccurrenceCheck[] };

export async function actionCreateLessonSeries(
  input: LessonSeriesParamsInput & { skipConflicts?: boolean }
): Promise<CreateLessonSeriesActionResult> {
  try {
    const result = await withAuthContext("actionCreateLessonSeries", (ctx) => createLessonSeriesTool(ctx, input));
    if (!result.ok) {
      return {
        ok: false,
        message: result.error.message,
        conflicts: result.error.details as SeriesOccurrenceCheck[] | undefined,
      };
    }
    revalidateAll();
    return { ok: true, ...result.data };
  } catch (error) {
    logger.error("actionCreateLessonSeries failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    if (error instanceof WriteScopeDeniedError) return { ok: false, message: error.message };
    return { ok: false, message: "Seri oluşturulurken beklenmeyen bir hata oluştu." };
  }
}

export type SeriesCancelActionResult = { ok: true; cancelledLessonIds: string[] } | { ok: false; message: string };

export async function actionCancelSeriesFromLesson(input: { lessonId: string }): Promise<SeriesCancelActionResult> {
  try {
    const result = await withAuthContext("actionCancelSeriesFromLesson", (ctx) => cancelSeriesFromLessonTool(ctx, input));
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true, cancelledLessonIds: result.data.cancelledLessonIds };
  } catch (error) {
    logger.error("actionCancelSeriesFromLesson failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    if (error instanceof WriteScopeDeniedError) return { ok: false, message: error.message };
    return { ok: false, message: "Seri iptal edilirken beklenmeyen bir hata oluştu." };
  }
}

export async function actionCancelEntireSeries(input: { seriesId: string }): Promise<SeriesCancelActionResult> {
  try {
    const result = await withAuthContext("actionCancelEntireSeries", (ctx) => cancelEntireSeriesTool(ctx, input));
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true, cancelledLessonIds: result.data.cancelledLessonIds };
  } catch (error) {
    logger.error("actionCancelEntireSeries failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    if (error instanceof WriteScopeDeniedError) return { ok: false, message: error.message };
    return { ok: false, message: "Seri iptal edilirken beklenmeyen bir hata oluştu." };
  }
}

export type ChangeLessonAssignmentActionResult =
  | { ok: true; affectedLessonIds: string[] }
  | { ok: false; message: string; conflicts?: { lessonId: string; startAt: string; message: string }[] };

/** Faz 13 — ders öğretmeni/şube/oda değişimi. */
export async function actionChangeLessonTeacherOrBranch(input: {
  lessonId: string;
  scope: "single" | "fromHereOnward" | "entireSeries";
  newTeacherId?: string;
  newBranchId?: string;
  newRoomId?: string;
}): Promise<ChangeLessonAssignmentActionResult> {
  try {
    const result = await withAuthContext("actionChangeLessonTeacherOrBranch", (ctx) =>
      changeLessonTeacherOrBranchTool(ctx, input)
    );
    if (!result.ok) {
      return {
        ok: false,
        message: result.error.message,
        conflicts: Array.isArray(result.error.details)
          ? (result.error.details as { lessonId: string; startAt: string; message: string }[])
          : undefined,
      };
    }
    revalidateAll();
    return { ok: true, affectedLessonIds: result.data.affectedLessonIds };
  } catch (error) {
    logger.error("actionChangeLessonTeacherOrBranch failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    if (error instanceof WriteScopeDeniedError) return { ok: false, message: error.message };
    return { ok: false, message: "Ders ataması değiştirilirken beklenmeyen bir hata oluştu." };
  }
}

export type AddPaymentFormState = {
  ok: false;
  formError?: string;
  fieldErrors?: Record<string, string>;
} | null;

/** P0 (2026-08-29) — `actionAddStudent` ile AYNI çökme deseni taşıyordu; AYNI düzeltme uygulandı. */
export async function actionAddPayment(_prevState: AddPaymentFormState, formData: FormData): Promise<AddPaymentFormState> {
  try {
    await withAuthContext("actionAddPayment", async (ctx) => {
      const result = await createPaymentRecordTool(ctx, {
        studentId: String(formData.get("studentId") || ""),
        description: String(formData.get("description") || ""),
        amount: Number(formData.get("amount") || 0),
        dueDate: String(formData.get("dueDate") || ""),
      });
      if (!result.ok) {
        throw new ToolValidationFailure(result.error);
      }
    });
    revalidateAll();
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    if (error instanceof WriteScopeDeniedError) {
      return { ok: false, formError: error.message };
    }
    if (error instanceof ToolValidationFailure) {
      logger.warn("actionAddPayment — doğrulama hatası (kullanıcıya gösterildi)", {
        code: error.serviceError.code,
        message: error.serviceError.message,
      });
      const fieldErrors = fieldErrorsFromZodFlatten(error.serviceError.details);
      return {
        ok: false,
        formError:
          error.serviceError.message === "Invalid input"
            ? "Formda düzeltilmesi gereken alanlar var — aşağıda işaretlendi."
            : error.serviceError.message,
        fieldErrors,
      };
    }
    logger.error("actionAddPayment failed", error);
    return { ok: false, formError: "Ödeme kaydı oluşturulurken beklenmeyen bir hata oluştu. Lütfen tekrar deneyin." };
  }
  return null;
}

export type CreateFeeRuleActionInput = {
  teacherId: string;
  branchId?: string;
  instrument?: string;
  perMinuteRate: number;
  effectiveFrom: string;
  effectiveTo?: string;
};

export type UpdateFeeRuleActionInput = {
  ruleId: string;
  teacherId?: string;
  branchId?: string;
  instrument?: string;
  perMinuteRate?: number;
  effectiveFrom?: string;
  effectiveTo?: string;
};

export type FeeRuleActionResult = { ok: true; rule: TeacherFeeRule } | { ok: false; message: string };

export async function actionCreateFeeRule(input: CreateFeeRuleActionInput): Promise<FeeRuleActionResult> {
  try {
    const result = await withAuthContext("actionCreateFeeRule", (ctx) => createFeeRuleTool(ctx, input));
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true, rule: result.data.rule };
  } catch (error) {
    logger.error("actionCreateFeeRule failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    if (error instanceof WriteScopeDeniedError) return { ok: false, message: error.message };
    return { ok: false, message: "Ücret kuralı oluşturulurken beklenmeyen bir hata oluştu." };
  }
}

export async function actionUpdateFeeRule(input: UpdateFeeRuleActionInput): Promise<FeeRuleActionResult> {
  try {
    const result = await withAuthContext("actionUpdateFeeRule", (ctx) => updateFeeRuleTool(ctx, input));
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true, rule: result.data.rule };
  } catch (error) {
    logger.error("actionUpdateFeeRule failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    if (error instanceof WriteScopeDeniedError) return { ok: false, message: error.message };
    return { ok: false, message: "Ücret kuralı güncellenirken beklenmeyen bir hata oluştu." };
  }
}

export type ComputeTeacherPayoutActionResult =
  | ({
      ok: true;
      paymentMethodInfo: TeacherPayoutPaymentMethodInfo | null;
      existingPayout: { id: string; method?: string; status: string } | null;
    } & TeacherEarningsResult)
  | { ok: false; message: string };

/** Salt-okunur önizleme — hiçbir kayıt yazmaz. */
export async function actionComputeTeacherPayout(input: {
  teacherId: string;
  periodStart: string;
  periodEnd: string;
}): Promise<ComputeTeacherPayoutActionResult> {
  try {
    const result = await withAuthContext("actionComputeTeacherPayout", (ctx) => computeTeacherPayoutTool(ctx, input));
    if (!result.ok) return { ok: false, message: result.error.message };
    return { ok: true, ...result.data };
  } catch (error) {
    logger.error("actionComputeTeacherPayout failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    if (error instanceof WriteScopeDeniedError) return { ok: false, message: error.message };
    return { ok: false, message: "Hakediş hesaplanırken beklenmeyen bir hata oluştu." };
  }
}

export type TeacherPayoutActionResult = { ok: true; payout: TeacherPayout } | { ok: false; message: string };

export async function actionCreateTeacherPayout(input: {
  teacherId: string;
  periodStart: string;
  periodEnd: string;
  paymentMethod?: "cash" | "transfer";
}): Promise<TeacherPayoutActionResult> {
  try {
    const result = await withAuthContext("actionCreateTeacherPayout", (ctx) => createTeacherPayoutTool(ctx, input));
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true, payout: result.data.payout };
  } catch (error) {
    logger.error("actionCreateTeacherPayout failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    if (error instanceof WriteScopeDeniedError) return { ok: false, message: error.message };
    return { ok: false, message: "Hakediş kaydı oluşturulurken beklenmeyen bir hata oluştu." };
  }
}

/** PRODUCT_BACKLOG §3.4 — yönetici override: nakit/havale seçimini açıkça değiştirir. */
export async function actionUpdateTeacherPayoutPaymentMethod(input: {
  payoutId: string;
  method: "cash" | "transfer";
}): Promise<TeacherPayoutActionResult> {
  try {
    const result = await withAuthContext("actionUpdateTeacherPayoutPaymentMethod", (ctx) =>
      updateTeacherPayoutPaymentMethodTool(ctx, input)
    );
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true, payout: result.data.payout };
  } catch (error) {
    logger.error("actionUpdateTeacherPayoutPaymentMethod failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    if (error instanceof WriteScopeDeniedError) return { ok: false, message: error.message };
    return { ok: false, message: "Hakediş ödeme yöntemi güncellenirken beklenmeyen bir hata oluştu." };
  }
}

export async function actionMarkTeacherPayoutPaid(input: {
  payoutId: string;
  method?: string;
}): Promise<TeacherPayoutActionResult> {
  try {
    const result = await withAuthContext("actionMarkTeacherPayoutPaid", (ctx) => markTeacherPayoutPaidTool(ctx, input));
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true, payout: result.data.payout };
  } catch (error) {
    logger.error("actionMarkTeacherPayoutPaid failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    if (error instanceof WriteScopeDeniedError) return { ok: false, message: error.message };
    return { ok: false, message: "Hakediş ödendi olarak işaretlenirken beklenmeyen bir hata oluştu." };
  }
}

export type UpdateFeeRoundingModeActionResult =
  | { ok: true; feeRoundingMode: FeeRoundingMode }
  | { ok: false; message: string };

export async function actionUpdateFeeRoundingMode(
  feeRoundingMode: FeeRoundingMode
): Promise<UpdateFeeRoundingModeActionResult> {
  try {
    const result = await withAuthContext("actionUpdateFeeRoundingMode", (ctx) =>
      updateFeeRoundingModeTool(ctx, { feeRoundingMode })
    );
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true, feeRoundingMode: result.data.feeRoundingMode };
  } catch (error) {
    logger.error("actionUpdateFeeRoundingMode failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    if (error instanceof WriteScopeDeniedError) return { ok: false, message: error.message };
    return { ok: false, message: "Ücret yuvarlama politikası güncellenirken beklenmeyen bir hata oluştu." };
  }
}

export type UpdateMakeupWindowDaysActionResult =
  | { ok: true; makeupWindowDays: number }
  | { ok: false; message: string };

export async function actionUpdateMakeupWindowDays(
  makeupWindowDays: number
): Promise<UpdateMakeupWindowDaysActionResult> {
  try {
    const result = await withAuthContext("actionUpdateMakeupWindowDays", (ctx) =>
      updateMakeupWindowDaysTool(ctx, { makeupWindowDays })
    );
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true, makeupWindowDays: result.data.makeupWindowDays };
  } catch (error) {
    logger.error("actionUpdateMakeupWindowDays failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    if (error instanceof WriteScopeDeniedError) return { ok: false, message: error.message };
    return { ok: false, message: "Telafi politika penceresi güncellenirken beklenmeyen bir hata oluştu." };
  }
}

export type UpdateSchoolLogoActionResult = { ok: true; logoUrl: string } | { ok: false; message: string };

export async function actionUpdateSchoolLogo(input: {
  fileMimeType: string;
  fileData: string;
}): Promise<UpdateSchoolLogoActionResult> {
  try {
    const result = await withAuthContext("actionUpdateSchoolLogo", (ctx) => updateSchoolLogoTool(ctx, input));
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true, logoUrl: result.data.logoUrl };
  } catch (error) {
    logger.error("actionUpdateSchoolLogo failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    if (error instanceof WriteScopeDeniedError) return { ok: false, message: error.message };
    return { ok: false, message: "Kurum logosu güncellenirken beklenmeyen bir hata oluştu." };
  }
}

export type UpdateMonthlyMakeupAllowanceActionResult =
  | { ok: true; monthlyMakeupAllowance: number }
  | { ok: false; message: string };

export async function actionUpdateMonthlyMakeupAllowance(
  monthlyMakeupAllowance: number
): Promise<UpdateMonthlyMakeupAllowanceActionResult> {
  try {
    const result = await withAuthContext("actionUpdateMonthlyMakeupAllowance", (ctx) =>
      updateMonthlyMakeupAllowanceTool(ctx, { monthlyMakeupAllowance })
    );
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true, monthlyMakeupAllowance: result.data.monthlyMakeupAllowance };
  } catch (error) {
    logger.error("actionUpdateMonthlyMakeupAllowance failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    if (error instanceof WriteScopeDeniedError) return { ok: false, message: error.message };
    return { ok: false, message: "Aylık telafi hakkı güncellenirken beklenmeyen bir hata oluştu." };
  }
}

export type UpdateTermWeeklyClosedDaysInput = { guz: number[]; yaz: number[] };
export type UpdateTermWeeklyClosedDaysActionResult =
  | { ok: true; guz: number[]; yaz: number[] }
  | { ok: false; message: string };

export async function actionUpdateTermWeeklyClosedDays(
  input: UpdateTermWeeklyClosedDaysInput
): Promise<UpdateTermWeeklyClosedDaysActionResult> {
  try {
    const result = await withAuthContext("actionUpdateTermWeeklyClosedDays", (ctx) =>
      updateTermWeeklyClosedDaysTool(ctx, input)
    );
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true, guz: result.data.guz, yaz: result.data.yaz };
  } catch (error) {
    logger.error("actionUpdateTermWeeklyClosedDays failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    if (error instanceof WriteScopeDeniedError) return { ok: false, message: error.message };
    return { ok: false, message: "Çalışma takvimi güncellenirken beklenmeyen bir hata oluştu." };
  }
}

export async function actionLogout() {
  // Cookie clear via API for consistent Set-Cookie
  // Server action fallback: redirect after client fetch preferred
  redirect("/login");
}

/** Used by logout button — returns after client calls /api/v1/auth/logout */
export async function actionRequireAuth(): Promise<boolean> {
  const ctx = await getSessionContext();
  return Boolean(ctx);
}

// ─── İş Takip (Task) modülü — /panel/is-takip, /ogretmen/is-takip ────────
// /panel/workflows (AI otomasyonu) ile İLGİSİZ, ayrı bir modül. RBAC her
// eylemde tools.ts'te (ctx.role/ctx.teacherId'e göre) zaten kesin olarak
// uygulanır — buradaki server action'lar yalnızca ince adaptörlerdir.

export type TaskActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; message: string };

function parseOptionalStringList(raw: FormDataEntryValue | null): string[] | undefined {
  const s = String(raw ?? "").trim();
  if (!s) return undefined;
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

async function createTaskFromFormData(formData: FormData): Promise<TaskActionResult<{ taskId: string }>> {
  try {
    const result = await withAuthContext("actionCreateTask", (ctx) =>
      createTaskTool(ctx, {
        title: String(formData.get("title") || ""),
        description: String(formData.get("description") || "") || undefined,
        priority: (String(formData.get("priority") || "MEDIUM") as TaskPriority) || "MEDIUM",
        category: String(formData.get("category") || "") as TaskCategory,
        assigneeId: String(formData.get("assigneeId") || "") || undefined,
        followerIds: parseOptionalStringList(formData.get("followerIds")),
        startDate: String(formData.get("startDate") || "") || undefined,
        dueDate: String(formData.get("dueDate") || "") || undefined,
        tags: parseOptionalStringList(formData.get("tags")),
        studentId: String(formData.get("studentId") || "") || undefined,
        teacherId: String(formData.get("teacherId") || "") || undefined,
        branchId: String(formData.get("branchId") || "") || undefined,
        lessonId: String(formData.get("lessonId") || "") || undefined,
        paymentId: String(formData.get("paymentId") || "") || undefined,
        documentId: String(formData.get("documentId") || "") || undefined,
        relatedEntityType: String(formData.get("relatedEntityType") || "") || undefined,
        relatedEntityId: String(formData.get("relatedEntityId") || "") || undefined,
        relatedEntityLabel: String(formData.get("relatedEntityLabel") || "") || undefined,
      })
    );
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true, data: { taskId: result.data.taskId } };
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    // P0-2 (2026-08-29) — diğer TÜM action'larla AYNI, kurulu desen; bu
    // özel durum eksikti, kurum kapsamı reddi jenerik bir mesajın ARKASINA
    // gizleniyordu.
    if (error instanceof WriteScopeDeniedError) return { ok: false, message: error.message };
    logger.error("actionCreateTask failed", error);
    return { ok: false, message: "Görev oluşturulurken beklenmeyen bir hata oluştu." };
  }
}

/** Client'tan `useTransition` ile çağrılabilir — sonucu (taskId veya hata mesajı) döner. */
export async function actionCreateTask(
  formData: FormData
): Promise<TaskActionResult<{ taskId: string }>> {
  return createTaskFromFormData(formData);
}

export type CreateTaskFormState = { ok: false; message: string } | null;

/**
 * P0 (2026-08-29) — bu yorum ÖNCEDEN "mevcut actionAddStudent ile aynı
 * davranış deseni" diyordu (yani throw eder) — bu artık YANLIŞ/ESKİMİŞ bir
 * referanstı, çünkü `actionAddStudent` P0-1/P0-2'de TAM OLARAK bu throw
 * deseninden kurtarılmıştı. `actionCreateTaskForm` bu düzeltmeyi HİÇ
 * ALMAMIŞTI — AYNI çökme riski (görev oluşturma formu, `QuickTaskLink`
 * aracılığıyla UYGULAMA GENELİNDE onlarca yerden erişilebilir) burada da
 * mevcuttu. Artık `useActionState` uyumlu: throw ETMEZ, `CreateTaskFormState`
 * döner; yalnızca BAŞARI durumunda (bağlamsal görevlerde) redirect eder.
 */
export async function actionCreateTaskForm(_prevState: CreateTaskFormState, formData: FormData): Promise<CreateTaskFormState> {
  const result = await createTaskFromFormData(formData);
  if (!result.ok) {
    logger.warn("actionCreateTaskForm — doğrulama/iş kuralı hatası (kullanıcıya gösterildi)", { message: result.message });
    return { ok: false, message: result.message };
  }
  // Bağlamsal (İlişkili kayıt üzerinden açılan) görevlerde doğrudan görev
  // detayına yönlendir — "Görevi görüntüle" davranışı (madde 4 gereksinimi).
  // Bağlamsız (serbest) görevlerde mevcut davranış korunur: listede kal.
  if (String(formData.get("relatedEntityType") || "")) {
    redirect(`/panel/is-takip/${result.data.taskId}?created=1`);
  }
  return null;
}

export async function actionUpdateTask(input: {
  taskId: string;
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  category?: TaskCategory;
  assigneeId?: string | null;
  followerIds?: string[];
  startDate?: string | null;
  dueDate?: string | null;
  progressPercent?: number;
  tags?: string[];
}): Promise<TaskActionResult> {
  try {
    const result = await withAuthContext("actionUpdateTask", (ctx) => updateTaskTool(ctx, input));
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true, data: undefined };
  } catch (error) {
    logger.error("actionUpdateTask failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "Görev güncellenirken beklenmeyen bir hata oluştu." };
  }
}

export async function actionChangeTaskStatus(input: {
  taskId: string;
  action: "complete" | "cancel" | "archive" | "reopen" | "set_status";
  status?: TaskStatus;
}): Promise<TaskActionResult<{ status: TaskStatus }>> {
  try {
    const result = await withAuthContext("actionChangeTaskStatus", (ctx) => changeTaskStatusTool(ctx, input));
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true, data: { status: result.data.status } };
  } catch (error) {
    logger.error("actionChangeTaskStatus failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "Görev durumu güncellenirken beklenmeyen bir hata oluştu." };
  }
}

export async function actionAddTaskChecklistItem(input: {
  taskId: string;
  title: string;
}): Promise<TaskActionResult<{ itemId: string }>> {
  try {
    const result = await withAuthContext("actionAddTaskChecklistItem", (ctx) =>
      addTaskChecklistItemTool(ctx, input)
    );
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true, data: { itemId: result.data.itemId } };
  } catch (error) {
    logger.error("actionAddTaskChecklistItem failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "Checklist eklenirken beklenmeyen bir hata oluştu." };
  }
}

export async function actionSetTaskChecklistItemCompleted(input: {
  taskId: string;
  itemId: string;
  isCompleted: boolean;
}): Promise<TaskActionResult> {
  try {
    const result = await withAuthContext("actionSetTaskChecklistItemCompleted", (ctx) =>
      setTaskChecklistItemCompletedTool(ctx, input)
    );
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true, data: undefined };
  } catch (error) {
    logger.error("actionSetTaskChecklistItemCompleted failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "Checklist güncellenirken beklenmeyen bir hata oluştu." };
  }
}

export async function actionArchiveTaskChecklistItem(input: {
  taskId: string;
  itemId: string;
}): Promise<TaskActionResult> {
  try {
    const result = await withAuthContext("actionArchiveTaskChecklistItem", (ctx) =>
      archiveTaskChecklistItemTool(ctx, input)
    );
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true, data: undefined };
  } catch (error) {
    logger.error("actionArchiveTaskChecklistItem failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "Checklist kaldırılırken beklenmeyen bir hata oluştu." };
  }
}

export async function actionAddTaskComment(input: {
  taskId: string;
  body: string;
}): Promise<TaskActionResult<{ commentId: string }>> {
  try {
    const result = await withAuthContext("actionAddTaskComment", (ctx) => addTaskCommentTool(ctx, input));
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true, data: { commentId: result.data.commentId } };
  } catch (error) {
    logger.error("actionAddTaskComment failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "Yorum eklenirken beklenmeyen bir hata oluştu." };
  }
}

export async function actionUpdateTaskComment(input: {
  taskId: string;
  commentId: string;
  body: string;
}): Promise<TaskActionResult<{ commentId: string }>> {
  try {
    const result = await withAuthContext("actionUpdateTaskComment", (ctx) => updateTaskCommentTool(ctx, input));
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true, data: { commentId: result.data.commentId } };
  } catch (error) {
    logger.error("actionUpdateTaskComment failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "Yorum düzenlenirken beklenmeyen bir hata oluştu." };
  }
}

export async function actionDeleteTaskComment(input: {
  taskId: string;
  commentId: string;
}): Promise<TaskActionResult<{ commentId: string }>> {
  try {
    const result = await withAuthContext("actionDeleteTaskComment", (ctx) => deleteTaskCommentTool(ctx, input));
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true, data: { commentId: result.data.commentId } };
  } catch (error) {
    logger.error("actionDeleteTaskComment failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "Yorum kaldırılırken beklenmeyen bir hata oluştu." };
  }
}

export async function actionAddTaskFileAttachment(input: {
  taskId: string;
  title: string;
  fileName: string;
  fileMimeType: string;
  fileData: string;
}): Promise<TaskActionResult<{ attachmentId: string }>> {
  try {
    const result = await withAuthContext("actionAddTaskFileAttachment", (ctx) =>
      addTaskFileAttachmentTool(ctx, input)
    );
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true, data: { attachmentId: result.data.attachmentId } };
  } catch (error) {
    logger.error("actionAddTaskFileAttachment failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "Dosya eklenirken beklenmeyen bir hata oluştu." };
  }
}

export async function actionAddTaskLinkAttachment(input: {
  taskId: string;
  title: string;
  url: string;
}): Promise<TaskActionResult<{ attachmentId: string }>> {
  try {
    const result = await withAuthContext("actionAddTaskLinkAttachment", (ctx) =>
      addTaskLinkAttachmentTool(ctx, input)
    );
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true, data: { attachmentId: result.data.attachmentId } };
  } catch (error) {
    logger.error("actionAddTaskLinkAttachment failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "Bağlantı eklenirken beklenmeyen bir hata oluştu." };
  }
}

export async function actionDeleteTaskAttachment(input: {
  taskId: string;
  attachmentId: string;
}): Promise<TaskActionResult<{ attachmentId: string }>> {
  try {
    const result = await withAuthContext("actionDeleteTaskAttachment", (ctx) =>
      deleteTaskAttachmentTool(ctx, input)
    );
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true, data: { attachmentId: result.data.attachmentId } };
  } catch (error) {
    logger.error("actionDeleteTaskAttachment failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "Ek kaldırılırken beklenmeyen bir hata oluştu." };
  }
}

export type TaskReminderPreferenceResult =
  | { ok: true; data: { dueSoonEnabled: boolean; dueTodayEnabled: boolean; overdueEnabled: boolean } }
  | { ok: false; message: string };

/** Her zaman ÇAĞIRANIN KENDİ tercihi — girdi bir userId almaz, admin başkasınınkini değiştiremez. */
export async function actionGetTaskReminderPreference(): Promise<TaskReminderPreferenceResult> {
  try {
    const result = await withAuthContext("actionGetTaskReminderPreference", (ctx) =>
      getTaskReminderPreferenceTool(ctx)
    );
    if (!result.ok) return { ok: false, message: result.error.message };
    return { ok: true, data: result.data };
  } catch (error) {
    logger.error("actionGetTaskReminderPreference failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "Hatırlatma tercihleri okunurken beklenmeyen bir hata oluştu." };
  }
}

export async function actionUpdateTaskReminderPreference(input: {
  dueSoonEnabled: boolean;
  dueTodayEnabled: boolean;
  overdueEnabled: boolean;
}): Promise<TaskReminderPreferenceResult> {
  try {
    const result = await withAuthContext("actionUpdateTaskReminderPreference", (ctx) =>
      updateTaskReminderPreferenceTool(ctx, input)
    );
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true, data: result.data };
  } catch (error) {
    logger.error("actionUpdateTaskReminderPreference failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "Hatırlatma tercihleri kaydedilirken beklenmeyen bir hata oluştu." };
  }
}

export type NotificationPreferencesActionResult =
  | {
      ok: true;
      data: { preferences: Array<{ category: string; inAppEnabled: boolean; pushEnabled: boolean }> };
    }
  | { ok: false; message: string };

/** Her zaman çağıranın kendi tercihleri — userId parametresi yok. */
export async function actionGetNotificationPreferences(): Promise<NotificationPreferencesActionResult> {
  try {
    const result = await withAuthContext("actionGetNotificationPreferences", (ctx) =>
      getNotificationPreferencesTool(ctx)
    );
    if (!result.ok) return { ok: false, message: result.error.message };
    return { ok: true, data: result.data };
  } catch (error) {
    logger.error("actionGetNotificationPreferences failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "Bildirim tercihleri okunurken beklenmeyen bir hata oluştu." };
  }
}

export async function actionSetNotificationPreferences(input: {
  updates: Array<{ category: string; inAppEnabled: boolean }>;
}): Promise<NotificationPreferencesActionResult> {
  try {
    const result = await withAuthContext("actionSetNotificationPreferences", (ctx) =>
      setNotificationPreferencesTool(ctx, input)
    );
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true, data: result.data };
  } catch (error) {
    logger.error("actionSetNotificationPreferences failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "Bildirim tercihleri kaydedilirken beklenmeyen bir hata oluştu." };
  }
}

export async function actionResetNotificationPreferences(): Promise<NotificationPreferencesActionResult> {
  try {
    const result = await withAuthContext("actionResetNotificationPreferences", (ctx) =>
      resetNotificationPreferencesTool(ctx)
    );
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true, data: result.data };
  } catch (error) {
    logger.error("actionResetNotificationPreferences failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "Bildirim tercihleri sıfırlanırken beklenmeyen bir hata oluştu." };
  }
}

export type KvkkActionResult = { ok: true } | { ok: false; message: string };

/** Faz 8 (KVKK) — yeni hukuki metin versiyonu yayınla (admin). */
export async function actionCreateConsentTextVersion(formData: FormData): Promise<KvkkActionResult> {
  try {
    const result = await withAuthContext("actionCreateConsentTextVersion", (ctx) =>
      createConsentTextVersionTool(ctx, {
        consentType: String(formData.get("consentType") || ""),
        bodyText: String(formData.get("bodyText") || ""),
        effectiveFrom: String(formData.get("effectiveFrom") || ""),
      })
    );
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true };
  } catch (error) {
    logger.error("actionCreateConsentTextVersion failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "Metin versiyonu yayınlanırken beklenmeyen bir hata oluştu." };
  }
}

/** Faz 8 (KVKK) — tenant kısıtlanan-özellik listesi + cihaz bilgisi kaydı ayarı (admin). */
export async function actionUpdateConsentSettings(formData: FormData): Promise<KvkkActionResult> {
  try {
    const restrictedFeatures = String(formData.get("restrictedFeatures") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const result = await withAuthContext("actionUpdateConsentSettings", (ctx) =>
      updateConsentSettingsTool(ctx, {
        restrictedFeatures,
        recordDeviceInfo: formData.get("recordDeviceInfo") === "on",
      })
    );
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true };
  } catch (error) {
    logger.error("actionUpdateConsentSettings failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "Rıza ayarları güncellenirken beklenmeyen bir hata oluştu." };
  }
}

/** Faz 8 (KVKK) — portal first-login gate'inde veya ayarlarda rıza ver (konu kendisi). */
export async function actionGrantKvkkConsent(input: {
  subjectType: "student" | "parent" | "user";
  subjectId: string;
  consentType: string;
  channel: string;
}): Promise<KvkkActionResult> {
  try {
    const result = await withAuthContext("actionGrantKvkkConsent", (ctx) => grantKvkkConsentTool(ctx, input));
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true };
  } catch (error) {
    logger.error("actionGrantKvkkConsent failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "Rıza kaydedilirken beklenmeyen bir hata oluştu." };
  }
}

/** Faz 8 (KVKK) — bir rızayı geri çek (konu kendisi veya admin). */
export async function actionWithdrawKvkkConsent(input: {
  consentId: string;
  reason?: string;
}): Promise<KvkkActionResult> {
  try {
    const result = await withAuthContext("actionWithdrawKvkkConsent", (ctx) => withdrawKvkkConsentTool(ctx, input));
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true };
  } catch (error) {
    logger.error("actionWithdrawKvkkConsent failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "Rıza geri çekilirken beklenmeyen bir hata oluştu." };
  }
}

/** 2026-2027 kaynağı Fotoğraf/Video Açık Rıza Formu — "geleceğe etkili" geri çekme, PORTAL-CONTRACT-001. */
export async function actionWithdrawSocialMediaConsent(input: { studentId: string; reason?: string }): Promise<KvkkActionResult> {
  try {
    const result = await withAuthContext("actionWithdrawSocialMediaConsent", (ctx) => withdrawSocialMediaConsentTool(ctx, input));
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true };
  } catch (error) {
    logger.error("actionWithdrawSocialMediaConsent failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "İzin geri çekilirken beklenmeyen bir hata oluştu." };
  }
}

export type GenerateDocumentActionResult = { ok: false; message: string } | void;

/**
 * 2026-2027 kaynağı Madde 20 — KVKK Aydınlatma Metni, sözleşmeden AYRI belge
 * (bkz. docs/contracts/2026_2027_CONTRACT_DOCUMENT_TYPE_MAPPING.md).
 * Başarılıysa `actionAddStudent` ile AYNI desen: doğrudan yazdırma sayfasına
 * `redirect()` eder (NEXT_REDIRECT fırlatır) — hata durumunda geriye döner.
 */
export async function actionGenerateKvkkNoticeDocument(input: { studentId: string }): Promise<GenerateDocumentActionResult> {
  let documentId: string;
  try {
    const result = await withAuthContext("actionGenerateKvkkNoticeDocument", (ctx) => generateKvkkNoticeDocumentTool(ctx, input));
    if (!result.ok) return { ok: false, message: result.error.message };
    documentId = result.data.documentId;
  } catch (error) {
    logger.error("actionGenerateKvkkNoticeDocument failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "KVKK Aydınlatma Metni oluşturulurken beklenmeyen bir hata oluştu." };
  }
  revalidateAll();
  redirect(`/evrak-yazdir/${documentId}`);
}

/** 2026-2027 kaynağı Madde 19 — Fotoğraf/Video Açık Rıza Formu, kaydedilmiş SocialMediaConsent kararının yazılı belgesi. */
export async function actionGeneratePhotoVideoConsentDocument(input: { studentId: string }): Promise<GenerateDocumentActionResult> {
  let documentId: string;
  try {
    const result = await withAuthContext("actionGeneratePhotoVideoConsentDocument", (ctx) =>
      generatePhotoVideoConsentDocumentTool(ctx, input)
    );
    if (!result.ok) return { ok: false, message: result.error.message };
    documentId = result.data.documentId;
  } catch (error) {
    logger.error("actionGeneratePhotoVideoConsentDocument failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "Fotoğraf/Video Açık Rıza Formu oluşturulurken beklenmeyen bir hata oluştu." };
  }
  revalidateAll();
  redirect(`/evrak-yazdir/${documentId}`);
}

export type CrmActionResult = { ok: true } | { ok: false; message: string };

/** Faz 11 — manuel arama kaydı. */
export async function actionCreateCallLog(formData: FormData): Promise<CrmActionResult> {
  try {
    const result = await withAuthContext("actionCreateCallLog", (ctx) =>
      createCallLogTool(ctx, {
        callerNumber: String(formData.get("callerNumber") || ""),
        callerName: String(formData.get("callerName") || "") || undefined,
        direction: String(formData.get("direction") || "inbound"),
        answered: formData.get("answered") === "on",
        durationSeconds: formData.get("durationSeconds") ? Number(formData.get("durationSeconds")) : undefined,
        occurredAt: String(formData.get("occurredAt") || ""),
        note: String(formData.get("note") || "") || undefined,
      })
    );
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true };
  } catch (error) {
    logger.error("actionCreateCallLog failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "Arama kaydı oluşturulurken beklenmeyen bir hata oluştu." };
  }
}

/** Faz 11 — arama kaydına manuel kişi ataması. */
export async function actionAssignCallContact(input: {
  callId: string;
  contactType: "student" | "parent" | "lead";
  contactId: string;
}): Promise<CrmActionResult> {
  try {
    const result = await withAuthContext("actionAssignCallContact", (ctx) => assignCallContactTool(ctx, input));
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true };
  } catch (error) {
    logger.error("actionAssignCallContact failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "Kişi ataması yapılırken beklenmeyen bir hata oluştu." };
  }
}

/** Faz 11 — geri arama tamamlandı işaretle. */
export async function actionMarkCallbackDone(input: { callId: string }): Promise<CrmActionResult> {
  try {
    const result = await withAuthContext("actionMarkCallbackDone", (ctx) => markCallbackDoneTool(ctx, input));
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true };
  } catch (error) {
    logger.error("actionMarkCallbackDone failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "Geri arama işaretlenirken beklenmeyen bir hata oluştu." };
  }
}

/** Faz 11 — manuel mesaj kaydı. */
export async function actionCreateMessageLog(formData: FormData): Promise<CrmActionResult> {
  try {
    const result = await withAuthContext("actionCreateMessageLog", (ctx) =>
      createMessageLogTool(ctx, {
        channel: String(formData.get("channel") || "sms"),
        senderIdentifier: String(formData.get("senderIdentifier") || ""),
        occurredAt: String(formData.get("occurredAt") || ""),
        contentOrSummary: String(formData.get("contentOrSummary") || ""),
      })
    );
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true };
  } catch (error) {
    logger.error("actionCreateMessageLog failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "Mesaj kaydı oluşturulurken beklenmeyen bir hata oluştu." };
  }
}

/** Faz 11 — mesaj kaydına manuel kişi ataması. */
export async function actionAssignMessageContact(input: {
  messageId: string;
  contactType: "student" | "parent" | "lead";
  contactId: string;
}): Promise<CrmActionResult> {
  try {
    const result = await withAuthContext("actionAssignMessageContact", (ctx) => assignMessageContactTool(ctx, input));
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true };
  } catch (error) {
    logger.error("actionAssignMessageContact failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "Kişi ataması yapılırken beklenmeyen bir hata oluştu." };
  }
}

/** Faz 11 — mesaj durumu güncelle (unread/read/replied). */
export async function actionSetMessageStatus(input: {
  messageId: string;
  status: "unread" | "read" | "replied";
}): Promise<CrmActionResult> {
  try {
    const result = await withAuthContext("actionSetMessageStatus", (ctx) => setMessageStatusTool(ctx, input));
    if (!result.ok) return { ok: false, message: result.error.message };
    revalidateAll();
    return { ok: true };
  } catch (error) {
    logger.error("actionSetMessageStatus failed", error);
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    return { ok: false, message: "Mesaj durumu güncellenirken beklenmeyen bir hata oluştu." };
  }
}

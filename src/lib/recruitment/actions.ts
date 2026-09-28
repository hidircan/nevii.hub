"use server";

/**
 * İK panel server action'ları — `actions.ts#withAuthContext` ile AYNI oturum/yazma kapsamı kuralı:
 * tek kurum seçili olmalı, BRANCH_MANAGER / HYPER_ADMIN bu yüzeyde işlem yapmaz. Araç sonucu
 * `{ ok, message }` biçimine indirgenir (istemci bileşenleri hata cümlesini doğrudan gösterir).
 */
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSessionContext } from "../auth/session";
import { resolveWriteScope } from "../institution/write-scope";
import { runWithTenantAsync } from "../tenant-context";
import { logger } from "../logger";
import type { ServiceContext } from "../services/context";
import type { ServiceResult } from "../services/result";
import * as tools from "./tools";

type ActionResult<T> = { ok: true; data: T } | { ok: false; message: string };

async function run<T>(name: string, fn: (ctx: ServiceContext) => Promise<ServiceResult<T>>, revalidate: string[] = []): Promise<ActionResult<T>> {
  let session: ServiceContext;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/ik");
  }
  try {
    const scope = await resolveWriteScope(session);
    if (scope.mode !== "single") return { ok: false, message: "İşlem yapmak için üst menüden tek bir kurum seçin." };
    if (session.role === "BRANCH_MANAGER" || session.role === "HYPER_ADMIN") return { ok: false, message: "Bu işlem bu rol için kapalıdır." };
    const ctx: ServiceContext = { ...session, tenantId: scope.tenantId, channel: "web" };
    const res = await runWithTenantAsync(scope.tenantId, () => fn(ctx));
    if (!res.ok) return { ok: false, message: res.error.message };
    for (const p of revalidate) revalidatePath(p, "layout");
    return { ok: true, data: res.data };
  } catch (e) {
    logger.error(`recruitment action ${name} failed`, e);
    return { ok: false, message: "Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin." };
  }
}

const IK = "/panel/ik";

export async function actionSaveJob(input: unknown) {
  return run("saveJob", (ctx) => tools.saveJobTool(ctx, input), [IK]);
}
export async function actionSetJobStatus(input: unknown) {
  return run("setJobStatus", (ctx) => tools.setJobStatusTool(ctx, input), [IK]);
}
export async function actionChangeStage(input: unknown) {
  return run("changeStage", (ctx) => tools.changeStageTool(ctx, input), [IK]);
}
export async function actionUpdateApplication(input: unknown) {
  return run("updateApplication", (ctx) => tools.updateApplicationTool(ctx, input), [IK]);
}
export async function actionAddNote(input: unknown) {
  return run("addNote", (ctx) => tools.addNoteTool(ctx, input), [IK]);
}
export async function actionScheduleInterview(input: unknown) {
  return run("scheduleInterview", (ctx) => tools.scheduleInterviewTool(ctx, input), [IK]);
}
export async function actionUpdateInterviewStatus(input: unknown) {
  return run("updateInterviewStatus", (ctx) => tools.updateInterviewStatusTool(ctx, input), [IK]);
}
export async function actionAddEvaluation(input: unknown) {
  return run("addEvaluation", (ctx) => tools.addEvaluationTool(ctx, input), [IK]);
}
export async function actionSendTemplateEmail(input: unknown) {
  return run("sendTemplateEmail", (ctx) => tools.sendTemplateEmailTool(ctx, input), [IK]);
}
export async function actionPreviewEmail(input: unknown) {
  return run("previewEmail", (ctx) => tools.previewEmailTool(ctx, input));
}
export async function actionSaveTemplate(input: unknown) {
  return run("saveTemplate", (ctx) => tools.saveTemplateTool(ctx, input), [IK]);
}
export async function actionSaveSettings(input: unknown) {
  return run("saveSettings", (ctx) => tools.saveSettingsTool(ctx, input), [IK]);
}
export async function actionConvertToEmployee(input: unknown) {
  return run("convertToEmployee", (ctx) => tools.convertToEmployeeTool(ctx, input), [IK]);
}
export async function actionAnonymizeApplication(input: unknown) {
  return run("anonymizeApplication", (ctx) => tools.anonymizeApplicationTool(ctx, input), [IK]);
}
export async function actionRunRetentionSweep() {
  return run("runRetentionSweep", (ctx) => tools.runRetentionSweepTool(ctx), [IK]);
}

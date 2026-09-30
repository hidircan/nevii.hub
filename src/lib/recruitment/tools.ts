/**
 * İK / işe alım yönetim araçları (panel). `email-templates/tools.ts` ile AYNI desen:
 * `ServiceResult`, `requireRole`, zod doğrulama, denetim kaydı. YALNIZ SCHOOL_ADMIN / SUPER_ADMIN.
 * Her okuma/yazma `ctx.tenantId` ile kapsamlanır.
 */
import { z } from "zod";
import { ok, fail, fromZodError, type ServiceResult } from "../services/result";
import { requireRole, type ServiceContext } from "../services/context";
import { recordAuditLog } from "../audit/log";
import { logger } from "../logger";
import {
  applicationNumber,
  CLOSED_STAGES,
  fullName,
  PIPELINE_STAGES,
  STAGE_LABELS,
  STAGES,
  INTERVIEW_KIND_LABELS,
} from "./constants";
import { applyApplicationFilter, type ApplicationFilter } from "./filters";
import {
  addActivity,
  createEvaluation,
  createInterview,
  createJob,
  deleteFilesForApplication,
  getApplication,
  getFile,
  getJob,
  getJobBySlug,
  getSettings,
  claimHire,
  listActivities,
  listApplications,
  listEvaluations,
  listInterviews,
  listJobs,
  redactActivities,
  saveSettings,
  updateApplication,
  updateInterview,
  updateJob,
  createTemplate,
  updateTemplate,
  type JobInput,
} from "./store";
import {
  buildPlaceholderValues,
  ensureDefaultTemplates,
  outcomeLabel,
  renderRecruitmentEmail,
  sendRecruitmentEmail,
  unknownPlaceholders,
} from "./emails";
import { careerSlugForTenant, getInstitutionInfo, slugify } from "./institution";
import type {
  ApplicationStage,
  RecruitmentActivity,
  RecruitmentApplication,
  RecruitmentEmailTemplate,
  RecruitmentEvaluation,
  RecruitmentFileMeta,
  RecruitmentInterview,
  RecruitmentJob,
  RecruitmentSettings,
} from "./types";

const ADMIN_ROLES = ["SCHOOL_ADMIN", "SUPER_ADMIN"] as const;

function guard(ctx: ServiceContext) {
  const auth = requireRole(ctx, [...ADMIN_ROLES]);
  return auth.ok ? null : fail("FORBIDDEN", "İnsan kaynakları modülü yalnız kurum yöneticilerine açıktır.");
}

function parseOrFail<T>(schema: z.ZodType<T>, input: unknown): ServiceResult<T> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first?.path?.length ? `${first.path.join(".")}: ` : "";
    return { ...fromZodError(parsed.error.flatten()), error: { code: "VALIDATION_ERROR", message: `${where}${first?.message ?? "Geçersiz giriş."}`, details: parsed.error.flatten() } };
  }
  return ok(parsed.data);
}

function audit(ctx: ServiceContext, action: string, entityType: string, entityId: string, meta?: Record<string, unknown>) {
  void recordAuditLog({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    action,
    entityType,
    entityId,
    outcome: "success",
    meta,
  });
}

async function actorName(ctx: ServiceContext): Promise<string> {
  try {
    const { getUserById } = await import("../auth/users");
    const u = await getUserById(ctx.userId);
    const name = (u as { name?: string } | null)?.name;
    return name || u?.email || "Yönetici";
  } catch {
    return "Yönetici";
  }
}

const stageSchema = z.enum(STAGES as [ApplicationStage, ...ApplicationStage[]]);
const idSchema = z.string().min(1).max(64);
const optionalIso = z
  .string()
  .max(40)
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || !Number.isNaN(Date.parse(v)), "Geçerli bir tarih girin.");

/* ───────────────────────── İlanlar ───────────────────────── */

const jobSchema = z.object({
  id: idSchema.optional(),
  title: z.string().trim().min(3, "Başlık en az 3 karakter olmalı.").max(140),
  slug: z.string().trim().max(80).optional(),
  category: z.enum(["teacher", "staff"]),
  instruments: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  branchId: z.string().max(64).optional().nullable().transform((v) => v || null),
  employmentType: z.enum(["full_time", "part_time", "freelance", "intern"]),
  location: z.string().max(140).default(""),
  summary: z.string().max(400).default(""),
  description: z.string().max(12000).default(""),
  requirements: z.string().max(8000).default(""),
  benefits: z.string().max(8000).default(""),
  status: z.enum(["draft", "published", "closed", "archived"]).default("draft"),
  closesAt: optionalIso,
});

export type JobWithStats = RecruitmentJob & { applicationCount: number; newCount: number; activeCount: number };

export async function listJobsTool(ctx: ServiceContext): Promise<ServiceResult<{ jobs: JobWithStats[]; careerSlug: string }>> {
  const g = guard(ctx);
  if (g) return g;
  const [jobs, apps, careerSlug] = await Promise.all([listJobs(ctx.tenantId), listApplications(ctx.tenantId), careerSlugForTenant(ctx.tenantId)]);
  const withStats = jobs.map((j) => {
    const mine = apps.filter((a) => a.jobId === j.id && !a.anonymizedAt);
    return {
      ...j,
      applicationCount: mine.length,
      newCount: mine.filter((a) => a.stage === "new").length,
      activeCount: mine.filter((a) => !CLOSED_STAGES.includes(a.stage) && a.stage !== "talent_pool").length,
    };
  });
  return ok({ jobs: withStats, careerSlug });
}

export async function getJobTool(ctx: ServiceContext, input: unknown): Promise<ServiceResult<{ job: RecruitmentJob; careerSlug: string }>> {
  const g = guard(ctx);
  if (g) return g;
  const v = parseOrFail(z.object({ id: idSchema }), input);
  if (!v.ok) return v;
  const job = await getJob(ctx.tenantId, v.data.id);
  if (!job) return fail("NOT_FOUND", "İlan bulunamadı.");
  return ok({ job, careerSlug: await careerSlugForTenant(ctx.tenantId) });
}

async function uniqueSlug(tenantId: string, wanted: string, selfId?: string): Promise<string> {
  const base = slugify(wanted) || "ilan";
  let candidate = base;
  for (let i = 2; i < 200; i++) {
    const hit = await getJobBySlug(tenantId, candidate);
    if (!hit || hit.id === selfId) return candidate;
    candidate = `${base}-${i}`;
  }
  return `${base}-${Date.now()}`;
}

/** İlk ilan yayımlandığında, ayarları hiç kaydedilmemiş kurumun kariyer sayfası açılır (bilinçli kapatılmışsa dokunulmaz). */
async function enableCareerPageOnFirstPublish(tenantId: string, userId: string) {
  const s = await getSettings(tenantId);
  if (!s.careerPageEnabled && s.updatedBy === null && s.updatedAt === new Date(0).toISOString()) {
    await saveSettings(tenantId, { careerPageEnabled: true, updatedBy: userId });
  }
}

export async function saveJobTool(ctx: ServiceContext, input: unknown): Promise<ServiceResult<{ job: RecruitmentJob }>> {
  const g = guard(ctx);
  if (g) return g;
  const v = parseOrFail(jobSchema, input);
  if (!v.ok) return v;
  const d = v.data;
  if (d.branchId) {
    const { readReferenceData } = await import("../store");
    const { runWithTenantAsync } = await import("../tenant-context");
    const data = await runWithTenantAsync(ctx.tenantId, () => readReferenceData());
    if (!data.settings.branches.some((b) => b.id === d.branchId)) return fail("VALIDATION_ERROR", "Seçilen şube bu kurumda bulunamadı.");
  }
  const existing = d.id ? await getJob(ctx.tenantId, d.id) : null;
  if (d.id && !existing) return fail("NOT_FOUND", "Düzenlenecek ilan bulunamadı.");
  const slug = await uniqueSlug(ctx.tenantId, d.slug || existing?.slug || d.title, existing?.id);
  const publishedAt = d.status === "published" ? existing?.publishedAt ?? new Date().toISOString() : existing?.publishedAt ?? null;
  const payload: JobInput = {
    slug,
    title: d.title,
    category: d.category,
    instruments: Array.from(new Set(d.instruments)),
    branchId: d.branchId,
    employmentType: d.employmentType,
    location: d.location,
    summary: d.summary,
    description: d.description,
    requirements: d.requirements,
    benefits: d.benefits,
    status: d.status,
    publishedAt,
    closesAt: d.closesAt,
  };
  const job = existing ? await updateJob(ctx.tenantId, existing.id, payload) : await createJob(ctx.tenantId, payload, ctx.userId);
  if (!job) return fail("INTERNAL_ERROR", "İlan kaydedilemedi.");
  if (job.status === "published") await enableCareerPageOnFirstPublish(ctx.tenantId, ctx.userId);
  audit(ctx, existing ? "recruitment.job_update" : "recruitment.job_create", "RecruitmentJob", job.id, { status: job.status, slug: job.slug });
  return ok({ job });
}

export async function setJobStatusTool(ctx: ServiceContext, input: unknown): Promise<ServiceResult<{ job: RecruitmentJob }>> {
  const g = guard(ctx);
  if (g) return g;
  const v = parseOrFail(z.object({ id: idSchema, status: z.enum(["draft", "published", "closed", "archived"]) }), input);
  if (!v.ok) return v;
  const existing = await getJob(ctx.tenantId, v.data.id);
  if (!existing) return fail("NOT_FOUND", "İlan bulunamadı.");
  const job = await updateJob(ctx.tenantId, existing.id, {
    status: v.data.status,
    publishedAt: v.data.status === "published" ? existing.publishedAt ?? new Date().toISOString() : existing.publishedAt,
  });
  if (!job) return fail("INTERNAL_ERROR", "İlan durumu güncellenemedi.");
  if (job.status === "published") await enableCareerPageOnFirstPublish(ctx.tenantId, ctx.userId);
  audit(ctx, "recruitment.job_status", "RecruitmentJob", job.id, { status: job.status });
  return ok({ job });
}

/* ───────────────────────── Aday havuzu ───────────────────────── */

export async function listApplicationsTool(
  ctx: ServiceContext,
  filter: ApplicationFilter
): Promise<ServiceResult<{ applications: RecruitmentApplication[]; total: number; jobs: RecruitmentJob[]; allInstruments: string[]; allTags: string[]; allCities: string[] }>> {
  const g = guard(ctx);
  if (g) return g;
  const [apps, jobs] = await Promise.all([listApplications(ctx.tenantId), listJobs(ctx.tenantId)]);
  const visible = apps.filter((a) => !a.anonymizedAt);
  const filtered = applyApplicationFilter(visible, filter);
  const uniq = (xs: string[]) => Array.from(new Set(xs.filter(Boolean))).sort((a, b) => a.localeCompare(b, "tr"));
  return ok({
    applications: filtered,
    total: visible.length,
    jobs,
    allInstruments: uniq([...visible.flatMap((a) => a.instruments), ...jobs.flatMap((j) => j.instruments)]),
    allTags: uniq(visible.flatMap((a) => a.tags)),
    allCities: uniq(visible.map((a) => a.city)),
  });
}

export type ApplicationDetail = {
  application: RecruitmentApplication;
  job: RecruitmentJob | null;
  activities: RecruitmentActivity[];
  interviews: RecruitmentInterview[];
  evaluations: RecruitmentEvaluation[];
  cv: Omit<RecruitmentFileMeta, "tenantId"> | null;
  templates: RecruitmentEmailTemplate[];
  settings: RecruitmentSettings;
  jobs: RecruitmentJob[];
};

export async function getApplicationDetailTool(ctx: ServiceContext, input: unknown): Promise<ServiceResult<ApplicationDetail>> {
  const g = guard(ctx);
  if (g) return g;
  const v = parseOrFail(z.object({ id: idSchema }), input);
  if (!v.ok) return v;
  const application = await getApplication(ctx.tenantId, v.data.id);
  if (!application) return fail("NOT_FOUND", "Aday bulunamadı.");
  const [job, activities, interviews, evaluations, templates, settings, jobs] = await Promise.all([
    application.jobId ? getJob(ctx.tenantId, application.jobId) : Promise.resolve(null),
    listActivities(ctx.tenantId, application.id),
    listInterviews(ctx.tenantId, application.id),
    listEvaluations(ctx.tenantId, application.id),
    ensureDefaultTemplates(ctx.tenantId),
    getSettings(ctx.tenantId),
    listJobs(ctx.tenantId),
  ]);
  let cv: ApplicationDetail["cv"] = null;
  if (application.cvFileId) {
    const f = await getFile(ctx.tenantId, application.cvFileId);
    if (f) cv = { id: f.id, applicationId: f.applicationId, fileName: f.fileName, mimeType: f.mimeType, sizeBytes: f.sizeBytes, createdAt: f.createdAt };
  }
  return ok({ application, job, activities, interviews, evaluations, cv, templates: templates.filter((t) => t.active), settings, jobs });
}

export async function getCvFileTool(ctx: ServiceContext, input: unknown): Promise<ServiceResult<{ fileName: string; mimeType: string; data: Buffer }>> {
  const g = guard(ctx);
  if (g) return g;
  const v = parseOrFail(z.object({ applicationId: idSchema }), input);
  if (!v.ok) return v;
  const app = await getApplication(ctx.tenantId, v.data.applicationId);
  if (!app?.cvFileId) return fail("NOT_FOUND", "Bu adayın yüklenmiş bir CV'si yok.");
  const f = await getFile(ctx.tenantId, app.cvFileId);
  if (!f) return fail("NOT_FOUND", "CV dosyası bulunamadı (anonimleştirilmiş olabilir).");
  audit(ctx, "recruitment.cv_download", "RecruitmentApplication", app.id);
  return ok({ fileName: f.fileName, mimeType: f.mimeType, data: f.data });
}

export async function changeStageTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ updated: number }>> {
  const g = guard(ctx);
  if (g) return g;
  const v = parseOrFail(z.object({ ids: z.array(idSchema).min(1).max(500), stage: stageSchema, note: z.string().max(2000).optional() }), input);
  if (!v.ok) return v;
  const name = await actorName(ctx);
  let updated = 0;
  for (const id of v.data.ids) {
    const app = await getApplication(ctx.tenantId, id);
    if (!app || app.anonymizedAt || app.stage === v.data.stage) continue;
    await updateApplication(ctx.tenantId, id, { stage: v.data.stage, lastStageChangeAt: new Date().toISOString() });
    await addActivity(ctx.tenantId, {
      applicationId: id,
      type: "stage_change",
      body: `${STAGE_LABELS[app.stage]} → ${STAGE_LABELS[v.data.stage]}${v.data.note ? ` — ${v.data.note}` : ""}`,
      meta: { from: app.stage, to: v.data.stage },
      actorUserId: ctx.userId,
      actorName: name,
    });
    updated++;
  }
  audit(ctx, "recruitment.stage_change", "RecruitmentApplication", v.data.ids.join(",").slice(0, 200), { stage: v.data.stage, updated });
  return ok({ updated });
}

const profilePatchSchema = z.object({
  id: idSchema,
  firstName: z.string().trim().min(1).max(60).optional(),
  lastName: z.string().trim().min(1).max(60).optional(),
  email: z.string().trim().toLowerCase().email("Geçerli bir e-posta girin.").max(160).optional(),
  phone: z.string().trim().max(30).optional(),
  city: z.string().trim().max(60).optional(),
  category: z.enum(["teacher", "staff"]).optional(),
  jobId: z.string().max(64).nullable().optional(),
  instruments: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  experienceYears: z.number().int().min(0).max(60).nullable().optional(),
  teachingYears: z.number().int().min(0).max(60).nullable().optional(),
  educationLevel: z.enum(["", "high_school", "conservatory_hs", "associate", "bachelor", "master", "doctorate"]).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
});

export async function updateApplicationTool(ctx: ServiceContext, input: unknown): Promise<ServiceResult<{ application: RecruitmentApplication }>> {
  const g = guard(ctx);
  if (g) return g;
  const v = parseOrFail(profilePatchSchema, input);
  if (!v.ok) return v;
  const { id, ...patch } = v.data;
  const app = await getApplication(ctx.tenantId, id);
  if (!app) return fail("NOT_FOUND", "Aday bulunamadı.");
  if (app.anonymizedAt) return fail("CONFLICT", "Anonimleştirilmiş aday düzenlenemez.");
  if (patch.jobId) {
    const job = await getJob(ctx.tenantId, patch.jobId);
    if (!job) return fail("VALIDATION_ERROR", "Seçilen ilan bulunamadı.");
  }
  if (patch.tags) patch.tags = Array.from(new Set(patch.tags));
  const updated = await updateApplication(ctx.tenantId, id, patch);
  if (!updated) return fail("INTERNAL_ERROR", "Aday güncellenemedi.");
  audit(ctx, "recruitment.application_update", "RecruitmentApplication", id, { fields: Object.keys(patch) });
  return ok({ application: updated });
}

export async function addNoteTool(ctx: ServiceContext, input: unknown): Promise<ServiceResult<{ activity: RecruitmentActivity }>> {
  const g = guard(ctx);
  if (g) return g;
  const v = parseOrFail(z.object({ id: idSchema, body: z.string().trim().min(1, "Not boş olamaz.").max(4000) }), input);
  if (!v.ok) return v;
  const app = await getApplication(ctx.tenantId, v.data.id);
  if (!app) return fail("NOT_FOUND", "Aday bulunamadı.");
  if (app.anonymizedAt) return fail("CONFLICT", "Anonimleştirilmiş adaya not eklenemez.");
  const activity = await addActivity(ctx.tenantId, {
    applicationId: app.id,
    type: "note",
    body: v.data.body,
    meta: null,
    actorUserId: ctx.userId,
    actorName: await actorName(ctx),
  });
  return ok({ activity });
}

/* ───────────────────────── Görüşme / deneme dersi ───────────────────────── */

const interviewSchema = z.object({
  applicationId: idSchema,
  kind: z.enum(["interview", "demo_lesson", "phone", "online"]),
  scheduledAt: z.string().refine((s) => !Number.isNaN(Date.parse(s)), "Geçerli bir tarih-saat girin."),
  durationMinutes: z.number().int().min(10).max(480).default(30),
  location: z.string().trim().max(300).default(""),
  interviewers: z.string().trim().max(300).default(""),
  notes: z.string().max(4000).default(""),
  sendInvitation: z.boolean().default(false),
  templateId: z.string().max(64).optional(),
});

export async function scheduleInterviewTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ interview: RecruitmentInterview; invitation: string | null }>> {
  const g = guard(ctx);
  if (g) return g;
  const v = parseOrFail(interviewSchema, input);
  if (!v.ok) return v;
  const d = v.data;
  const app = await getApplication(ctx.tenantId, d.applicationId);
  if (!app) return fail("NOT_FOUND", "Aday bulunamadı.");
  if (app.anonymizedAt) return fail("CONFLICT", "Anonimleştirilmiş adaya görüşme planlanamaz.");
  const scheduledAt = new Date(d.scheduledAt).toISOString();
  let interview = await createInterview(ctx.tenantId, {
    applicationId: app.id,
    kind: d.kind,
    scheduledAt,
    durationMinutes: d.durationMinutes,
    location: d.location,
    interviewers: d.interviewers,
    status: "planned",
    notes: d.notes,
    invitationSentAt: null,
    createdBy: ctx.userId,
  });
  const name = await actorName(ctx);
  const targetStage: ApplicationStage = d.kind === "demo_lesson" ? "demo_lesson" : "interview";
  const order = PIPELINE_STAGES.indexOf(app.stage);
  if (order >= 0 && order < PIPELINE_STAGES.indexOf(targetStage)) {
    await updateApplication(ctx.tenantId, app.id, { stage: targetStage, lastStageChangeAt: new Date().toISOString() });
    await addActivity(ctx.tenantId, {
      applicationId: app.id, type: "stage_change", body: `${STAGE_LABELS[app.stage]} → ${STAGE_LABELS[targetStage]} (görüşme planlandı)`,
      meta: { from: app.stage, to: targetStage }, actorUserId: ctx.userId, actorName: name,
    });
  }
  let invitation: string | null = null;
  if (d.sendInvitation) {
    const templates = await ensureDefaultTemplates(ctx.tenantId);
    const tpl = (d.templateId && templates.find((t) => t.id === d.templateId)) || templates.find((t) => t.kind === "interview_invite" && t.active);
    if (tpl) {
      const [job, institution] = await Promise.all([app.jobId ? getJob(ctx.tenantId, app.jobId) : null, getInstitutionInfo(ctx.tenantId)]);
      const rendered = renderRecruitmentEmail({
        subject: tpl.subject,
        body: tpl.body,
        institution,
        values: buildPlaceholderValues({ app, job, institution, interview }),
      });
      const outcome = await sendRecruitmentEmail(app.email, rendered);
      invitation = outcomeLabel(outcome);
      if (outcome.delivered) interview = (await updateInterview(ctx.tenantId, interview.id, { invitationSentAt: new Date().toISOString() })) ?? interview;
      await addActivity(ctx.tenantId, {
        applicationId: app.id, type: "email", body: `"${rendered.subject}" — ${invitation}`,
        meta: { templateId: tpl.id, delivered: outcome.delivered, reason: outcome.reason ?? null }, actorUserId: ctx.userId, actorName: name,
      });
    }
  }
  await addActivity(ctx.tenantId, {
    applicationId: app.id, type: "interview",
    body: `${INTERVIEW_KIND_LABELS[d.kind]} planlandı: ${new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", dateStyle: "medium", timeStyle: "short" }).format(new Date(scheduledAt))}${d.location ? ` · ${d.location}` : ""}`,
    meta: { interviewId: interview.id }, actorUserId: ctx.userId, actorName: name,
  });
  audit(ctx, "recruitment.interview_schedule", "RecruitmentInterview", interview.id, { applicationId: app.id, kind: d.kind });
  return ok({ interview, invitation });
}

export async function updateInterviewStatusTool(ctx: ServiceContext, input: unknown): Promise<ServiceResult<{ interview: RecruitmentInterview }>> {
  const g = guard(ctx);
  if (g) return g;
  const v = parseOrFail(
    z.object({ id: idSchema, status: z.enum(["planned", "completed", "cancelled", "no_show"]), notes: z.string().max(4000).optional() }),
    input
  );
  if (!v.ok) return v;
  const interview = await updateInterview(ctx.tenantId, v.data.id, { status: v.data.status, notes: v.data.notes });
  if (!interview) return fail("NOT_FOUND", "Görüşme bulunamadı.");
  return ok({ interview });
}

/* ───────────────────────── Değerlendirme ───────────────────────── */

export async function addEvaluationTool(ctx: ServiceContext, input: unknown): Promise<ServiceResult<{ evaluation: RecruitmentEvaluation; ratingAvg: number }>> {
  const g = guard(ctx);
  if (g) return g;
  const v = parseOrFail(
    z.object({
      applicationId: idSchema,
      interviewId: z.string().max(64).optional().nullable(),
      scores: z.record(z.string().max(40), z.number().int().min(1).max(5)),
      recommendation: z.enum(["strong_yes", "yes", "neutral", "no", "strong_no"]),
      comment: z.string().max(4000).default(""),
    }),
    input
  );
  if (!v.ok) return v;
  const d = v.data;
  const values = Object.values(d.scores);
  if (values.length === 0) return fail("VALIDATION_ERROR", "En az bir kriteri puanlayın.");
  const app = await getApplication(ctx.tenantId, d.applicationId);
  if (!app) return fail("NOT_FOUND", "Aday bulunamadı.");
  const overall = Math.round((values.reduce((s, n) => s + n, 0) / values.length) * 10) / 10;
  const name = await actorName(ctx);
  const evaluation = await createEvaluation(ctx.tenantId, {
    applicationId: app.id, interviewId: d.interviewId ?? null, evaluatorId: ctx.userId, evaluatorName: name,
    scores: d.scores, overall, recommendation: d.recommendation, comment: d.comment,
  });
  const all = await listEvaluations(ctx.tenantId, app.id);
  const ratingAvg = Math.round((all.reduce((s, e) => s + e.overall, 0) / all.length) * 10) / 10;
  await updateApplication(ctx.tenantId, app.id, { ratingAvg });
  await addActivity(ctx.tenantId, {
    applicationId: app.id, type: "evaluation", body: `Değerlendirme: ${overall.toFixed(1)} / 5`, meta: { evaluationId: evaluation.id },
    actorUserId: ctx.userId, actorName: name,
  });
  return ok({ evaluation, ratingAvg });
}

/* ───────────────────────── E-posta ───────────────────────── */

export async function listTemplatesTool(ctx: ServiceContext): Promise<ServiceResult<{ templates: RecruitmentEmailTemplate[] }>> {
  const g = guard(ctx);
  if (g) return g;
  return ok({ templates: await ensureDefaultTemplates(ctx.tenantId) });
}

const templateSchema = z.object({
  id: idSchema.optional(),
  kind: z.enum(["received", "positive", "negative", "interview_invite", "offer", "custom"]),
  name: z.string().trim().min(2).max(100),
  subject: z.string().trim().min(2).max(200),
  body: z.string().trim().min(10, "Gövde en az 10 karakter olmalı.").max(10000),
  active: z.boolean().default(true),
});

export async function saveTemplateTool(ctx: ServiceContext, input: unknown): Promise<ServiceResult<{ template: RecruitmentEmailTemplate }>> {
  const g = guard(ctx);
  if (g) return g;
  const v = parseOrFail(templateSchema, input);
  if (!v.ok) return v;
  const unknown = unknownPlaceholders(`${v.data.subject}\n${v.data.body}`);
  if (unknown.length) return fail("VALIDATION_ERROR", `Bilinmeyen yer tutucu: ${unknown.map((u) => `{{${u}}}`).join(", ")} — listedeki alanları kullanın.`);
  const { id, ...fields } = v.data;
  let template: RecruitmentEmailTemplate | null;
  if (id) {
    template = await updateTemplate(ctx.tenantId, id, fields);
    if (!template) return fail("NOT_FOUND", "Şablon bulunamadı.");
  } else {
    template = await createTemplate(ctx.tenantId, { ...fields, systemKey: null }, ctx.userId);
  }
  audit(ctx, id ? "recruitment.template_update" : "recruitment.template_create", "RecruitmentEmailTemplate", template.id);
  return ok({ template });
}

const sendSchema = z.object({
  ids: z.array(idSchema).min(1).max(200),
  templateId: idSchema,
  subject: z.string().trim().min(2).max(200).optional(),
  body: z.string().trim().min(10).max(10000).optional(),
  moveToStage: stageSchema.optional(),
});

export type BulkEmailResult = { sent: number; failed: number; skipped: number; blocked: boolean; details: { id: string; name: string; result: string }[] };

export async function sendTemplateEmailTool(ctx: ServiceContext, input: unknown): Promise<ServiceResult<BulkEmailResult>> {
  const g = guard(ctx);
  if (g) return g;
  const v = parseOrFail(sendSchema, input);
  if (!v.ok) return v;
  const d = v.data;
  const templates = await ensureDefaultTemplates(ctx.tenantId);
  const tpl = templates.find((t) => t.id === d.templateId);
  if (!tpl) return fail("NOT_FOUND", "Şablon bulunamadı.");
  const subject = d.subject ?? tpl.subject;
  const body = d.body ?? tpl.body;
  const unknown = unknownPlaceholders(`${subject}\n${body}`);
  if (unknown.length) return fail("VALIDATION_ERROR", `Bilinmeyen yer tutucu: ${unknown.map((u) => `{{${u}}}`).join(", ")}`);
  const { consumeRateLimit } = await import("../rate-limit");
  if (!consumeRateLimit("recruitment-bulk-mail", `${ctx.tenantId}:${ctx.userId}`, { windowMs: 60 * 60 * 1000, max: 30 })) {
    return fail("RATE_LIMITED", "Kısa sürede çok fazla toplu e-posta gönderildi. Lütfen bir süre sonra tekrar deneyin.");
  }
  const [institution, jobs, name] = await Promise.all([getInstitutionInfo(ctx.tenantId), listJobs(ctx.tenantId), actorName(ctx)]);
  const result: BulkEmailResult = { sent: 0, failed: 0, skipped: 0, blocked: false, details: [] };
  for (const id of Array.from(new Set(d.ids))) {
    const app = await getApplication(ctx.tenantId, id);
    if (!app || app.anonymizedAt || !app.email) {
      result.skipped++;
      continue;
    }
    const job = app.jobId ? jobs.find((j) => j.id === app.jobId) ?? null : null;
    const interviews = await listInterviews(ctx.tenantId, app.id);
    const nextInterview = interviews.filter((i) => i.status === "planned").sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))[0] ?? null;
    const rendered = renderRecruitmentEmail({ subject, body, institution, values: buildPlaceholderValues({ app, job, institution, interview: nextInterview }) });
    const outcome = await sendRecruitmentEmail(app.email, rendered);
    const label = outcomeLabel(outcome);
    if (outcome.delivered) result.sent++;
    else {
      result.failed++;
      if (outcome.blocked) result.blocked = true;
    }
    result.details.push({ id: app.id, name: fullName(app), result: label });
    await addActivity(ctx.tenantId, {
      applicationId: app.id, type: "email", body: `"${rendered.subject}" — ${label}`,
      meta: { templateId: tpl.id, kind: tpl.kind, delivered: outcome.delivered, reason: outcome.reason ?? null }, actorUserId: ctx.userId, actorName: name,
    });
    if (d.moveToStage && app.stage !== d.moveToStage) {
      await updateApplication(ctx.tenantId, app.id, { stage: d.moveToStage, lastStageChangeAt: new Date().toISOString() });
      await addActivity(ctx.tenantId, {
        applicationId: app.id, type: "stage_change", body: `${STAGE_LABELS[app.stage]} → ${STAGE_LABELS[d.moveToStage]} (e-posta ile)`,
        meta: { from: app.stage, to: d.moveToStage }, actorUserId: ctx.userId, actorName: name,
      });
    }
  }
  audit(ctx, "recruitment.bulk_email", "RecruitmentEmailTemplate", tpl.id, { sent: result.sent, failed: result.failed, count: d.ids.length });
  return ok(result);
}

export async function previewEmailTool(ctx: ServiceContext, input: unknown): Promise<ServiceResult<{ subject: string; html: string }>> {
  const g = guard(ctx);
  if (g) return g;
  const v = parseOrFail(z.object({ applicationId: idSchema.optional(), subject: z.string().max(200), body: z.string().max(10000) }), input);
  if (!v.ok) return v;
  const institution = await getInstitutionInfo(ctx.tenantId);
  let app: Pick<RecruitmentApplication, "firstName" | "lastName" | "seq"> = { firstName: "Ayşe", lastName: "Yılmaz", seq: 42 };
  let job: RecruitmentJob | null = null;
  if (v.data.applicationId) {
    const real = await getApplication(ctx.tenantId, v.data.applicationId);
    if (real) {
      app = real;
      job = real.jobId ? await getJob(ctx.tenantId, real.jobId) : null;
    }
  }
  const sample = { kind: "interview" as const, scheduledAt: new Date(Date.now() + 3 * 864e5).toISOString(), location: "Merkez şube" };
  const rendered = renderRecruitmentEmail({
    subject: v.data.subject, body: v.data.body, institution,
    values: buildPlaceholderValues({ app, job: job ?? { title: "Piyano Öğretmeni" }, institution, interview: sample }),
  });
  return ok({ subject: rendered.subject, html: rendered.html });
}

/* ───────────────────────── Ayarlar ───────────────────────── */

export async function getSettingsTool(ctx: ServiceContext): Promise<ServiceResult<{ settings: RecruitmentSettings; careerSlug: string }>> {
  const g = guard(ctx);
  if (g) return g;
  const [settings, careerSlug] = await Promise.all([getSettings(ctx.tenantId), careerSlugForTenant(ctx.tenantId)]);
  return ok({ settings, careerSlug });
}

export async function saveSettingsTool(ctx: ServiceContext, input: unknown): Promise<ServiceResult<{ settings: RecruitmentSettings }>> {
  const g = guard(ctx);
  if (g) return g;
  const v = parseOrFail(
    z.object({
      careerPageEnabled: z.boolean(),
      careerPageIntro: z.string().max(4000),
      kvkkText: z.string().max(12000),
      notifyInApp: z.boolean(),
      notifyEmails: z.array(z.string().trim().email("Bildirim e-postalarından biri geçersiz.")).max(10),
      autoAcknowledge: z.boolean(),
      retentionMonths: z.number().int().min(1).max(60),
      scorecardCriteria: z.array(z.object({ key: z.string().trim().min(1).max(40), label: z.string().trim().min(2).max(80) })).min(1).max(12),
    }),
    input
  );
  if (!v.ok) return v;
  const prev = await getSettings(ctx.tenantId);
  // KVKK metni değişirse sürüm artar — hangi adayın hangi metni onayladığı izlenebilir kalır.
  const kvkkTextVersion = prev.kvkkText.trim() !== v.data.kvkkText.trim() ? `v${(Number(prev.kvkkTextVersion.replace(/\D/g, "")) || 1) + 1}` : prev.kvkkTextVersion;
  const settings = await saveSettings(ctx.tenantId, { ...v.data, kvkkTextVersion, updatedBy: ctx.userId });
  audit(ctx, "recruitment.settings_update", "RecruitmentSettings", ctx.tenantId, { kvkkTextVersion });
  return ok({ settings });
}

/* ───────────────────────── Öğretmen / Personel'e aktarma ───────────────────────── */

export async function convertToEmployeeTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ target: "teacher" | "staff"; recordId: string; href: string }>> {
  const g = guard(ctx);
  if (g) return g;
  const v = parseOrFail(
    z.object({
      applicationId: idSchema,
      target: z.enum(["teacher", "staff"]),
      branchId: z.string().min(1, "Şube seçin.").max(64),
      instrument: z.string().max(60).optional(),
      position: z.string().max(100).optional(),
    }),
    input
  );
  if (!v.ok) return v;
  const d = v.data;
  const app = await getApplication(ctx.tenantId, d.applicationId);
  if (!app) return fail("NOT_FOUND", "Aday bulunamadı.");
  if (app.anonymizedAt) return fail("CONFLICT", "Anonimleştirilmiş aday aktarılamaz.");
  if (app.hiredTeacherId || app.hiredStaffId) return fail("CONFLICT", "Bu aday zaten bir öğretmen/personel kaydına aktarılmış.");
  if (d.target === "teacher" && !(d.instrument || app.instruments[0])) return fail("VALIDATION_ERROR", "Öğretmen kaydı için bir enstrüman seçin.");
  // Çift tıklama / eşzamanlı istek: yalnız ilk istek kaydı oluşturabilir.
  if (!(await claimHire(ctx.tenantId, app.id))) return fail("CONFLICT", "Bu aday için aktarım zaten sürüyor veya tamamlandı.");
  const release = () => updateApplication(ctx.tenantId, app.id, { hiredTeacherId: null });
  const job = app.jobId ? await getJob(ctx.tenantId, app.jobId) : null;
  const hireDate = new Date().toISOString().slice(0, 10);
  const note = `İK başvurusu ${applicationNumber(app.seq)} üzerinden aktarıldı.`;
  let recordId: string;
  let href: string;
  const { runWithTenantAsync } = await import("../tenant-context");
  if (d.target === "teacher") {
    const instrument = (d.instrument || app.instruments[0])!;
    const { createTeacherTool } = await import("../services/tools");
    const res = await runWithTenantAsync(ctx.tenantId, () =>
      createTeacherTool(ctx, {
        name: fullName(app),
        email: app.email || undefined,
        phone: app.phone || "-",
        branchId: d.branchId,
        instrument,
        university: app.profile.school || undefined,
        graduationYear: app.profile.graduationYear,
        hireDate,
        personnelNotes: note,
      })
    );
    if (!res.ok) {
      await release();
      return fail(res.error.code, `Öğretmen kaydı oluşturulamadı: ${res.error.message}`);
    }
    recordId = res.data.teacherId;
    href = `/panel/ogretmenler/${recordId}`;
    await updateApplication(ctx.tenantId, app.id, { hiredTeacherId: recordId, stage: "hired", lastStageChangeAt: new Date().toISOString() });
  } else {
    const { createStaffMemberTool } = await import("../services/tools");
    const res = await runWithTenantAsync(ctx.tenantId, () =>
      createStaffMemberTool(ctx, {
        name: fullName(app),
        position: d.position || job?.title || "Personel",
        email: app.email || undefined,
        phone: app.phone || undefined,
        branchId: d.branchId,
        hireDate,
        personnelNotes: note,
      })
    );
    if (!res.ok) {
      await release();
      return fail(res.error.code, `Personel kaydı oluşturulamadı: ${res.error.message}`);
    }
    recordId = res.data.staffId;
    href = `/panel/personel/${recordId}`;
    await updateApplication(ctx.tenantId, app.id, { hiredTeacherId: null, hiredStaffId: recordId, stage: "hired", lastStageChangeAt: new Date().toISOString() });
  }
  await addActivity(ctx.tenantId, {
    applicationId: app.id, type: "system",
    body: d.target === "teacher" ? "Öğretmen kaydına aktarıldı." : "Personel kaydına aktarıldı.",
    meta: { target: d.target, recordId }, actorUserId: ctx.userId, actorName: await actorName(ctx),
  });
  audit(ctx, "recruitment.convert", "RecruitmentApplication", app.id, { target: d.target, recordId });
  return ok({ target: d.target, recordId, href });
}

/* ───────────────────────── KVKK: anonimleştirme + saklama süresi ───────────────────────── */

async function anonymize(tenantId: string, app: RecruitmentApplication): Promise<void> {
  await deleteFilesForApplication(tenantId, app.id);
  await redactActivities(tenantId, app.id);
  await updateApplication(tenantId, app.id, {
    firstName: "Anonim",
    lastName: "Aday",
    email: `anonim-${app.id}@invalid.local`,
    phone: "",
    city: "",
    tags: [],
    cvFileId: null,
    profile: {},
    anonymizedAt: new Date().toISOString(),
  });
}

export async function anonymizeApplicationTool(ctx: ServiceContext, input: unknown): Promise<ServiceResult<{ id: string }>> {
  const g = guard(ctx);
  if (g) return g;
  // 2026-09-29 — "Kişisel veriyi sil" geri alınamaz: kurum sahibi/yöneticisi + kritik şifre + gerekçe.
  const { criticalDeleteFields, guardCriticalDelete } = await import("../services/tools");
  const v = parseOrFail(z.object({ id: idSchema, ...criticalDeleteFields }), input);
  if (!v.ok) return v;
  const app = await getApplication(ctx.tenantId, v.data.id);
  if (!app) return fail("NOT_FOUND", "Aday bulunamadı.");
  if (app.anonymizedAt) return ok({ id: app.id });
  const denied = await guardCriticalDelete(
    ctx,
    { action: "recruitment.anonymize", entityType: "RecruitmentApplication", entityId: app.id },
    v.data.criticalPassword
  );
  if (denied) return denied;
  await anonymize(ctx.tenantId, app);
  audit(ctx, "recruitment.anonymize", "RecruitmentApplication", app.id, { reason: "manual", note: v.data.reason });
  return ok({ id: app.id });
}

/** Saklama süresi dolmuş, işe alınmamış başvuruları anonimleştirir. İdempotent. */
export async function runRetentionSweep(tenantId: string, now: Date = new Date()): Promise<number> {
  const apps = await listApplications(tenantId);
  let count = 0;
  for (const a of apps) {
    if (a.anonymizedAt || a.stage === "hired" || !a.retentionUntil) continue;
    if (new Date(a.retentionUntil).getTime() > now.getTime()) continue;
    try {
      await anonymize(tenantId, a);
      count++;
    } catch (e) {
      logger.error("recruitment retention anonymize failed", { tenantId, id: a.id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return count;
}

export async function runRetentionSweepTool(ctx: ServiceContext): Promise<ServiceResult<{ anonymized: number }>> {
  const g = guard(ctx);
  if (g) return g;
  const anonymized = await runRetentionSweep(ctx.tenantId);
  if (anonymized > 0) audit(ctx, "recruitment.retention_sweep", "RecruitmentApplication", ctx.tenantId, { anonymized });
  return ok({ anonymized });
}

/* ───────────────────────── Özet (dashboard) ───────────────────────── */

export type RecruitmentDashboard = {
  openJobs: number;
  totalActive: number;
  newThisWeek: number;
  awaitingReview: number;
  hiredThisMonth: number;
  byStage: { stage: ApplicationStage; label: string; count: number }[];
  bySource: { source: string; count: number }[];
  byCategory: { teacher: number; staff: number };
  upcomingInterviews: (RecruitmentInterview & { candidateName: string })[];
  recent: RecruitmentApplication[];
  retentionDue: number;
  careerSlug: string;
  jobs: RecruitmentJob[];
};

export async function getDashboardTool(ctx: ServiceContext, now: Date = new Date()): Promise<ServiceResult<RecruitmentDashboard>> {
  const g = guard(ctx);
  if (g) return g;
  const [appsAll, jobs, interviews, careerSlug] = await Promise.all([
    listApplications(ctx.tenantId),
    listJobs(ctx.tenantId),
    listInterviews(ctx.tenantId),
    careerSlugForTenant(ctx.tenantId),
  ]);
  const apps = appsAll.filter((a) => !a.anonymizedAt);
  const weekAgo = now.getTime() - 7 * 864e5;
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const sourceCounts = new Map<string, number>();
  for (const a of apps) sourceCounts.set(a.source, (sourceCounts.get(a.source) ?? 0) + 1);
  const byId = new Map(apps.map((a) => [a.id, a]));
  return ok({
    openJobs: jobs.filter((j) => j.status === "published").length,
    totalActive: apps.filter((a) => !CLOSED_STAGES.includes(a.stage) && a.stage !== "talent_pool").length,
    newThisWeek: apps.filter((a) => new Date(a.createdAt).getTime() >= weekAgo).length,
    awaitingReview: apps.filter((a) => a.stage === "new").length,
    hiredThisMonth: apps.filter((a) => a.stage === "hired" && new Date(a.lastStageChangeAt).getTime() >= monthStart).length,
    byStage: STAGES.map((s) => ({ stage: s, label: STAGE_LABELS[s], count: apps.filter((a) => a.stage === s).length })),
    bySource: [...sourceCounts.entries()].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count),
    byCategory: { teacher: apps.filter((a) => a.category === "teacher").length, staff: apps.filter((a) => a.category === "staff").length },
    upcomingInterviews: interviews
      .filter((i) => i.status === "planned" && new Date(i.scheduledAt).getTime() >= now.getTime() - 3600e3 && byId.has(i.applicationId))
      .slice(0, 8)
      .map((i) => ({ ...i, candidateName: fullName(byId.get(i.applicationId)!) })),
    recent: apps.slice(0, 8),
    retentionDue: apps.filter((a) => a.stage !== "hired" && a.retentionUntil && new Date(a.retentionUntil).getTime() <= now.getTime()).length,
    careerSlug,
    jobs,
  });
}

/** Yazdırma/CSV için: filtreyle aynı liste + ilan başlıkları. */
export async function exportApplicationsTool(
  ctx: ServiceContext,
  filter: ApplicationFilter,
  ids?: string[]
): Promise<ServiceResult<{ rows: (RecruitmentApplication & { jobTitle: string })[]; institutionName: string }>> {
  const g = guard(ctx);
  if (g) return g;
  const [apps, jobs, institution] = await Promise.all([listApplications(ctx.tenantId), listJobs(ctx.tenantId), getInstitutionInfo(ctx.tenantId)]);
  let rows = applyApplicationFilter(apps.filter((a) => !a.anonymizedAt), filter);
  if (ids && ids.length) {
    const set = new Set(ids);
    rows = rows.filter((a) => set.has(a.id));
  }
  const titles = new Map(jobs.map((j) => [j.id, j.title]));
  audit(ctx, "recruitment.export", "RecruitmentApplication", ctx.tenantId, { count: rows.length });
  return ok({ rows: rows.map((a) => ({ ...a, jobTitle: a.jobId ? titles.get(a.jobId) ?? "—" : "Genel başvuru" })), institutionName: institution.name });
}

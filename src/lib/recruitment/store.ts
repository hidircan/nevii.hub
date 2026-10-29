/**
 * İK modülü kalıcılık katmanı — `email-templates/store.ts` ile AYNI ikili desen:
 * STORE_MODE=db → Prisma; json/memory → tek dosya `recruitment.json` (dosya kilidi + atomik yazım).
 * Her fonksiyon `tenantId` ile kapsamlanır; tenant sınırı burada da uygulanır (araç katmanına ek olarak).
 */
import path from "path";
import { Prisma } from "@prisma/client";
import { isDbMode, resolveDataDir } from "../config";
import { uid } from "../utils";
import { withFileLock, writeJsonFileAtomic } from "../atomic-json-file";
import { DEFAULT_TEACHER_CRITERIA } from "./constants";
import type {
  ApplicationProfile,
  RecruitmentActivity,
  RecruitmentApplication,
  RecruitmentEmailTemplate,
  RecruitmentEvaluation,
  RecruitmentFileMeta,
  RecruitmentInterview,
  RecruitmentJob,
  RecruitmentSettings,
  ScorecardCriterion,
} from "./types";

const FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "recruitment.json");
/** Testlerin aynı dosyayı temizleyebilmesi için dışa açık. */
export const RECRUITMENT_FILE = FILE;

/** json modunda CV baytları ayrı dosyada tutulur (ana durum dosyası her okumada CV'leri parse etmesin). */
const FILES_DIR = path.join(path.dirname(FILE), "recruitment-files");
type StoredFile = RecruitmentFileMeta;

async function writeBlob(id: string, data: Buffer) {
  const fs = await import("fs/promises");
  await fs.mkdir(FILES_DIR, { recursive: true });
  await fs.writeFile(path.join(FILES_DIR, `${id}.bin`), data);
}
async function readBlob(id: string): Promise<Buffer | null> {
  try {
    const fs = await import("fs/promises");
    return await fs.readFile(path.join(FILES_DIR, `${id}.bin`));
  } catch {
    return null;
  }
}
async function deleteBlob(id: string) {
  const fs = await import("fs/promises");
  await fs.rm(path.join(FILES_DIR, `${id}.bin`), { force: true });
}
type JsonState = {
  jobs: RecruitmentJob[];
  applications: RecruitmentApplication[];
  files: StoredFile[];
  activities: RecruitmentActivity[];
  interviews: RecruitmentInterview[];
  evaluations: RecruitmentEvaluation[];
  templates: RecruitmentEmailTemplate[];
  settings: RecruitmentSettings[];
};

function emptyState(): JsonState {
  return { jobs: [], applications: [], files: [], activities: [], interviews: [], evaluations: [], templates: [], settings: [] };
}

async function loadState(): Promise<JsonState> {
  try {
    const fs = await import("fs/promises");
    const raw = await fs.readFile(FILE, "utf8");
    return { ...emptyState(), ...(JSON.parse(raw) as Partial<JsonState>) };
  } catch {
    return emptyState();
  }
}

async function mutate<T>(fn: (s: JsonState) => T | Promise<T>): Promise<T> {
  return withFileLock(FILE, async () => {
    const s = await loadState();
    const out = await fn(s);
    await writeJsonFileAtomic(FILE, s);
    return out;
  });
}

async function prismaClient() {
  const { prisma } = await import("../db");
  return prisma;
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const toDate = (s: string | null | undefined) => (s ? new Date(s) : null);
const now = () => new Date().toISOString();

/* ─────────────────────────── İlanlar ─────────────────────────── */

type JobRow = {
  id: string; tenantId: string; slug: string; title: string; category: string; instruments: string[];
  branchId: string | null; employmentType: string; location: string; summary: string; description: string;
  requirements: string; benefits: string; status: string; publishedAt: Date | null; closesAt: Date | null;
  createdBy: string | null; createdAt: Date; updatedAt: Date;
};

function mapJob(r: JobRow): RecruitmentJob {
  return {
    ...r,
    category: r.category as RecruitmentJob["category"],
    employmentType: r.employmentType as RecruitmentJob["employmentType"],
    status: r.status as RecruitmentJob["status"],
    publishedAt: iso(r.publishedAt),
    closesAt: iso(r.closesAt),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export type JobInput = Omit<RecruitmentJob, "id" | "tenantId" | "createdAt" | "updatedAt" | "createdBy">;

function jobData(input: Partial<JobInput>) {
  const d: Record<string, unknown> = { ...input };
  if ("publishedAt" in input) d.publishedAt = toDate(input.publishedAt);
  if ("closesAt" in input) d.closesAt = toDate(input.closesAt);
  return d;
}

export async function listJobs(tenantId: string): Promise<RecruitmentJob[]> {
  if (isDbMode) {
    const rows = await (await prismaClient()).recruitmentJob.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" } });
    return rows.map(mapJob);
  }
  const s = await loadState();
  return s.jobs.filter((j) => j.tenantId === tenantId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getJob(tenantId: string, id: string): Promise<RecruitmentJob | null> {
  if (isDbMode) {
    const r = await (await prismaClient()).recruitmentJob.findFirst({ where: { tenantId, id } });
    return r ? mapJob(r) : null;
  }
  return (await loadState()).jobs.find((j) => j.tenantId === tenantId && j.id === id) ?? null;
}

export async function getJobBySlug(tenantId: string, slug: string): Promise<RecruitmentJob | null> {
  if (isDbMode) {
    const r = await (await prismaClient()).recruitmentJob.findFirst({ where: { tenantId, slug } });
    return r ? mapJob(r) : null;
  }
  return (await loadState()).jobs.find((j) => j.tenantId === tenantId && j.slug === slug) ?? null;
}

export async function createJob(tenantId: string, input: JobInput, createdBy: string | null): Promise<RecruitmentJob> {
  const id = uid("rjob");
  if (isDbMode) {
    const r = await (await prismaClient()).recruitmentJob.create({
      data: { id, tenantId, createdBy, ...(jobData(input) as object) } as never,
    });
    return mapJob(r);
  }
  return mutate((s) => {
    const t = now();
    const job: RecruitmentJob = { id, tenantId, createdBy, createdAt: t, updatedAt: t, ...input };
    s.jobs.push(job);
    return job;
  });
}

export async function updateJob(tenantId: string, id: string, patch: Partial<JobInput>): Promise<RecruitmentJob | null> {
  if (isDbMode) {
    const p = await prismaClient();
    const res = await p.recruitmentJob.updateMany({ where: { tenantId, id }, data: jobData(patch) as never });
    if (res.count === 0) return null;
    return getJob(tenantId, id);
  }
  return mutate((s) => {
    const j = s.jobs.find((x) => x.tenantId === tenantId && x.id === id);
    if (!j) return null;
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) (j as Record<string, unknown>)[k] = v;
    j.updatedAt = now();
    return j;
  });
}

/* ─────────────────────────── Başvurular ─────────────────────────── */

type AppRow = {
  id: string; tenantId: string; seq: number; jobId: string | null; category: string; stage: string;
  firstName: string; lastName: string; email: string; phone: string; city: string; instruments: string[];
  experienceYears: number | null; teachingYears: number | null; educationLevel: string; source: string;
  tags: string[]; ratingAvg: number | null; profile: unknown; cvFileId: string | null; kvkkConsentAt: Date | null;
  kvkkTextVersion: string; retentionUntil: Date | null; anonymizedAt: Date | null; hiredTeacherId: string | null;
  hiredStaffId: string | null; lastStageChangeAt: Date; createdAt: Date; updatedAt: Date;
};

function mapApp(r: AppRow): RecruitmentApplication {
  return {
    ...r,
    category: r.category as RecruitmentApplication["category"],
    stage: r.stage as RecruitmentApplication["stage"],
    educationLevel: r.educationLevel as RecruitmentApplication["educationLevel"],
    source: r.source as RecruitmentApplication["source"],
    profile: (r.profile && typeof r.profile === "object" ? r.profile : {}) as ApplicationProfile,
    kvkkConsentAt: iso(r.kvkkConsentAt),
    retentionUntil: iso(r.retentionUntil),
    anonymizedAt: iso(r.anonymizedAt),
    lastStageChangeAt: r.lastStageChangeAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export type ApplicationInput = Omit<RecruitmentApplication, "id" | "tenantId" | "seq" | "createdAt" | "updatedAt" | "lastStageChangeAt">;
export type ApplicationPatch = Partial<Omit<RecruitmentApplication, "id" | "tenantId" | "seq" | "createdAt" | "updatedAt">>;

function appData(input: ApplicationPatch) {
  const d: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) if (v !== undefined) d[k] = v;
  for (const k of ["kvkkConsentAt", "retentionUntil", "anonymizedAt", "lastStageChangeAt"] as const) {
    if (k in d) d[k] = toDate(d[k] as string | null);
  }
  return d;
}

export async function listApplications(tenantId: string): Promise<RecruitmentApplication[]> {
  if (isDbMode) {
    const rows = await (await prismaClient()).recruitmentApplication.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" } });
    return rows.map((r) => mapApp(r as AppRow));
  }
  const s = await loadState();
  return s.applications.filter((a) => a.tenantId === tenantId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getApplication(tenantId: string, id: string): Promise<RecruitmentApplication | null> {
  if (isDbMode) {
    const r = await (await prismaClient()).recruitmentApplication.findFirst({ where: { tenantId, id } });
    return r ? mapApp(r as AppRow) : null;
  }
  return (await loadState()).applications.find((a) => a.tenantId === tenantId && a.id === id) ?? null;
}

export async function findApplicationsByEmail(tenantId: string, email: string): Promise<RecruitmentApplication[]> {
  const e = email.trim().toLowerCase();
  if (isDbMode) {
    const rows = await (await prismaClient()).recruitmentApplication.findMany({ where: { tenantId, email: e } });
    return rows.map((r) => mapApp(r as AppRow));
  }
  return (await loadState()).applications.filter((a) => a.tenantId === tenantId && a.email === e);
}

/** İşe alım aktarımı için atomik "rezervasyon": yalnız henüz aktarılmamışsa true döner (çift tıklamada ikinci istek false). */
export const HIRE_PENDING = "__pending__";
export async function claimHire(tenantId: string, id: string): Promise<boolean> {
  if (isDbMode) {
    const res = await (await prismaClient()).recruitmentApplication.updateMany({
      where: { tenantId, id, hiredTeacherId: null, hiredStaffId: null, anonymizedAt: null },
      data: { hiredTeacherId: HIRE_PENDING },
    });
    return res.count === 1;
  }
  return mutate((s) => {
    const a = s.applications.find((x) => x.tenantId === tenantId && x.id === id);
    if (!a || a.hiredTeacherId || a.hiredStaffId || a.anonymizedAt) return false;
    a.hiredTeacherId = HIRE_PENDING;
    return true;
  });
}

export async function createApplication(tenantId: string, input: ApplicationInput): Promise<RecruitmentApplication> {
  const id = uid("rapp");
  if (isDbMode) {
    const p = await prismaClient();
    // Sıra no çakışmasında (eşzamanlı iki başvuru) birkaç kez yeniden dene — unique(tenantId, seq).
    for (let attempt = 0; attempt < 5; attempt++) {
      const last = await p.recruitmentApplication.findFirst({ where: { tenantId }, orderBy: { seq: "desc" }, select: { seq: true } });
      const seq = (last?.seq ?? 0) + 1;
      try {
        const r = await p.recruitmentApplication.create({ data: { id, tenantId, seq, ...(appData(input) as object) } as never });
        return mapApp(r as AppRow);
      } catch (e) {
        if (attempt === 4 || !(e instanceof Error) || !/Unique constraint|P2002/i.test(e.message)) throw e;
      }
    }
    throw new Error("Başvuru numarası üretilemedi.");
  }
  return mutate((s) => {
    const seq = s.applications.filter((a) => a.tenantId === tenantId).reduce((m, a) => Math.max(m, a.seq), 0) + 1;
    const t = now();
    const app: RecruitmentApplication = { id, tenantId, seq, createdAt: t, updatedAt: t, lastStageChangeAt: t, ...input };
    s.applications.push(app);
    return app;
  });
}

export async function updateApplication(tenantId: string, id: string, patch: ApplicationPatch): Promise<RecruitmentApplication | null> {
  if (isDbMode) {
    const p = await prismaClient();
    const res = await p.recruitmentApplication.updateMany({ where: { tenantId, id }, data: appData(patch) as never });
    if (res.count === 0) return null;
    return getApplication(tenantId, id);
  }
  return mutate((s) => {
    const a = s.applications.find((x) => x.tenantId === tenantId && x.id === id);
    if (!a) return null;
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) (a as Record<string, unknown>)[k] = v;
    a.updatedAt = now();
    return a;
  });
}

/* ─────────────────────────── Dosyalar (CV) ─────────────────────────── */

export async function saveFile(
  tenantId: string,
  input: { applicationId: string | null; fileName: string; mimeType: string; data: Buffer }
): Promise<RecruitmentFileMeta> {
  const id = uid("rfile");
  const meta = { id, tenantId, applicationId: input.applicationId, fileName: input.fileName, mimeType: input.mimeType, sizeBytes: input.data.length };
  if (isDbMode) {
    const r = await (await prismaClient()).recruitmentFile.create({ data: { ...meta, data: new Uint8Array(input.data) } });
    return { ...meta, createdAt: r.createdAt.toISOString() };
  }
  await writeBlob(id, input.data);
  return mutate((s) => {
    const row: StoredFile = { ...meta, createdAt: now() };
    s.files.push(row);
    return row;
  });
}

export async function getFile(tenantId: string, id: string): Promise<(RecruitmentFileMeta & { data: Buffer }) | null> {
  if (isDbMode) {
    const r = await (await prismaClient()).recruitmentFile.findFirst({ where: { tenantId, id } });
    if (!r) return null;
    return {
      id: r.id, tenantId: r.tenantId, applicationId: r.applicationId, fileName: r.fileName, mimeType: r.mimeType,
      sizeBytes: r.sizeBytes, createdAt: r.createdAt.toISOString(), data: Buffer.from(r.data),
    };
  }
  const f = (await loadState()).files.find((x) => x.tenantId === tenantId && x.id === id);
  if (!f) return null;
  const data = await readBlob(f.id);
  return data ? { ...f, data } : null;
}

export async function deleteFilesForApplication(tenantId: string, applicationId: string): Promise<number> {
  if (isDbMode) {
    const res = await (await prismaClient()).recruitmentFile.deleteMany({ where: { tenantId, applicationId } });
    return res.count;
  }
  const removed = await mutate((s) => {
    const gone = s.files.filter((f) => f.tenantId === tenantId && f.applicationId === applicationId);
    s.files = s.files.filter((f) => !(f.tenantId === tenantId && f.applicationId === applicationId));
    return gone;
  });
  for (const f of removed) await deleteBlob(f.id);
  return removed.length;
}

/* ─────────────────────────── Zaman çizelgesi ─────────────────────────── */

export async function addActivity(
  tenantId: string,
  input: Omit<RecruitmentActivity, "id" | "tenantId" | "createdAt">
): Promise<RecruitmentActivity> {
  const id = uid("ract");
  if (isDbMode) {
    const r = await (await prismaClient()).recruitmentActivity.create({
      data: { id, tenantId, ...input, meta: (input.meta ?? undefined) as never },
    });
    return { ...input, id, tenantId, createdAt: r.createdAt.toISOString() };
  }
  return mutate((s) => {
    const row: RecruitmentActivity = { id, tenantId, createdAt: now(), ...input };
    s.activities.push(row);
    return row;
  });
}

export async function listActivities(tenantId: string, applicationId: string): Promise<RecruitmentActivity[]> {
  if (isDbMode) {
    const rows = await (await prismaClient()).recruitmentActivity.findMany({
      where: { tenantId, applicationId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => ({
      ...r,
      type: r.type as RecruitmentActivity["type"],
      meta: (r.meta as Record<string, unknown> | null) ?? null,
      createdAt: r.createdAt.toISOString(),
    }));
  }
  return (await loadState()).activities
    .filter((a) => a.tenantId === tenantId && a.applicationId === applicationId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Anonimleştirmede serbest metin taşıyan notlar, görüşme ayrıntıları ve değerlendirme yorumları temizlenir (tip/zaman/puan kalır). */
export async function redactActivities(tenantId: string, applicationId: string): Promise<void> {
  if (isDbMode) {
    const p = await prismaClient();
    await p.recruitmentActivity.updateMany({
      where: { tenantId, applicationId },
      data: { body: "[anonimleştirildi]", meta: Prisma.DbNull },
    });
    await p.recruitmentInterview.updateMany({ where: { tenantId, applicationId }, data: { notes: "", location: "", interviewers: "" } });
    await p.recruitmentEvaluation.updateMany({ where: { tenantId, applicationId }, data: { comment: "" } });
    return;
  }
  await mutate((s) => {
    for (const a of s.activities) if (a.tenantId === tenantId && a.applicationId === applicationId) {
      a.body = "[anonimleştirildi]";
      a.meta = null;
    }
    for (const i of s.interviews) if (i.tenantId === tenantId && i.applicationId === applicationId) {
      i.notes = "";
      i.location = "";
      i.interviewers = "";
    }
    for (const e of s.evaluations) if (e.tenantId === tenantId && e.applicationId === applicationId) e.comment = "";
  });
}

/* ─────────────────────────── Görüşmeler ─────────────────────────── */

type InterviewRow = Omit<RecruitmentInterview, "scheduledAt" | "invitationSentAt" | "createdAt" | "updatedAt" | "kind" | "status"> & {
  kind: string; status: string; scheduledAt: Date; invitationSentAt: Date | null; createdAt: Date; updatedAt: Date;
};
function mapInterview(r: InterviewRow): RecruitmentInterview {
  return {
    ...r,
    kind: r.kind as RecruitmentInterview["kind"],
    status: r.status as RecruitmentInterview["status"],
    scheduledAt: r.scheduledAt.toISOString(),
    invitationSentAt: iso(r.invitationSentAt),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export async function listInterviews(tenantId: string, applicationId?: string): Promise<RecruitmentInterview[]> {
  if (isDbMode) {
    const rows = await (await prismaClient()).recruitmentInterview.findMany({
      where: { tenantId, ...(applicationId ? { applicationId } : {}) },
      orderBy: { scheduledAt: "asc" },
    });
    return rows.map(mapInterview);
  }
  return (await loadState()).interviews
    .filter((i) => i.tenantId === tenantId && (!applicationId || i.applicationId === applicationId))
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
}

export type InterviewInput = Omit<RecruitmentInterview, "id" | "tenantId" | "createdAt" | "updatedAt">;

export async function createInterview(tenantId: string, input: InterviewInput): Promise<RecruitmentInterview> {
  const id = uid("rint");
  if (isDbMode) {
    const r = await (await prismaClient()).recruitmentInterview.create({
      data: { id, tenantId, ...input, scheduledAt: new Date(input.scheduledAt), invitationSentAt: toDate(input.invitationSentAt) },
    });
    return mapInterview(r);
  }
  return mutate((s) => {
    const t = now();
    const row: RecruitmentInterview = { id, tenantId, createdAt: t, updatedAt: t, ...input };
    s.interviews.push(row);
    return row;
  });
}

export async function updateInterview(
  tenantId: string,
  id: string,
  patch: Partial<Omit<InterviewInput, "applicationId">>
): Promise<RecruitmentInterview | null> {
  if (isDbMode) {
    const p = await prismaClient();
    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) data[k] = v;
    if ("scheduledAt" in data) data.scheduledAt = new Date(data.scheduledAt as string);
    if ("invitationSentAt" in data) data.invitationSentAt = toDate(data.invitationSentAt as string | null);
    const res = await p.recruitmentInterview.updateMany({ where: { tenantId, id }, data: data as never });
    if (res.count === 0) return null;
    const r = await p.recruitmentInterview.findFirst({ where: { tenantId, id } });
    return r ? mapInterview(r) : null;
  }
  return mutate((s) => {
    const i = s.interviews.find((x) => x.tenantId === tenantId && x.id === id);
    if (!i) return null;
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) (i as Record<string, unknown>)[k] = v;
    i.updatedAt = now();
    return i;
  });
}

/* ─────────────────────────── Değerlendirmeler ─────────────────────────── */

export async function listEvaluations(tenantId: string, applicationId: string): Promise<RecruitmentEvaluation[]> {
  if (isDbMode) {
    const rows = await (await prismaClient()).recruitmentEvaluation.findMany({
      where: { tenantId, applicationId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => ({
      ...r,
      scores: (r.scores as Record<string, number>) ?? {},
      recommendation: r.recommendation as RecruitmentEvaluation["recommendation"],
      createdAt: r.createdAt.toISOString(),
    }));
  }
  return (await loadState()).evaluations
    .filter((e) => e.tenantId === tenantId && e.applicationId === applicationId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createEvaluation(
  tenantId: string,
  input: Omit<RecruitmentEvaluation, "id" | "tenantId" | "createdAt">
): Promise<RecruitmentEvaluation> {
  const id = uid("reval");
  if (isDbMode) {
    const r = await (await prismaClient()).recruitmentEvaluation.create({ data: { id, tenantId, ...input } });
    return { ...input, id, tenantId, createdAt: r.createdAt.toISOString() };
  }
  return mutate((s) => {
    const row: RecruitmentEvaluation = { id, tenantId, createdAt: now(), ...input };
    s.evaluations.push(row);
    return row;
  });
}

/* ─────────────────────────── E-posta şablonları ─────────────────────────── */

function mapTemplate(r: {
  id: string; tenantId: string; kind: string; name: string; subject: string; body: string; active: boolean;
  systemKey: string | null; createdBy: string | null; createdAt: Date; updatedAt: Date;
}): RecruitmentEmailTemplate {
  return { ...r, kind: r.kind as RecruitmentEmailTemplate["kind"], createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() };
}

export async function listTemplates(tenantId: string): Promise<RecruitmentEmailTemplate[]> {
  if (isDbMode) {
    const rows = await (await prismaClient()).recruitmentEmailTemplate.findMany({ where: { tenantId }, orderBy: { createdAt: "asc" } });
    return rows.map(mapTemplate);
  }
  return (await loadState()).templates.filter((t) => t.tenantId === tenantId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export type TemplateInput = Pick<RecruitmentEmailTemplate, "kind" | "name" | "subject" | "body" | "active" | "systemKey">;

export async function createTemplate(tenantId: string, input: TemplateInput, createdBy: string | null): Promise<RecruitmentEmailTemplate> {
  const id = uid("rtpl");
  if (isDbMode) {
    const r = await (await prismaClient()).recruitmentEmailTemplate.create({ data: { id, tenantId, createdBy, ...input } });
    return mapTemplate(r);
  }
  return mutate((s) => {
    const t = now();
    const row: RecruitmentEmailTemplate = { id, tenantId, createdBy, createdAt: t, updatedAt: t, ...input };
    s.templates.push(row);
    return row;
  });
}

export async function updateTemplate(tenantId: string, id: string, patch: Partial<TemplateInput>): Promise<RecruitmentEmailTemplate | null> {
  if (isDbMode) {
    const p = await prismaClient();
    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) data[k] = v;
    const res = await p.recruitmentEmailTemplate.updateMany({ where: { tenantId, id }, data });
    if (res.count === 0) return null;
    const r = await p.recruitmentEmailTemplate.findFirst({ where: { tenantId, id } });
    return r ? mapTemplate(r) : null;
  }
  return mutate((s) => {
    const t = s.templates.find((x) => x.tenantId === tenantId && x.id === id);
    if (!t) return null;
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) (t as Record<string, unknown>)[k] = v;
    t.updatedAt = now();
    return t;
  });
}

/* ─────────────────────────── Ayarlar ─────────────────────────── */

export function defaultSettings(tenantId: string): RecruitmentSettings {
  return {
    tenantId,
    careerPageEnabled: false,
    careerPageIntro: "",
    kvkkText: "",
    kvkkTextVersion: "v1",
    notifyInApp: true,
    notifyEmails: [],
    autoAcknowledge: true,
    retentionMonths: 12,
    scorecardCriteria: DEFAULT_TEACHER_CRITERIA,
    updatedBy: null,
    updatedAt: new Date(0).toISOString(),
  };
}

function normalizeCriteria(v: unknown): ScorecardCriterion[] {
  if (!Array.isArray(v)) return DEFAULT_TEACHER_CRITERIA;
  const out = v.filter(
    (c): c is ScorecardCriterion =>
      !!c && typeof c === "object" && typeof (c as ScorecardCriterion).key === "string" && typeof (c as ScorecardCriterion).label === "string"
  );
  return out.length > 0 ? out : DEFAULT_TEACHER_CRITERIA;
}

export async function getSettings(tenantId: string): Promise<RecruitmentSettings> {
  if (isDbMode) {
    const r = await (await prismaClient()).recruitmentSettings.findUnique({ where: { tenantId } });
    if (!r) return defaultSettings(tenantId);
    return { ...r, scorecardCriteria: normalizeCriteria(r.scorecardCriteria), updatedAt: r.updatedAt.toISOString() };
  }
  const row = (await loadState()).settings.find((x) => x.tenantId === tenantId);
  return row ? { ...defaultSettings(tenantId), ...row, scorecardCriteria: normalizeCriteria(row.scorecardCriteria) } : defaultSettings(tenantId);
}

export type SettingsPatch = Partial<Omit<RecruitmentSettings, "tenantId" | "updatedAt">>;

export async function saveSettings(tenantId: string, patch: SettingsPatch): Promise<RecruitmentSettings> {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) if (v !== undefined) clean[k] = v;
  if (isDbMode) {
    const p = await prismaClient();
    const base = defaultSettings(tenantId);
    const { updatedAt: _u, tenantId: _t, ...createDefaults } = base;
    void _u;
    void _t;
    await p.recruitmentSettings.upsert({
      where: { tenantId },
      create: { tenantId, ...createDefaults, ...clean } as never,
      update: clean as never,
    });
    return getSettings(tenantId);
  }
  return mutate((s) => {
    const idx = s.settings.findIndex((x) => x.tenantId === tenantId);
    const merged: RecruitmentSettings = {
      ...(idx >= 0 ? s.settings[idx]! : defaultSettings(tenantId)),
      ...(clean as SettingsPatch),
      tenantId,
      updatedAt: now(),
    };
    if (idx >= 0) s.settings[idx] = merged;
    else s.settings.push(merged);
    return merged;
  });
}

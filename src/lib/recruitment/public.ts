/**
 * Herkese açık kariyer sayfası servisleri — oturum yok, tenant slug'dan sunucuda çözülür.
 * Yalnız yayında olan ve kapanış tarihi geçmemiş ilanlar görünür. Başvuru: zod doğrulama, aynı e-posta + aynı ilan
 * için 24 saat içinde tekrar gönderim yeni kayıt açmaz (çift tıklama / yeniden deneme güvenli), CV sihirli bayt
 * kontrolü, KVKK onayı zorunlu. Aday ve yönetici bildirimleri başvuruyu ASLA bloklamaz (hata loglanır).
 */
import { z } from "zod";
import { logger } from "../logger";
import { applicationNumber, CATEGORY_LABELS, CV_MAX_BYTES, defaultKvkkText, fullName, normalizeSource } from "./constants";
import { detectCvKind } from "./cv-parser";
import { buildPlaceholderValues, ensureDefaultTemplates, renderRecruitmentEmail, sendRecruitmentEmail, outcomeLabel, textToHtml } from "./emails";
import { getInstitutionInfo, type CareerTenant } from "./institution";
import {
  addActivity,
  createApplication,
  getJobBySlug,
  getSettings,
  findApplicationsByEmail,
  listJobs,
  saveFile,
  updateApplication,
} from "./store";
import type { ApplicationProfile, RecruitmentJob, RecruitmentSettings } from "./types";

export function isJobOpen(job: RecruitmentJob, now: Date = new Date()): boolean {
  if (job.status !== "published") return false;
  if (job.closesAt && new Date(job.closesAt).getTime() < now.getTime()) return false;
  return true;
}

export type PublicCareerPage = {
  tenant: CareerTenant;
  institution: { name: string; logoUrl?: string; website?: string; phone?: string; email?: string };
  settings: Pick<RecruitmentSettings, "careerPageEnabled" | "careerPageIntro" | "kvkkTextVersion"> & { kvkkText: string };
  jobs: RecruitmentJob[];
};

export async function getPublicCareerPage(tenant: CareerTenant): Promise<PublicCareerPage | null> {
  const [settings, jobs, institution] = await Promise.all([getSettings(tenant.tenantId), listJobs(tenant.tenantId), getInstitutionInfo(tenant.tenantId)]);
  if (!settings.careerPageEnabled) return null;
  return {
    tenant,
    institution,
    settings: {
      careerPageEnabled: settings.careerPageEnabled,
      careerPageIntro: settings.careerPageIntro,
      kvkkTextVersion: settings.kvkkTextVersion,
      kvkkText: settings.kvkkText.trim() || defaultKvkkText(institution.name || tenant.name),
    },
    jobs: jobs.filter((j) => isJobOpen(j)).sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "")),
  };
}

export async function getPublicJob(tenantId: string, jobSlug: string): Promise<RecruitmentJob | null> {
  const job = await getJobBySlug(tenantId, jobSlug);
  return job && isJobOpen(job) ? job : null;
}

const optInt = (min: number, max: number) =>
  z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => (v === undefined || v === "" ? undefined : Number(v)))
    .refine((v) => v === undefined || (Number.isInteger(v) && v >= min && v <= max), `${min}–${max} arası bir sayı girin.`);

const optText = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));
const optUrl = z
  .string()
  .trim()
  .max(300)
  .optional()
  .transform((v) => (v ? (/^https?:\/\//i.test(v) ? v : `https://${v}`) : undefined))
  .refine((v) => v === undefined || /^https?:\/\/[^\s]+\.[^\s]+/.test(v), "Geçerli bir bağlantı girin.");

/** Ad/soyad: yalnız harf, boşluk, kesme, nokta, tire — URL/e-posta taşıyıp otomatik e-postayla yayılmasın. */
const NAME_RE = /^[\p{L}][\p{L}\s'’.-]*$/u;

export const applicationFormSchema = z.object({
  jobSlug: z.string().trim().max(100).optional(),
  category: z.enum(["teacher", "staff"]).optional(),
  firstName: z.string().trim().min(2, "Adınızı girin.").max(60).regex(NAME_RE, "Ad yalnız harf içerebilir."),
  lastName: z.string().trim().min(2, "Soyadınızı girin.").max(60).regex(NAME_RE, "Soyad yalnız harf içerebilir."),
  email: z.string().trim().toLowerCase().email("Geçerli bir e-posta adresi girin.").max(160),
  phone: z.string().trim().min(10, "Telefon numaranızı girin.").max(30).regex(/^[+\d\s().-]+$/, "Telefon yalnız rakam ve + ( ) - içerebilir."),
  city: optText(60),
  birthYear: optInt(1940, new Date().getFullYear() - 15),
  instruments: z.array(z.string().trim().min(1).max(60)).max(12).default([]),
  experienceYears: optInt(0, 60),
  teachingYears: optInt(0, 60),
  educationLevel: z.enum(["", "high_school", "conservatory_hs", "associate", "bachelor", "master", "doctorate"]).default(""),
  school: optText(140),
  department: optText(120),
  graduationYear: optInt(1950, new Date().getFullYear() + 6),
  currentPosition: optText(120),
  languages: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
  skills: z.array(z.string().trim().min(1).max(60)).max(15).default([]),
  availability: optText(300),
  availableFrom: optText(20),
  expectedSalary: optText(60),
  portfolioUrl: optUrl,
  linkedinUrl: optUrl,
  coverLetter: optText(5000),
  source: optText(40),
  utm: z
    .record(z.string().max(40), z.string().max(120))
    .optional()
    .refine((v) => !v || Object.keys(v).length <= 10, "Çok fazla izleme parametresi."),
  kvkkConsent: z.literal(true, { message: "Devam etmek için KVKK aydınlatma metnini onaylamanız gerekir." }),
  cvParseMethod: z.enum(["rules", "ai"]).optional(),
  cvParsedFields: z.array(z.string().max(40)).max(30).optional(),
});

export type ApplicationFormInput = z.input<typeof applicationFormSchema>;

export type SubmitResult =
  | { ok: true; applicationNumber: string; duplicate: boolean }
  | { ok: false; status: number; message: string; field?: string };

export async function submitPublicApplication(
  tenant: CareerTenant,
  raw: unknown,
  cv: { fileName: string; mimeType: string; data: Buffer } | null,
  now: Date = new Date()
): Promise<SubmitResult> {
  const parsed = applicationFormSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, status: 400, message: issue?.message ?? "Form geçersiz.", field: issue?.path?.join(".") };
  }
  const f = parsed.data;
  const settings = await getSettings(tenant.tenantId);
  if (!settings.careerPageEnabled) return { ok: false, status: 404, message: "Bu kurumun kariyer sayfası şu an kapalı." };

  let job: RecruitmentJob | null = null;
  if (f.jobSlug && f.jobSlug !== "genel") {
    job = await getPublicJob(tenant.tenantId, f.jobSlug);
    if (!job) return { ok: false, status: 404, message: "Bu ilan artık başvuruya açık değil." };
  }

  let cvKind: "pdf" | "docx" | null = null;
  if (cv) {
    if (cv.data.length > CV_MAX_BYTES) return { ok: false, status: 413, message: "CV dosyası en fazla 4 MB olabilir.", field: "cv" };
    cvKind = detectCvKind(cv.data, cv.mimeType, cv.fileName);
    if (!cvKind) return { ok: false, status: 415, message: "CV yalnız PDF veya Word (.docx) olabilir.", field: "cv" };
  }

  // Çift gönderim koruması: aynı e-posta + aynı ilan, son 24 saat → mevcut başvuruyu döndür.
  // Yanıt, e-postanın daha önce başvurup başvurmadığını AÇIĞA VURMAZ (numara dönmez).
  const existing = (await findApplicationsByEmail(tenant.tenantId, f.email)).find(
    (a) => !a.anonymizedAt && a.jobId === (job?.id ?? null) && now.getTime() - new Date(a.createdAt).getTime() < 864e5
  );
  if (existing) return { ok: true, applicationNumber: "", duplicate: true };

  const profile: ApplicationProfile = {
    birthYear: f.birthYear,
    school: f.school,
    department: f.department,
    graduationYear: f.graduationYear,
    currentPosition: f.currentPosition,
    languages: f.languages.length ? f.languages : undefined,
    skills: f.skills.length ? f.skills : undefined,
    availability: f.availability,
    availableFrom: f.availableFrom,
    expectedSalary: f.expectedSalary,
    portfolioUrl: f.portfolioUrl,
    linkedinUrl: f.linkedinUrl,
    coverLetter: f.coverLetter,
    utm: f.utm,
    cvParse: f.cvParseMethod ? { method: f.cvParseMethod, parsedAt: now.toISOString(), fields: f.cvParsedFields ?? [] } : undefined,
  };
  for (const k of Object.keys(profile) as (keyof ApplicationProfile)[]) if (profile[k] === undefined) delete profile[k];

  const retention = new Date(now);
  retention.setMonth(retention.getMonth() + settings.retentionMonths);

  const app = await createApplication(tenant.tenantId, {
    jobId: job?.id ?? null,
    category: job?.category ?? f.category ?? "teacher",
    stage: "new",
    firstName: f.firstName,
    lastName: f.lastName,
    email: f.email,
    phone: f.phone,
    city: f.city ?? "",
    instruments: Array.from(new Set(f.instruments)),
    experienceYears: f.experienceYears ?? null,
    teachingYears: f.teachingYears ?? null,
    educationLevel: f.educationLevel,
    source: normalizeSource(f.source ?? f.utm?.utm_source),
    tags: [],
    ratingAvg: null,
    profile,
    cvFileId: null,
    kvkkConsentAt: now.toISOString(),
    kvkkTextVersion: settings.kvkkTextVersion,
    retentionUntil: retention.toISOString(),
    anonymizedAt: null,
    hiredTeacherId: null,
    hiredStaffId: null,
  });

  if (cv && cvKind) {
    const safeName = cv.fileName.replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 120) || `cv.${cvKind}`;
    const file = await saveFile(tenant.tenantId, { applicationId: app.id, fileName: safeName, mimeType: cvKind === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document", data: cv.data });
    await updateApplication(tenant.tenantId, app.id, { cvFileId: file.id });
  }

  await addActivity(tenant.tenantId, {
    applicationId: app.id,
    type: "system",
    body: `Başvuru alındı — ${job ? job.title : "genel başvuru"} (${app.source}).${cv ? " CV yüklendi." : ""}`,
    meta: { source: app.source, utm: f.utm ?? null },
    actorUserId: null,
    actorName: "Kariyer sayfası",
  });

  await notifyAfterSubmit(tenant, app.id, app, job, settings).catch((e) =>
    logger.error("recruitment notifyAfterSubmit failed", { tenantId: tenant.tenantId, error: e instanceof Error ? e.message : String(e) })
  );

  return { ok: true, applicationNumber: applicationNumber(app.seq), duplicate: false };
}

async function notifyAfterSubmit(
  tenant: CareerTenant,
  applicationId: string,
  app: Parameters<typeof buildPlaceholderValues>[0]["app"] & { email: string; category: "teacher" | "staff"; instruments: string[] },
  job: RecruitmentJob | null,
  settings: RecruitmentSettings
) {
  const institution = await getInstitutionInfo(tenant.tenantId);
  const who = fullName(app);
  const title = job?.title ?? `Genel başvuru (${CATEGORY_LABELS[app.category]})`;

  const { consumeRateLimit } = await import("../rate-limit");
  const DAY = 864e5;
  // Kötüye kullanım sınırı: form, istenen adrese kurum adına e-posta gönderdirmek için kullanılamasın.
  const ackAllowed =
    consumeRateLimit("recruitment-ack-tenant", tenant.tenantId, { windowMs: DAY, max: 300 }) &&
    consumeRateLimit("recruitment-ack-recipient", `${tenant.tenantId}:${app.email.toLowerCase()}`, { windowMs: DAY, max: 3 });

  if (settings.autoAcknowledge && ackAllowed) {
    const templates = await ensureDefaultTemplates(tenant.tenantId);
    const tpl = templates.find((t) => t.kind === "received" && t.active);
    if (tpl) {
      const rendered = renderRecruitmentEmail({ subject: tpl.subject, body: tpl.body, institution, values: buildPlaceholderValues({ app, job, institution }) });
      const outcome = await sendRecruitmentEmail(app.email, rendered);
      await addActivity(tenant.tenantId, {
        applicationId, type: "email", body: `"${rendered.subject}" — ${outcomeLabel(outcome)}`,
        meta: { templateId: tpl.id, kind: "received", delivered: outcome.delivered, reason: outcome.reason ?? null }, actorUserId: null, actorName: "Sistem",
      });
    }
  }

  const href = `/panel/ik/adaylar/${applicationId}`;
  if (settings.notifyInApp) {
    const { notifyAdmins } = await import("../manager-notifications");
    await notifyAdmins(
      tenant.tenantId,
      "recruitment_new_application",
      { title: "Yeni iş başvurusu", body: `${who} — ${title}${app.instruments.length ? ` · ${app.instruments.join(", ")}` : ""}. ${href}` },
      { dedupeKey: applicationId }
    );
  }

  if (settings.notifyEmails.length && consumeRateLimit("recruitment-admin-mail", tenant.tenantId, { windowMs: DAY, max: 200 })) {
    const { getPublicAppBaseUrl } = await import("../email");
    const base = getPublicAppBaseUrl();
    const body =
      `Kariyer sayfanızdan yeni bir başvuru geldi.\n\nAday: ${who}\nPozisyon: ${title}\n` +
      `${app.instruments.length ? `Enstrüman: ${app.instruments.join(", ")}\n` : ""}Başvuru no: ${applicationNumber(app.seq)}\n\n` +
      `Adayı görüntülemek için: ${base}${href}`;
    const rendered = {
      subject: `Yeni başvuru: ${who} — ${title}`.slice(0, 200),
      text: body,
      html: `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#18181b;max-width:560px;">${textToHtml(body)}</div>`,
      attachments: undefined,
    };
    for (const to of settings.notifyEmails) await sendRecruitmentEmail(to, rendered);
  }
}

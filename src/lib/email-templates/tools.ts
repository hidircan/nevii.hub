/**
 * 10. tur iş #2 — kurum e-posta şablonu yönetim araçları (admin).
 * `services/tools.ts` ile AYNI desen (`ServiceResult`, `requireRole`,
 * `parseOrFail`, `audit`) ama ayrı modülde — tools.ts zaten çok büyük.
 * YALNIZ SCHOOL_ADMIN/SUPER_ADMIN. Test e-postası SADECE işlemi yapan
 * admin'in KENDİ e-postasına gider (rastgele alıcıya gönderim yok).
 */
import { z } from "zod";
import { ok, fail, fromZodError, type ServiceResult } from "../services/result";
import { requireRole, type ServiceContext } from "../services/context";
import { recordAuditLog } from "../audit/log";
import { readData } from "../store";

/** `services/tools.ts` ile AYNI yerel yardımcılar (orada export edilmezler). */
function parseOrFail<T>(schema: z.ZodType<T>, input: unknown): ServiceResult<T> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error.flatten());
  return ok(parsed.data);
}

function audit(
  ctx: ServiceContext,
  action: string,
  entityType: string,
  entityId: string,
  meta?: Record<string, unknown>
) {
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
import {
  EMAIL_TEMPLATE_KEYS,
  EMAIL_TEMPLATE_LABELS,
  isEmailTemplateKey,
  localesForKey,
  placeholdersForKey,
  type EmailTemplateKey,
  type EmailTemplateLocale,
} from "./keys";
import { getDefaultEmailTemplate, sampleValuesForKey } from "./defaults";
import {
  archiveAllEmailTemplateVersions,
  getEmailTemplateVersion,
  listEmailTemplateVersions,
  publishEmailTemplateVersion,
  saveEmailTemplateDraft,
  type EmailTemplateFields,
} from "./store";
import {
  previewValues,
  renderTransactionalEmail,
  sanitizeTemplateFields,
  validateTemplateFields,
} from "./engine";

const keySchema = z.enum(EMAIL_TEMPLATE_KEYS);
const localeSchema = z.enum(["tr", "en"]);

const fieldsSchema = z.object({
  subject: z.string().min(1).max(500),
  preheader: z.string().max(1000).default(""),
  introHtml: z.string().max(30000).default(""),
  bodyHtml: z.string().max(60000).default(""),
  signatureHtml: z.string().max(15000).default(""),
  ctaLabel: z.string().min(1).max(120),
  showLogo: z.boolean().default(true),
});

export type EmailTemplateSummary = {
  key: EmailTemplateKey;
  label: string;
  locales: EmailTemplateLocale[];
  publishedVersion: number | null;
  draftVersion: number | null;
  updatedAt: string | null;
};

export async function listEmailTemplatesTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ templates: EmailTemplateSummary[] }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(z.object({ locale: localeSchema.default("tr") }), input);
  if (!v.ok) return v;
  const locale = v.data.locale;
  const templates: EmailTemplateSummary[] = [];
  for (const key of EMAIL_TEMPLATE_KEYS) {
    const versions = await listEmailTemplateVersions(ctx.tenantId, key, locale);
    const published = versions.find((r) => r.status === "published") ?? null;
    const draft = versions.find((r) => r.status === "draft") ?? null;
    templates.push({
      key,
      label: EMAIL_TEMPLATE_LABELS[key],
      locales: localesForKey(key),
      publishedVersion: published?.version ?? null,
      draftVersion: draft?.version ?? null,
      updatedAt: versions[0]?.updatedAt ?? null,
    });
  }
  return ok({ templates });
}

export type EmailTemplateDetail = {
  key: EmailTemplateKey;
  label: string;
  locale: EmailTemplateLocale;
  fields: EmailTemplateFields;
  source: "published" | "draft" | "default";
  version: number | null;
  defaultFields: EmailTemplateFields;
  placeholders: { name: string; label: string; required: boolean }[];
  versions: { version: number; status: string; createdBy: string | null; createdAt: string; updatedAt: string }[];
};

export async function getEmailTemplateTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<EmailTemplateDetail>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(z.object({ key: keySchema, locale: localeSchema.default("tr") }), input);
  if (!v.ok) return v;
  const { key, locale } = v.data;
  const versions = await listEmailTemplateVersions(ctx.tenantId, key, locale);
  const draft = versions.find((r) => r.status === "draft") ?? null;
  const published = versions.find((r) => r.status === "published") ?? null;
  const current = draft ?? published;
  const d = getDefaultEmailTemplate(key, locale);
  const pick = (r: typeof current): EmailTemplateFields =>
    r
      ? {
          subject: r.subject,
          preheader: r.preheader,
          introHtml: r.introHtml,
          bodyHtml: r.bodyHtml,
          signatureHtml: r.signatureHtml,
          ctaLabel: r.ctaLabel,
          showLogo: r.showLogo,
        }
      : { ...d, showLogo: true };
  return ok({
    key,
    label: EMAIL_TEMPLATE_LABELS[key],
    locale,
    fields: pick(current),
    source: current ? (current.status as "published" | "draft") : "default",
    version: current?.version ?? null,
    defaultFields: { ...d, showLogo: true },
    placeholders: placeholdersForKey(key).map((p) => ({ name: p.name, label: p.label, required: p.required })),
    versions: versions.map((r) => ({
      version: r.version,
      status: r.status,
      createdBy: r.createdBy,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),
  });
}

export async function saveEmailTemplateDraftTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ key: EmailTemplateKey; locale: EmailTemplateLocale; version: number }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(z.object({ key: keySchema, locale: localeSchema.default("tr"), fields: fieldsSchema }), input);
  if (!v.ok) return v;
  const { key, locale } = v.data;
  const cleaned = sanitizeTemplateFields({ ...v.data.fields });
  const check = validateTemplateFields(key, cleaned, false);
  if (!check.ok) return fail("VALIDATION_ERROR", check.errors.join(" "));
  const saved = await saveEmailTemplateDraft({
    tenantId: ctx.tenantId,
    key,
    locale,
    fields: cleaned,
    createdBy: ctx.userId,
  });
  audit(ctx, "email_template.draft_saved", "EmailTemplate", `${key}:${locale}:v${saved.version}`, {});
  return ok({ key, locale, version: saved.version });
}

export async function publishEmailTemplateTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ key: EmailTemplateKey; locale: EmailTemplateLocale; version: number }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(
    z.object({ key: keySchema, locale: localeSchema.default("tr"), version: z.number().int().positive() }),
    input
  );
  if (!v.ok) return v;
  const { key, locale, version } = v.data;
  const row = await getEmailTemplateVersion(ctx.tenantId, key, locale, version);
  if (!row) return fail("NOT_FOUND", "Şablon sürümü bulunamadı.");
  // Yayımlama ANINDA tam doğrulama: zorunlu alanlar + bilinmeyen yer tutucu + HTML güvenliği.
  const cleaned = sanitizeTemplateFields({
    subject: row.subject,
    preheader: row.preheader,
    introHtml: row.introHtml,
    bodyHtml: row.bodyHtml,
    signatureHtml: row.signatureHtml,
    ctaLabel: row.ctaLabel,
    showLogo: row.showLogo,
  });
  const check = validateTemplateFields(key, cleaned, true);
  if (!check.ok) return fail("VALIDATION_ERROR", `Bu sürüm yayımlanamaz: ${check.errors.join(" ")}`);
  const published = await publishEmailTemplateVersion(ctx.tenantId, key, locale, version);
  if (!published) return fail("NOT_FOUND", "Şablon sürümü bulunamadı.");
  audit(ctx, "email_template.published", "EmailTemplate", `${key}:${locale}:v${version}`, {});
  return ok({ key, locale, version });
}

export async function resetEmailTemplateTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ key: EmailTemplateKey; locale: EmailTemplateLocale; archivedCount: number }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(z.object({ key: keySchema, locale: localeSchema.default("tr") }), input);
  if (!v.ok) return v;
  const count = await archiveAllEmailTemplateVersions(ctx.tenantId, v.data.key, v.data.locale);
  audit(ctx, "email_template.reset_to_default", "EmailTemplate", `${v.data.key}:${v.data.locale}`, { archivedCount: count });
  return ok({ key: v.data.key, locale: v.data.locale, archivedCount: count });
}

function footerForPreview(key: EmailTemplateKey, locale: EmailTemplateLocale): string[] {
  if (key === "password_reset") {
    return locale === "en"
      ? ["The link expires in 30 minutes and can be used only once.", "If you did not ask for this, ignore the email."]
      : ["Bu bağlantı 30 dakika içinde geçerliliğini yitirir ve yalnızca bir kez kullanılabilir.", "Bu isteği siz yapmadıysanız bu e-postayı yok sayabilirsiniz."];
  }
  return ["Bu bağlantı 7 gün içinde geçerliliğini yitirir ve yalnızca bir kez kullanılabilir.", "Bu daveti siz talep etmediyseniz, bu e-postayı yok sayabilirsiniz."];
}

export async function previewEmailTemplateTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ subject: string; html: string; text: string; customized: boolean }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(
    z.object({ key: keySchema, locale: localeSchema.default("tr"), version: z.number().int().positive().optional() }),
    input
  );
  if (!v.ok) return v;
  const { key, locale } = v.data;
  const data = await readData();
  const values = { ...sampleValuesForKey(key), ...previewValues() };
  const rendered = await renderTransactionalEmail({
    key,
    locale,
    tenantId: ctx.tenantId,
    values,
    institutionName: data.settings.name ?? "NeviiHub",
    logoUrl: data.settings.logoUrl || undefined,
    footerLines: footerForPreview(key, locale),
    forceVersion: v.data.version,
  });
  return ok({ subject: rendered.subject, html: rendered.html, text: rendered.text, customized: rendered.customized });
}

export async function sendEmailTemplateTestTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ delivered: boolean; blocked?: boolean; to: string }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(
    z.object({ key: keySchema, locale: localeSchema.default("tr"), version: z.number().int().positive().optional() }),
    input
  );
  if (!v.ok) return v;
  const { isRateLimited } = await import("../auth/password-reset");
  if (isRateLimited(`tpl-test:${ctx.tenantId}:${ctx.userId}`, 10, 60 * 60 * 1000)) {
    return fail("RATE_LIMITED", "Çok fazla test e-postası gönderildi. Lütfen bir süre sonra tekrar deneyin.");
  }
  const { getUserById } = await import("../auth/users");
  const me = await getUserById(ctx.userId);
  if (!me?.email) return fail("VALIDATION_ERROR", "Test e-postası için hesabınızda kayıtlı bir e-posta adresi bulunamadı.");
  const { key, locale } = v.data;
  const data = await readData();
  const values = { ...sampleValuesForKey(key), ...previewValues() };
  const rendered = await renderTransactionalEmail({
    key,
    locale,
    tenantId: ctx.tenantId,
    values,
    institutionName: data.settings.name ?? "NeviiHub",
    logoUrl: data.settings.logoUrl || undefined,
    footerLines: footerForPreview(key, locale),
    forceVersion: v.data.version,
  });
  const { sendEmail } = await import("../email");
  const result = await sendEmail({
    to: me.email,
    subject: `[TEST] ${rendered.subject}`,
    html: rendered.html,
    text: `Bu bir şablon test e-postasıdır (örnek veriyle üretilmiştir).\n\n${rendered.text}`,
    attachments: rendered.attachments,
  });
  audit(ctx, "email_template.test_sent", "EmailTemplate", `${key}:${locale}`, { delivered: result.delivered });
  return ok({ delivered: result.delivered, blocked: result.delivered ? undefined : result.blocked, to: me.email });
}

export { isEmailTemplateKey };

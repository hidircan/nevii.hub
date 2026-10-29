/**
 * 10. tur iş #2 — kurum e-posta şablonlarının kalıcılık katmanı.
 * `student-portal-access.ts` ile AYNI ikili (json dosya ↔ Prisma DB) desen.
 * STORE_MODE=db → Prisma EmailTemplate; json/memory → dosya deposu.
 */
import path from "path";
import { isDbMode, resolveDataDir } from "../config";
import { uid } from "../utils";
import type { EmailTemplateKey, EmailTemplateLocale } from "./keys";

const FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "email-templates.json");

/** Resolved store path — exposed so tests clean up the same file the module writes. */
export const EMAIL_TEMPLATES_FILE = FILE;

export type EmailTemplateStatus = "draft" | "published" | "archived";

export type EmailTemplateRecord = {
  id: string;
  tenantId: string;
  key: EmailTemplateKey;
  locale: EmailTemplateLocale;
  status: EmailTemplateStatus;
  version: number;
  subject: string;
  preheader: string;
  introHtml: string;
  bodyHtml: string;
  signatureHtml: string;
  ctaLabel: string;
  showLogo: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EmailTemplateFields = {
  subject: string;
  preheader: string;
  introHtml: string;
  bodyHtml: string;
  signatureHtml: string;
  ctaLabel: string;
  showLogo: boolean;
};

async function loadAll(): Promise<EmailTemplateRecord[]> {
  try {
    const fs = await import("fs/promises");
    const raw = await fs.readFile(FILE, "utf8");
    return JSON.parse(raw) as EmailTemplateRecord[];
  } catch {
    return [];
  }
}

async function saveAll(rows: EmailTemplateRecord[]): Promise<void> {
  const fs = await import("fs/promises");
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(rows, null, 2));
}

function toRecordFull(r: {
  id: string;
  tenantId: string;
  key: string;
  locale: string;
  status: string;
  version: number;
  subject: string;
  preheader: string;
  introHtml: string;
  bodyHtml: string;
  signatureHtml: string;
  ctaLabel: string;
  showLogo: boolean;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}): EmailTemplateRecord {
  return {
    id: r.id,
    tenantId: r.tenantId,
    key: r.key as EmailTemplateKey,
    locale: r.locale as EmailTemplateLocale,
    status: r.status as EmailTemplateStatus,
    version: r.version,
    subject: r.subject,
    preheader: r.preheader,
    introHtml: r.introHtml,
    bodyHtml: r.bodyHtml,
    signatureHtml: r.signatureHtml,
    ctaLabel: r.ctaLabel,
    showLogo: r.showLogo,
    createdBy: r.createdBy,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export async function listEmailTemplateVersions(
  tenantId: string,
  key: EmailTemplateKey,
  locale: EmailTemplateLocale
): Promise<EmailTemplateRecord[]> {
  if (isDbMode) {
    const { prisma } = await import("../db");
    const rows = await prisma.emailTemplate.findMany({
      where: { tenantId, key, locale },
      orderBy: { version: "desc" },
    });
    return rows.map(toRecordFull);
  }
  const all = await loadAll();
  return all
    .filter((r) => r.tenantId === tenantId && r.key === key && r.locale === locale)
    .sort((a, b) => b.version - a.version);
}

export async function getPublishedEmailTemplate(
  tenantId: string,
  key: EmailTemplateKey,
  locale: EmailTemplateLocale
): Promise<EmailTemplateRecord | null> {
  if (isDbMode) {
    const { prisma } = await import("../db");
    const row = await prisma.emailTemplate.findFirst({
      where: { tenantId, key, locale, status: "published" },
      orderBy: { version: "desc" },
    });
    return row ? toRecordFull(row) : null;
  }
  const all = await loadAll();
  const matches = all
    .filter((r) => r.tenantId === tenantId && r.key === key && r.locale === locale && r.status === "published")
    .sort((a, b) => b.version - a.version);
  return matches[0] ?? null;
}

export async function getEmailTemplateVersion(
  tenantId: string,
  key: EmailTemplateKey,
  locale: EmailTemplateLocale,
  version: number
): Promise<EmailTemplateRecord | null> {
  if (isDbMode) {
    const { prisma } = await import("../db");
    const row = await prisma.emailTemplate.findUnique({
      where: { tenantId_key_locale_version: { tenantId, key, locale, version } },
    });
    return row ? toRecordFull(row) : null;
  }
  const all = await loadAll();
  return (
    all.find((r) => r.tenantId === tenantId && r.key === key && r.locale === locale && r.version === version) ?? null
  );
}

/**
 * Yeni taslak sürüm oluşturur (her kaydetme yeni sürüm — geçmiş korunur).
 * Aynı anda birden fazla `draft` birikmemesi için önceki taslak `archived`
 * yapılır (yayınlanmışa dokunulmaz).
 */
export async function saveEmailTemplateDraft(input: {
  tenantId: string;
  key: EmailTemplateKey;
  locale: EmailTemplateLocale;
  fields: EmailTemplateFields;
  createdBy: string;
}): Promise<EmailTemplateRecord> {
  const { tenantId, key, locale, fields, createdBy } = input;
  if (isDbMode) {
    const { prisma } = await import("../db");
    const latest = await prisma.emailTemplate.findFirst({
      where: { tenantId, key, locale },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const version = (latest?.version ?? 0) + 1;
    await prisma.emailTemplate.updateMany({
      where: { tenantId, key, locale, status: "draft" },
      data: { status: "archived" },
    });
    const created = await prisma.emailTemplate.create({
      data: { id: uid("etpl"), tenantId, key, locale, status: "draft", version, createdBy, ...fields },
    });
    return toRecordFull(created);
  }
  const all = await loadAll();
  const scoped = all.filter((r) => r.tenantId === tenantId && r.key === key && r.locale === locale);
  const version = scoped.reduce((m, r) => Math.max(m, r.version), 0) + 1;
  const now = new Date().toISOString();
  for (const r of all) {
    if (r.tenantId === tenantId && r.key === key && r.locale === locale && r.status === "draft") {
      r.status = "archived";
      r.updatedAt = now;
    }
  }
  const record: EmailTemplateRecord = {
    id: uid("etpl"),
    tenantId,
    key,
    locale,
    status: "draft",
    version,
    createdBy,
    createdAt: now,
    updatedAt: now,
    ...fields,
  };
  all.push(record);
  await saveAll(all);
  return record;
}

/**
 * Belirli bir sürümü yayımlar: önceki `published` → `archived`, hedef →
 * `published`. Idempotent (zaten yayındaysa no-op).
 */
export async function publishEmailTemplateVersion(
  tenantId: string,
  key: EmailTemplateKey,
  locale: EmailTemplateLocale,
  version: number
): Promise<EmailTemplateRecord | null> {
  if (isDbMode) {
    const { prisma } = await import("../db");
    const target = await prisma.emailTemplate.findUnique({
      where: { tenantId_key_locale_version: { tenantId, key, locale, version } },
    });
    if (!target) return null;
    if (target.status === "published") return toRecordFull(target);
    await prisma.emailTemplate.updateMany({
      where: { tenantId, key, locale, status: "published" },
      data: { status: "archived" },
    });
    const updated = await prisma.emailTemplate.update({
      where: { tenantId_key_locale_version: { tenantId, key, locale, version } },
      data: { status: "published" },
    });
    return toRecordFull(updated);
  }
  const all = await loadAll();
  const target = all.find(
    (r) => r.tenantId === tenantId && r.key === key && r.locale === locale && r.version === version
  );
  if (!target) return null;
  if (target.status === "published") return target;
  const now = new Date().toISOString();
  for (const r of all) {
    if (r.tenantId === tenantId && r.key === key && r.locale === locale && r.status === "published") {
      r.status = "archived";
      r.updatedAt = now;
    }
  }
  target.status = "published";
  target.updatedAt = now;
  await saveAll(all);
  return target;
}

/**
 * Varsayılana dönüş: bu anahtarın TÜM özel satırları `archived` yapılır
 * (SİLİNMEZ — sürüm geçmişi korunur). Sonrasında kod-içi varsayılan kullanılır.
 */
export async function archiveAllEmailTemplateVersions(
  tenantId: string,
  key: EmailTemplateKey,
  locale: EmailTemplateLocale
): Promise<number> {
  if (isDbMode) {
    const { prisma } = await import("../db");
    const res = await prisma.emailTemplate.updateMany({
      where: { tenantId, key, locale, status: { in: ["draft", "published"] } },
      data: { status: "archived" },
    });
    return res.count;
  }
  const all = await loadAll();
  const now = new Date().toISOString();
  let count = 0;
  for (const r of all) {
    if (
      r.tenantId === tenantId &&
      r.key === key &&
      r.locale === locale &&
      (r.status === "draft" || r.status === "published")
    ) {
      r.status = "archived";
      r.updatedAt = now;
      count += 1;
    }
  }
  if (count > 0) await saveAll(all);
  return count;
}

/**
 * Hukuki belge revizyon yönetimi (§6) — NeviiOS tek yönetim yolu.
 *
 * Sahiplik (NeviiAds-local kararı korunur):
 * - NeviiAds = taslak HAZIRLAMA kaynağı (local). NeviiOS'a otomatik akış
 *   YOK; aktarım elle yapıştırma + kaynak etiketiyle olur.
 * - NeviiOS = müşteriye sunulan ONAYLI sürümün seçildiği/yayımlandığı
 *   tek operasyonel kaynak. Aynı belge için bağımsız ikinci aktif kopya
 *   oluşmaz: yürürlükteki sürüm TEKTİR (publishedVersion).
 * - Yayımlanmış sürüm yerinde DEĞİŞTİRİLMEZ; yeni revizyon yeni sürüm
 *   açar, geçmiş kabul kayıtları eski sürüme bağlı kalır.
 *
 * Durumlar ayrı izlenir: hukuki inceleme / ticari onay / teknik yayın.
 * Yayın, iki onayı da ister (fail-closed). Bu tur local sentetik
 * demoyla sınırlıdır; gerçek public yayın ayrı onay ister.
 */
import { z } from "zod";
import { fail, ok, type ServiceResult } from "../services/result";
import type { ServiceContext } from "../services/context";
import { LEGAL_DOCS } from "./legal-documents";

export type DocReviewState = "bekliyor" | "onaylandi" | "reddedildi";

export type LegalDocRevision = {
  version: string;
  /** Düz metin gövde (HTML/script YOK; istemci metin olarak gösterir). */
  bodyText: string;
  /** Revizyonun hazırlandığı kaynak (sahiplik izi). */
  source: "neviios" | "neviiads-aktarim";
  legalReview: DocReviewState;
  legalNote: string | null;
  commercial: DocReviewState;
  commercialNote: string | null;
  createdBy: string;
  createdAt: string;
};

export type LegalDocState = {
  docId: string;
  /** Yürürlükteki (müşteriye sunulan) sürüm; null = yayın yok. */
  publishedVersion: string | null;
  publishedBy: string | null;
  publishedAt: string | null;
  revisions: LegalDocRevision[];
  updatedAt: string;
};

const KNOWN_IDS = new Set(LEGAL_DOCS.map((d) => d.id));

function stateOf(states: LegalDocState[], docId: string): LegalDocState {
  return (
    states.find((s) => s.docId === docId) ?? {
      docId,
      publishedVersion: null,
      publishedBy: null,
      publishedAt: null,
      revisions: [],
      updatedAt: new Date(0).toISOString(),
    }
  );
}

/** Yürürlükteki belge görünümü: temel kayıt + yayınlanmış metin (varsa). */
export async function getEffectiveDocs(): Promise<
  { id: string; title: string; version: string; scope: string; about: string; bodyText: string | null; approved: boolean }[]
> {
  const { listLegalDocStates } = await import("./store");
  const states = await listLegalDocStates();
  return LEGAL_DOCS.filter((d) => d.appliesB2B).map((d) => {
    const st = stateOf(states, d.id);
    const pub = st.publishedVersion ? st.revisions.find((r) => r.version === st.publishedVersion) : undefined;
    return {
      id: d.id,
      title: d.title,
      version: pub?.version ?? d.version,
      scope: d.scope,
      about: d.about,
      bodyText: pub?.bodyText ?? null,
      approved: Boolean(pub),
    };
  });
}

/** Gerçek satış kilidi (depo bilinçli): zorunlu sözleşmelerin TÜMÜ yayında olmalı. */
export async function getDocsApprovalStatusAsync(): Promise<{ allApproved: boolean; pending: string[] }> {
  const docs = await getEffectiveDocs();
  const pending = docs.filter((d) => d.scope === "required" && !d.approved).map((d) => d.title);
  return { allApproved: pending.length === 0, pending };
}

/** Yürürlükteki sürümlerle kabul doğrulaması (ödeme anı). */
export async function validateDocAcceptanceAsync(
  input: unknown
): Promise<{ ok: true } | { ok: false; message: string }> {
  const docs = await getEffectiveDocs();
  const required = docs.filter((d) => d.scope === "required");
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, message: "Sözleşme onayları eksik; belgeleri inceleyip onaylayın." };
  }
  const rec = input as Record<string, unknown>;
  const missing = required.filter((d) => rec[d.id] !== d.version).map((d) => d.title);
  if (missing.length > 0) {
    return { ok: false, message: `Şu belgelerin güncel sürümü onaylanmalı: ${missing.join(", ")}.` };
  }
  return { ok: true };
}

const reviseSchema = z.object({
  docId: z.string().min(1).max(64),
  bodyText: z.string().trim().min(20, "Belge metni en az 20 karakter olmalı.").max(60000),
  source: z.enum(["neviios", "neviiads-aktarim"]),
});

const reviewSchema = z.object({
  docId: z.string().min(1).max(64),
  version: z.string().min(1).max(32),
  field: z.enum(["legalReview", "commercial"]),
  value: z.enum(["bekliyor", "onaylandi", "reddedildi"]),
  note: z.string().trim().max(500).nullable().optional(),
});

const publishSchema = z.object({
  docId: z.string().min(1).max(64),
  version: z.string().min(1).max(32).nullable().optional(),
});

function nextVersion(existing: LegalDocRevision[]): string {
  const day = new Date().toISOString().slice(0, 10);
  const n = existing.filter((r) => r.version.startsWith(day)).length + 1;
  return `${day}-r${n}`;
}

async function audit(ctx: ServiceContext, docId: string, action: string, detail: Record<string, unknown>) {
  const { appendPlatformAudit } = await import("../platform/store");
  await appendPlatformAudit({
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    actorTenantId: ctx.tenantId,
    targetTenantId: null,
    action,
    entityType: "legal_doc",
    entityId: docId,
    before: null,
    after: detail as unknown as import("../platform/types").JsonValue,
    requestId: ctx.requestId || "n/a",
    outcome: "success",
  });
}

/** Yeni taslak revizyon (metin boş başlar; hazır metin YOK — uydurma yok). */
export async function createDocRevision(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<LegalDocRevision>> {
  if (ctx.role !== "HYPER_ADMIN") return fail("FORBIDDEN", "Bu alan yalnız platform yöneticisine açıktır.");
  const parsed = reviseSchema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Revizyon geçersiz.");
  }
  if (!KNOWN_IDS.has(parsed.data.docId)) return fail("NOT_FOUND", "Belge kayıtlı değil.");
  const { listLegalDocStates, saveLegalDocState } = await import("./store");
  const st = stateOf(await listLegalDocStates(), parsed.data.docId);
  const now = new Date().toISOString();
  const rev: LegalDocRevision = {
    version: nextVersion(st.revisions),
    bodyText: parsed.data.bodyText,
    source: parsed.data.source,
    legalReview: "bekliyor",
    legalNote: null,
    commercial: "bekliyor",
    commercialNote: null,
    createdBy: ctx.userId,
    createdAt: now,
  };
  st.revisions.push(rev);
  st.updatedAt = now;
  await saveLegalDocState(st);
  await audit(ctx, st.docId, "saas.legal_doc.revise", { version: rev.version, source: rev.source });
  return ok(rev);
}

/** Hukuki inceleme / ticari onay durumu (revizyon bazında, ayrı). */
export async function setDocReview(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<LegalDocRevision>> {
  if (ctx.role !== "HYPER_ADMIN") return fail("FORBIDDEN", "Bu alan yalnız platform yöneticisine açıktır.");
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Değerlendirme geçersiz.");
  }
  if (!KNOWN_IDS.has(parsed.data.docId)) return fail("NOT_FOUND", "Belge kayıtlı değil.");
  const { listLegalDocStates, saveLegalDocState } = await import("./store");
  const st = stateOf(await listLegalDocStates(), parsed.data.docId);
  const rev = st.revisions.find((r) => r.version === parsed.data.version);
  if (!rev) return fail("NOT_FOUND", "Revizyon bulunamadı.");
  if (parsed.data.field === "legalReview") {
    rev.legalReview = parsed.data.value;
    rev.legalNote = parsed.data.note?.trim() || null;
  } else {
    rev.commercial = parsed.data.value;
    rev.commercialNote = parsed.data.note?.trim() || null;
  }
  st.updatedAt = new Date().toISOString();
  await saveLegalDocState(st);
  await audit(ctx, st.docId, "saas.legal_doc.review", {
    version: rev.version,
    field: parsed.data.field,
    value: parsed.data.value,
  });
  return ok(rev);
}

/**
 * Yayınla / yayından kaldır. Yayın iki onayı da ister; sürüm yerinde
 * değişmez, yürürlükteki sürüm işaretçisi güncellenir. version=null →
 * yayından kaldırma (geri dönüş).
 */
export async function publishDocRevision(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<LegalDocState>> {
  if (ctx.role !== "HYPER_ADMIN") return fail("FORBIDDEN", "Bu alan yalnız platform yöneticisine açıktır.");
  const parsed = publishSchema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Yayın isteği geçersiz.");
  }
  if (!KNOWN_IDS.has(parsed.data.docId)) return fail("NOT_FOUND", "Belge kayıtlı değil.");
  const { listLegalDocStates, saveLegalDocState } = await import("./store");
  const st = stateOf(await listLegalDocStates(), parsed.data.docId);
  const now = new Date().toISOString();
  if (!parsed.data.version) {
    st.publishedVersion = null;
    st.publishedBy = null;
    st.publishedAt = null;
    st.updatedAt = now;
    await saveLegalDocState(st);
    await audit(ctx, st.docId, "saas.legal_doc.unpublish", {});
    return ok(st);
  }
  const rev = st.revisions.find((r) => r.version === parsed.data.version);
  if (!rev) return fail("NOT_FOUND", "Revizyon bulunamadı.");
  if (rev.legalReview !== "onaylandi" || rev.commercial !== "onaylandi") {
    return fail("VALIDATION_ERROR", "Yayın için hukuki inceleme ve ticari onayın ikisi de gerekli.");
  }
  st.publishedVersion = rev.version;
  st.publishedBy = ctx.userId;
  st.publishedAt = now;
  st.updatedAt = now;
  await saveLegalDocState(st);
  await audit(ctx, st.docId, "saas.legal_doc.publish", { version: rev.version });
  return ok(st);
}

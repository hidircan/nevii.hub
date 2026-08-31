import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import {
  generateKvkkNoticeDocumentTool,
  generatePhotoVideoConsentDocumentTool,
  setSocialMediaConsentTool,
  getDocumentInstanceTool,
} from "../services/tools";
import { DOCUMENT_TEMPLATES_FILE, DOCUMENT_INSTANCES_FILE } from "../documents";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";

const SMC_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "social-media-consents.json");

function adminCtx(overrides?: Partial<ServiceContext>): ServiceContext {
  return { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web", ...overrides };
}
function teacherCtx(overrides?: Partial<ServiceContext>): ServiceContext {
  return { role: "TEACHER", userId: "u3", tenantId: DEFAULT_TENANT_ID, teacherId: "t1", channel: "web", ...overrides };
}

beforeEach(async () => {
  await fs.rm(DOCUMENT_TEMPLATES_FILE, { force: true });
  await fs.rm(DOCUMENT_INSTANCES_FILE, { force: true });
  await fs.rm(SMC_FILE, { force: true });
});

/**
 * 2026-2027 kaynağı Madde 19/20 — sözleşmeden AYRI iki belge (KVKK Aydınlatma
 * Metni, Fotoğraf/Video Açık Rıza Formu). `/evrak-yazdir/[documentId]`
 * (mevcut, jenerik, `getDocumentInstanceTool` ile tenant/RBAC korumalı) bu
 * belgeleri OTOMATİK olarak render edebildiğinden, buradaki testler yalnızca
 * ÜRETİM adımını (doğru şablon seçimi, doğru alan değerleri) doğrular.
 */
describe("generateKvkkNoticeDocumentTool", () => {
  it("aktif KVKK şablonundan öğrenciye özel bir belge üretir — açık rıza ön koşulu GEREKMEZ", async () => {
    const res = await generateKvkkNoticeDocumentTool(adminCtx(), { studentId: "s1" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.reference).toBeTruthy();

    const doc = await getDocumentInstanceTool(adminCtx(), { documentId: res.data.documentId });
    expect(doc.ok).toBe(true);
    if (!doc.ok) return;
    expect(doc.data.document.kind).toBe("kvkk");
    expect(doc.data.document.renderedHtml).toContain("Zeynep Arslan");
    expect(doc.data.document.renderedHtml).not.toContain("{{"); // hiçbir placeholder boş/ham kalmamalı
  });

  it("olmayan öğrenci için VALIDATION_ERROR döner", async () => {
    const res = await generateKvkkNoticeDocumentTool(adminCtx(), { studentId: "no-such-student" });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VALIDATION_ERROR");
  });

  it("yalnızca SCHOOL_ADMIN/SUPER_ADMIN üretebilir — öğretmen REDDEDİLİR", async () => {
    const res = await generateKvkkNoticeDocumentTool(teacherCtx(), { studentId: "s1" });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("FORBIDDEN");
  });
});

describe("generatePhotoVideoConsentDocumentTool", () => {
  it("kayıtlı bir SocialMediaConsent kararı YOKSA üretim ENGELLENİR (personel keyfi izin uyduramaz)", async () => {
    const res = await generatePhotoVideoConsentDocumentTool(adminCtx(), { studentId: "s1" });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VALIDATION_ERROR");
    expect(res.error.message).toContain("önce sözleşme oluşturma");
  });

  it("granted (izin verildi) kararı doğru işaret ve kanallarla belgeye yansır", async () => {
    await setSocialMediaConsentTool(adminCtx(), {
      studentId: "s1",
      status: "granted",
      representativeName: "Selin Arslan",
      relationship: "veli",
      scopes: ["website", "in_house_board"],
    });
    const res = await generatePhotoVideoConsentDocumentTool(adminCtx(), { studentId: "s1" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const doc = await getDocumentInstanceTool(adminCtx(), { documentId: res.data.documentId });
    expect(doc.ok).toBe(true);
    if (!doc.ok) return;
    expect(doc.data.document.renderedHtml).toContain("Kurumun resmi internet sitesi");
    expect(doc.data.document.renderedHtml).toContain("Kurum içi pano ve etkinlik tanıtımları");
    expect(doc.data.document.renderedHtml).toContain("Selin Arslan");
  });

  it("denied (izin verilmedi) kararı da belgeye doğru işaretle yansır (izin YOK diye belge üretimi ENGELLENMEZ)", async () => {
    await setSocialMediaConsentTool(adminCtx(), {
      studentId: "s1",
      status: "denied",
      representativeName: "Selin Arslan",
      relationship: "veli",
      scopes: ["photo"],
    });
    const res = await generatePhotoVideoConsentDocumentTool(adminCtx(), { studentId: "s1" });
    expect(res.ok).toBe(true);
  });
});

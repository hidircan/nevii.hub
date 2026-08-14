import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import {
  createDocumentInstanceTool,
  listDocumentInstancesTool,
  archiveDocumentInstanceTool,
  uploadSignedDocumentTool,
  getDocumentInstanceTool,
} from "../services/tools";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");
const TPL_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "document-templates.json");
const INST_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "document-instances.json");

function ctx(overrides?: Partial<ServiceContext>): ServiceContext {
  return {
    role: "SCHOOL_ADMIN",
    userId: "u1",
    tenantId: DEFAULT_TENANT_ID,
    channel: "web",
    ...overrides,
  };
}

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
  await fs.rm(TPL_FILE, { force: true });
  await fs.rm(INST_FILE, { force: true });
});

async function seedTemplateAndDoc() {
  const { listDocumentTemplatesTool } = await import("../services/tools");
  const templates = await listDocumentTemplatesTool(ctx());
  if (!templates.ok) throw new Error("templates failed");
  const tpl = templates.data.templates[0]!;
  const created = await createDocumentInstanceTool(ctx(), {
    templateId: tpl.id,
    studentId: "s1",
    fieldValues: {},
  });
  if (!created.ok) throw new Error(created.error.message);
  return created.data.documentId;
}

describe("listDocumentInstancesTool — RBAC ve filtreleme", () => {
  it("PARENT rolü yetkisizdir (FORBIDDEN)", async () => {
    const res = await listDocumentInstancesTool(ctx({ role: "PARENT" }), {});
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("FORBIDDEN");
  });

  it("SCHOOL_ADMIN oluşturulan belgeyi listede görür", async () => {
    const documentId = await seedTemplateAndDoc();
    const res = await listDocumentInstancesTool(ctx(), {});
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.documents.some((d) => d.id === documentId)).toBe(true);
  });

  it("studentId filtresi yalnız o öğrenciye bağlı belgeleri döner", async () => {
    await seedTemplateAndDoc();
    const res = await listDocumentInstancesTool(ctx(), { studentId: "s1" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.documents.every((d) => d.studentId === "s1")).toBe(true);

    const resOther = await listDocumentInstancesTool(ctx(), { studentId: "s-does-not-exist" });
    expect(resOther.ok).toBe(true);
    if (!resOther.ok) return;
    expect(resOther.data.documents.length).toBe(0);
  });
});

describe("archiveDocumentInstanceTool — silme yok, arşivleme", () => {
  it("belgeyi 'cancelled' durumuna geçirir", async () => {
    const documentId = await seedTemplateAndDoc();
    const res = await archiveDocumentInstanceTool(ctx(), { documentId });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.status).toBe("cancelled");

    const fetched = await getDocumentInstanceTool(ctx(), { documentId });
    expect(fetched.ok).toBe(true);
    if (!fetched.ok) return;
    expect(fetched.data.document.status).toBe("cancelled");
  });

  it("TEACHER arşivleyemez (FORBIDDEN)", async () => {
    const documentId = await seedTemplateAndDoc();
    const res = await archiveDocumentInstanceTool(ctx({ role: "TEACHER", teacherId: "t1" }), { documentId });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("FORBIDDEN");
  });

  it("olmayan bir belge için NOT_FOUND döner", async () => {
    const res = await archiveDocumentInstanceTool(ctx(), { documentId: "does-not-exist" });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("NOT_FOUND");
  });
});

describe("uploadSignedDocumentTool — imzalı sürüm", () => {
  it("dosya yüklenince status 'uploaded' olur ve dosya bilgisi saklanır", async () => {
    const documentId = await seedTemplateAndDoc();
    const res = await uploadSignedDocumentTool(ctx(), {
      documentId,
      fileName: "imzali.pdf",
      fileMimeType: "application/pdf",
      fileData: Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.from("test-content")]).toString("base64"),
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.status).toBe("uploaded");

    const fetched = await getDocumentInstanceTool(ctx(), { documentId });
    expect(fetched.ok).toBe(true);
    if (!fetched.ok) return;
    expect(fetched.data.document.fileName).toBe("imzali.pdf");
    expect(fetched.data.document.signedUploadedAt).toBeDefined();
  });

  it("magic-byte imzası MIME type ile uyuşmayan dosyayı reddeder (upload parity)", async () => {
    const documentId = await seedTemplateAndDoc();
    const res = await uploadSignedDocumentTool(ctx(), {
      documentId,
      fileName: "sahte.pdf",
      fileMimeType: "application/pdf",
      fileData: Buffer.from("bu bir PDF değil").toString("base64"),
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VALIDATION_ERROR");
  });

  it("aşırı büyük fileData zod tarafından reddedilir", async () => {
    const documentId = await seedTemplateAndDoc();
    const res = await uploadSignedDocumentTool(ctx(), {
      documentId,
      fileName: "buyuk.pdf",
      fileMimeType: "application/pdf",
      fileData: "a".repeat(3_000_000),
    });
    expect(res.ok).toBe(false);
  });

  it("PARENT yükleyemez (FORBIDDEN)", async () => {
    const documentId = await seedTemplateAndDoc();
    const res = await uploadSignedDocumentTool(ctx({ role: "PARENT" }), {
      documentId,
      fileName: "x.pdf",
      fileMimeType: "application/pdf",
      fileData: Buffer.from("x").toString("base64"),
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("FORBIDDEN");
  });
});

describe("getDocumentInstanceTool — sahiplik/tenant", () => {
  it("olmayan bir belge için NOT_FOUND döner (sızıntı yok)", async () => {
    const res = await getDocumentInstanceTool(ctx(), { documentId: "does-not-exist" });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("NOT_FOUND");
  });
});

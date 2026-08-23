import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { uploadDocumentDirectTool, getDocumentInstanceTool } from "../services/tools";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");
const TPL_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "document-templates.json");
const INST_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "document-instances.json");

function ctx(overrides?: Partial<ServiceContext>): ServiceContext {
  return { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web", ...overrides };
}

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
  await fs.rm(TPL_FILE, { force: true });
  await fs.rm(INST_FILE, { force: true });
});

const VALID_FILE = {
  fileName: "belge.pdf",
  fileMimeType: "application/pdf",
  fileData: Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.from("fake pdf bytes")]).toString("base64"),
};

describe("Evraklar — şablonsuz doğrudan dosya yükleme (Paket 7)", () => {
  it("kategori (kind) seçip önceden hiçbir şablon olmadan dosya yüklenebilir", async () => {
    const res = await uploadDocumentDirectTool(ctx(), { kind: "petition", ...VALID_FILE });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const doc = await getDocumentInstanceTool(ctx(), { documentId: res.data.documentId });
    expect(doc.ok).toBe(true);
    if (doc.ok) {
      expect(doc.data.document.status).toBe("uploaded");
      expect(doc.data.document.kind).toBe("petition");
    }
  });

  it("şablonu daha önce hiç seed edilmemiş bir kategoride bile çalışır (ör. teacher_contract)", async () => {
    const res = await uploadDocumentDirectTool(ctx(), { kind: "teacher_contract", ...VALID_FILE });
    expect(res.ok).toBe(true);
  });

  it("desteklenmeyen dosya türü reddedilir", async () => {
    const res = await uploadDocumentDirectTool(ctx(), {
      kind: "custom",
      fileName: "virus.exe",
      fileMimeType: "application/x-msdownload",
      fileData: Buffer.from("x").toString("base64"),
    });
    expect(res.ok).toBe(false);
  });

  it("yalnız SCHOOL_ADMIN/SUPER_ADMIN yükleyebilir (RBAC)", async () => {
    const res = await uploadDocumentDirectTool(ctx({ role: "TEACHER", teacherId: "t1" }), {
      kind: "custom",
      ...VALID_FILE,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("FORBIDDEN");
  });

  it("var olmayan bir öğrenciye bağlamaya çalışmak reddedilir", async () => {
    const res = await uploadDocumentDirectTool(ctx(), { kind: "custom", ...VALID_FILE, studentId: "no-such-id" });
    expect(res.ok).toBe(false);
  });
});

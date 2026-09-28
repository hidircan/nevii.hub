import { describe, it, expect, beforeEach, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import {
  listDocumentInstancesTool,
  getDocumentInstanceTool,
  archiveDocumentInstanceTool,
} from "../services/tools";
import { createDocumentInstance, DOCUMENT_INSTANCES_FILE } from "../documents";
import { PLATFORM_STORE_FILE, grantBranchAccess } from "../platform/store";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";

/**
 * Şube müdürü evrak kapsamı (sahadan gelen bildirim: BM Evraklar'a girince
 * /panel'e sekiyordu — liste, buton, arşivleme hiç görünmüyordu).
 *
 * Kilitlenen kapsam (fail-closed, deneme BM kuralıyla aynı):
 * 1. Liste BM'ye yalnız atanmış şubelerin evraklarını gösterir (şubesiz evrak inmez).
 * 2. Detay kendi şubesinde OK, başka şubede FORBIDDEN.
 * 3. Arşivleme kendi şubesinde OK, başka şubede FORBIDDEN (kayıt değişmez).
 * 4. Atanmış şubesi OLMAYAN BM listede FORBIDDEN alır (sessiz boş liste yok).
 * 5. Admin yolu değişmez (filtre BM dışını etkilemez).
 * 6. Silme/üretim/yükleme/şablon yönetimi admin-only kalır (ayrı tool rolleri).
 */
const DATA_DIR = resolveDataDir(path.join(process.cwd(), "data"));

vi.mock("../audit/log", () => ({ recordAuditLog: vi.fn().mockResolvedValue(undefined) }));

function adminCtx(): ServiceContext {
  return { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web" };
}
function bmCtx(userId: string): ServiceContext {
  return { role: "BRANCH_MANAGER", userId, tenantId: DEFAULT_TENANT_ID, channel: "web" };
}

async function seedDoc(branchId: string | undefined, reference: string): Promise<string> {
  const doc = await createDocumentInstance({
    tenantId: DEFAULT_TENANT_ID,
    templateId: "",
    kind: "custom",
    fieldValues: { __bodyHtml: "<p>test</p>" },
    branchId,
    createdBy: "u1",
  });
  expect(doc.id).toBeTruthy();
  void reference;
  return doc.id;
}

beforeEach(async () => {
  await fs.rm(path.join(DATA_DIR, "document-instances.json"), { force: true });
  await fs.rm(DOCUMENT_INSTANCES_FILE, { force: true });
  await fs.rm(PLATFORM_STORE_FILE, { force: true });
  vi.clearAllMocks();
});

describe("şube müdürü evrak kapsamı", () => {
  it("liste yalnız atanmış şubeyi gösterir, şubesiz evrak inmez", async () => {
    const ownId = await seedDoc("erzene", "own");
    await seedDoc("evka3", "other");
    await seedDoc(undefined, "no-branch");
    await grantBranchAccess({ tenantId: DEFAULT_TENANT_ID, userId: "user_bm_1", branchId: "erzene", grantedBy: "u1" });
    const res = await listDocumentInstancesTool(bmCtx("user_bm_1"), {});
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.documents.map((d) => d.id)).toEqual([ownId]);
  });

  it("atanmış şube yoksa liste FORBIDDEN döner", async () => {
    await seedDoc("erzene", "own");
    const res = await listDocumentInstancesTool(bmCtx("user_bm_yok"), {});
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("FORBIDDEN");
  });

  it("detay kendi şubesinde OK, başka şubede FORBIDDEN", async () => {
    const ownId = await seedDoc("erzene", "own");
    const otherId = await seedDoc("evka3", "other");
    await grantBranchAccess({ tenantId: DEFAULT_TENANT_ID, userId: "user_bm_1", branchId: "erzene", grantedBy: "u1" });
    const bm = bmCtx("user_bm_1");
    const own = await getDocumentInstanceTool(bm, { documentId: ownId });
    expect(own.ok).toBe(true);
    const other = await getDocumentInstanceTool(bm, { documentId: otherId });
    expect(other.ok).toBe(false);
    if (other.ok) return;
    expect(other.error.code).toBe("FORBIDDEN");
  });

  it("arşivleme kendi şubesinde OK, başka şubede FORBIDDEN (kayıt değişmez)", async () => {
    const ownId = await seedDoc("erzene", "own");
    const otherId = await seedDoc("evka3", "other");
    await grantBranchAccess({ tenantId: DEFAULT_TENANT_ID, userId: "user_bm_1", branchId: "erzene", grantedBy: "u1" });
    const bm = bmCtx("user_bm_1");
    const okRes = await archiveDocumentInstanceTool(bm, { documentId: ownId });
    expect(okRes.ok).toBe(true);
    const badRes = await archiveDocumentInstanceTool(bm, { documentId: otherId });
    expect(badRes.ok).toBe(false);
    if (badRes.ok) return;
    expect(badRes.error.code).toBe("FORBIDDEN");
    const untouched = await getDocumentInstanceTool(adminCtx(), { documentId: otherId });
    expect(untouched.ok).toBe(true);
    if (!untouched.ok) return;
    expect(untouched.data.document.status).not.toBe("cancelled");
  });

  it("admin yolu değişmez — tüm evraklar listelenir ve arşivlenir", async () => {
    await seedDoc("evka3", "other");
    const listed = await listDocumentInstancesTool(adminCtx(), {});
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.data.documents.length).toBeGreaterThanOrEqual(1);
    const arch = await archiveDocumentInstanceTool(adminCtx(), { documentId: listed.data.documents[0]!.id });
    expect(arch.ok).toBe(true);
  });
});

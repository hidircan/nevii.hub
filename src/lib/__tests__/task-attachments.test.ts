import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import {
  createTaskTool,
  addTaskFileAttachmentTool,
  addTaskLinkAttachmentTool,
  deleteTaskAttachmentTool,
  getTaskAttachmentFileTool,
  getTaskDetailTool,
} from "../services/tools";
import { TASKS_FILE, getAttachmentById } from "../tasks";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";

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
  await fs.rm(TASKS_FILE, { force: true });
});

async function createBasicTask(overrides?: Record<string, unknown>) {
  const res = await createTaskTool(ctx(), {
    title: "Test görevi",
    category: "Kayıt",
    priority: "MEDIUM",
    ...overrides,
  });
  if (!res.ok) throw new Error(res.error.message);
  return res.data.taskId;
}

/** 1x1 şeffaf PNG — geçerli, küçük, gerçek bir dosya baytı. */
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

/**
 * İş Takip Faz 3B-2A — göreve güvenli dosya/link eki. `addFileAttachment`/
 * `addLinkAttachment` mevcut base64-in-DB deseninin (TeachingMaterial/
 * HomeworkSubmission) aynısı — yeni bir depolama sağlayıcısı yok. Burada
 * yalnızca bu spesifik akışın (validasyon, RBAC, tenant izolasyonu, indirme,
 * silme+audit) hedefli testleri var.
 */
describe("İş Takip — güvenli görev ekleri (Faz 3B-2A)", () => {
  it("yetkili kullanıcı dosya eki ekler; liste ve detayda görünür", async () => {
    const taskId = await createBasicTask();
    const res = await addTaskFileAttachmentTool(ctx(), {
      taskId,
      title: "Kayıt formu taraması",
      fileName: "form.png",
      fileMimeType: "image/png",
      fileData: TINY_PNG_BASE64,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const detail = await getTaskDetailTool(ctx(), { taskId });
    expect(detail.ok).toBe(true);
    if (!detail.ok) return;
    expect(detail.data.attachments).toHaveLength(1);
    const att = detail.data.attachments[0]!;
    expect(att.type).toBe("FILE");
    expect(att.title).toBe("Kayıt formu taraması");
    expect(att.fileSize).toBeGreaterThan(0);
    // fileData ASLA liste/detay yanıtında yer almamalı (public tip).
    expect((att as unknown as { fileData?: string }).fileData).toBeUndefined();
  });

  it("yetkili kullanıcı https link eki ekler", async () => {
    const taskId = await createBasicTask();
    const res = await addTaskLinkAttachmentTool(ctx(), {
      taskId,
      title: "Drive klasörü",
      url: "https://drive.example.com/klasor",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const detail = await getTaskDetailTool(ctx(), { taskId });
    expect(detail.ok).toBe(true);
    if (!detail.ok) return;
    expect(detail.data.attachments).toHaveLength(1);
    expect(detail.data.attachments[0]!.type).toBe("LINK");
    expect(detail.data.attachments[0]!.url).toBe("https://drive.example.com/klasor");
  });

  it("yetkisiz rol (PARENT) ek ekleyemez", async () => {
    const taskId = await createBasicTask();
    const res = await addTaskLinkAttachmentTool(ctx({ role: "STUDENT" }), {
      taskId,
      title: "Deneme",
      url: "https://example.com",
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("FORBIDDEN");
  });

  it("kendine atanmamış/takipçisi olmadığı görevde TEACHER ek ekleyemez", async () => {
    const taskId = await createBasicTask({ assigneeId: "t-other" });
    const res = await addTaskLinkAttachmentTool(ctx({ role: "TEACHER", teacherId: "t-me", userId: "u-me" }), {
      taskId,
      title: "Deneme",
      url: "https://example.com",
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("FORBIDDEN");
  });

  it("kendine atanmış görevde TEACHER ek ekleyebilir", async () => {
    const taskId = await createBasicTask({ assigneeId: "t-me" });
    const res = await addTaskLinkAttachmentTool(ctx({ role: "TEACHER", teacherId: "t-me", userId: "u-me" }), {
      taskId,
      title: "Deneme",
      url: "https://example.com",
    });
    expect(res.ok).toBe(true);
  });

  it("cross-tenant görev ID'sine ek eklenemez", async () => {
    const taskId = await createBasicTask();
    const res = await addTaskLinkAttachmentTool(ctx({ tenantId: "other-tenant-z" }), {
      taskId,
      title: "Deneme",
      url: "https://example.com",
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("NOT_FOUND");
  });

  it("javascript: bağlantısı reddedilir", async () => {
    const taskId = await createBasicTask();
    const res = await addTaskLinkAttachmentTool(ctx(), {
      taskId,
      title: "Kötü niyetli",
      url: "javascript:alert(1)",
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VALIDATION_ERROR");
  });

  it("data: bağlantısı reddedilir", async () => {
    const taskId = await createBasicTask();
    const res = await addTaskLinkAttachmentTool(ctx(), {
      taskId,
      title: "Kötü niyetli",
      url: "data:text/html,<script>alert(1)</script>",
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VALIDATION_ERROR");
  });

  it("iç ağ (private/loopback) adresine bağlantı reddedilir", async () => {
    const taskId = await createBasicTask();
    const res = await addTaskLinkAttachmentTool(ctx(), {
      taskId,
      title: "İç ağ",
      url: "http://192.168.1.10/panel",
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VALIDATION_ERROR");
  });

  it("path traversal içeren dosya adı reddedilir", async () => {
    const taskId = await createBasicTask();
    const res = await addTaskFileAttachmentTool(ctx(), {
      taskId,
      title: "Kötü niyetli",
      fileName: "../../etc/passwd",
      fileMimeType: "image/png",
      fileData: TINY_PNG_BASE64,
    });
    expect(res.ok).toBe(false);
  });

  it("izin verilmeyen uzantılı dosya reddedilir (MIME doğru olsa bile)", async () => {
    const taskId = await createBasicTask();
    const res = await addTaskFileAttachmentTool(ctx(), {
      taskId,
      title: "Kötü niyetli",
      fileName: "virus.exe",
      fileMimeType: "application/pdf",
      fileData: TINY_PNG_BASE64,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VALIDATION_ERROR");
  });

  it("desteklenmeyen MIME türü reddedilir", async () => {
    const taskId = await createBasicTask();
    const res = await addTaskFileAttachmentTool(ctx(), {
      taskId,
      title: "Deneme",
      fileName: "dosya.bin",
      fileMimeType: "application/x-msdownload",
      fileData: TINY_PNG_BASE64,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VALIDATION_ERROR");
  });

  it("aşırı büyük dosya reddedilir (>2MB)", async () => {
    const taskId = await createBasicTask();
    const big = Buffer.alloc(2_500_000, 1).toString("base64");
    const res = await addTaskFileAttachmentTool(ctx(), {
      taskId,
      title: "Büyük dosya",
      fileName: "buyuk.pdf",
      fileMimeType: "application/pdf",
      fileData: big,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VALIDATION_ERROR");
  });

  it("yetkili kullanıcı eki indirir (fileData döner)", async () => {
    const taskId = await createBasicTask();
    const addRes = await addTaskFileAttachmentTool(ctx(), {
      taskId,
      title: "Form",
      fileName: "form.png",
      fileMimeType: "image/png",
      fileData: TINY_PNG_BASE64,
    });
    expect(addRes.ok).toBe(true);
    if (!addRes.ok) return;

    const fileRes = await getTaskAttachmentFileTool(ctx(), { attachmentId: addRes.data.attachmentId });
    expect(fileRes.ok).toBe(true);
    if (!fileRes.ok) return;
    expect(fileRes.data.fileData).toBe(TINY_PNG_BASE64);
    expect(fileRes.data.fileMimeType).toBe("image/png");
  });

  it("yetkisiz TEACHER (görevin sorumlusu/takipçisi değil) eki indiremez", async () => {
    const taskId = await createBasicTask({ assigneeId: "t-other" });
    const addRes = await addTaskFileAttachmentTool(ctx(), {
      taskId,
      title: "Form",
      fileName: "form.png",
      fileMimeType: "image/png",
      fileData: TINY_PNG_BASE64,
    });
    if (!addRes.ok) throw new Error("setup failed");

    const fileRes = await getTaskAttachmentFileTool(ctx({ role: "TEACHER", teacherId: "t-me", userId: "u-me" }), {
      attachmentId: addRes.data.attachmentId,
    });
    expect(fileRes.ok).toBe(false);
    if (fileRes.ok) return;
    expect(fileRes.error.code).toBe("FORBIDDEN");
  });

  it("cross-tenant çağrı eki indiremez (NOT_FOUND — IDOR'a kapalı)", async () => {
    const taskId = await createBasicTask();
    const addRes = await addTaskFileAttachmentTool(ctx(), {
      taskId,
      title: "Form",
      fileName: "form.png",
      fileMimeType: "image/png",
      fileData: TINY_PNG_BASE64,
    });
    if (!addRes.ok) throw new Error("setup failed");

    const fileRes = await getTaskAttachmentFileTool(ctx({ tenantId: "other-tenant-z" }), {
      attachmentId: addRes.data.attachmentId,
    });
    expect(fileRes.ok).toBe(false);
    if (fileRes.ok) return;
    expect(fileRes.error.code).toBe("NOT_FOUND");
  });

  it("ekleyen kişi kendi ekini kaldırabilir; soft-delete sonrası listede görünmez ve aktiviteye yazılır", async () => {
    const taskId = await createBasicTask({ assigneeId: "t-me" });
    const addRes = await addTaskLinkAttachmentTool(ctx({ role: "TEACHER", teacherId: "t-me", userId: "u-me" }), {
      taskId,
      title: "Deneme",
      url: "https://example.com",
    });
    if (!addRes.ok) throw new Error("setup failed");

    const delRes = await deleteTaskAttachmentTool(ctx({ role: "TEACHER", teacherId: "t-me", userId: "u-me" }), {
      taskId,
      attachmentId: addRes.data.attachmentId,
    });
    expect(delRes.ok).toBe(true);

    const detail = await getTaskDetailTool(ctx(), { taskId });
    expect(detail.ok).toBe(true);
    if (!detail.ok) return;
    expect(detail.data.attachments).toHaveLength(0);
    expect(detail.data.activity.map((a) => a.action)).toContain("attachment_added");
    expect(detail.data.activity.map((a) => a.action)).toContain("attachment_removed");
  });

  it("başka bir TEACHER'ın eklediği eki farklı bir TEACHER kaldıramaz (yalnızca ekleyen veya admin)", async () => {
    const taskId = await createBasicTask({ assigneeId: "t-a", followerIds: ["t-b"] });
    const addRes = await addTaskLinkAttachmentTool(ctx({ role: "TEACHER", teacherId: "t-a", userId: "u-a" }), {
      taskId,
      title: "Deneme",
      url: "https://example.com",
    });
    if (!addRes.ok) throw new Error("setup failed");

    const delRes = await deleteTaskAttachmentTool(ctx({ role: "TEACHER", teacherId: "t-b", userId: "u-b" }), {
      taskId,
      attachmentId: addRes.data.attachmentId,
    });
    expect(delRes.ok).toBe(false);
    if (delRes.ok) return;
    expect(delRes.error.code).toBe("FORBIDDEN");
  });

  it("admin başka birinin eklediği eki de kaldırabilir (moderasyon)", async () => {
    const taskId = await createBasicTask({ assigneeId: "t-me" });
    const addRes = await addTaskLinkAttachmentTool(ctx({ role: "TEACHER", teacherId: "t-me", userId: "u-me" }), {
      taskId,
      title: "Deneme",
      url: "https://example.com",
    });
    if (!addRes.ok) throw new Error("setup failed");

    const delRes = await deleteTaskAttachmentTool(ctx(), { taskId, attachmentId: addRes.data.attachmentId });
    expect(delRes.ok).toBe(true);
  });

  it("silme hard-delete DEĞİL soft-delete — kayıt tenant-scoped okumada `deletedAt` ile hâlâ mevcut", async () => {
    const taskId = await createBasicTask();
    const addRes = await addTaskFileAttachmentTool(ctx(), {
      taskId,
      title: "Form",
      fileName: "form.png",
      fileMimeType: "image/png",
      fileData: TINY_PNG_BASE64,
    });
    if (!addRes.ok) throw new Error("setup failed");
    await deleteTaskAttachmentTool(ctx(), { taskId, attachmentId: addRes.data.attachmentId });

    const raw = await getAttachmentById(DEFAULT_TENANT_ID, addRes.data.attachmentId);
    expect(raw).not.toBeNull();
    expect(raw?.deletedAt).toBeTruthy();

    // Soft-delete sonrası indirilemez de (erişilebilirlik açısından reddedilir).
    const fileRes = await getTaskAttachmentFileTool(ctx(), { attachmentId: addRes.data.attachmentId });
    expect(fileRes.ok).toBe(false);
  });
});

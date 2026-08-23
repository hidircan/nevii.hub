import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import {
  createTaskTool,
  addTaskCommentTool,
  updateTaskCommentTool,
  deleteTaskCommentTool,
  getTaskDetailTool,
} from "../services/tools";
import { TASKS_FILE } from "../tasks";
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
  const res = await createTaskTool(ctx(), { title: "Test görevi", category: "Kayıt", ...overrides });
  if (!res.ok) throw new Error(res.error.message);
  return res.data.taskId;
}

/** Faz 2 madde 5 — yorum düzenleme/soft-delete. Model (updateComment/softDeleteComment) Faz 1'de zaten vardı; UI+tool eksikti. */
describe("İş Takip — yorum düzenleme/soft-delete", () => {
  it("yazar kendi yorumunu düzenleyebilir; updatedAt createdAt'ten farklılaşır", async () => {
    const taskId = await createBasicTask();
    const created = await addTaskCommentTool(ctx(), { taskId, body: "İlk hali" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const updated = await updateTaskCommentTool(ctx(), {
      taskId,
      commentId: created.data.commentId,
      body: "Düzeltilmiş hali",
    });
    expect(updated.ok).toBe(true);

    const detail = await getTaskDetailTool(ctx(), { taskId });
    expect(detail.ok).toBe(true);
    if (!detail.ok) return;
    const comment = detail.data.comments.find((c) => c.id === created.data.commentId)!;
    expect(comment.body).toBe("Düzeltilmiş hali");
    expect(comment.updatedAt).not.toBe(comment.createdAt);
  });

  it("başka bir kullanıcı (TEACHER, yazar olmayan) yorumu düzenleyemez — FORBIDDEN", async () => {
    const taskId = await createBasicTask({ assigneeId: "t1", followerIds: ["t2"] });
    const created = await addTaskCommentTool(ctx({ role: "TEACHER", teacherId: "t1", userId: "u_t1" }), {
      taskId,
      body: "t1'in yorumu",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const res = await updateTaskCommentTool(ctx({ role: "TEACHER", teacherId: "t2", userId: "u_t2" }), {
      taskId,
      commentId: created.data.commentId,
      body: "İzinsiz değişiklik",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("FORBIDDEN");
  });

  it("admin herhangi bir kullanıcının yorumunu düzenleyebilir/kaldırabilir (moderasyon)", async () => {
    const taskId = await createBasicTask({ assigneeId: "t1" });
    const created = await addTaskCommentTool(ctx({ role: "TEACHER", teacherId: "t1", userId: "u_t1" }), {
      taskId,
      body: "Öğretmenin yorumu",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const updated = await updateTaskCommentTool(ctx(), { taskId, commentId: created.data.commentId, body: "Moderasyon" });
    expect(updated.ok).toBe(true);

    const removed = await deleteTaskCommentTool(ctx(), { taskId, commentId: created.data.commentId });
    expect(removed.ok).toBe(true);
  });

  it("yazar kendi yorumunu soft-delete edebilir — hard delete YOK, silinen yorum listeden kalkar ama kaydı kaybolmaz", async () => {
    const taskId = await createBasicTask();
    const created = await addTaskCommentTool(ctx(), { taskId, body: "Silinecek yorum" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const removed = await deleteTaskCommentTool(ctx(), { taskId, commentId: created.data.commentId });
    expect(removed.ok).toBe(true);

    const detail = await getTaskDetailTool(ctx(), { taskId });
    expect(detail.ok).toBe(true);
    if (!detail.ok) return;
    expect(detail.data.comments.some((c) => c.id === created.data.commentId)).toBe(false);

    // Zaten silinmiş bir yorumu tekrar silmeye/düzenlemeye çalışmak NOT_FOUND döner (idempotent hata) — hard delete olmadığının dolaylı kanıtı: kayıt tamamen yok olmadı, yalnızca erişilemez.
    const secondDelete = await deleteTaskCommentTool(ctx(), { taskId, commentId: created.data.commentId });
    expect(secondDelete.ok).toBe(false);
    if (!secondDelete.ok) expect(secondDelete.error.code).toBe("NOT_FOUND");
  });

  it("PARENT/STUDENT yorum düzenleme/silme tool'larını çağıramaz", async () => {
    const taskId = await createBasicTask();
    const created = await addTaskCommentTool(ctx(), { taskId, body: "x" });
    if (!created.ok) throw new Error("setup failed");

    const updateRes = await updateTaskCommentTool(ctx({ role: "STUDENT", studentId: "s1" }), {
      taskId,
      commentId: created.data.commentId,
      body: "y",
    });
    expect(updateRes.ok).toBe(false);

    const deleteRes = await deleteTaskCommentTool(ctx({ role: "STUDENT", studentId: "s1" }), {
      taskId,
      commentId: created.data.commentId,
    });
    expect(deleteRes.ok).toBe(false);
  });
});

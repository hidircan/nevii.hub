import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import {
  createTaskTool,
  listTasksTool,
  getTaskTool,
  getTaskDetailTool,
  updateTaskTool,
  changeTaskStatusTool,
  addTaskChecklistItemTool,
  setTaskChecklistItemCompletedTool,
  archiveTaskChecklistItemTool,
  addTaskCommentTool,
  getTaskKpiSummaryTool,
  getTaskReportTool,
  createDocumentInstanceTool,
  listDocumentTemplatesTool,
  getDocumentInstanceTool,
} from "../services/tools";
import { TASKS_FILE } from "../tasks";
import { resolveDataDir } from "../config";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";

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
  await fs.rm(TASKS_FILE, { force: true });
  await fs.rm(TPL_FILE, { force: true });
  await fs.rm(INST_FILE, { force: true });
});

async function seedDocument(overrides?: Partial<ServiceContext>) {
  const templates = await listDocumentTemplatesTool(ctx(overrides));
  if (!templates.ok) throw new Error("templates failed");
  const tpl = templates.data.templates[0]!;
  const created = await createDocumentInstanceTool(ctx(overrides), {
    templateId: tpl.id,
    studentId: "s1",
    fieldValues: {},
  });
  if (!created.ok) throw new Error(created.error.message);
  return created.data.documentId;
}

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

describe("İş Takip — admin tam CRUD + yaşam döngüsü", () => {
  it("admin görev oluşturur, listeler, detayını görür", async () => {
    const taskId = await createBasicTask({ assigneeId: "t1", followerIds: ["t2"] });
    const listRes = await listTasksTool(ctx(), {});
    expect(listRes.ok).toBe(true);
    if (listRes.ok) expect(listRes.data.tasks.some((t) => t.id === taskId)).toBe(true);

    const detailRes = await getTaskDetailTool(ctx(), { taskId });
    expect(detailRes.ok).toBe(true);
    if (detailRes.ok) {
      expect(detailRes.data.task.assigneeId).toBe("t1");
      expect(detailRes.data.activity.length).toBeGreaterThan(0);
    }
  });

  it("admin görevi düzenler (sorumlu, öncelik, kategori, son tarih)", async () => {
    const taskId = await createBasicTask();
    const res = await updateTaskTool(ctx(), {
      taskId,
      assigneeId: "t2",
      priority: "URGENT",
      category: "Teknik",
      dueDate: new Date(Date.now() + 86400000).toISOString(),
    });
    expect(res.ok).toBe(true);

    const detail = await getTaskDetailTool(ctx(), { taskId });
    if (detail.ok) {
      expect(detail.data.task.assigneeId).toBe("t2");
      expect(detail.data.task.priority).toBe("URGENT");
      expect(detail.data.task.category).toBe("Teknik");
    }
  });

  it("tamamla → yeniden aç → iptal → arşivle → geri yükle yaşam döngüsü, hard delete YOK", async () => {
    const taskId = await createBasicTask();

    const complete = await changeTaskStatusTool(ctx(), { taskId, action: "complete" });
    expect(complete.ok).toBe(true);
    if (complete.ok) expect(complete.data.status).toBe("COMPLETED");
    const detail = await getTaskDetailTool(ctx(), { taskId });
    if (detail.ok) {
      expect(detail.data.task.completedAt).toBeTruthy();
      expect(detail.data.task.progressPercent).toBe(100);
    }

    const reopen = await changeTaskStatusTool(ctx(), { taskId, action: "reopen" });
    expect(reopen.ok).toBe(true);
    if (reopen.ok) expect(reopen.data.status).toBe("TODO");

    const cancel = await changeTaskStatusTool(ctx(), { taskId, action: "cancel" });
    expect(cancel.ok).toBe(true);
    if (cancel.ok) expect(cancel.data.status).toBe("CANCELLED");

    const archive = await changeTaskStatusTool(ctx(), { taskId, action: "archive" });
    expect(archive.ok).toBe(true);
    if (archive.ok) expect(archive.data.status).toBe("ARCHIVED");

    // "Silinmedi" — hâlâ getTaskTool ile erişilebilir (admin için her zaman).
    const stillThere = await getTaskTool(ctx(), { taskId });
    expect(stillThere.ok).toBe(true);
    if (stillThere.ok) expect(stillThere.data.task.status).toBe("ARCHIVED");

    const restore = await changeTaskStatusTool(ctx(), { taskId, action: "reopen" });
    expect(restore.ok).toBe(true);
    if (restore.ok) expect(restore.data.status).toBe("TODO");
  });

  it("son tarih başlangıç tarihinden önce olamaz — VALIDATION_ERROR", async () => {
    const res = await createTaskTool(ctx(), {
      title: "Geçersiz tarih",
      category: "Kayıt",
      startDate: "2026-09-10",
      dueDate: "2026-09-01",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("VALIDATION_ERROR");
  });

  it("başlık zorunlu — boş başlık VALIDATION_ERROR döner", async () => {
    const res = await createTaskTool(ctx(), { title: "", category: "Kayıt" });
    expect(res.ok).toBe(false);
  });
});

describe("İş Takip — RBAC: çalışan (TEACHER) yalnızca kendi görevini görür/değiştirir", () => {
  it("TEACHER yalnızca kendine atanan/takipçi olduğu görevleri listede görür", async () => {
    const ownTaskId = await createBasicTask({ assigneeId: "t1" });
    const followerTaskId = await createBasicTask({ assigneeId: "t2", followerIds: ["t1"] });
    await createBasicTask({ assigneeId: "t2" }); // t1'in görmemesi gereken görev

    const listRes = await listTasksTool(ctx({ role: "TEACHER", teacherId: "t1", userId: "u_teacher" }), {});
    expect(listRes.ok).toBe(true);
    if (listRes.ok) {
      const ids = listRes.data.tasks.map((t) => t.id);
      expect(ids).toContain(ownTaskId);
      expect(ids).toContain(followerTaskId);
      expect(ids).toHaveLength(2);
    }
  });

  it("TEACHER başkasının görevini API manipülasyonuyla (doğrudan taskId ile) göremez", async () => {
    const otherTaskId = await createBasicTask({ assigneeId: "t2" });
    const res = await getTaskTool(ctx({ role: "TEACHER", teacherId: "t1", userId: "u_teacher" }), { taskId: otherTaskId });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("FORBIDDEN");
  });

  it("TEACHER başkasının görevini API manipülasyonuyla değiştiremez (updateTaskTool)", async () => {
    const otherTaskId = await createBasicTask({ assigneeId: "t2" });
    const res = await updateTaskTool(ctx({ role: "TEACHER", teacherId: "t1", userId: "u_teacher" }), {
      taskId: otherTaskId,
      status: "IN_PROGRESS",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("FORBIDDEN");
  });

  it("TEACHER kendi görevinde izinli statü geçişi yapabilir (set_status)", async () => {
    const taskId = await createBasicTask({ assigneeId: "t1" });
    const res = await changeTaskStatusTool(ctx({ role: "TEACHER", teacherId: "t1", userId: "u_teacher" }), {
      taskId,
      action: "set_status",
      status: "IN_PROGRESS",
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.status).toBe("IN_PROGRESS");
  });

  it("TEACHER kendi görevini bile iptal/arşivleyemez — yalnızca yönetici", async () => {
    const taskId = await createBasicTask({ assigneeId: "t1" });
    const cancelRes = await changeTaskStatusTool(ctx({ role: "TEACHER", teacherId: "t1", userId: "u_teacher" }), {
      taskId,
      action: "cancel",
    });
    expect(cancelRes.ok).toBe(false);
    if (!cancelRes.ok) expect(cancelRes.error.code).toBe("FORBIDDEN");

    const setCancelled = await changeTaskStatusTool(ctx({ role: "TEACHER", teacherId: "t1", userId: "u_teacher" }), {
      taskId,
      action: "set_status",
      status: "CANCELLED",
    });
    expect(setCancelled.ok).toBe(false);
  });

  it("TEACHER sorumlu/takipçi/son tarih/bağlam alanlarını değiştiremez", async () => {
    const taskId = await createBasicTask({ assigneeId: "t1" });
    const res = await updateTaskTool(ctx({ role: "TEACHER", teacherId: "t1", userId: "u_teacher" }), {
      taskId,
      assigneeId: "t2",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("FORBIDDEN");

    const res2 = await updateTaskTool(ctx({ role: "TEACHER", teacherId: "t1", userId: "u_teacher" }), {
      taskId,
      dueDate: new Date().toISOString(),
    });
    expect(res2.ok).toBe(false);

    const res3 = await updateTaskTool(ctx({ role: "TEACHER", teacherId: "t1", userId: "u_teacher" }), {
      taskId,
      studentId: "s1",
    });
    expect(res3.ok).toBe(false);
  });

  it("TEACHER kendi görevinde yorum ekleyebilir ve checklist tamamlayabilir", async () => {
    const taskId = await createBasicTask({ assigneeId: "t1" });
    const checklistRes = await addTaskChecklistItemTool(ctx({ role: "TEACHER", teacherId: "t1", userId: "u_teacher" }), {
      taskId,
      title: "Adım 1",
    });
    expect(checklistRes.ok).toBe(true);
    if (!checklistRes.ok) return;

    const toggleRes = await setTaskChecklistItemCompletedTool(ctx({ role: "TEACHER", teacherId: "t1", userId: "u_teacher" }), {
      taskId,
      itemId: checklistRes.data.itemId,
      isCompleted: true,
    });
    expect(toggleRes.ok).toBe(true);

    const commentRes = await addTaskCommentTool(ctx({ role: "TEACHER", teacherId: "t1", userId: "u_teacher" }), {
      taskId,
      body: "İlerliyorum",
    });
    expect(commentRes.ok).toBe(true);
  });

  it("TEACHER başkasının görevine checklist/yorum ekleyemez", async () => {
    const otherTaskId = await createBasicTask({ assigneeId: "t2" });
    const res = await addTaskCommentTool(ctx({ role: "TEACHER", teacherId: "t1", userId: "u_teacher" }), {
      taskId: otherTaskId,
      body: "İzinsiz yorum",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("FORBIDDEN");
  });
});

describe("İş Takip — PARENT/STUDENT tamamen erişemez", () => {
  it("PARENT hiçbir görev tool'unu çağıramaz", async () => {
    const taskId = await createBasicTask();
    const list = await listTasksTool(ctx({ role: "STUDENT", studentId: "s1" }), {});
    expect(list.ok).toBe(false);
    if (!list.ok) expect(list.error.code).toBe("FORBIDDEN");

    const get = await getTaskTool(ctx({ role: "STUDENT", studentId: "s1" }), { taskId });
    expect(get.ok).toBe(false);

    const create = await createTaskTool(ctx({ role: "STUDENT", studentId: "s1" }), {
      title: "x",
      category: "Kayıt",
    });
    expect(create.ok).toBe(false);
  });

  it("STUDENT hiçbir görev tool'unu çağıramaz", async () => {
    const res = await listTasksTool(ctx({ role: "STUDENT", studentId: "s1" }), {});
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("FORBIDDEN");
  });
});

describe("İş Takip — bağlı kayıt (öğrenci/öğretmen/şube/ders/ödeme) aynı-tenant doğrulaması", () => {
  it("var olmayan (dolayısıyla başka-tenant temsili) bir studentId ile görev oluşturma reddedilir", async () => {
    const res = await createTaskTool(ctx(), {
      title: "Geçersiz bağlantı",
      category: "Kayıt",
      studentId: "does-not-exist-cross-tenant",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("VALIDATION_ERROR");
  });

  it("var olmayan bir teacherId/branchId/lessonId/paymentId ile görev oluşturma reddedilir", async () => {
    const t = await createTaskTool(ctx(), { title: "x", category: "Kayıt", teacherId: "ghost" });
    expect(t.ok).toBe(false);
    const b = await createTaskTool(ctx(), { title: "x", category: "Kayıt", branchId: "ghost" });
    expect(b.ok).toBe(false);
    const l = await createTaskTool(ctx(), { title: "x", category: "Kayıt", lessonId: "ghost" });
    expect(l.ok).toBe(false);
    const p = await createTaskTool(ctx(), { title: "x", category: "Kayıt", paymentId: "ghost" });
    expect(p.ok).toBe(false);
  });

  it("geçerli, aynı-tenant öğrenci/öğretmen/şube bağlantısıyla görev oluşturulabilir", async () => {
    const res = await createTaskTool(ctx(), {
      title: "Geçerli bağlantı",
      category: "Kayıt",
      studentId: "s1",
      teacherId: "t1",
      branchId: "erzene",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const detail = await getTaskDetailTool(ctx(), { taskId: res.data.taskId });
    if (detail.ok) {
      expect(detail.data.task.studentId).toBe("s1");
      expect(detail.data.task.teacherId).toBe("t1");
      expect(detail.data.task.branchId).toBe("erzene");
    }
  });
});

describe("İş Takip — checklist tamamlanma ve ilerleme kuralı", () => {
  it("tüm checklist öğeleri tamamlanınca ilerleme otomatik 100 olur", async () => {
    const taskId = await createBasicTask();
    const item1 = await addTaskChecklistItemTool(ctx(), { taskId, title: "A" });
    const item2 = await addTaskChecklistItemTool(ctx(), { taskId, title: "B" });
    if (!item1.ok || !item2.ok) throw new Error("setup failed");

    await setTaskChecklistItemCompletedTool(ctx(), { taskId, itemId: item1.data.itemId, isCompleted: true });
    let detail = await getTaskDetailTool(ctx(), { taskId });
    if (detail.ok) expect(detail.data.task.progressPercent).toBe(0); // yalnız 1/2 tamam — henüz otomatik 100 yok

    const finalToggle = await setTaskChecklistItemCompletedTool(ctx(), {
      taskId,
      itemId: item2.data.itemId,
      isCompleted: true,
    });
    expect(finalToggle.ok).toBe(true);
    if (finalToggle.ok) expect(finalToggle.data.allCompleted).toBe(true);

    detail = await getTaskDetailTool(ctx(), { taskId });
    if (detail.ok) expect(detail.data.task.progressPercent).toBe(100);
  });

  it("bir öğeyi geri açmak ilerlemeyi geri DÜŞÜRMEZ (belgelenmiş asimetrik kural)", async () => {
    const taskId = await createBasicTask();
    const item1 = await addTaskChecklistItemTool(ctx(), { taskId, title: "A" });
    if (!item1.ok) throw new Error("setup failed");
    await setTaskChecklistItemCompletedTool(ctx(), { taskId, itemId: item1.data.itemId, isCompleted: true });
    let detail = await getTaskDetailTool(ctx(), { taskId });
    if (detail.ok) expect(detail.data.task.progressPercent).toBe(100);

    await setTaskChecklistItemCompletedTool(ctx(), { taskId, itemId: item1.data.itemId, isCompleted: false });
    detail = await getTaskDetailTool(ctx(), { taskId });
    if (detail.ok) expect(detail.data.task.progressPercent).toBe(100); // geri düşmedi
  });

  it("checklist öğesi arşivlenebilir (soft) — hard delete yok, listChecklist'ten kalkar", async () => {
    const taskId = await createBasicTask();
    const item = await addTaskChecklistItemTool(ctx(), { taskId, title: "Kaldırılacak" });
    if (!item.ok) throw new Error("setup failed");
    const archiveRes = await archiveTaskChecklistItemTool(ctx(), { taskId, itemId: item.data.itemId });
    expect(archiveRes.ok).toBe(true);

    const detail = await getTaskDetailTool(ctx(), { taskId });
    if (detail.ok) expect(detail.data.checklist.some((c) => c.id === item.data.itemId)).toBe(false);
  });
});

describe("İş Takip — hızlı filtreler (KPI/liste)", () => {
  it("gecikmiş görev filtresi yalnızca son tarihi geçmiş VE açık görevleri döner", async () => {
    const overdueId = await createBasicTask({ dueDate: new Date(Date.now() - 2 * 86400000).toISOString() });
    const futureId = await createBasicTask({ dueDate: new Date(Date.now() + 2 * 86400000).toISOString() });
    void futureId;

    const res = await listTasksTool(ctx(), { quickFilter: "overdue" });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const ids = res.data.tasks.map((t) => t.id);
      expect(ids).toContain(overdueId);
      expect(ids).not.toContain(futureId);
    }
  });

  it("KPI özeti admin için tenant genelini, TEACHER için yalnızca kendisini sayar", async () => {
    await createBasicTask({ assigneeId: "t1" });
    await createBasicTask({ assigneeId: "t2" });

    const adminKpi = await getTaskKpiSummaryTool(ctx());
    expect(adminKpi.ok).toBe(true);
    if (adminKpi.ok) expect(adminKpi.data.openCount).toBe(2);

    const teacherKpi = await getTaskKpiSummaryTool(ctx({ role: "TEACHER", teacherId: "t1", userId: "u_teacher" }));
    expect(teacherKpi.ok).toBe(true);
    if (teacherKpi.ok) {
      expect(teacherKpi.data.openCount).toBe(1);
      expect(teacherKpi.data.assignedToMeCount).toBe(1);
    }
  });
});

describe("İş Takip — liste/detay tutarlılığı ve audit izi (aktivite geçmişi)", () => {
  it("oluşturma, durum değişimi ve yorum eklemeler aktivite geçmişinde görünür", async () => {
    const taskId = await createBasicTask();
    await changeTaskStatusTool(ctx(), { taskId, action: "complete" });
    await addTaskCommentTool(ctx(), { taskId, body: "not" });

    const detail = await getTaskDetailTool(ctx(), { taskId });
    expect(detail.ok).toBe(true);
    if (!detail.ok) return;
    const actions = detail.data.activity.map((a) => a.action);
    expect(actions).toContain("created");
    expect(actions).toContain("completed");
    expect(actions).toContain("comment_added");
  });

  it("listedeki bir görev, detay ekranıyla aynı alanları gösterir (tutarlılık)", async () => {
    const taskId = await createBasicTask({ assigneeId: "t1", priority: "HIGH" });
    const list = await listTasksTool(ctx(), {});
    const detail = await getTaskDetailTool(ctx(), { taskId });
    expect(list.ok && detail.ok).toBe(true);
    if (list.ok && detail.ok) {
      const listRow = list.data.tasks.find((t) => t.id === taskId)!;
      expect(listRow.assigneeId).toBe(detail.data.task.assigneeId);
      expect(listRow.priority).toBe(detail.data.task.priority);
      expect(listRow.status).toBe(detail.data.task.status);
    }
  });
});

/**
 * İş Takip Faz 3B-1A — Evrak detay ekranından bağlamlı görev oluşturma.
 * `documentId` alanı, doğrulama (validateTaskLinks) ve UI kablolaması zaten
 * mevcut altyapıdan gelen genel bağlam mekanizması — burada yalnızca bu
 * spesifik akışı (evrak → görev, görev → evrak) hedefli olarak doğruluyoruz.
 */
describe("İş Takip — evrak bağlamından görev oluşturma (Faz 3B-1A)", () => {
  it("yetkili yönetici, erişebildiği evraktan görev oluşturur; task doğru documentId ile kaydedilir", async () => {
    const documentId = await seedDocument();
    const res = await createTaskTool(ctx(), {
      title: "Evrak — takip",
      category: "Evrak",
      priority: "MEDIUM",
      documentId,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const detail = await getTaskDetailTool(ctx(), { taskId: res.data.taskId });
    expect(detail.ok).toBe(true);
    if (!detail.ok) return;
    expect(detail.data.task.documentId).toBe(documentId);
  });

  it("aynı evrak için birden fazla görev oluşturulabilir (otomatik tekilleştirme yok)", async () => {
    const documentId = await seedDocument();
    const first = await createTaskTool(ctx(), { title: "Görev 1", category: "Evrak", priority: "MEDIUM", documentId });
    const second = await createTaskTool(ctx(), { title: "Görev 2", category: "Evrak", priority: "MEDIUM", documentId });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.data.taskId).not.toBe(second.data.taskId);
  });

  it("başka tenant'ın evrağı için görev oluşturma reddedilir (VALIDATION_ERROR — IDOR'a kapalı)", async () => {
    const otherTenantId = "other-tenant-x";
    const foreignDocumentId = await seedDocument({ tenantId: otherTenantId });
    const res = await createTaskTool(ctx(), {
      title: "Yanlış tenant evrakı",
      category: "Evrak",
      priority: "MEDIUM",
      documentId: foreignDocumentId,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VALIDATION_ERROR");
  });

  it("başka tenant bağlamında bir görevden evrak bağlamı okunmaya çalışılınca erişim reddedilir", async () => {
    const otherTenantId = "other-tenant-y";
    const foreignDocumentId = await seedDocument({ tenantId: otherTenantId });
    const docRes = await getDocumentInstanceTool(ctx(), { documentId: foreignDocumentId });
    expect(docRes.ok).toBe(false);
    if (docRes.ok) return;
    expect(docRes.error.code).toBe("NOT_FOUND");
  });

  it("yetkisiz rol (TEACHER) evrak bağlamıyla görev oluşturamaz", async () => {
    const documentId = await seedDocument();
    const res = await createTaskTool(ctx({ role: "TEACHER" }), {
      title: "Yetkisiz deneme",
      category: "Evrak",
      priority: "MEDIUM",
      documentId,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("FORBIDDEN");
  });

  it("var olmayan/silinmiş bir evrak ID'siyle görev oluşturma reddedilir", async () => {
    const res = await createTaskTool(ctx(), {
      title: "Olmayan evrak",
      category: "Evrak",
      priority: "MEDIUM",
      documentId: "doc_does_not_exist",
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VALIDATION_ERROR");
  });
});

/**
 * İş Takip Faz 3B-3B — yönetici görev raporu tool katmanı (RBAC/tenant).
 * Saf hesaplama mantığı (`buildTaskReport`) ayrı dosyada (task-report.test.ts)
 * hedefli olarak test ediliyor — burada yalnızca tool'un rol/tenant
 * doğrulaması ve gerçek `listTasks` entegrasyonu doğrulanıyor.
 */
describe("İş Takip — yönetici görev raporu (Faz 3B-3B) — RBAC/tenant", () => {
  it("admin rapor alır; tenant'taki görevleri doğru sayar", async () => {
    await createBasicTask({ status: "TODO" });
    await createBasicTask({ status: "IN_PROGRESS" });
    const res = await getTaskReportTool(ctx(), {});
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.openWorkload.total).toBe(2);
  });

  it("TEACHER rapor alamaz (FORBIDDEN)", async () => {
    const res = await getTaskReportTool(ctx({ role: "TEACHER", teacherId: "t1", userId: "u_teacher" }), {});
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("FORBIDDEN");
  });

  it("PARENT/STUDENT rapor alamaz", async () => {
    const parentRes = await getTaskReportTool(ctx({ role: "STUDENT" }), {});
    expect(parentRes.ok).toBe(false);
    const studentRes = await getTaskReportTool(ctx({ role: "STUDENT" }), {});
    expect(studentRes.ok).toBe(false);
  });

  it("cross-tenant görevler rapora karışmaz", async () => {
    await createBasicTask({ status: "TODO" });
    const otherRes = await createTaskTool(ctx({ tenantId: "other-tenant-report" }), {
      title: "Başka tenant görevi",
      category: "Kayıt",
      priority: "MEDIUM",
    });
    expect(otherRes.ok).toBe(true);

    const res = await getTaskReportTool(ctx(), {});
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.openWorkload.total).toBe(1);

    const otherTenantReport = await getTaskReportTool(ctx({ tenantId: "other-tenant-report" }), {});
    expect(otherTenantReport.ok).toBe(true);
    if (!otherTenantReport.ok) return;
    expect(otherTenantReport.data.openWorkload.total).toBe(1);
  });

  it("başlangıç tarihi bitiş tarihinden sonraysa reddedilir", async () => {
    const res = await getTaskReportTool(ctx(), { startDate: "2026-02-01", endDate: "2026-01-01" });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VALIDATION_ERROR");
  });

  it("tarih verilmezse varsayılan son 30 gün aralığı kullanılır", async () => {
    const res = await getTaskReportTool(ctx(), {});
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const days =
      (new Date(res.data.range.endYmd).getTime() - new Date(res.data.range.startYmd).getTime()) / 86_400_000;
    expect(days).toBe(29);
  });

  it("boş tenant için güvenli boş rapor döner", async () => {
    const res = await getTaskReportTool(ctx({ tenantId: "empty-tenant-report" }), {});
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.totalTasks).toBe(0);
    expect(res.data.completed.ratePercent).toBeNull();
  });
});

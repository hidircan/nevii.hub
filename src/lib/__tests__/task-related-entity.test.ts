/**
 * İş Takip Merkezi — bağlamsal görev oluşturma, ilişkili kayıt (relatedEntity*)
 * ve tenant/RBAC izolasyonu testleri. Sabit demo fikstürleri (bkz. src/lib/seed.ts):
 * s1 (öğrenci, teacherId=t1), s2 (öğrenci, teacherId=t2), t1/t2 (öğretmen),
 * p1 (ödeme, studentId=s1), l1 (ders, studentId=s1/teacherId=t1),
 * m1 (telafi, studentId=s2/teacherId=t2).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import {
  createTaskTool,
  getTaskDetailTool,
  resolveTaskRelatedEntityTool,
} from "../services/tools";
import { TASKS_FILE } from "../tasks";
import { NOTIFICATIONS_FILE, listNotificationsForUser } from "../notifications";
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
  await fs.rm(NOTIFICATIONS_FILE, { force: true });
});

describe("createTaskTool — relatedEntity bağlamsal görev oluşturma", () => {
  it("admin: relatedEntityType=student verildiğinde studentId otomatik türetilir ve label saklanır", async () => {
    const res = await createTaskTool(ctx(), {
      title: "Ödeme takibi — Ada",
      category: "Tahsilat",
      relatedEntityType: "student",
      relatedEntityId: "s1",
      relatedEntityLabel: "Ada Yılmaz",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const detail = await getTaskDetailTool(ctx(), { taskId: res.data.taskId });
    expect(detail.ok).toBe(true);
    if (!detail.ok) return;
    expect(detail.data.task.studentId).toBe("s1");
    expect(detail.data.task.relatedEntityType).toBe("student");
    expect(detail.data.task.relatedEntityId).toBe("s1");
    expect(detail.data.task.relatedEntityLabel).toBe("Ada Yılmaz");
    // audit izi: oluşturma + ilişki bağlama aktivitesi (bkz. tools.ts addActivity)
    const actions = detail.data.activity.map((a) => a.action);
    expect(actions).toContain("created");
    expect(actions).toContain("field_updated");
  });

  it("relatedEntityType=makeup: özel FK olmasa da studentId/teacherId telafi kaydından türetilir", async () => {
    const res = await createTaskTool(ctx(), {
      title: "Telafi planlama — Test",
      category: "Program",
      relatedEntityType: "makeup",
      relatedEntityId: "m1",
      relatedEntityLabel: "Telafi #m1",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const detail = await getTaskDetailTool(ctx(), { taskId: res.data.taskId });
    if (!detail.ok) throw new Error("detail failed");
    expect(detail.data.task.studentId).toBe("s2");
    expect(detail.data.task.teacherId).toBe("t2");
    expect(detail.data.task.relatedEntityType).toBe("makeup");
  });

  it("cross-tenant/olmayan kayıt: relatedEntityId bulunamazsa VALIDATION_ERROR döner", async () => {
    const res = await createTaskTool(ctx(), {
      title: "Geçersiz bağlantı",
      category: "Kayıt",
      relatedEntityType: "student",
      relatedEntityId: "does-not-exist",
      relatedEntityLabel: "Yok",
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VALIDATION_ERROR");
  });

  it("TEACHER: erişebildiği (kendi öğrencisi) bir kayda bağlı görev oluşturabilir", async () => {
    const res = await createTaskTool(ctx({ role: "TEACHER", userId: "u-t1", teacherId: "t1" }), {
      title: "Kendi öğrencim için görev",
      category: "Eğitim",
      relatedEntityType: "student",
      relatedEntityId: "s1", // s1.teacherId === t1
      relatedEntityLabel: "Ada Yılmaz",
    });
    expect(res.ok).toBe(true);
  });

  it("TEACHER: erişemediği bir öğrenciye bağlı görev oluşturamaz (FORBIDDEN)", async () => {
    const res = await createTaskTool(ctx({ role: "TEACHER", userId: "u-t1", teacherId: "t1" }), {
      title: "Başka öğretmenin öğrencisi",
      category: "Eğitim",
      relatedEntityType: "student",
      relatedEntityId: "s2", // s2.teacherId === t2, t1 DEĞİL
      relatedEntityLabel: "S2",
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("FORBIDDEN");
  });

  it("TEACHER: bağlamsız (serbest) görev oluşturamaz", async () => {
    const res = await createTaskTool(ctx({ role: "TEACHER", userId: "u-t1", teacherId: "t1" }), {
      title: "Serbest görev",
      category: "Eğitim",
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("FORBIDDEN");
  });

  it("TEACHER: şube (branch) bağlantısına erişemez", async () => {
    const res = await createTaskTool(ctx({ role: "TEACHER", userId: "u-t1", teacherId: "t1" }), {
      title: "Şube görevi",
      category: "Program",
      relatedEntityType: "branch",
      relatedEntityId: "erzene",
      relatedEntityLabel: "Erzene",
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("FORBIDDEN");
  });

  it("STUDENT görev oluşturamaz (fail döner, throw etmez)", async () => {
    const res = await createTaskTool(ctx({ role: "STUDENT", userId: "u-p1", studentId: "s1" }), {
      title: "Veli görevi",
      category: "Veli İletişimi",
      relatedEntityType: "student",
      relatedEntityId: "s1",
      relatedEntityLabel: "Ada",
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("FORBIDDEN");
  });

  it("STUDENT görev oluşturamaz", async () => {
    const res = await createTaskTool(ctx({ role: "STUDENT", userId: "u-s1", studentId: "s1" }), {
      title: "Öğrenci görevi",
      category: "Kayıt",
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("FORBIDDEN");
  });

  it("assigneeId verildiğinde görev atama bildirimi tetiklenir", async () => {
    // Bootstrap kimlikleri (src/lib/auth/users.ts) yalnızca t2'yi bir User'a
    // (user_teacher_t2) bağlar — bildirim çözümü (resolveTaskNotifyUserId)
    // bu eşleşmeyi gerektirir.
    const res = await createTaskTool(ctx(), {
      title: "Bildirimli görev",
      category: "Kayıt",
      assigneeId: "t2",
      relatedEntityType: "student",
      relatedEntityId: "s2",
      relatedEntityLabel: "S2",
    });
    expect(res.ok).toBe(true);
    const notes = await listNotificationsForUser({ tenantId: DEFAULT_TENANT_ID, userId: "user_teacher_t2" });
    expect(notes.some((n) => n.kind === "task_new_assignment")).toBe(true);
  });
});

describe("resolveTaskRelatedEntityTool — tenant-safe ilişkili kayıt çözümü", () => {
  it("var olan bir öğrenciyi çözer ve href üretir", async () => {
    const res = await resolveTaskRelatedEntityTool(ctx(), {
      relatedEntityType: "student",
      relatedEntityId: "s1",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.exists).toBe(true);
    expect(res.data.href).toBe("/panel/ogrenciler/s1");
  });

  it("silinmiş/olmayan bir kayıt için exists:false döner (kırık link yerine güvenli mesaj)", async () => {
    const res = await resolveTaskRelatedEntityTool(ctx(), {
      relatedEntityType: "student",
      relatedEntityId: "archived-or-missing",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.exists).toBe(false);
    expect(res.data.href).toBeUndefined();
  });

  it("STUDENT görev görüntüleme rolüne sahip olmadığından reddedilir", async () => {
    const res = await resolveTaskRelatedEntityTool(ctx({ role: "STUDENT", studentId: "s1" }), {
      relatedEntityType: "student",
      relatedEntityId: "s1",
    });
    expect(res.ok).toBe(false);
  });
});

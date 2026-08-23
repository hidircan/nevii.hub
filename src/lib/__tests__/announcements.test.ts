import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import {
  createAnnouncementTool,
  listAllAnnouncementsTool,
  listAnnouncementsForUserTool,
  markAnnouncementReadTool,
  listAnnouncementReadersTool,
  updateAnnouncementStatusTool,
  getAnnouncementAttachmentFileTool,
} from "../services/tools";
import { readData } from "../store";
import {
  ANNOUNCEMENTS_FILE,
  ANNOUNCEMENT_READS_FILE,
  clearAnnouncements,
} from "../announcements";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";

function ctx(overrides?: Partial<ServiceContext>): ServiceContext {
  return {
    role: "SCHOOL_ADMIN",
    userId: "admin1",
    tenantId: DEFAULT_TENANT_ID,
    channel: "web",
    ...overrides,
  };
}

beforeEach(async () => {
  await fs.rm(ANNOUNCEMENTS_FILE, { force: true });
  await fs.rm(ANNOUNCEMENT_READS_FILE, { force: true });
  await clearAnnouncements(DEFAULT_TENANT_ID);
});

describe("EPIC 5 — createAnnouncementTool / RBAC", () => {
  it("TEACHER duyuru oluşturamaz (FORBIDDEN)", async () => {
    const result = await createAnnouncementTool(ctx({ role: "TEACHER", teacherId: "t1" }), {
      title: "x",
      body: "y",
      audienceType: "all",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
  });

  it("SCHOOL_ADMIN taslak duyuru oluşturabilir; varsayılan status draft", async () => {
    const created = await createAnnouncementTool(ctx(), {
      title: "Yeni dönem başlıyor",
      body: "Detaylar için okulla iletişime geçin.",
      audienceType: "all",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const all = await listAllAnnouncementsTool(ctx());
    expect(all.ok).toBe(true);
    if (!all.ok) return;
    const found = all.data.announcements.find((a) => a.id === created.data.announcementId);
    expect(found?.status).toBe("draft");
  });

  it("branch hedefi audienceRef olmadan reddedilir (VALIDATION_ERROR)", async () => {
    const result = await createAnnouncementTool(ctx(), {
      title: "x",
      body: "y",
      audienceType: "branch",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("EPIC 5 — listAnnouncementsForUserTool (portal görünümü, hedef kitle filtresi)", () => {
  it("draft duyuru hiçbir portale sızmaz", async () => {
    const created = await createAnnouncementTool(ctx(), {
      title: "Taslak",
      body: "y",
      audienceType: "all",
      status: "draft",
    });
    expect(created.ok).toBe(true);

    const data = await readData();
    const student = data.students[0];
    const result = await listAnnouncementsForUserTool(
      ctx({ role: "STUDENT", userId: "parent1", studentId: student.id })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.announcements).toHaveLength(0);
  });

  it("published + all: veli ve öğretmen görür", async () => {
    await createAnnouncementTool(ctx(), {
      title: "Genel duyuru",
      body: "y",
      audienceType: "all",
      status: "published",
    });

    const data = await readData();
    const student = data.students[0];
    const teacher = data.teachers[0];

    const parentView = await listAnnouncementsForUserTool(
      ctx({ role: "STUDENT", userId: "parent1", studentId: student.id })
    );
    expect(parentView.ok).toBe(true);
    if (parentView.ok) expect(parentView.data.announcements).toHaveLength(1);

    const teacherView = await listAnnouncementsForUserTool(
      ctx({ role: "TEACHER", userId: "teacher1", teacherId: teacher.id })
    );
    expect(teacherView.ok).toBe(true);
    if (teacherView.ok) expect(teacherView.data.announcements).toHaveLength(1);
  });

  it("branch hedefli published duyuru: başka şubedeki veli görmez", async () => {
    const data = await readData();
    const erzeneStudent = data.students.find((s) => s.branchId === "erzene");
    const evka3Student = data.students.find((s) => s.branchId === "evka3");
    expect(erzeneStudent).toBeDefined();
    expect(evka3Student).toBeDefined();
    if (!erzeneStudent || !evka3Student) return;

    await createAnnouncementTool(ctx(), {
      title: "Erzene şube duyurusu",
      body: "y",
      audienceType: "branch",
      audienceRef: { branchId: "erzene" },
      status: "published",
    });

    const inBranch = await listAnnouncementsForUserTool(
      ctx({ role: "STUDENT", userId: "p1", studentId: erzeneStudent.id })
    );
    expect(inBranch.ok).toBe(true);
    if (inBranch.ok) expect(inBranch.data.announcements).toHaveLength(1);

    const outOfBranch = await listAnnouncementsForUserTool(
      ctx({ role: "STUDENT", userId: "p2", studentId: evka3Student.id })
    );
    expect(outOfBranch.ok).toBe(true);
    if (outOfBranch.ok) expect(outOfBranch.data.announcements).toHaveLength(0);
  });

  it("expireAt geçmişteyse artık listede görünmez", async () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    await createAnnouncementTool(ctx(), {
      title: "Süresi dolan",
      body: "y",
      audienceType: "all",
      status: "published",
      expireAt: past,
    });
    const data = await readData();
    const result = await listAnnouncementsForUserTool(
      ctx({ role: "STUDENT", userId: "p1", studentId: data.students[0].id })
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.announcements).toHaveLength(0);
  });
});

describe("EPIC 5 — markAnnouncementReadTool / listAnnouncementReadersTool", () => {
  it("okundu işaretleme idempotenttir ve yönetim ekranında görünür", async () => {
    const created = await createAnnouncementTool(ctx(), {
      title: "x",
      body: "y",
      audienceType: "all",
      status: "published",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await markAnnouncementReadTool(ctx({ role: "STUDENT", userId: "parent-x" }), {
      announcementId: created.data.announcementId,
    });
    await markAnnouncementReadTool(ctx({ role: "STUDENT", userId: "parent-x" }), {
      announcementId: created.data.announcementId,
    });

    const readers = await listAnnouncementReadersTool(ctx(), {
      announcementId: created.data.announcementId,
    });
    expect(readers.ok).toBe(true);
    if (!readers.ok) return;
    expect(readers.data.userIds).toEqual(["parent-x"]);
  });

  it("TEACHER kim-okudu tablosunu göremez (FORBIDDEN)", async () => {
    const created = await createAnnouncementTool(ctx(), {
      title: "x",
      body: "y",
      audienceType: "all",
      status: "published",
    });
    if (!created.ok) return;
    const result = await listAnnouncementReadersTool(ctx({ role: "TEACHER", teacherId: "t1" }), {
      announcementId: created.data.announcementId,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
  });
});

describe("EPIC 5 — updateAnnouncementStatusTool", () => {
  it("draft -> published sonrası portale çıkar", async () => {
    const created = await createAnnouncementTool(ctx(), {
      title: "x",
      body: "y",
      audienceType: "all",
    });
    if (!created.ok) return;

    const data = await readData();
    const before = await listAnnouncementsForUserTool(
      ctx({ role: "STUDENT", userId: "p1", studentId: data.students[0].id })
    );
    if (before.ok) expect(before.data.announcements).toHaveLength(0);

    const updated = await updateAnnouncementStatusTool(ctx(), {
      announcementId: created.data.announcementId,
      status: "published",
    });
    expect(updated.ok).toBe(true);

    const after = await listAnnouncementsForUserTool(
      ctx({ role: "STUDENT", userId: "p1", studentId: data.students[0].id })
    );
    if (after.ok) expect(after.data.announcements).toHaveLength(1);
  });

  it("var olmayan duyuru id'si NOT_FOUND döner", async () => {
    const result = await updateAnnouncementStatusTool(ctx(), {
      announcementId: "does-not-exist",
      status: "archived",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
  });
});

const TINY_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("Duyuru ekleri", () => {
  it("geçerli PNG ekler, storageKey client listesine sızmaz, yetkili indirebilir", async () => {
    const created = await createAnnouncementTool(ctx(), {
      title: "Ekli duyuru",
      body: "dosya var",
      audienceType: "all",
      status: "published",
      attachments: [{ fileName: "not.png", mimeType: "image/png", fileData: TINY_PNG_B64 }],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const listed = await listAllAnnouncementsTool(ctx());
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    const found = listed.data.announcements.find((a) => a.id === created.data.announcementId);
    expect(found?.attachments).toHaveLength(1);
    expect(found?.attachments?.[0]?.fileName).toBe("not.png");
    expect(found?.attachments?.[0]?.storageKey).toBeUndefined();

    const file = await getAnnouncementAttachmentFileTool(ctx(), {
      announcementId: created.data.announcementId,
      attachmentId: found!.attachments![0]!.id,
    });
    expect(file.ok).toBe(true);
    if (file.ok) expect(file.data.fileMimeType).toBe("image/png");
  });

  it("desteklenmeyen MIME reddedilir", async () => {
    const res = await createAnnouncementTool(ctx(), {
      title: "x",
      body: "y",
      audienceType: "all",
      attachments: [{ fileName: "x.exe", mimeType: "application/x-msdownload", fileData: TINY_PNG_B64 }],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("VALIDATION_ERROR");
  });

  it("başka tenant ek indiremez", async () => {
    const created = await createAnnouncementTool(ctx(), {
      title: "gizli",
      body: "y",
      audienceType: "all",
      status: "published",
      attachments: [{ fileName: "not.png", mimeType: "image/png", fileData: TINY_PNG_B64 }],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const listed = await listAllAnnouncementsTool(ctx());
    if (!listed.ok) return;
    const found = listed.data.announcements.find((a) => a.id === created.data.announcementId);
    const stolen = await getAnnouncementAttachmentFileTool(
      ctx({ tenantId: "other-tenant", role: "SCHOOL_ADMIN", userId: "admin-other" }),
      {
        announcementId: created.data.announcementId,
        attachmentId: found!.attachments![0]!.id,
      }
    );
    expect(stolen.ok).toBe(false);
    if (!stolen.ok) expect(stolen.error.code).toBe("NOT_FOUND");
  });

  it("hedef kitle dışı kullanıcı ek indiremez", async () => {
    const created = await createAnnouncementTool(ctx(), {
      title: "öğretmenlere",
      body: "y",
      audienceType: "teachers",
      status: "published",
      attachments: [{ fileName: "not.png", mimeType: "image/png", fileData: TINY_PNG_B64 }],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const listed = await listAllAnnouncementsTool(ctx());
    if (!listed.ok) return;
    const found = listed.data.announcements.find((a) => a.id === created.data.announcementId);
    const parent = await getAnnouncementAttachmentFileTool(
      ctx({ role: "STUDENT", userId: "p1", studentId: "s1" }),
      {
        announcementId: created.data.announcementId,
        attachmentId: found!.attachments![0]!.id,
      }
    );
    expect(parent.ok).toBe(false);
    if (!parent.ok) expect(parent.error.code).toBe("FORBIDDEN");
  });
});

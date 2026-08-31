import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { createHomeworkTool, listHomeworkForStudentTool, getHomeworkFileTool, submitHomeworkTool, getHomeworkSubmissionFileTool } from "../services/tools";
import { HOMEWORK_FILE_PATH, HOMEWORK_SUBMISSIONS_FILE_PATH } from "../homework";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import { grantStudentAccess } from "./portal-access-test-helper";
import { STUDENT_PORTAL_ACCESS_FILE } from "../student-portal-access";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

function teacherCtx(overrides?: Partial<ServiceContext>): ServiceContext {
  return { role: "TEACHER", userId: "u1", tenantId: DEFAULT_TENANT_ID, teacherId: "t1", channel: "web", ...overrides };
}
function studentCtx(overrides?: Partial<ServiceContext>): ServiceContext {
  return { role: "STUDENT", userId: "u2", tenantId: DEFAULT_TENANT_ID, studentId: "s1", channel: "web", ...overrides };
}

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
  await fs.rm(HOMEWORK_FILE_PATH, { force: true });
  await fs.rm(HOMEWORK_SUBMISSIONS_FILE_PATH, { force: true });
  await fs.rm(STUDENT_PORTAL_ACCESS_FILE, { force: true });
});

const BASE = {
  studentId: "s1",
  title: "Piyano pratiği kaydı",
  description: "Etüt no. 3'ü kaydedip gönder",
  dueDate: "2026-09-01T00:00:00.000Z",
};

const AUDIO_TYPES = ["audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/aac", "audio/wav", "audio/ogg"];

describe("FEATURE B — ödeve ses dosyası eki (öğretmen)", () => {
  it.each(AUDIO_TYPES)("desteklenen ses türü kabul edilir: %s", async (mime) => {
    const fileData = Buffer.from("fake audio bytes").toString("base64");
    const res = await createHomeworkTool(teacherCtx(), {
      ...BASE,
      fileName: `pratik.${mime.split("/")[1]}`,
      fileMimeType: mime,
      fileData,
    });
    expect(res.ok).toBe(true);
  });

  it("desteklenmeyen ses türü reddedilir", async () => {
    const res = await createHomeworkTool(teacherCtx(), {
      ...BASE,
      fileName: "pratik.flac",
      fileMimeType: "audio/flac",
      fileData: Buffer.from("x").toString("base64"),
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VALIDATION_ERROR");
  });

  it("çok büyük ses dosyası (2MB üstü) Türkçe dostça hata ile reddedilir", async () => {
    const big = Buffer.alloc(2_100_000, 1).toString("base64");
    const res = await createHomeworkTool(teacherCtx(), {
      ...BASE,
      fileName: "uzun-kayit.mp3",
      fileMimeType: "audio/mpeg",
      fileData: big,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.message).toContain("büyük");
    expect(res.error.message).not.toContain("8 MB"); // eski yanlış limit metni kalmamalı
  });

  it("ses eki olan ödevi yalnızca sahibi öğrenci indirebilir — başka öğrenciye REDDEDİLİR", async () => {
    const fileData = Buffer.from("fake audio bytes").toString("base64");
    const created = await createHomeworkTool(teacherCtx(), {
      ...BASE,
      fileName: "pratik.mp3",
      fileMimeType: "audio/mpeg",
      fileData,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await grantStudentAccess({ tenantId: DEFAULT_TENANT_ID, userId: "u2" }, "s1");
    const list = await listHomeworkForStudentTool(studentCtx({ studentId: "s1" }), { studentId: "s1" });
    expect(list.ok).toBe(true);
    if (list.ok) expect(list.data.homework[0]!.fileMimeType).toBe("audio/mpeg");

    const ownFile = await getHomeworkFileTool(studentCtx({ studentId: "s1" }), { homeworkId: created.data.homeworkId });
    expect(ownFile.ok).toBe(true);
    if (ownFile.ok) {
      expect(ownFile.data.fileData).toBe(fileData);
      expect(ownFile.data.fileMimeType).toBe("audio/mpeg");
    }

    const otherFile = await getHomeworkFileTool(studentCtx({ userId: "u5", studentId: "s2" }), {
      homeworkId: created.data.homeworkId,
    });
    expect(otherFile.ok).toBe(false);
  });

  it("yalnızca TEACHER ses ekli ödev oluşturabilir (RBAC)", async () => {
    const res = await createHomeworkTool(studentCtx(), {
      ...BASE,
      fileName: "pratik.mp3",
      fileMimeType: "audio/mpeg",
      fileData: Buffer.from("x").toString("base64"),
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("FORBIDDEN");
  });
});

describe("FEATURE B — ödev teslimine ses dosyası eki (öğrenci)", () => {
  it("öğrenci ses kaydıyla teslim yükleyebilir, öğretmen indirebilir", async () => {
    const created = await createHomeworkTool(teacherCtx(), BASE);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    // Yalnızca SELF (öğrencinin kendisi) teslim yükleyebilir — GUARDIAN reddedilir (mevcut kural, korunur).
    await grantStudentAccess({ tenantId: DEFAULT_TENANT_ID, userId: "u2" }, "s1", "SELF");
    const fileData = Buffer.from("fake practice recording").toString("base64");
    const submitted = await submitHomeworkTool(studentCtx({ studentId: "s1" }), {
      homeworkId: created.data.homeworkId,
      fileName: "cevabim.wav",
      fileMimeType: "audio/wav",
      fileData,
    });
    expect(submitted.ok).toBe(true);
    if (!submitted.ok) return;

    const file = await getHomeworkSubmissionFileTool(teacherCtx(), { submissionId: submitted.data.submissionId });
    expect(file.ok).toBe(true);
    if (file.ok) {
      expect(file.data.fileMimeType).toBe("audio/wav");
      expect(file.data.fileData).toBe(fileData);
    }
  });

  it("desteklenmeyen tür ile teslim reddedilir", async () => {
    const created = await createHomeworkTool(teacherCtx(), BASE);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await grantStudentAccess({ tenantId: DEFAULT_TENANT_ID, userId: "u2" }, "s1", "SELF");
    const res = await submitHomeworkTool(studentCtx({ studentId: "s1" }), {
      homeworkId: created.data.homeworkId,
      fileName: "x.exe",
      fileMimeType: "application/x-msdownload",
      fileData: Buffer.from("x").toString("base64"),
    });
    expect(res.ok).toBe(false);
  });
});

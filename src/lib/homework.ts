/**
 * EPIC 6B (IMPLEMENTATION_PLAN.md) — ödev + teslim store katmanı.
 * STORE_MODE=db  → Prisma Homework/HomeworkSubmission (kalıcı, production)
 * STORE_MODE=json/memory → dosya tabanlı store (demo)
 * Aynı desen: src/lib/announcements/index.ts, src/lib/assessment/index.ts.
 *
 * Dosya erişimi: `fileData` (base64) yalnızca `getSubmission`/`getMaterial`
 * (dosya indirme rotaları) ile döner; liste/özet fonksiyonları `hasFile`
 * bayrağı taşır ama gövdeyi taşımaz — gereksiz büyük payload'ları önler.
 */

import path from "path";
import { isDbMode, resolveDataDir } from "./config";
import { uid } from "./utils";
import type {
  Homework as DbHomework,
  HomeworkSubmission as DbHomeworkSubmission,
} from "@prisma/client";
import type { Homework, HomeworkSubmission } from "./types";
import { cache } from "react";

/**
 * Kota (2026-10-14, docs/performance/QUOTA_AUDIT_2026_10_12.md): liste sorguları base64 dosya gövdesini DB'den hiç
 * okumaz; "dosya var" göstergesi dosya adından türetilir (her yükleme formu ad + tür + içeriği birlikte gönderir).
 * Dosya içeriği yalnız tekil okuma (getHomework / getSubmission) ile gelir.
 */
const LIST_OMIT = { fileData: true } as const;
type ListRow<T extends { fileData: string | null }> = Omit<T, "fileData"> & { fileData?: string | null };

const HOMEWORK_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "homework.json");
const SUBMISSIONS_FILE = path.join(
  resolveDataDir(path.join(process.cwd(), "data")),
  "homework-submissions.json"
);

export const HOMEWORK_FILE_PATH = HOMEWORK_FILE;
export const HOMEWORK_SUBMISSIONS_FILE_PATH = SUBMISSIONS_FILE;

type StoredHomework = Homework & { tenantId: string };
type StoredSubmission = HomeworkSubmission & { tenantId: string };

async function loadHomework(): Promise<StoredHomework[]> {
  try {
    const fs = await import("fs/promises");
    const raw = await fs.readFile(HOMEWORK_FILE, "utf8");
    return JSON.parse(raw) as StoredHomework[];
  } catch {
    return [];
  }
}

async function saveHomework(rows: StoredHomework[]): Promise<void> {
  const fs = await import("fs/promises");
  await fs.mkdir(path.dirname(HOMEWORK_FILE), { recursive: true });
  await fs.writeFile(HOMEWORK_FILE, JSON.stringify(rows, null, 2));
}

async function loadSubmissions(): Promise<StoredSubmission[]> {
  try {
    const fs = await import("fs/promises");
    const raw = await fs.readFile(SUBMISSIONS_FILE, "utf8");
    return JSON.parse(raw) as StoredSubmission[];
  } catch {
    return [];
  }
}

async function saveSubmissions(rows: StoredSubmission[]): Promise<void> {
  const fs = await import("fs/promises");
  await fs.mkdir(path.dirname(SUBMISSIONS_FILE), { recursive: true });
  await fs.writeFile(SUBMISSIONS_FILE, JSON.stringify(rows, null, 2));
}

function mapDbHomework(h: ListRow<DbHomework>): StoredHomework {
  return {
    id: h.id,
    tenantId: h.tenantId,
    teacherId: h.teacherId,
    studentId: h.studentId,
    lessonId: h.lessonId ?? undefined,
    title: h.title,
    description: h.description,
    dueDate: h.dueDate.toISOString(),
    createdAt: h.createdAt.toISOString(),
    updatedAt: h.updatedAt.toISOString(),
    fileName: h.fileName ?? undefined,
    fileMimeType: h.fileMimeType ?? undefined,
    fileData: h.fileData ?? undefined,
  };
}

/** `fileData` HARİÇ (yalnızca "dosya var mı" göstergesi "1") — liste görünümleri için. */
function toPublicHomeworkSummary(h: StoredHomework): Homework {
  return {
    id: h.id,
    teacherId: h.teacherId,
    studentId: h.studentId,
    lessonId: h.lessonId,
    title: h.title,
    description: h.description,
    dueDate: h.dueDate,
    createdAt: h.createdAt,
    updatedAt: h.updatedAt,
    fileName: h.fileName,
    fileMimeType: h.fileMimeType,
    fileData: h.fileData || h.fileName ? "1" : undefined,
  };
}

/** Tam sürüm (fileData dahil) — yalnız `getHomework` (tek kayıt) ve dosya indirme yolunda kullanılır. */
function toPublicHomework(h: StoredHomework): Homework {
  return {
    id: h.id,
    teacherId: h.teacherId,
    studentId: h.studentId,
    lessonId: h.lessonId,
    title: h.title,
    description: h.description,
    dueDate: h.dueDate,
    createdAt: h.createdAt,
    updatedAt: h.updatedAt,
    fileName: h.fileName,
    fileMimeType: h.fileMimeType,
    fileData: h.fileData,
  };
}

function mapDbSubmission(s: ListRow<DbHomeworkSubmission>): StoredSubmission {
  return {
    id: s.id,
    tenantId: s.tenantId,
    homeworkId: s.homeworkId,
    studentId: s.studentId,
    note: s.note ?? undefined,
    fileName: s.fileName ?? undefined,
    fileMimeType: s.fileMimeType ?? undefined,
    fileData: s.fileData ?? undefined,
    submittedAt: s.submittedAt.toISOString(),
    teacherFeedback: s.teacherFeedback ?? undefined,
    reviewedAt: s.reviewedAt ? s.reviewedAt.toISOString() : undefined,
  };
}

/** `fileData` HARİÇ — liste görünümleri için (yalnızca "dosya var mı" göstergesi). */
function toPublicSubmissionSummary(s: StoredSubmission): HomeworkSubmission {
  return {
    id: s.id,
    homeworkId: s.homeworkId,
    studentId: s.studentId,
    note: s.note,
    fileName: s.fileName,
    fileMimeType: s.fileMimeType,
    fileData: s.fileData || s.fileName ? "1" : undefined,
    submittedAt: s.submittedAt,
    teacherFeedback: s.teacherFeedback,
    reviewedAt: s.reviewedAt,
  };
}

function toPublicSubmissionFull(s: StoredSubmission): HomeworkSubmission {
  return {
    id: s.id,
    homeworkId: s.homeworkId,
    studentId: s.studentId,
    note: s.note,
    fileName: s.fileName,
    fileMimeType: s.fileMimeType,
    fileData: s.fileData,
    submittedAt: s.submittedAt,
    teacherFeedback: s.teacherFeedback,
    reviewedAt: s.reviewedAt,
  };
}

export type CreateHomeworkInput = {
  tenantId: string;
  teacherId: string;
  studentId: string;
  /** Faz 3C — bu ödevin verildiği ders (opsiyonel). */
  lessonId?: string;
  title: string;
  description: string;
  dueDate: string;
  fileName?: string;
  fileMimeType?: string;
  fileData?: string;
};

async function createHomeworkDb(input: CreateHomeworkInput): Promise<Homework> {
  const { prisma } = await import("./db");
  const row = await prisma.homework.create({
    data: {
      id: uid("hw"),
      tenantId: input.tenantId,
      teacherId: input.teacherId,
      studentId: input.studentId,
      lessonId: input.lessonId ?? null,
      title: input.title,
      description: input.description,
      dueDate: new Date(input.dueDate),
      fileName: input.fileName ?? null,
      fileMimeType: input.fileMimeType ?? null,
      fileData: input.fileData ?? null,
    },
  });
  return toPublicHomework(mapDbHomework(row));
}

export async function createHomework(input: CreateHomeworkInput): Promise<Homework> {
  if (isDbMode) return createHomeworkDb(input);
  const all = await loadHomework();
  const now = new Date().toISOString();
  const record: StoredHomework = {
    id: uid("hw"),
    tenantId: input.tenantId,
    teacherId: input.teacherId,
    studentId: input.studentId,
    lessonId: input.lessonId,
    title: input.title,
    description: input.description,
    dueDate: input.dueDate,
    createdAt: now,
    updatedAt: now,
    fileName: input.fileName,
    fileMimeType: input.fileMimeType,
    fileData: input.fileData,
  };
  await saveHomework([...all, record]);
  return toPublicHomework(record);
}

async function listForStudentDb(tenantId: string, studentId: string): Promise<Homework[]> {
  const { prisma } = await import("./db");
  const rows = await prisma.homework.findMany({
    where: { tenantId, studentId },
    orderBy: { dueDate: "asc" },
    omit: LIST_OMIT,
  });
  return rows.map((r) => toPublicHomeworkSummary(mapDbHomework(r)));
}

export async function listHomeworkForStudent(tenantId: string, studentId: string): Promise<Homework[]> {
  if (isDbMode) return listForStudentDb(tenantId, studentId);
  const all = await loadHomework();
  return all
    .filter((h) => h.tenantId === tenantId && h.studentId === studentId)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .map(toPublicHomeworkSummary);
}

async function listForTeacherDb(tenantId: string, teacherId: string): Promise<Homework[]> {
  const { prisma } = await import("./db");
  const rows = await prisma.homework.findMany({
    where: { tenantId, teacherId },
    orderBy: { dueDate: "desc" },
    omit: LIST_OMIT,
  });
  return rows.map((r) => toPublicHomeworkSummary(mapDbHomework(r)));
}

export async function listHomeworkForTeacher(tenantId: string, teacherId: string): Promise<Homework[]> {
  if (isDbMode) return listForTeacherDb(tenantId, teacherId);
  const all = await loadHomework();
  return all
    .filter((h) => h.tenantId === tenantId && h.teacherId === teacherId)
    .sort((a, b) => b.dueDate.localeCompare(a.dueDate))
    .map(toPublicHomeworkSummary);
}

async function getHomeworkDb(tenantId: string, id: string): Promise<Homework | null> {
  const { prisma } = await import("./db");
  const row = await prisma.homework.findFirst({ where: { id, tenantId } });
  return row ? toPublicHomework(mapDbHomework(row)) : null;
}

export async function getHomework(tenantId: string, id: string): Promise<Homework | null> {
  if (isDbMode) return getHomeworkDb(tenantId, id);
  const all = await loadHomework();
  const found = all.find((h) => h.id === id && h.tenantId === tenantId);
  return found ? toPublicHomework(found) : null;
}

async function updateHomeworkDueDateDb(tenantId: string, id: string, dueDate: string): Promise<Homework | null> {
  const { prisma } = await import("./db");
  const existing = await prisma.homework.findFirst({ where: { id, tenantId } });
  if (!existing) return null;
  const row = await prisma.homework.update({ where: { id }, data: { dueDate: new Date(dueDate) } });
  return toPublicHomework(mapDbHomework(row));
}

/** FEATURE C — teslim/derecelendirme verisi ve `createdAt` KORUNUR, yalnızca `dueDate` değişir. */
export async function updateHomeworkDueDate(tenantId: string, id: string, dueDate: string): Promise<Homework | null> {
  if (isDbMode) return updateHomeworkDueDateDb(tenantId, id, dueDate);
  const all = await loadHomework();
  const idx = all.findIndex((h) => h.id === id && h.tenantId === tenantId);
  if (idx === -1) return null;
  const updated: StoredHomework = { ...all[idx], dueDate, updatedAt: new Date().toISOString() };
  const next = [...all];
  next[idx] = updated;
  await saveHomework(next);
  return toPublicHomework(updated);
}

export type SubmitHomeworkInput = {
  tenantId: string;
  homeworkId: string;
  studentId: string;
  note?: string;
  fileName?: string;
  fileMimeType?: string;
  fileData?: string;
};

async function submitHomeworkDb(input: SubmitHomeworkInput): Promise<HomeworkSubmission> {
  const { prisma } = await import("./db");
  const row = await prisma.homeworkSubmission.create({
    data: {
      id: uid("hwsub"),
      tenantId: input.tenantId,
      homeworkId: input.homeworkId,
      studentId: input.studentId,
      note: input.note ?? null,
      fileName: input.fileName ?? null,
      fileMimeType: input.fileMimeType ?? null,
      fileData: input.fileData ?? null,
    },
  });
  return toPublicSubmissionFull(mapDbSubmission(row));
}

export async function submitHomework(input: SubmitHomeworkInput): Promise<HomeworkSubmission> {
  if (isDbMode) return submitHomeworkDb(input);
  const all = await loadSubmissions();
  const record: StoredSubmission = {
    id: uid("hwsub"),
    tenantId: input.tenantId,
    homeworkId: input.homeworkId,
    studentId: input.studentId,
    note: input.note,
    fileName: input.fileName,
    fileMimeType: input.fileMimeType,
    fileData: input.fileData,
    submittedAt: new Date().toISOString(),
  };
  await saveSubmissions([...all, record]);
  return toPublicSubmissionFull(record);
}

async function listSubmissionsDb(tenantId: string, homeworkId: string): Promise<HomeworkSubmission[]> {
  const { prisma } = await import("./db");
  const rows = await prisma.homeworkSubmission.findMany({
    where: { tenantId, homeworkId },
    orderBy: { submittedAt: "desc" },
    omit: LIST_OMIT,
  });
  return rows.map((r) => toPublicSubmissionSummary(mapDbSubmission(r)));
}

/** `fileData` içermez (özet) — dosya için ayrıca getSubmission çağrılmalı. */
export async function listSubmissionsForHomework(
  tenantId: string,
  homeworkId: string
): Promise<HomeworkSubmission[]> {
  if (isDbMode) return listSubmissionsDb(tenantId, homeworkId);
  const all = await loadSubmissions();
  return all
    .filter((s) => s.tenantId === tenantId && s.homeworkId === homeworkId)
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
    .map(toPublicSubmissionSummary);
}

async function getSubmissionDb(tenantId: string, id: string): Promise<StoredSubmission | null> {
  const { prisma } = await import("./db");
  const row = await prisma.homeworkSubmission.findFirst({ where: { id, tenantId } });
  return row ? mapDbSubmission(row) : null;
}

/** `fileData` DAHİL — yalnızca sahiplik kontrolü yapılmış çağrı yollarından kullanılmalı. */
export async function getSubmission(tenantId: string, id: string): Promise<HomeworkSubmission | null> {
  if (isDbMode) {
    const row = await getSubmissionDb(tenantId, id);
    return row ? toPublicSubmissionFull(row) : null;
  }
  const all = await loadSubmissions();
  const found = all.find((s) => s.id === id && s.tenantId === tenantId);
  return found ? toPublicSubmissionFull(found) : null;
}

async function reviewSubmissionDb(
  tenantId: string,
  id: string,
  teacherFeedback: string
): Promise<HomeworkSubmission | null> {
  const { prisma } = await import("./db");
  const result = await prisma.homeworkSubmission.updateMany({
    where: { id, tenantId },
    data: { teacherFeedback, reviewedAt: new Date() },
  });
  if (result.count === 0) return null;
  const row = await prisma.homeworkSubmission.findFirst({ where: { id, tenantId } });
  return row ? toPublicSubmissionFull(mapDbSubmission(row)) : null;
}

/** Öğretmenin bir teslime yazdığı geri bildirim (EPIC 6D). */
export async function reviewSubmission(
  tenantId: string,
  id: string,
  teacherFeedback: string
): Promise<HomeworkSubmission | null> {
  if (isDbMode) return reviewSubmissionDb(tenantId, id, teacherFeedback);
  const all = await loadSubmissions();
  const idx = all.findIndex((s) => s.id === id && s.tenantId === tenantId);
  if (idx === -1) return null;
  const updated: StoredSubmission = {
    ...all[idx],
    teacherFeedback,
    reviewedAt: new Date().toISOString(),
  };
  const next = [...all];
  next[idx] = updated;
  await saveSubmissions(next);
  return toPublicSubmissionFull(updated);
}

async function listAllHomeworkDb(tenantId: string): Promise<Homework[]> {
  const { prisma } = await import("./db");
  const rows = await prisma.homework.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    omit: LIST_OMIT,
  });
  return rows.map((r) => toPublicHomeworkSummary(mapDbHomework(r)));
}

/** EPIC 0/12 (IMPLEMENTATION_PLAN.md son adım) — kurum dışa aktarımı içindir. */
export async function listAllHomework(tenantId: string): Promise<Homework[]> {
  if (isDbMode) return listAllHomeworkDb(tenantId);
  const all = await loadHomework();
  return all
    .filter((h) => h.tenantId === tenantId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(toPublicHomeworkSummary);
}

/** Faz 3C — bu ders için (herhangi bir öğretmen tarafından) zaten ödev verilmiş mi? */
export async function hasHomeworkForLesson(tenantId: string, lessonId: string): Promise<boolean> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    const count = await prisma.homework.count({ where: { tenantId, lessonId } });
    return count > 0;
  }
  const all = await loadHomework();
  return all.some((h) => h.tenantId === tenantId && h.lessonId === lessonId);
}

async function listAllSubmissionsDb(tenantId: string): Promise<HomeworkSubmission[]> {
  const { prisma } = await import("./db");
  const rows = await prisma.homeworkSubmission.findMany({
    where: { tenantId },
    orderBy: { submittedAt: "desc" },
    omit: LIST_OMIT,
  });
  return rows.map((r) => toPublicSubmissionSummary(mapDbSubmission(r)));
}

/**
 * EPIC 0/12 (IMPLEMENTATION_PLAN.md son adım) — kurum dışa aktarımı içindir.
 * `fileData` HARİÇ (özet) — CSV satırına ham base64 gömmek dosyayı
 * kullanışsız şişirir; export yalnızca "dosya var mı" bilgisini taşır.
 */
export const listAllHomeworkSubmissions = cache(async function listAllHomeworkSubmissions(
  tenantId: string
): Promise<HomeworkSubmission[]> {
  // Kota (2026-10-14): React `cache` — Öğretmenler listesi skoru öğretmen BAŞINA hesaplar; aynı sunucu render'ında kurumun
  // teslim listesi tek kez okunur. Render dışı çağrı (API/tool) her seferinde okur. Dönen dizi çağıranlarca değiştirilmez.
  if (isDbMode) return listAllSubmissionsDb(tenantId);
  const all = await loadSubmissions();
  return all
    .filter((s) => s.tenantId === tenantId)
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
    .map(toPublicSubmissionSummary);
});

async function clearHomeworkDb(tenantId: string): Promise<void> {
  const { prisma } = await import("./db");
  await prisma.homework.deleteMany({ where: { tenantId } });
}

/** Demo reset için — tenant'ın tüm ödevlerini (ve teslimlerini, cascade) siler. */
export async function clearHomework(tenantId: string): Promise<void> {
  if (isDbMode) return clearHomeworkDb(tenantId);
  const homework = await loadHomework();
  const idsToRemove = new Set(homework.filter((h) => h.tenantId === tenantId).map((h) => h.id));
  const remainingHomework = homework.filter((h) => h.tenantId !== tenantId);
  if (remainingHomework.length !== homework.length) await saveHomework(remainingHomework);
  if (idsToRemove.size > 0) {
    const submissions = await loadSubmissions();
    const remainingSubmissions = submissions.filter((s) => !idsToRemove.has(s.homeworkId));
    if (remainingSubmissions.length !== submissions.length) await saveSubmissions(remainingSubmissions);
  }
}

/**
 * Karşılıklı Değerlendirmeler sprinti — öğretmenin öğrenciyi
 * yapılandırılmış değerlendirmesi. `teacher-feedback.ts` ile AYNI desen
 * (json/memory dosya ↔ DB Prisma `StudentFeedback`, migration
 * `prisma/migrations/20260815090000_add_student_feedback` — staging'e
 * uygulanmadı, bkz. final rapor).
 *
 * Gizlilik: ham kayıt yalnızca SCHOOL_ADMIN/SUPER_ADMIN ve değerlendirmeyi
 * yazan öğretmenin KENDİSİ (yalnız kendi yazdıkları) için okunur — öğrenci/
 * veli asla görmez (bu sprintte planlı bir gizlilik kararı, TeacherFeedback'in
 * öğretmene kapalı olmasının simetriği).
 *
 * Aynı ay tekrar kuralı: aynı tenant+teacherId+studentId için cari takvim
 * ayında zaten bir kayıt varsa, `submitStudentFeedback` yeni satır YARATMAZ —
 * mevcut kaydı GÜNCELLER (createdAt sabit kalır, updatedAt ilerler).
 */

import path from "path";
import { isDbMode, resolveDataDir } from "./config";
import { uid } from "./utils";
import type { StudentFeedback as DbStudentFeedback } from "@prisma/client";
import type { StudentFeedback, StudentFeedbackCriterionKey, StudentFeedbackStatus } from "./types";

const FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "student-feedback.json");
export const STUDENT_FEEDBACK_FILE_PATH = FILE;

export const STUDENT_FEEDBACK_CRITERIA: { key: StudentFeedbackCriterionKey; label: string }[] = [
  { key: "attendance", label: "Derse katılım" },
  { key: "practice", label: "Pratik ve ödev disiplini" },
  { key: "progress", label: "Gelişim ve performans" },
  { key: "attitude", label: "İletişim ve tutum" },
  { key: "preparedness", label: "Derse hazırlık" },
];

export const STUDENT_FEEDBACK_COMMENT_MAX = 1000;

type StoredFeedback = StudentFeedback & { tenantId: string };

async function loadAll(): Promise<StoredFeedback[]> {
  try {
    const fs = await import("fs/promises");
    const raw = await fs.readFile(FILE, "utf8");
    return JSON.parse(raw) as StoredFeedback[];
  } catch {
    return [];
  }
}

async function saveAll(rows: StoredFeedback[]): Promise<void> {
  const fs = await import("fs/promises");
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(rows, null, 2));
}

function mapDb(f: DbStudentFeedback): StoredFeedback {
  return {
    id: f.id,
    tenantId: f.tenantId,
    teacherId: f.teacherId,
    studentId: f.studentId,
    submittedBy: f.submittedBy,
    scores: f.scores as Record<StudentFeedbackCriterionKey, number>,
    comment: f.comment ?? undefined,
    status: f.status as StudentFeedbackStatus,
    createdAt: f.createdAt.toISOString(),
    updatedAt: f.updatedAt.toISOString(),
  };
}

function toPublic(f: StoredFeedback): StudentFeedback {
  return {
    id: f.id,
    teacherId: f.teacherId,
    studentId: f.studentId,
    submittedBy: f.submittedBy,
    scores: f.scores,
    comment: f.comment,
    status: f.status,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
  };
}

function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export type SubmitStudentFeedbackInput = {
  tenantId: string;
  teacherId: string;
  studentId: string;
  submittedBy: string;
  scores: Record<StudentFeedbackCriterionKey, number>;
  comment?: string;
};

export type SubmitStudentFeedbackResult = { feedback: StudentFeedback; updated: boolean };

async function findThisMonthDb(
  tenantId: string,
  teacherId: string,
  studentId: string,
  now: Date
): Promise<DbStudentFeedback | null> {
  const { prisma } = await import("./db");
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return prisma.studentFeedback.findFirst({
    where: { tenantId, teacherId, studentId, createdAt: { gte: monthStart, lt: nextMonthStart } },
  });
}

async function submitFeedbackDb(
  input: SubmitStudentFeedbackInput,
  now: Date
): Promise<SubmitStudentFeedbackResult> {
  const { prisma } = await import("./db");
  const existing = await findThisMonthDb(input.tenantId, input.teacherId, input.studentId, now);
  if (existing) {
    const row = await prisma.studentFeedback.update({
      where: { id: existing.id },
      data: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        scores: input.scores as any,
        comment: input.comment ?? null,
      },
    });
    return { feedback: toPublic(mapDb(row)), updated: true };
  }
  const row = await prisma.studentFeedback.create({
    data: {
      id: uid("sfb"),
      tenantId: input.tenantId,
      teacherId: input.teacherId,
      studentId: input.studentId,
      submittedBy: input.submittedBy,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      scores: input.scores as any,
      comment: input.comment ?? null,
      status: "pending",
    },
  });
  return { feedback: toPublic(mapDb(row)), updated: false };
}

export async function submitStudentFeedback(
  input: SubmitStudentFeedbackInput,
  now: Date = new Date()
): Promise<SubmitStudentFeedbackResult> {
  if (isDbMode) return submitFeedbackDb(input, now);

  const all = await loadAll();
  const nowIso = now.toISOString();
  const currentMonth = monthKey(nowIso);
  const existingIdx = all.findIndex(
    (f) =>
      f.tenantId === input.tenantId &&
      f.teacherId === input.teacherId &&
      f.studentId === input.studentId &&
      monthKey(f.createdAt) === currentMonth
  );

  if (existingIdx >= 0) {
    const updated: StoredFeedback = {
      ...all[existingIdx]!,
      scores: input.scores,
      comment: input.comment,
      updatedAt: nowIso,
    };
    const next = [...all];
    next[existingIdx] = updated;
    await saveAll(next);
    return { feedback: toPublic(updated), updated: true };
  }

  const record: StoredFeedback = {
    id: uid("sfb"),
    tenantId: input.tenantId,
    teacherId: input.teacherId,
    studentId: input.studentId,
    submittedBy: input.submittedBy,
    scores: input.scores,
    comment: input.comment,
    status: "pending",
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  await saveAll([...all, record]);
  return { feedback: toPublic(record), updated: false };
}

/** Öğretmenin bu öğrenci için cari ayda zaten kaydı var mı — form "Güncelle" moduna geçsin diye. */
export async function findStudentFeedbackThisMonth(
  tenantId: string,
  teacherId: string,
  studentId: string,
  now: Date = new Date()
): Promise<StudentFeedback | null> {
  if (isDbMode) {
    const row = await findThisMonthDb(tenantId, teacherId, studentId, now);
    return row ? toPublic(mapDb(row)) : null;
  }
  const all = await loadAll();
  const currentMonth = monthKey(now.toISOString());
  const found = all.find(
    (f) =>
      f.tenantId === tenantId &&
      f.teacherId === teacherId &&
      f.studentId === studentId &&
      monthKey(f.createdAt) === currentMonth
  );
  return found ? toPublic(found) : null;
}

async function listDb(tenantId: string, filter: { teacherId?: string; studentId?: string }): Promise<StudentFeedback[]> {
  const { prisma } = await import("./db");
  const rows = await prisma.studentFeedback.findMany({
    where: { tenantId, ...(filter.teacherId ? { teacherId: filter.teacherId } : {}), ...(filter.studentId ? { studentId: filter.studentId } : {}) },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => toPublic(mapDb(r)));
}

/** Yönetici (tüm kayıtlar) veya öğretmenin kendi (teacherId zorunlu) görünümü — çağıran tool yetkiyi zaten uygular. */
export async function listStudentFeedback(
  tenantId: string,
  filter: { teacherId?: string; studentId?: string } = {}
): Promise<StudentFeedback[]> {
  if (isDbMode) return listDb(tenantId, filter);
  const all = await loadAll();
  return all
    .filter(
      (f) =>
        f.tenantId === tenantId &&
        (!filter.teacherId || f.teacherId === filter.teacherId) &&
        (!filter.studentId || f.studentId === filter.studentId)
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(toPublic);
}

export async function getStudentFeedbackById(tenantId: string, id: string): Promise<StudentFeedback | null> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    const row = await prisma.studentFeedback.findFirst({ where: { id, tenantId } });
    return row ? toPublic(mapDb(row)) : null;
  }
  const all = await loadAll();
  const found = all.find((f) => f.id === id && f.tenantId === tenantId);
  return found ? toPublic(found) : null;
}

export async function updateStudentFeedbackStatus(
  tenantId: string,
  id: string,
  status: StudentFeedbackStatus
): Promise<StudentFeedback | null> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    const existing = await prisma.studentFeedback.findFirst({ where: { id, tenantId } });
    if (!existing) return null;
    const row = await prisma.studentFeedback.update({ where: { id }, data: { status } });
    return toPublic(mapDb(row));
  }
  const all = await loadAll();
  const idx = all.findIndex((f) => f.id === id && f.tenantId === tenantId);
  if (idx < 0) return null;
  const updated: StoredFeedback = { ...all[idx]!, status, updatedAt: new Date().toISOString() };
  const next = [...all];
  next[idx] = updated;
  await saveAll(next);
  return toPublic(updated);
}

async function clearFeedbackDb(tenantId: string): Promise<void> {
  const { prisma } = await import("./db");
  await prisma.studentFeedback.deleteMany({ where: { tenantId } });
}

/** Demo reset için — tenant'ın tüm öğrenci değerlendirmelerini siler. */
export async function clearStudentFeedback(tenantId: string): Promise<void> {
  if (isDbMode) return clearFeedbackDb(tenantId);
  const all = await loadAll();
  const remaining = all.filter((f) => f.tenantId !== tenantId);
  if (remaining.length !== all.length) await saveAll(remaining);
}

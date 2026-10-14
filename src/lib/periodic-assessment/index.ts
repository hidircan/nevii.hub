/**
 * Faz 3B — dört haftalık genel gelişim değerlendirmesi store katmanı. Aynı
 * desen: src/lib/assessment/index.ts (STORE_MODE=db → Prisma, json/memory →
 * dosya tabanlı store). Bu modül YALNIZCA gönderilmiş (submitted) kayıtları
 * saklar — "bekliyor" hesaplaması `computePendingPeriodicAssessmentPeriods`
 * (bu dosyanın altında, saf/I-O'suz) fonksiyonuyla YAPILIR, hiçbir yerde
 * kalıcı kılınmaz.
 */

import path from "path";
import { isDbMode, resolveDataDir } from "../config";
import { uid } from "../utils";
import type { PeriodicAssessment as DbPeriodicAssessment } from "@prisma/client";
import type { PeriodicAssessment, Student } from "../types";

const FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "periodic-assessments.json");
export const PERIODIC_ASSESSMENTS_FILE = FILE;

type StoredPeriodicAssessment = PeriodicAssessment & { tenantId: string };

async function loadAll(): Promise<StoredPeriodicAssessment[]> {
  try {
    const fs = await import("fs/promises");
    const raw = await fs.readFile(FILE, "utf8");
    return JSON.parse(raw) as StoredPeriodicAssessment[];
  } catch {
    return [];
  }
}

async function saveAll(rows: StoredPeriodicAssessment[]): Promise<void> {
  const fs = await import("fs/promises");
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(rows, null, 2));
}

function mapDb(a: DbPeriodicAssessment): StoredPeriodicAssessment {
  return {
    id: a.id,
    tenantId: a.tenantId,
    studentId: a.studentId,
    teacherId: a.teacherId,
    periodStart: a.periodStart.toISOString(),
    periodEnd: a.periodEnd.toISOString(),
    relatedLessonIds: (a.relatedLessonIds as string[]) ?? [],
    overallProgressNote: a.overallProgressNote,
    strengthsNote: a.strengthsNote ?? undefined,
    areasForImprovementNote: a.areasForImprovementNote ?? undefined,
    recommendationNote: a.recommendationNote ?? undefined,
    submittedBy: a.submittedBy,
    submittedAt: a.submittedAt.toISOString(),
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

function toPublic(a: StoredPeriodicAssessment): PeriodicAssessment {
  const { tenantId: _t, ...pub } = a;
  void _t;
  return pub;
}

export type CreatePeriodicAssessmentInput = {
  tenantId: string;
  studentId: string;
  teacherId: string;
  periodStart: string;
  periodEnd: string;
  relatedLessonIds: string[];
  overallProgressNote: string;
  strengthsNote?: string;
  areasForImprovementNote?: string;
  recommendationNote?: string;
  submittedBy: string;
};

export type CreatePeriodicAssessmentResult =
  | { ok: true; assessment: PeriodicAssessment }
  | { ok: false; code: "ALREADY_SUBMITTED"; message: string };

async function createDb(input: CreatePeriodicAssessmentInput): Promise<CreatePeriodicAssessmentResult> {
  const { prisma } = await import("../db");
  const existing = await prisma.periodicAssessment.findFirst({
    where: {
      tenantId: input.tenantId,
      studentId: input.studentId,
      teacherId: input.teacherId,
      periodStart: new Date(input.periodStart),
      periodEnd: new Date(input.periodEnd),
    },
  });
  if (existing) {
    return { ok: false, code: "ALREADY_SUBMITTED", message: "Bu dönem için değerlendirme zaten gönderilmiş." };
  }
  const row = await prisma.periodicAssessment.create({
    data: {
      id: uid("pass"),
      tenantId: input.tenantId,
      studentId: input.studentId,
      teacherId: input.teacherId,
      periodStart: new Date(input.periodStart),
      periodEnd: new Date(input.periodEnd),
      relatedLessonIds: input.relatedLessonIds,
      overallProgressNote: input.overallProgressNote,
      strengthsNote: input.strengthsNote ?? null,
      areasForImprovementNote: input.areasForImprovementNote ?? null,
      recommendationNote: input.recommendationNote ?? null,
      submittedBy: input.submittedBy,
    },
  });
  return { ok: true, assessment: toPublic(mapDb(row)) };
}

/**
 * Aynı öğrenci+öğretmen+dönem için İKİNCİ kez çağrılırsa `ALREADY_SUBMITTED`
 * döner (DB modda `@@unique` ile de garanti altına alınır — bu kontrol
 * json/memory modda AYNI garantiyi sağlar).
 */
export async function createPeriodicAssessment(
  input: CreatePeriodicAssessmentInput
): Promise<CreatePeriodicAssessmentResult> {
  if (isDbMode) return createDb(input);
  const all = await loadAll();
  const exists = all.some(
    (a) =>
      a.tenantId === input.tenantId &&
      a.studentId === input.studentId &&
      a.teacherId === input.teacherId &&
      a.periodStart === input.periodStart &&
      a.periodEnd === input.periodEnd
  );
  if (exists) {
    return { ok: false, code: "ALREADY_SUBMITTED", message: "Bu dönem için değerlendirme zaten gönderilmiş." };
  }
  const now = new Date().toISOString();
  const record: StoredPeriodicAssessment = {
    id: uid("pass"),
    tenantId: input.tenantId,
    studentId: input.studentId,
    teacherId: input.teacherId,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    relatedLessonIds: input.relatedLessonIds,
    overallProgressNote: input.overallProgressNote,
    strengthsNote: input.strengthsNote,
    areasForImprovementNote: input.areasForImprovementNote,
    recommendationNote: input.recommendationNote,
    submittedBy: input.submittedBy,
    submittedAt: now,
    createdAt: now,
    updatedAt: now,
  };
  await saveAll([...all, record]);
  return { ok: true, assessment: toPublic(record) };
}

export async function listPeriodicAssessmentsForStudent(
  tenantId: string,
  studentId: string
): Promise<PeriodicAssessment[]> {
  if (isDbMode) {
    const { prisma } = await import("../db");
    const rows = await prisma.periodicAssessment.findMany({
      where: { tenantId, studentId },
      orderBy: { periodStart: "desc" },
    });
    return rows.map((r) => toPublic(mapDb(r)));
  }
  const all = await loadAll();
  return all
    .filter((a) => a.tenantId === tenantId && a.studentId === studentId)
    .sort((a, b) => b.periodStart.localeCompare(a.periodStart))
    .map(toPublic);
}

export async function listPeriodicAssessmentsForTeacher(
  tenantId: string,
  teacherId: string
): Promise<PeriodicAssessment[]> {
  if (isDbMode) {
    const { prisma } = await import("../db");
    const rows = await prisma.periodicAssessment.findMany({
      where: { tenantId, teacherId },
      orderBy: { periodStart: "desc" },
    });
    return rows.map((r) => toPublic(mapDb(r)));
  }
  const all = await loadAll();
  return all
    .filter((a) => a.tenantId === tenantId && a.teacherId === teacherId)
    .sort((a, b) => b.periodStart.localeCompare(a.periodStart))
    .map(toPublic);
}

export async function listPeriodicAssessmentsPage(
  tenantId: string,
  f: import("../assessment").ReportPageFilter
): Promise<{ rows: PeriodicAssessment[]; total: number }> {
  const skip = Math.max(0, (f.page - 1) * f.pageSize);
  if (isDbMode) {
    const { prisma } = await import("../db");
    const where = {
      tenantId,
      ...(f.teacherId ? { teacherId: f.teacherId } : {}),
      ...(f.studentId ? { studentId: f.studentId } : {}),
      submittedAt: { gte: new Date(f.fromIso), lte: new Date(f.toIso) },
    };
    const [rows, total] = await Promise.all([
      prisma.periodicAssessment.findMany({ where, orderBy: { submittedAt: "desc" }, skip, take: f.pageSize }),
      prisma.periodicAssessment.count({ where }),
    ]);
    return { rows: rows.map((r) => toPublic(mapDb(r))), total };
  }
  const all = (await loadAll())
    .filter(
      (a) =>
        a.tenantId === tenantId &&
        (!f.teacherId || a.teacherId === f.teacherId) &&
        (!f.studentId || a.studentId === f.studentId) &&
        a.submittedAt >= f.fromIso &&
        a.submittedAt <= f.toIso
    )
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  return { rows: all.slice(skip, skip + f.pageSize).map(toPublic), total: all.length };
}

/** Demo reset için — tenant'ın tüm dönemsel değerlendirmelerini siler. */
export async function clearPeriodicAssessments(tenantId: string): Promise<void> {
  if (isDbMode) {
    const { prisma } = await import("../db");
    await prisma.periodicAssessment.deleteMany({ where: { tenantId } });
    return;
  }
  const all = await loadAll();
  const remaining = all.filter((a) => a.tenantId !== tenantId);
  if (remaining.length !== all.length) await saveAll(remaining);
}

const PERIOD_DAYS = 28;

export type PendingPeriod = { periodStart: string; periodEnd: string };

/**
 * Saf fonksiyon (I/O yok) — bir öğrencinin ilk ders tarihinden (yoksa kayıt
 * tarihinden) başlayarak TAMAMLANMIŞ (periodEnd <= now) 4 haftalık dönemleri
 * türetir, `submittedPeriods`'ta OLMAYANLARI "bekliyor" olarak döner.
 * Öğrencinin ilk ders tarihi hiç yoksa (henüz hiç dersi olmamış) boş dizi
 * döner — bekleyen bir değerlendirme YOKTUR.
 */
export function computePendingPeriodicAssessmentPeriods(
  student: Pick<Student, "firstLessonAt" | "enrollmentStartDate">,
  submittedPeriods: PendingPeriod[],
  now: Date = new Date()
): PendingPeriod[] {
  const anchor = student.firstLessonAt ?? student.enrollmentStartDate;
  if (!anchor) return [];

  const anchorDate = new Date(anchor);
  if (Number.isNaN(anchorDate.getTime())) return [];

  const submittedKeys = new Set(submittedPeriods.map((p) => `${p.periodStart}:${p.periodEnd}`));
  const pending: PendingPeriod[] = [];

  let periodStart = new Date(anchorDate);
  while (true) {
    const periodEnd = new Date(periodStart.getTime() + (PERIOD_DAYS - 1) * 24 * 60 * 60 * 1000);
    if (periodEnd > now) break;
    const key = `${periodStart.toISOString()}:${periodEnd.toISOString()}`;
    if (!submittedKeys.has(key)) {
      pending.push({ periodStart: periodStart.toISOString(), periodEnd: periodEnd.toISOString() });
    }
    periodStart = new Date(periodStart.getTime() + PERIOD_DAYS * 24 * 60 * 60 * 1000);
  }

  return pending;
}

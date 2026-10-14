/**
 * EPIC 7 (IMPLEMENTATION_PLAN.md) — öğretmen gelişim değerlendirme store
 * katmanı. STORE_MODE=db → Prisma LessonAssessment (kalıcı, production).
 * STORE_MODE=json/memory → dosya tabanlı store (demo). Aynı desen:
 * src/lib/announcements/index.ts, src/lib/notifications/index.ts.
 */

import path from "path";
import { isDbMode, resolveDataDir } from "../config";
import { uid } from "../utils";
import type { LessonAssessment as DbLessonAssessment } from "@prisma/client";
import type { AssessmentScores, LessonAssessment } from "../types";

const FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "lesson-assessments.json");

/** Resolved store path — exposed so tests clean up the same file this module writes. */
export const LESSON_ASSESSMENTS_FILE = FILE;

type StoredAssessment = LessonAssessment & { tenantId: string };

async function loadAll(): Promise<StoredAssessment[]> {
  try {
    const fs = await import("fs/promises");
    const raw = await fs.readFile(FILE, "utf8");
    return JSON.parse(raw) as StoredAssessment[];
  } catch {
    return [];
  }
}

async function saveAll(rows: StoredAssessment[]): Promise<void> {
  const fs = await import("fs/promises");
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(rows, null, 2));
}

function mapDbAssessment(a: DbLessonAssessment): StoredAssessment {
  return {
    id: a.id,
    tenantId: a.tenantId,
    lessonId: a.lessonId,
    studentId: a.studentId,
    teacherId: a.teacherId,
    teknikBecerisi: a.teknikBecerisi,
    notaOkuma: a.notaOkuma,
    muzikalite: a.muzikalite,
    ritimDuyusu: a.ritimDuyusu,
    calismaDuzeni: a.calismaDuzeni,
    evOdeviTamamlama: a.evOdeviTamamlama,
    dersKatilimi: a.dersKatilimi,
    motivasyon: a.motivasyon,
    genelIlerleme: a.genelIlerleme,
    hedefeUlasma: a.hedefeUlasma,
    piecesWorked: a.piecesWorked ?? undefined,
    etudesWorked: a.etudesWorked ?? undefined,
    technicalWork: a.technicalWork ?? undefined,
    theoryWork: a.theoryWork ?? undefined,
    strengthNote: a.strengthNote,
    nextStepsNote: a.nextStepsNote,
    improvementNote: a.improvementNote,
    parentPrivateNote: a.parentPrivateNote ?? undefined,
    parentNoteVisibleToStudent: a.parentNoteVisibleToStudent,
    teacherSignedName: a.teacherSignedName,
    teacherSignedAt: a.teacherSignedAt.toISOString(),
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

function toPublicAssessment(a: StoredAssessment): LessonAssessment {
  return {
    id: a.id,
    lessonId: a.lessonId,
    studentId: a.studentId,
    teacherId: a.teacherId,
    teknikBecerisi: a.teknikBecerisi,
    notaOkuma: a.notaOkuma,
    muzikalite: a.muzikalite,
    ritimDuyusu: a.ritimDuyusu,
    calismaDuzeni: a.calismaDuzeni,
    evOdeviTamamlama: a.evOdeviTamamlama,
    dersKatilimi: a.dersKatilimi,
    motivasyon: a.motivasyon,
    genelIlerleme: a.genelIlerleme,
    hedefeUlasma: a.hedefeUlasma,
    piecesWorked: a.piecesWorked,
    etudesWorked: a.etudesWorked,
    technicalWork: a.technicalWork,
    theoryWork: a.theoryWork,
    strengthNote: a.strengthNote,
    nextStepsNote: a.nextStepsNote,
    improvementNote: a.improvementNote,
    parentPrivateNote: a.parentPrivateNote,
    parentNoteVisibleToStudent: a.parentNoteVisibleToStudent,
    teacherSignedName: a.teacherSignedName,
    teacherSignedAt: a.teacherSignedAt,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

export type CreateAssessmentInput = AssessmentScores & {
  tenantId: string;
  lessonId: string;
  studentId: string;
  teacherId: string;
  /** Faz 3A — "çalışılan konular", hepsi opsiyonel. */
  piecesWorked?: string;
  etudesWorked?: string;
  technicalWork?: string;
  theoryWork?: string;
  strengthNote: string;
  nextStepsNote: string;
  improvementNote: string;
  parentPrivateNote?: string;
  parentNoteVisibleToStudent?: boolean;
  teacherSignedName: string;
};

async function createAssessmentDb(input: CreateAssessmentInput): Promise<LessonAssessment> {
  const { prisma } = await import("../db");
  const row = await prisma.lessonAssessment.create({
    data: {
      id: uid("assess"),
      tenantId: input.tenantId,
      lessonId: input.lessonId,
      studentId: input.studentId,
      teacherId: input.teacherId,
      teknikBecerisi: input.teknikBecerisi,
      notaOkuma: input.notaOkuma,
      muzikalite: input.muzikalite,
      ritimDuyusu: input.ritimDuyusu,
      calismaDuzeni: input.calismaDuzeni,
      evOdeviTamamlama: input.evOdeviTamamlama,
      dersKatilimi: input.dersKatilimi,
      motivasyon: input.motivasyon,
      genelIlerleme: input.genelIlerleme,
      hedefeUlasma: input.hedefeUlasma,
      piecesWorked: input.piecesWorked ?? null,
      etudesWorked: input.etudesWorked ?? null,
      technicalWork: input.technicalWork ?? null,
      theoryWork: input.theoryWork ?? null,
      strengthNote: input.strengthNote,
      nextStepsNote: input.nextStepsNote,
      improvementNote: input.improvementNote,
      parentPrivateNote: input.parentPrivateNote ?? null,
      parentNoteVisibleToStudent: input.parentNoteVisibleToStudent ?? false,
      teacherSignedName: input.teacherSignedName,
      teacherSignedAt: new Date(),
    },
  });
  return toPublicAssessment(mapDbAssessment(row));
}

/** teacherSignedAt her zaman SUNUCU saatiyle damgalanır — client'tan gelen tarihe güvenilmez. */
export async function createAssessment(input: CreateAssessmentInput): Promise<LessonAssessment> {
  if (isDbMode) return createAssessmentDb(input);
  const all = await loadAll();
  const now = new Date().toISOString();
  const record: StoredAssessment = {
    id: uid("assess"),
    tenantId: input.tenantId,
    lessonId: input.lessonId,
    studentId: input.studentId,
    teacherId: input.teacherId,
    teknikBecerisi: input.teknikBecerisi,
    notaOkuma: input.notaOkuma,
    muzikalite: input.muzikalite,
    ritimDuyusu: input.ritimDuyusu,
    calismaDuzeni: input.calismaDuzeni,
    evOdeviTamamlama: input.evOdeviTamamlama,
    dersKatilimi: input.dersKatilimi,
    motivasyon: input.motivasyon,
    genelIlerleme: input.genelIlerleme,
    hedefeUlasma: input.hedefeUlasma,
    piecesWorked: input.piecesWorked,
    etudesWorked: input.etudesWorked,
    technicalWork: input.technicalWork,
    theoryWork: input.theoryWork,
    strengthNote: input.strengthNote,
    nextStepsNote: input.nextStepsNote,
    improvementNote: input.improvementNote,
    parentPrivateNote: input.parentPrivateNote,
    parentNoteVisibleToStudent: input.parentNoteVisibleToStudent ?? false,
    teacherSignedName: input.teacherSignedName,
    teacherSignedAt: now,
    createdAt: now,
    updatedAt: now,
  };
  await saveAll([...all, record]);
  return toPublicAssessment(record);
}

async function listAssessmentsForStudentDb(
  tenantId: string,
  studentId: string
): Promise<LessonAssessment[]> {
  const { prisma } = await import("../db");
  const rows = await prisma.lessonAssessment.findMany({
    where: { tenantId, studentId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => toPublicAssessment(mapDbAssessment(r)));
}

export async function listAssessmentsForStudent(
  tenantId: string,
  studentId: string
): Promise<LessonAssessment[]> {
  if (isDbMode) return listAssessmentsForStudentDb(tenantId, studentId);
  const all = await loadAll();
  return all
    .filter((a) => a.tenantId === tenantId && a.studentId === studentId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(toPublicAssessment);
}

async function getAssessmentDb(tenantId: string, id: string): Promise<LessonAssessment | null> {
  const { prisma } = await import("../db");
  const row = await prisma.lessonAssessment.findFirst({ where: { id, tenantId } });
  return row ? toPublicAssessment(mapDbAssessment(row)) : null;
}

export async function getAssessment(tenantId: string, id: string): Promise<LessonAssessment | null> {
  if (isDbMode) return getAssessmentDb(tenantId, id);
  const all = await loadAll();
  const found = all.find((a) => a.id === id && a.tenantId === tenantId);
  return found ? toPublicAssessment(found) : null;
}

/** Rapor portalı (2026-10-14): verilen derslerden raporu YAZILMIŞ olanlar — yalnız `lessonId` okunur (bekleyen hesabı). */
export async function listAssessedLessonIds(tenantId: string, lessonIds: string[]): Promise<Set<string>> {
  if (lessonIds.length === 0) return new Set();
  if (isDbMode) {
    const { prisma } = await import("../db");
    const rows = await prisma.lessonAssessment.findMany({
      where: { tenantId, lessonId: { in: lessonIds } },
      select: { lessonId: true },
    });
    return new Set(rows.map((r) => r.lessonId));
  }
  const wanted = new Set(lessonIds);
  return new Set((await loadAll()).filter((a) => a.tenantId === tenantId && wanted.has(a.lessonId)).map((a) => a.lessonId));
}

async function listAllAssessmentsDb(tenantId: string): Promise<LessonAssessment[]> {
  const { prisma } = await import("../db");
  const rows = await prisma.lessonAssessment.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => toPublicAssessment(mapDbAssessment(r)));
}

/** EPIC 0/12 (IMPLEMENTATION_PLAN.md son adım) — kurum dışa aktarımı içindir. */
export async function listAllAssessments(tenantId: string): Promise<LessonAssessment[]> {
  if (isDbMode) return listAllAssessmentsDb(tenantId);
  const all = await loadAll();
  return all
    .filter((a) => a.tenantId === tenantId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(toPublicAssessment);
}

async function clearAssessmentsDb(tenantId: string): Promise<void> {
  const { prisma } = await import("../db");
  await prisma.lessonAssessment.deleteMany({ where: { tenantId } });
}

/** Demo reset için — tenant'ın tüm değerlendirmelerini siler. */
export async function clearAssessments(tenantId: string): Promise<void> {
  if (isDbMode) return clearAssessmentsDb(tenantId);
  const all = await loadAll();
  const remaining = all.filter((a) => a.tenantId !== tenantId);
  if (remaining.length !== all.length) await saveAll(remaining);
}

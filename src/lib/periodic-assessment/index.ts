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
import { computeOverallScore } from "../assessment/score";
import type { PeriodicAssessment as DbPeriodicAssessment, Prisma } from "@prisma/client";
import type {
  AssessmentScores,
  Lesson,
  PeriodicAssessment,
  PeriodicLessonSummaryItem,
} from "../types";

const FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "periodic-assessments.json");
export const PERIODIC_ASSESSMENTS_FILE = FILE;

type StoredPeriodicAssessment = PeriodicAssessment & { tenantId: string };

/**
 * DB modunda `PeriodicAssessment.relatedLessonIds` (`JSONB`) hem geriye uyumlu
 * `string[]` dizisini hem de 4 derslik puan/özet zarfını (`PeriodicRelatedEnvelope`)
 * taşır — böylece yeni bir DB şema migration'ı zorunlu olmadan puanlar ve
 * 4 ders özeti hem PostgreSQL hem JSON store'da birebir kalıcı saklanır.
 */
type PeriodicRelatedEnvelope = {
  lessonIds: string[];
  scores?: AssessmentScores;
  overallScore?: number;
  lessonSummaries?: PeriodicLessonSummaryItem[];
  teacherSignedName?: string;
  approvedAt?: string;
};

function unpackRelatedPayload(raw: unknown): PeriodicRelatedEnvelope {
  if (Array.isArray(raw)) {
    return { lessonIds: raw.filter((x): x is string => typeof x === "string") };
  }
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    const lessonIds = Array.isArray(obj.lessonIds)
      ? obj.lessonIds.filter((x): x is string => typeof x === "string")
      : [];
    const scores =
      obj.scores && typeof obj.scores === "object"
        ? (obj.scores as AssessmentScores)
        : undefined;
    const overallScore =
      typeof obj.overallScore === "number"
        ? obj.overallScore
        : scores
          ? Number(computeOverallScore(scores).toFixed(1))
          : undefined;
    const lessonSummaries = Array.isArray(obj.lessonSummaries)
      ? (obj.lessonSummaries as PeriodicLessonSummaryItem[])
      : undefined;
    const teacherSignedName =
      typeof obj.teacherSignedName === "string" && obj.teacherSignedName.trim()
        ? obj.teacherSignedName.trim()
        : undefined;
    const approvedAt =
      typeof obj.approvedAt === "string" && obj.approvedAt.trim()
        ? obj.approvedAt.trim()
        : undefined;
    return {
      lessonIds,
      scores,
      overallScore,
      lessonSummaries,
      teacherSignedName,
      approvedAt,
    };
  }
  return { lessonIds: [] };
}

function packRelatedPayload(input: CreatePeriodicAssessmentInput): Prisma.InputJsonValue {
  if (
    !input.scores &&
    input.overallScore === undefined &&
    !input.lessonSummaries &&
    !input.teacherSignedName &&
    !input.approvedAt
  ) {
    return input.relatedLessonIds;
  }
  const overallScore =
    input.overallScore ??
    (input.scores ? Number(computeOverallScore(input.scores).toFixed(1)) : undefined);
  return {
    lessonIds: input.relatedLessonIds,
    ...(input.scores ? { scores: input.scores } : {}),
    ...(overallScore !== undefined ? { overallScore } : {}),
    ...(input.lessonSummaries ? { lessonSummaries: input.lessonSummaries } : {}),
    ...(input.teacherSignedName ? { teacherSignedName: input.teacherSignedName } : {}),
    ...(input.approvedAt ? { approvedAt: input.approvedAt } : {}),
  } as unknown as Prisma.InputJsonValue;
}

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
  const unpacked = unpackRelatedPayload(a.relatedLessonIds);
  return {
    id: a.id,
    tenantId: a.tenantId,
    studentId: a.studentId,
    teacherId: a.teacherId,
    periodStart: a.periodStart.toISOString(),
    periodEnd: a.periodEnd.toISOString(),
    relatedLessonIds: unpacked.lessonIds,
    overallProgressNote: a.overallProgressNote,
    strengthsNote: a.strengthsNote ?? undefined,
    areasForImprovementNote: a.areasForImprovementNote ?? undefined,
    recommendationNote: a.recommendationNote ?? undefined,
    scores: unpacked.scores,
    overallScore: unpacked.overallScore,
    lessonSummaries: unpacked.lessonSummaries,
    teacherSignedName: unpacked.teacherSignedName,
    approvedAt: unpacked.approvedAt,
    submittedBy: a.submittedBy,
    submittedAt: a.submittedAt.toISOString(),
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

function toPublic(a: StoredPeriodicAssessment): PeriodicAssessment {
  const { tenantId: _t, ...pub } = a;
  void _t;
  if (pub.scores && pub.overallScore === undefined) {
    pub.overallScore = Number(computeOverallScore(pub.scores).toFixed(1));
  }
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
  scores?: AssessmentScores;
  overallScore?: number;
  lessonSummaries?: PeriodicLessonSummaryItem[];
  teacherSignedName?: string;
  approvedAt?: string;
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
  let row: DbPeriodicAssessment;
  try {
    row = await prisma.periodicAssessment.create({
      data: {
        id: uid("pass"),
        tenantId: input.tenantId,
        studentId: input.studentId,
        teacherId: input.teacherId,
        periodStart: new Date(input.periodStart),
        periodEnd: new Date(input.periodEnd),
        relatedLessonIds: packRelatedPayload(input),
        overallProgressNote: input.overallProgressNote,
        strengthsNote: input.strengthsNote ?? null,
        areasForImprovementNote: input.areasForImprovementNote ?? null,
        recommendationNote: input.recommendationNote ?? null,
        submittedBy: input.submittedBy,
      },
    });
  } catch (e) {
    // Aynı anda iki gönderim (çift dokunma / mobil tekrar) → @@unique yakalar; ham Prisma hatası kullanıcıya gitmez.
    if ((e as { code?: string }).code === "P2002") {
      return { ok: false, code: "ALREADY_SUBMITTED", message: "Bu dönem için değerlendirme zaten gönderilmiş." };
    }
    throw e;
  }
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
  const overallScore =
    input.overallScore ??
    (input.scores ? Number(computeOverallScore(input.scores).toFixed(1)) : undefined);
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
    scores: input.scores,
    overallScore,
    lessonSummaries: input.lessonSummaries,
    teacherSignedName: input.teacherSignedName,
    approvedAt: input.approvedAt ?? now,
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

/** Rapor hiç yazılmamış öğrencide geriye bakılan en uzak gün (eski birikim geri gelmesin). */
export const PERIODIC_LOOKBACK_DAYS = 60;
export const LESSONS_PER_PERIOD = 4;

export type PendingPeriod = { periodStart: string; periodEnd: string };

type PeriodLesson = Pick<Lesson, "startAt" | "status">;

/** Rapora sayılan ders: geçmişte, iptal/gelmedi değil. */
export function isReportableLesson(l: PeriodLesson, nowMs: number): boolean {
  return l.status !== "cancelled" && l.status !== "no_show" && Date.parse(l.startAt) <= nowMs;
}

/**
 * 4 haftalık rapor — TEK kural (2026-10-23), saf fonksiyon. Öğrenci × öğretmen için EN FAZLA BİR bekleyen dönem:
 * son gönderilmiş raporun bitişinden SONRA yapılmış ilk 4 ders. Dönem = [1. dersin başlangıcı, 4. dersin başlangıcı].
 * Rapor hiç yoksa taban `now - PERIODIC_LOOKBACK_DAYS`. Eski 28 günlük takvim dönemi yok: ders yapılmamış hafta
 * için boş form, aylarca geriye birikim ve liste/gönderim arasında farklı dönem üretimi bu yüzden kalktı.
 * Eski kayıtlar (takvim ya da 4 ders anahtarlı) yalnız bitiş tarihiyle kapsar → migration/backfill gerekmez.
 */
export function computePendingPeriod(
  lessons: PeriodLesson[],
  lastReportEnd: string | undefined,
  now: Date = new Date()
): PendingPeriod | null {
  const nowMs = now.getTime();
  const floorMs = Math.max(lastReportEnd ? Date.parse(lastReportEnd) : -Infinity, nowMs - PERIODIC_LOOKBACK_DAYS * 86_400_000);
  const batch = lessons
    .filter((l) => isReportableLesson(l, nowMs) && Date.parse(l.startAt) > floorMs)
    .sort((a, b) => a.startAt.localeCompare(b.startAt))
    .slice(0, LESSONS_PER_PERIOD);
  if (batch.length < LESSONS_PER_PERIOD) return null;
  return {
    periodStart: new Date(batch[0]!.startAt).toISOString(),
    periodEnd: new Date(batch[batch.length - 1]!.startAt).toISOString(),
  };
}

/** Öğrenci×öğretmen başına en son gönderilmiş raporun bitişi (`studentId:teacherId` → ISO). Yalnız tarih okunur. */
export async function listLatestPeriodicEnds(
  tenantId: string,
  f: { teacherId?: string; studentId?: string }
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const put = (studentId: string, teacherId: string, end: string) => {
    const key = `${studentId}:${teacherId}`;
    const prev = out.get(key);
    if (!prev || prev < end) out.set(key, end);
  };
  if (isDbMode) {
    const { prisma } = await import("../db");
    const rows = await prisma.periodicAssessment.groupBy({
      by: ["studentId", "teacherId"],
      where: { tenantId, ...(f.teacherId ? { teacherId: f.teacherId } : {}), ...(f.studentId ? { studentId: f.studentId } : {}) },
      _max: { periodEnd: true },
    });
    for (const r of rows) if (r._max.periodEnd) put(r.studentId, r.teacherId, r._max.periodEnd.toISOString());
    return out;
  }
  for (const a of await loadAll()) {
    if (a.tenantId !== tenantId || (f.teacherId && a.teacherId !== f.teacherId) || (f.studentId && a.studentId !== f.studentId)) continue;
    put(a.studentId, a.teacherId, new Date(a.periodEnd).toISOString());
  }
  return out;
}

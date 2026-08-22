/**
 * Öğrenci müfredat / konu ilerleme store.
 * STORE_MODE=db → Prisma StudentCurriculumTopic
 * STORE_MODE=json/memory → data/curriculum-topics.json
 * Desen: assessment / homework store katmanları.
 */

import path from "path";
import { isDbMode, resolveDataDir } from "../config";
import { uid } from "../utils";
import type {
  CurriculumTopicEvent,
  CurriculumTopicStatus,
  StudentCurriculumTopic,
} from "../types";

const FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "curriculum-topics.json");

export const CURRICULUM_TOPICS_FILE = FILE;

type StoredTopic = StudentCurriculumTopic & { tenantId: string };

const STATUS_DEFAULT_PROGRESS: Record<CurriculumTopicStatus, number> = {
  planned: 0,
  in_progress: 50,
  mastered: 100,
  deferred: 0,
};

export function defaultProgressForStatus(status: CurriculumTopicStatus): number {
  return STATUS_DEFAULT_PROGRESS[status];
}

/**
 * Genel ilerleme: konuların progressPercent aritmetik ortalaması (eşit ağırlık).
 * Konu yoksa 0. Açıklanabilir: her konu 0–100, ortalama yuvarlanmış.
 */
export function computeOverallCurriculumProgress(
  topics: Pick<StudentCurriculumTopic, "progressPercent">[]
): number {
  if (topics.length === 0) return 0;
  const sum = topics.reduce((s, t) => s + clampProgress(t.progressPercent), 0);
  return Math.round(sum / topics.length);
}

export function clampProgress(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

async function loadAll(): Promise<StoredTopic[]> {
  try {
    const fs = await import("fs/promises");
    const raw = await fs.readFile(FILE, "utf8");
    return JSON.parse(raw) as StoredTopic[];
  } catch {
    return [];
  }
}

async function saveAll(rows: StoredTopic[]): Promise<void> {
  const fs = await import("fs/promises");
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(rows, null, 2));
}

function toPublic(t: StoredTopic): StudentCurriculumTopic {
  const { tenantId: _t, ...rest } = t;
  void _t;
  return rest;
}

function mapDb(row: {
  id: string;
  studentId: string;
  teacherId: string;
  title: string;
  description: string | null;
  status: string;
  progressPercent: number;
  sortOrder: number;
  notes: string | null;
  history: unknown;
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
  tenantId: string;
}): StoredTopic {
  return {
    id: row.id,
    tenantId: row.tenantId,
    studentId: row.studentId,
    teacherId: row.teacherId,
    title: row.title,
    description: row.description ?? undefined,
    status: row.status as CurriculumTopicStatus,
    progressPercent: row.progressPercent,
    sortOrder: row.sortOrder,
    notes: row.notes ?? undefined,
    history: (row.history as CurriculumTopicEvent[]) ?? [],
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export type CreateCurriculumTopicInput = {
  tenantId: string;
  studentId: string;
  teacherId: string;
  title: string;
  description?: string;
  status?: CurriculumTopicStatus;
  progressPercent?: number;
  sortOrder?: number;
  notes?: string;
  createdBy: string;
};

export type UpdateCurriculumTopicInput = {
  title?: string;
  description?: string | null;
  status?: CurriculumTopicStatus;
  progressPercent?: number;
  sortOrder?: number;
  notes?: string | null;
  updatedBy: string;
  changeNote?: string;
};

async function createDb(input: CreateCurriculumTopicInput): Promise<StudentCurriculumTopic> {
  const { prisma } = await import("../db");
  const status = input.status ?? "planned";
  const progress =
    input.progressPercent !== undefined
      ? clampProgress(input.progressPercent)
      : defaultProgressForStatus(status);
  const now = new Date();
  const history: CurriculumTopicEvent[] = [
    {
      at: now.toISOString(),
      byUserId: input.createdBy,
      action: "created",
      note: input.notes,
      toStatus: status,
      toProgress: progress,
    },
  ];
  const row = await prisma.studentCurriculumTopic.create({
    data: {
      id: uid("cur"),
      tenantId: input.tenantId,
      studentId: input.studentId,
      teacherId: input.teacherId,
      title: input.title,
      description: input.description ?? null,
      status,
      progressPercent: progress,
      sortOrder: input.sortOrder ?? 0,
      notes: input.notes ?? null,
      history,
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
    },
  });
  return toPublic(mapDb(row));
}

async function createJson(input: CreateCurriculumTopicInput): Promise<StudentCurriculumTopic> {
  const all = await loadAll();
  const status = input.status ?? "planned";
  const progress =
    input.progressPercent !== undefined
      ? clampProgress(input.progressPercent)
      : defaultProgressForStatus(status);
  const now = new Date().toISOString();
  const stored: StoredTopic = {
    id: uid("cur"),
    tenantId: input.tenantId,
    studentId: input.studentId,
    teacherId: input.teacherId,
    title: input.title,
    description: input.description,
    status,
    progressPercent: progress,
    sortOrder: input.sortOrder ?? 0,
    notes: input.notes,
    history: [
      {
        at: now,
        byUserId: input.createdBy,
        action: "created",
        note: input.notes,
        toStatus: status,
        toProgress: progress,
      },
    ],
    createdBy: input.createdBy,
    updatedBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
  };
  all.push(stored);
  await saveAll(all);
  return toPublic(stored);
}

export async function createCurriculumTopic(
  input: CreateCurriculumTopicInput
): Promise<StudentCurriculumTopic> {
  if (isDbMode) return createDb(input);
  return createJson(input);
}

async function updateDb(
  tenantId: string,
  id: string,
  patch: UpdateCurriculumTopicInput
): Promise<StudentCurriculumTopic | null> {
  const { prisma } = await import("../db");
  const existing = await prisma.studentCurriculumTopic.findFirst({ where: { id, tenantId } });
  if (!existing) return null;

  const nextStatus = (patch.status ?? existing.status) as CurriculumTopicStatus;
  let nextProgress =
    patch.progressPercent !== undefined
      ? clampProgress(patch.progressPercent)
      : existing.progressPercent;
  if (patch.status !== undefined && patch.progressPercent === undefined) {
    nextProgress = defaultProgressForStatus(nextStatus);
  }

  const history = ([...(existing.history as CurriculumTopicEvent[])] as CurriculumTopicEvent[]).slice(
    -49
  );
  const now = new Date();
  history.push({
    at: now.toISOString(),
    byUserId: patch.updatedBy,
    action: patch.status !== undefined && patch.status !== existing.status ? "status_changed" : "updated",
    note: patch.changeNote,
    fromStatus: existing.status as CurriculumTopicStatus,
    toStatus: nextStatus,
    fromProgress: existing.progressPercent,
    toProgress: nextProgress,
  });

  const row = await prisma.studentCurriculumTopic.update({
    where: { id },
    data: {
      title: patch.title ?? existing.title,
      description:
        patch.description === null ? null : (patch.description ?? existing.description),
      status: nextStatus,
      progressPercent: nextProgress,
      sortOrder: patch.sortOrder ?? existing.sortOrder,
      notes: patch.notes === null ? null : (patch.notes ?? existing.notes),
      history,
      updatedBy: patch.updatedBy,
    },
  });
  return toPublic(mapDb(row));
}

async function updateJson(
  tenantId: string,
  id: string,
  patch: UpdateCurriculumTopicInput
): Promise<StudentCurriculumTopic | null> {
  const all = await loadAll();
  const idx = all.findIndex((t) => t.id === id && t.tenantId === tenantId);
  if (idx < 0) return null;
  const existing = all[idx];
  const nextStatus = patch.status ?? existing.status;
  let nextProgress =
    patch.progressPercent !== undefined
      ? clampProgress(patch.progressPercent)
      : existing.progressPercent;
  if (patch.status !== undefined && patch.progressPercent === undefined) {
    nextProgress = defaultProgressForStatus(nextStatus);
  }
  const now = new Date().toISOString();
  const history = [...existing.history].slice(-49);
  history.push({
    at: now,
    byUserId: patch.updatedBy,
    action: patch.status !== undefined && patch.status !== existing.status ? "status_changed" : "updated",
    note: patch.changeNote,
    fromStatus: existing.status,
    toStatus: nextStatus,
    fromProgress: existing.progressPercent,
    toProgress: nextProgress,
  });
  const next: StoredTopic = {
    ...existing,
    title: patch.title ?? existing.title,
    description:
      patch.description === null ? undefined : (patch.description ?? existing.description),
    status: nextStatus,
    progressPercent: nextProgress,
    sortOrder: patch.sortOrder ?? existing.sortOrder,
    notes: patch.notes === null ? undefined : (patch.notes ?? existing.notes),
    history,
    updatedBy: patch.updatedBy,
    updatedAt: now,
  };
  all[idx] = next;
  await saveAll(all);
  return toPublic(next);
}

export async function updateCurriculumTopic(
  tenantId: string,
  id: string,
  patch: UpdateCurriculumTopicInput
): Promise<StudentCurriculumTopic | null> {
  if (isDbMode) return updateDb(tenantId, id, patch);
  return updateJson(tenantId, id, patch);
}

export async function getCurriculumTopic(
  tenantId: string,
  id: string
): Promise<StudentCurriculumTopic | null> {
  if (isDbMode) {
    const { prisma } = await import("../db");
    const row = await prisma.studentCurriculumTopic.findFirst({ where: { id, tenantId } });
    return row ? toPublic(mapDb(row)) : null;
  }
  const all = await loadAll();
  const found = all.find((t) => t.id === id && t.tenantId === tenantId);
  return found ? toPublic(found) : null;
}

export async function listCurriculumTopicsForStudent(
  tenantId: string,
  studentId: string
): Promise<StudentCurriculumTopic[]> {
  if (isDbMode) {
    const { prisma } = await import("../db");
    const rows = await prisma.studentCurriculumTopic.findMany({
      where: { tenantId, studentId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    return rows.map((r) => toPublic(mapDb(r)));
  }
  const all = await loadAll();
  return all
    .filter((t) => t.tenantId === tenantId && t.studentId === studentId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt))
    .map(toPublic);
}

export async function listAllCurriculumTopics(tenantId: string): Promise<StudentCurriculumTopic[]> {
  if (isDbMode) {
    const { prisma } = await import("../db");
    const rows = await prisma.studentCurriculumTopic.findMany({
      where: { tenantId },
      orderBy: { updatedAt: "desc" },
    });
    return rows.map((r) => toPublic(mapDb(r)));
  }
  const all = await loadAll();
  return all
    .filter((t) => t.tenantId === tenantId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map(toPublic);
}

export type BulkCreateCurriculumTopicsInput = {
  tenantId: string;
  createdBy: string;
  /** Zaten erişim/sahiplik doğrulanmış (studentId, o öğrencinin teacherId'si) çiftleri. */
  assignments: { studentId: string; teacherId: string }[];
  topics: { title: string; description?: string; sortOrder?: number }[];
};

export type BulkCreateCurriculumTopicsResult = {
  created: number;
  skippedExisting: number;
};

function normalizeTitleKey(title: string): string {
  return title.trim().toLocaleLowerCase("tr");
}

/**
 * Toplu atama — tek okuma + tek yazım round-trip'i (N ayrı create çağrısı
 * DEĞİL). Aynı öğrenci+başlık zaten varsa (mevcut kayıtlarda VEYA aynı
 * istek içinde tekrar ediyorsa) o satır atlanır, yeni kayıt oluşturulmaz.
 */
async function bulkCreateDb(
  input: BulkCreateCurriculumTopicsInput
): Promise<BulkCreateCurriculumTopicsResult> {
  const { prisma } = await import("../db");
  const studentIds = [...new Set(input.assignments.map((a) => a.studentId))];
  const existingRows = await prisma.studentCurriculumTopic.findMany({
    where: { tenantId: input.tenantId, studentId: { in: studentIds } },
    select: { studentId: true, title: true },
  });
  const existing = new Set(existingRows.map((r) => `${r.studentId}::${normalizeTitleKey(r.title)}`));

  const now = new Date();
  const rows: {
    id: string;
    tenantId: string;
    studentId: string;
    teacherId: string;
    title: string;
    description: string | null;
    status: string;
    progressPercent: number;
    sortOrder: number;
    notes: string | null;
    history: CurriculumTopicEvent[];
    createdBy: string;
    updatedBy: string;
  }[] = [];
  let skippedExisting = 0;
  for (const a of input.assignments) {
    for (const t of input.topics) {
      const key = `${a.studentId}::${normalizeTitleKey(t.title)}`;
      if (existing.has(key)) {
        skippedExisting += 1;
        continue;
      }
      existing.add(key);
      const status: CurriculumTopicStatus = "planned";
      const progress = defaultProgressForStatus(status);
      const history: CurriculumTopicEvent[] = [
        {
          at: now.toISOString(),
          byUserId: input.createdBy,
          action: "created",
          toStatus: status,
          toProgress: progress,
        },
      ];
      rows.push({
        id: uid("cur"),
        tenantId: input.tenantId,
        studentId: a.studentId,
        teacherId: a.teacherId,
        title: t.title.trim(),
        description: t.description ?? null,
        status,
        progressPercent: progress,
        sortOrder: t.sortOrder ?? 0,
        notes: null,
        history,
        createdBy: input.createdBy,
        updatedBy: input.createdBy,
      });
    }
  }
  if (rows.length > 0) {
    await prisma.studentCurriculumTopic.createMany({ data: rows });
  }
  return { created: rows.length, skippedExisting };
}

async function bulkCreateJson(
  input: BulkCreateCurriculumTopicsInput
): Promise<BulkCreateCurriculumTopicsResult> {
  const all = await loadAll();
  const existing = new Set(
    all
      .filter((t) => t.tenantId === input.tenantId)
      .map((t) => `${t.studentId}::${normalizeTitleKey(t.title)}`)
  );

  const now = new Date().toISOString();
  const newRows: StoredTopic[] = [];
  let skippedExisting = 0;
  for (const a of input.assignments) {
    for (const t of input.topics) {
      const key = `${a.studentId}::${normalizeTitleKey(t.title)}`;
      if (existing.has(key)) {
        skippedExisting += 1;
        continue;
      }
      existing.add(key);
      const status: CurriculumTopicStatus = "planned";
      const progress = defaultProgressForStatus(status);
      newRows.push({
        id: uid("cur"),
        tenantId: input.tenantId,
        studentId: a.studentId,
        teacherId: a.teacherId,
        title: t.title.trim(),
        description: t.description,
        status,
        progressPercent: progress,
        sortOrder: t.sortOrder ?? 0,
        notes: undefined,
        history: [
          {
            at: now,
            byUserId: input.createdBy,
            action: "created",
            toStatus: status,
            toProgress: progress,
          },
        ],
        createdBy: input.createdBy,
        updatedBy: input.createdBy,
        createdAt: now,
        updatedAt: now,
      });
    }
  }
  if (newRows.length > 0) {
    await saveAll([...all, ...newRows]);
  }
  return { created: newRows.length, skippedExisting };
}

export async function bulkCreateCurriculumTopics(
  input: BulkCreateCurriculumTopicsInput
): Promise<BulkCreateCurriculumTopicsResult> {
  if (isDbMode) return bulkCreateDb(input);
  return bulkCreateJson(input);
}

/** Veli/öğrenci özeti — not ve history detayı sadeleştirilir. */
export function toCurriculumSummary(topic: StudentCurriculumTopic): {
  id: string;
  title: string;
  status: CurriculumTopicStatus;
  progressPercent: number;
  updatedAt: string;
} {
  return {
    id: topic.id,
    title: topic.title,
    status: topic.status,
    progressPercent: topic.progressPercent,
    updatedAt: topic.updatedAt,
  };
}

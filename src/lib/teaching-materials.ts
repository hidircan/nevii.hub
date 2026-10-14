/**
 * EPIC 6B (IMPLEMENTATION_PLAN.md) — öğretmen materyali/pratik videosu store
 * katmanı. Aynı desen: src/lib/homework.ts, src/lib/announcements/index.ts.
 * Hedefleme (targetStudentType/targetInstrument/targetLevel) SUNUCU
 * tarafında eşleştirilir (bkz. matchesMaterialAudience) — client'a hedef
 * dışı materyal asla gönderilmez.
 */

import path from "path";
import { isDbMode, resolveDataDir } from "./config";
import { uid } from "./utils";
import type { TeachingMaterial as DbTeachingMaterial } from "@prisma/client";
import type { Instrument, StudentType, TeachingMaterial } from "./types";

/** Kota (2026-10-14): liste sorguları dosya gövdesini okumaz; "dosya var" göstergesi dosya adından (bkz. homework.ts). */
const LIST_OMIT = { fileData: true } as const;

const FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "teaching-materials.json");
export const TEACHING_MATERIALS_FILE_PATH = FILE;

type StoredMaterial = TeachingMaterial & { tenantId: string };

async function loadAll(): Promise<StoredMaterial[]> {
  try {
    const fs = await import("fs/promises");
    const raw = await fs.readFile(FILE, "utf8");
    return JSON.parse(raw) as StoredMaterial[];
  } catch {
    return [];
  }
}

async function saveAll(rows: StoredMaterial[]): Promise<void> {
  const fs = await import("fs/promises");
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(rows, null, 2));
}

function mapDb(m: Omit<DbTeachingMaterial, "fileData"> & { fileData?: string | null }): StoredMaterial {
  return {
    id: m.id,
    tenantId: m.tenantId,
    teacherId: m.teacherId,
    title: m.title,
    description: m.description,
    targetStudentType: (m.targetStudentType as StudentType | null) ?? undefined,
    targetInstrument: (m.targetInstrument as Instrument | null) ?? undefined,
    targetLevel: m.targetLevel ?? undefined,
    fileName: m.fileName ?? undefined,
    fileMimeType: m.fileMimeType ?? undefined,
    fileData: m.fileData ?? undefined,
    createdAt: m.createdAt.toISOString(),
  };
}

function toPublicSummary(m: StoredMaterial): TeachingMaterial {
  return {
    id: m.id,
    teacherId: m.teacherId,
    title: m.title,
    description: m.description,
    targetStudentType: m.targetStudentType,
    targetInstrument: m.targetInstrument,
    targetLevel: m.targetLevel,
    fileName: m.fileName,
    fileMimeType: m.fileMimeType,
    fileData: m.fileData || m.fileName ? "1" : undefined,
    createdAt: m.createdAt,
  };
}

function toPublicFull(m: StoredMaterial): TeachingMaterial {
  return {
    id: m.id,
    teacherId: m.teacherId,
    title: m.title,
    description: m.description,
    targetStudentType: m.targetStudentType,
    targetInstrument: m.targetInstrument,
    targetLevel: m.targetLevel,
    fileName: m.fileName,
    fileMimeType: m.fileMimeType,
    fileData: m.fileData,
    createdAt: m.createdAt,
  };
}

export type CreateTeachingMaterialInput = {
  tenantId: string;
  teacherId: string;
  title: string;
  description: string;
  targetStudentType?: StudentType;
  targetInstrument?: Instrument;
  targetLevel?: string;
  fileName?: string;
  fileMimeType?: string;
  fileData?: string;
};

async function createMaterialDb(input: CreateTeachingMaterialInput): Promise<TeachingMaterial> {
  const { prisma } = await import("./db");
  const row = await prisma.teachingMaterial.create({
    data: {
      id: uid("mat"),
      tenantId: input.tenantId,
      teacherId: input.teacherId,
      title: input.title,
      description: input.description,
      targetStudentType: input.targetStudentType ?? null,
      targetInstrument: input.targetInstrument ?? null,
      targetLevel: input.targetLevel ?? null,
      fileName: input.fileName ?? null,
      fileMimeType: input.fileMimeType ?? null,
      fileData: input.fileData ?? null,
    },
  });
  return toPublicFull(mapDb(row));
}

export async function createTeachingMaterial(
  input: CreateTeachingMaterialInput
): Promise<TeachingMaterial> {
  if (isDbMode) return createMaterialDb(input);
  const all = await loadAll();
  const record: StoredMaterial = {
    id: uid("mat"),
    tenantId: input.tenantId,
    teacherId: input.teacherId,
    title: input.title,
    description: input.description,
    targetStudentType: input.targetStudentType,
    targetInstrument: input.targetInstrument,
    targetLevel: input.targetLevel,
    fileName: input.fileName,
    fileMimeType: input.fileMimeType,
    fileData: input.fileData,
    createdAt: new Date().toISOString(),
  };
  await saveAll([...all, record]);
  return toPublicFull(record);
}

async function listForTenantDb(tenantId: string): Promise<TeachingMaterial[]> {
  const { prisma } = await import("./db");
  const rows = await prisma.teachingMaterial.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    omit: LIST_OMIT,
  });
  return rows.map((r) => toPublicSummary(mapDb(r)));
}

/** `fileData` içermez (özet) — tüm materyaller, filtreleme çağıran tarafta yapılır. */
export async function listTeachingMaterials(tenantId: string): Promise<TeachingMaterial[]> {
  if (isDbMode) return listForTenantDb(tenantId);
  const all = await loadAll();
  return all
    .filter((m) => m.tenantId === tenantId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(toPublicSummary);
}

async function listForTeacherDb(tenantId: string, teacherId: string): Promise<TeachingMaterial[]> {
  const { prisma } = await import("./db");
  const rows = await prisma.teachingMaterial.findMany({
    where: { tenantId, teacherId },
    orderBy: { createdAt: "desc" },
    omit: LIST_OMIT,
  });
  return rows.map((r) => toPublicSummary(mapDb(r)));
}

export async function listTeachingMaterialsForTeacher(
  tenantId: string,
  teacherId: string
): Promise<TeachingMaterial[]> {
  if (isDbMode) return listForTeacherDb(tenantId, teacherId);
  const all = await loadAll();
  return all
    .filter((m) => m.tenantId === tenantId && m.teacherId === teacherId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(toPublicSummary);
}

async function getMaterialDb(tenantId: string, id: string): Promise<StoredMaterial | null> {
  const { prisma } = await import("./db");
  const row = await prisma.teachingMaterial.findFirst({ where: { id, tenantId } });
  return row ? mapDb(row) : null;
}

/** `fileData` DAHİL — yalnızca sahiplik/hedefleme kontrolü yapılmış çağrı yollarından kullanılmalı. */
export async function getTeachingMaterial(tenantId: string, id: string): Promise<TeachingMaterial | null> {
  if (isDbMode) {
    const row = await getMaterialDb(tenantId, id);
    return row ? toPublicFull(row) : null;
  }
  const all = await loadAll();
  const found = all.find((m) => m.id === id && m.tenantId === tenantId);
  return found ? toPublicFull(found) : null;
}

async function clearMaterialsDb(tenantId: string): Promise<void> {
  const { prisma } = await import("./db");
  await prisma.teachingMaterial.deleteMany({ where: { tenantId } });
}

/** Demo reset için — tenant'ın tüm materyallerini siler. */
export async function clearTeachingMaterials(tenantId: string): Promise<void> {
  if (isDbMode) return clearMaterialsDb(tenantId);
  const all = await loadAll();
  const remaining = all.filter((m) => m.tenantId !== tenantId);
  if (remaining.length !== all.length) await saveAll(remaining);
}

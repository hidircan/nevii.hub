/**
 * PRODUCT_BACKLOG §5 — deneme dersi store (JSON + DB parity).
 */

import path from "path";
import { isDbMode, resolveDataDir } from "./config";
import { uid } from "./utils";
import type { BranchId, Instrument, TrialLesson, TrialLessonStatus } from "./types";

const FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "trial-lessons.json");
export const TRIAL_LESSONS_FILE = FILE;

type Stored = TrialLesson & { tenantId: string };

async function loadAll(): Promise<Stored[]> {
  try {
    const fs = await import("fs/promises");
    return JSON.parse(await fs.readFile(FILE, "utf8")) as Stored[];
  } catch {
    return [];
  }
}
async function saveAll(rows: Stored[]) {
  const fs = await import("fs/promises");
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(rows, null, 2));
}

export async function createTrialLesson(input: {
  tenantId: string;
  name: string;
  phone: string;
  parentName?: string;
  instrument: Instrument;
  branchId: BranchId;
  teacherId: string;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  createdBy: string;
  notes?: string;
}): Promise<TrialLesson> {
  const now = new Date().toISOString();
  const row: Stored = {
    id: uid("trial"),
    tenantId: input.tenantId,
    name: input.name,
    phone: input.phone,
    parentName: input.parentName?.trim() || undefined,
    instrument: input.instrument,
    branchId: input.branchId,
    teacherId: input.teacherId,
    startAt: input.startAt,
    endAt: input.endAt,
    durationMinutes: input.durationMinutes,
    status: "planned",
    notes: input.notes,
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
  };
  if (isDbMode) {
    const { prisma } = await import("./db");
    await prisma.trialLesson.create({
      data: {
        id: row.id,
        tenantId: input.tenantId,
        name: row.name,
        phone: row.phone,
        parentName: row.parentName ?? null,
        instrument: row.instrument,
        branchId: row.branchId,
        teacherId: row.teacherId,
        startAt: new Date(row.startAt),
        endAt: new Date(row.endAt),
        durationMinutes: row.durationMinutes,
        status: row.status,
        notes: row.notes,
        createdBy: row.createdBy,
      },
    });
  } else {
    const all = await loadAll();
    all.push(row);
    await saveAll(all);
  }
  const { tenantId: _t, ...pub } = row;
  void _t;
  return pub;
}

export async function updateTrialLessonStatus(
  tenantId: string,
  id: string,
  status: TrialLessonStatus,
  extra?: { convertedStudentId?: string }
): Promise<TrialLesson | null> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    const r = await prisma.trialLesson.findFirst({ where: { id, tenantId } });
    if (!r) return null;
    const u = await prisma.trialLesson.update({
      where: { id },
      data: {
        status,
        convertedStudentId: extra?.convertedStudentId ?? r.convertedStudentId,
      },
    });
    return mapDb(u);
  }
  const all = await loadAll();
  const idx = all.findIndex((t) => t.id === id && t.tenantId === tenantId);
  if (idx < 0) return null;
  all[idx] = {
    ...all[idx],
    status,
    convertedStudentId: extra?.convertedStudentId ?? all[idx].convertedStudentId,
    updatedAt: new Date().toISOString(),
  };
  await saveAll(all);
  const { tenantId: _t, ...pub } = all[idx];
  void _t;
  return pub;
}

/** Düzenlenebilir alanlar — `undefined` alan dokunulmaz (kısmi güncelleme). */
export type TrialLessonPatch = Partial<
  Pick<TrialLesson, "name" | "phone" | "parentName" | "instrument" | "branchId" | "teacherId" | "startAt" | "endAt" | "durationMinutes" | "notes">
> & { resultNotes?: string; resultNotesAt?: string; resultNotesByUserId?: string };

/** Kısmi güncelleme; json/db aynı davranış. Dönüşüm/statü alanlarına dokunmaz. */
export async function updateTrialLesson(tenantId: string, id: string, patch: TrialLessonPatch): Promise<TrialLesson | null> {
  const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as TrialLessonPatch;
  if (isDbMode) {
    const { prisma } = await import("./db");
    const r = await prisma.trialLesson.findFirst({ where: { id, tenantId } });
    if (!r) return null;
    const u = await prisma.trialLesson.update({
      where: { id },
      data: {
        ...defined,
        ...(defined.startAt ? { startAt: new Date(defined.startAt) } : {}),
        ...(defined.endAt ? { endAt: new Date(defined.endAt) } : {}),
        ...(defined.resultNotesAt ? { resultNotesAt: new Date(defined.resultNotesAt) } : {}),
      },
    });
    return mapDb(u);
  }
  const all = await loadAll();
  const idx = all.findIndex((t) => t.id === id && t.tenantId === tenantId);
  if (idx < 0) return null;
  all[idx] = { ...all[idx], ...defined, updatedAt: new Date().toISOString() };
  await saveAll(all);
  const { tenantId: _t, ...pub } = all[idx];
  void _t;
  return pub;
}

/**
 * Deneme dersini kalıcı siler (sahip emri 2026-09-28: satır her zaman
 * silinebilir). json/db aynı davranış. Bağlı ÖĞRENCİ kaydına dokunmaz —
 * yalnız deneme satırı gider; öğrencideki `convertedFromTrialId` iz olarak
 * kalır. İmza nüshası olan evraklar (varsa) arşiv niteliğiyle korunur.
 */
export async function deleteTrialLesson(tenantId: string, id: string): Promise<boolean> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    const r = await prisma.trialLesson.findFirst({ where: { id, tenantId } });
    if (!r) return false;
    await prisma.trialLesson.delete({ where: { id } });
    return true;
  }
  const all = await loadAll();
  const idx = all.findIndex((t) => t.id === id && t.tenantId === tenantId);
  if (idx < 0) return false;
  all.splice(idx, 1);
  await saveAll(all);
  return true;
}

function mapDb(r: {
  id: string;
  name: string;
  phone: string;
  parentName?: string | null;
  instrument: string;
  branchId: string;
  teacherId: string;
  startAt: Date;
  endAt: Date;
  durationMinutes: number;
  status: string;
  convertedStudentId: string | null;
  convertedAt: Date | null;
  convertedByUserId: string | null;
  notes: string | null;
  resultNotes?: string | null;
  resultNotesAt?: Date | null;
  resultNotesByUserId?: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}): TrialLesson {
  return {
    id: r.id,
    name: r.name,
    phone: r.phone,
    parentName: r.parentName ?? undefined,
    instrument: r.instrument as Instrument,
    branchId: r.branchId,
    teacherId: r.teacherId,
    startAt: r.startAt.toISOString(),
    endAt: r.endAt.toISOString(),
    durationMinutes: r.durationMinutes,
    status: r.status as TrialLessonStatus,
    convertedStudentId: r.convertedStudentId ?? undefined,
    convertedAt: r.convertedAt?.toISOString() ?? undefined,
    convertedByUserId: r.convertedByUserId ?? undefined,
    notes: r.notes ?? undefined,
    resultNotes: r.resultNotes ?? undefined,
    resultNotesAt: r.resultNotesAt?.toISOString() ?? undefined,
    resultNotesByUserId: r.resultNotesByUserId ?? undefined,
    createdBy: r.createdBy,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export async function listTrialLessons(tenantId: string): Promise<TrialLesson[]> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    const rows = await prisma.trialLesson.findMany({
      where: { tenantId },
      orderBy: { startAt: "desc" },
    });
    return rows.map(mapDb);
  }
  const all = await loadAll();
  return all
    .filter((t) => t.tenantId === tenantId)
    .sort((a, b) => b.startAt.localeCompare(a.startAt))
    .map(({ tenantId: _t, ...p }) => {
      void _t;
      return p;
    });
}

export async function getTrialLesson(tenantId: string, id: string): Promise<TrialLesson | null> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    const r = await prisma.trialLesson.findFirst({ where: { id, tenantId } });
    return r ? mapDb(r) : null;
  }
  const all = await loadAll();
  const t = all.find((x) => x.id === id && x.tenantId === tenantId);
  if (!t) return null;
  const { tenantId: _t, ...p } = t;
  void _t;
  return p;
}

/**
 * Deneme → öğrenci dönüşümünü işaretler. Aynı deneme ikinci kez dönüştürülemez
 * (ilk dönüşüm korunur, `false` döner) — çift kayıt/yanlış atıf olmaz.
 */
export async function markTrialConverted(
  tenantId: string,
  id: string,
  input: { studentId: string; userId: string; at?: string }
): Promise<boolean> {
  const at = input.at ?? new Date().toISOString();
  if (isDbMode) {
    const { prisma } = await import("./db");
    const res = await prisma.trialLesson.updateMany({
      where: { id, tenantId, convertedStudentId: null },
      data: {
        convertedStudentId: input.studentId,
        convertedAt: new Date(at),
        convertedByUserId: input.userId,
        status: "will_continue",
      },
    });
    return res.count === 1;
  }
  const all = await loadAll();
  const idx = all.findIndex((t) => t.id === id && t.tenantId === tenantId);
  if (idx < 0 || all[idx].convertedStudentId) return false;
  all[idx] = {
    ...all[idx],
    convertedStudentId: input.studentId,
    convertedAt: at,
    convertedByUserId: input.userId,
    status: "will_continue",
    updatedAt: at,
  };
  await saveAll(all);
  return true;
}

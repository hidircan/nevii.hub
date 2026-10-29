/**
 * EPIC 6C (IMPLEMENTATION_PLAN.md) — veli/öğrencinin öğretmen hakkında
 * yapılandırılmış geri bildirimi. Aynı desen: src/lib/homework.ts,
 * src/lib/teacher-availability.ts.
 *
 * Gizlilik kararı (plan'ın "Gizlilik kararı" bölümü): kamuya açık ortalama/
 * sıralama YOK, öğretmen kendi geri bildirimini GÖRMEZ — bu modül yalnızca
 * SCHOOL_ADMIN/SUPER_ADMIN'e açık `listTeacherFeedbackTool` tarafından
 * okunur. Öğretmene özel bir okuma yolu YALNIZCA anonim/toplulaştırılmış
 * özet (bkz. `teacher-feedback-summary.ts`) üzerinden açılır — ham kayıt
 * asla değil.
 *
 * Aynı ay tekrar kuralı: aynı tenant+studentId+teacherId için, cari takvim
 * ayı içinde zaten bir kayıt varsa, `submitTeacherFeedback` yeni bir satır
 * YARATMAZ — mevcut kaydı GÜNCELLER (updatedAt ilerler, createdAt sabit
 * kalır). Böylece bir öğrenci aynı öğretmeni ayda yalnızca bir kez
 * "değerlendirebilir" — ikinci giriş "Değerlendirmeyi Güncelle"dir.
 */

import path from "path";
import { isDbMode, resolveDataDir } from "./config";
import { uid } from "./utils";
import type { TeacherFeedback as DbTeacherFeedback } from "@prisma/client";
import type { TeacherFeedback, TeacherFeedbackCriterionKey, TeacherFeedbackStatus } from "./types";

const FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "teacher-feedback.json");
export const TEACHER_FEEDBACK_FILE_PATH = FILE;

export const TEACHER_FEEDBACK_CRITERIA: { key: TeacherFeedbackCriterionKey; label: string }[] = [
  { key: "clarity", label: "Dersi anlaşılır anlatma" },
  { key: "communication", label: "İletişim ve saygı" },
  { key: "effectiveness", label: "Ders verimliliği" },
  { key: "motivation", label: "Öğrenciyi motive etme" },
  { key: "punctuality", label: "Ders düzeni / zamanında başlama" },
];

/** Öğretmen özetinin görünmesi için gereken en az anonim yanıt sayısı. */
export const TEACHER_FEEDBACK_MIN_ANONYMOUS_RESPONSES = 3;

type StoredFeedback = TeacherFeedback & { tenantId: string };

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

function mapDb(f: DbTeacherFeedback): StoredFeedback {
  return {
    id: f.id,
    tenantId: f.tenantId,
    teacherId: f.teacherId,
    studentId: f.studentId,
    submittedBy: f.submittedBy,
    submitterRole: f.submitterRole,
    scores: f.scores as Record<TeacherFeedbackCriterionKey, number>,
    continueWithTeacher: (f.continueWithTeacher as TeacherFeedback["continueWithTeacher"]) ?? undefined,
    comment: f.comment ?? undefined,
    status: f.status as TeacherFeedbackStatus,
    sharedWithTeacher: f.sharedWithTeacher,
    createdAt: f.createdAt.toISOString(),
    updatedAt: f.updatedAt.toISOString(),
  };
}

function toPublic(f: StoredFeedback): TeacherFeedback {
  return {
    id: f.id,
    teacherId: f.teacherId,
    studentId: f.studentId,
    submittedBy: f.submittedBy,
    submitterRole: f.submitterRole,
    scores: f.scores,
    continueWithTeacher: f.continueWithTeacher,
    comment: f.comment,
    status: f.status,
    sharedWithTeacher: f.sharedWithTeacher,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
  };
}

/** UTC değil, sunucu yerel takvim ayı — "yyyy-MM" biçiminde tek karşılaştırma anahtarı. */
function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export type SubmitTeacherFeedbackInput = {
  tenantId: string;
  teacherId: string;
  studentId: string;
  submittedBy: string;
  submitterRole: string;
  scores: Record<TeacherFeedbackCriterionKey, number>;
  continueWithTeacher?: TeacherFeedback["continueWithTeacher"];
  comment?: string;
};

export type SubmitTeacherFeedbackResult = { feedback: TeacherFeedback; updated: boolean };

async function findThisMonthDb(
  tenantId: string,
  studentId: string,
  teacherId: string,
  now: Date
): Promise<DbTeacherFeedback | null> {
  const { prisma } = await import("./db");
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return prisma.teacherFeedback.findFirst({
    where: {
      tenantId,
      studentId,
      teacherId,
      createdAt: { gte: monthStart, lt: nextMonthStart },
    },
  });
}

async function submitFeedbackDb(
  input: SubmitTeacherFeedbackInput,
  now: Date
): Promise<SubmitTeacherFeedbackResult> {
  const { prisma } = await import("./db");
  const existing = await findThisMonthDb(input.tenantId, input.studentId, input.teacherId, now);
  if (existing) {
    const row = await prisma.teacherFeedback.update({
      where: { id: existing.id },
      data: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        scores: input.scores as any,
        continueWithTeacher: input.continueWithTeacher ?? null,
        comment: input.comment ?? null,
        submitterRole: input.submitterRole,
      },
    });
    return { feedback: toPublic(mapDb(row)), updated: true };
  }
  const row = await prisma.teacherFeedback.create({
    data: {
      id: uid("tfb"),
      tenantId: input.tenantId,
      teacherId: input.teacherId,
      studentId: input.studentId,
      submittedBy: input.submittedBy,
      submitterRole: input.submitterRole,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      scores: input.scores as any,
      continueWithTeacher: input.continueWithTeacher ?? null,
      comment: input.comment ?? null,
      status: "pending",
    },
  });
  return { feedback: toPublic(mapDb(row)), updated: false };
}

/**
 * Aynı ay tekrar kuralını (bkz. dosya başı) uygular — sonuçtaki `updated`
 * alanı çağırana "yeni kayıt mı, güncelleme mi" bilgisini taşır (audit/UI
 * mesajı için).
 */
export async function submitTeacherFeedback(
  input: SubmitTeacherFeedbackInput,
  now: Date = new Date()
): Promise<SubmitTeacherFeedbackResult> {
  if (isDbMode) return submitFeedbackDb(input, now);

  const all = await loadAll();
  const nowIso = now.toISOString();
  const currentMonth = monthKey(nowIso);
  const existingIdx = all.findIndex(
    (f) =>
      f.tenantId === input.tenantId &&
      f.studentId === input.studentId &&
      f.teacherId === input.teacherId &&
      monthKey(f.createdAt) === currentMonth
  );

  if (existingIdx >= 0) {
    const updated: StoredFeedback = {
      ...all[existingIdx]!,
      scores: input.scores,
      continueWithTeacher: input.continueWithTeacher,
      comment: input.comment,
      submitterRole: input.submitterRole,
      updatedAt: nowIso,
    };
    const next = [...all];
    next[existingIdx] = updated;
    await saveAll(next);
    return { feedback: toPublic(updated), updated: true };
  }

  const record: StoredFeedback = {
    id: uid("tfb"),
    tenantId: input.tenantId,
    teacherId: input.teacherId,
    studentId: input.studentId,
    submittedBy: input.submittedBy,
    submitterRole: input.submitterRole,
    scores: input.scores,
    continueWithTeacher: input.continueWithTeacher,
    comment: input.comment,
    status: "pending",
    sharedWithTeacher: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  await saveAll([...all, record]);
  return { feedback: toPublic(record), updated: false };
}

/** Öğrencinin bu öğretmen için cari ayda zaten bir kaydı var mı — form "Güncelle" moduna geçsin diye. */
export async function findTeacherFeedbackThisMonth(
  tenantId: string,
  studentId: string,
  teacherId: string,
  now: Date = new Date()
): Promise<TeacherFeedback | null> {
  if (isDbMode) {
    const row = await findThisMonthDb(tenantId, studentId, teacherId, now);
    return row ? toPublic(mapDb(row)) : null;
  }
  const all = await loadAll();
  const currentMonth = monthKey(now.toISOString());
  const found = all.find(
    (f) =>
      f.tenantId === tenantId &&
      f.studentId === studentId &&
      f.teacherId === teacherId &&
      monthKey(f.createdAt) === currentMonth
  );
  return found ? toPublic(found) : null;
}

async function listForTeacherDb(tenantId: string, teacherId?: string): Promise<TeacherFeedback[]> {
  const { prisma } = await import("./db");
  const rows = await prisma.teacherFeedback.findMany({
    where: { tenantId, ...(teacherId ? { teacherId } : {}) },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => toPublic(mapDb(r)));
}

/** Yalnızca yönetim ekranı içindir (bkz. dosya başındaki gizlilik notu). */
export async function listTeacherFeedback(
  tenantId: string,
  teacherId?: string
): Promise<TeacherFeedback[]> {
  if (isDbMode) return listForTeacherDb(tenantId, teacherId);
  const all = await loadAll();
  return all
    .filter((f) => f.tenantId === tenantId && (!teacherId || f.teacherId === teacherId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(toPublic);
}

/** Raporlar ekranı (2026-10-23): tarih filtreli + sayfalı — tüm tablo okunmaz. */
export async function listTeacherFeedbackPage(
  tenantId: string,
  f: { teacherId?: string; fromIso: string; toIso: string; page: number; pageSize: number }
): Promise<{ rows: TeacherFeedback[]; total: number }> {
  const skip = Math.max(0, (f.page - 1) * f.pageSize);
  if (isDbMode) {
    const { prisma } = await import("./db");
    const where = {
      tenantId,
      ...(f.teacherId ? { teacherId: f.teacherId } : {}),
      createdAt: { gte: new Date(f.fromIso), lte: new Date(f.toIso) },
    };
    const [rows, total] = await Promise.all([
      prisma.teacherFeedback.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: f.pageSize }),
      prisma.teacherFeedback.count({ where }),
    ]);
    return { rows: rows.map((r) => toPublic(mapDb(r))), total };
  }
  const all = (await loadAll())
    .filter(
      (x) =>
        x.tenantId === tenantId &&
        (!f.teacherId || x.teacherId === f.teacherId) &&
        x.createdAt >= f.fromIso &&
        x.createdAt <= f.toIso
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { rows: all.slice(skip, skip + f.pageSize).map(toPublic), total: all.length };
}

async function getByIdDb(tenantId: string, id: string): Promise<DbTeacherFeedback | null> {
  const { prisma } = await import("./db");
  return prisma.teacherFeedback.findFirst({ where: { id, tenantId } });
}

export async function getTeacherFeedbackById(tenantId: string, id: string): Promise<TeacherFeedback | null> {
  if (isDbMode) {
    const row = await getByIdDb(tenantId, id);
    return row ? toPublic(mapDb(row)) : null;
  }
  const all = await loadAll();
  const found = all.find((f) => f.id === id && f.tenantId === tenantId);
  return found ? toPublic(found) : null;
}

/** Yönetici durum güncellemesi: İncelendi / Aksiyon Alındı / Arşivlendi. */
export async function updateTeacherFeedbackStatus(
  tenantId: string,
  id: string,
  status: TeacherFeedbackStatus
): Promise<TeacherFeedback | null> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    const existing = await getByIdDb(tenantId, id);
    if (!existing) return null;
    const row = await prisma.teacherFeedback.update({ where: { id }, data: { status } });
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

/** Yönetici bir yorumu öğretmenin anonim özetinde paylaşmayı seçer/geri alır. */
export async function setTeacherFeedbackShared(
  tenantId: string,
  id: string,
  shared: boolean
): Promise<TeacherFeedback | null> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    const existing = await getByIdDb(tenantId, id);
    if (!existing) return null;
    const row = await prisma.teacherFeedback.update({ where: { id }, data: { sharedWithTeacher: shared } });
    return toPublic(mapDb(row));
  }
  const all = await loadAll();
  const idx = all.findIndex((f) => f.id === id && f.tenantId === tenantId);
  if (idx < 0) return null;
  const updated: StoredFeedback = { ...all[idx]!, sharedWithTeacher: shared, updatedAt: new Date().toISOString() };
  const next = [...all];
  next[idx] = updated;
  await saveAll(next);
  return toPublic(updated);
}

export type TeacherFeedbackSummary = {
  responseCount: number;
  eligible: boolean;
  criteriaAverages: Record<TeacherFeedbackCriterionKey, number> | null;
  continueDistribution: Record<"yes" | "unsure" | "no", number> | null;
  sharedComments: string[];
};

/**
 * Öğretmenin GÖREBİLECEĞİ tek görünüm — ham kayıt/kimlik YOK, yalnızca
 * eşik sağlanınca (bkz. TEACHER_FEEDBACK_MIN_ANONYMOUS_RESPONSES) kriter
 * ortalamaları + devam tercihi dağılımı + yönetimin paylaşmayı seçtiği
 * yorumlar (kimliksiz düz metin).
 */
export async function computeTeacherFeedbackSummary(
  tenantId: string,
  teacherId: string,
  /** Faz — teacher-performance-v2: opsiyonel dönem filtresi. Verilmezse (v1 çağrısı) tüm-zamanlar davranışı AYNI kalır. */
  periodStart?: string,
  periodEnd?: string
): Promise<TeacherFeedbackSummary> {
  const unfiltered = await listTeacherFeedback(tenantId, teacherId);
  const all =
    periodStart && periodEnd
      ? unfiltered.filter((f) => f.createdAt.slice(0, 10) >= periodStart && f.createdAt.slice(0, 10) <= periodEnd)
      : unfiltered;
  const responseCount = all.length;
  const eligible = responseCount >= TEACHER_FEEDBACK_MIN_ANONYMOUS_RESPONSES;
  if (!eligible) {
    return { responseCount, eligible: false, criteriaAverages: null, continueDistribution: null, sharedComments: [] };
  }

  const criteriaAverages = {} as Record<TeacherFeedbackCriterionKey, number>;
  for (const { key } of TEACHER_FEEDBACK_CRITERIA) {
    const sum = all.reduce((s, f) => s + (f.scores[key] ?? 0), 0);
    criteriaAverages[key] = Math.round((sum / responseCount) * 10) / 10;
  }

  const continueDistribution = { yes: 0, unsure: 0, no: 0 };
  for (const f of all) {
    if (f.continueWithTeacher) continueDistribution[f.continueWithTeacher] += 1;
  }

  const sharedComments = all.filter((f) => f.sharedWithTeacher && f.comment).map((f) => f.comment!);

  return { responseCount, eligible: true, criteriaAverages, continueDistribution, sharedComments };
}

async function clearFeedbackDb(tenantId: string): Promise<void> {
  const { prisma } = await import("./db");
  await prisma.teacherFeedback.deleteMany({ where: { tenantId } });
}

/** Demo reset için — tenant'ın tüm öğretmen geri bildirimlerini siler. */
export async function clearTeacherFeedback(tenantId: string): Promise<void> {
  if (isDbMode) return clearFeedbackDb(tenantId);
  const all = await loadAll();
  const remaining = all.filter((f) => f.tenantId !== tenantId);
  if (remaining.length !== all.length) await saveAll(remaining);
}

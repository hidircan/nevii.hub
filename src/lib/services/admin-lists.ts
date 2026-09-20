import { z } from "zod";
import { readData } from "../store";
import { computeTeacherPerformanceScore } from "../insights/teacher-performance";
import { requireRole, type ServiceContext } from "./context";
import { fail, fromZodError, ok, type ServiceResult } from "./result";

/**
 * Admin P0 salt-okunur listeler (Faz 2).
 *
 * Mobil admin (Kişiler, Yoklama öğrenci araması, Program öğretmen filtresi,
 * Tahsilat, Duyuru hedefleme, ders reassign) bu listeleri tüketir; daha önce
 * `GET /api/v1/students`, `GET /api/v1/teachers`, `GET /api/v1/branches` ve
 * `GET /api/v1/rooms` route'ları YOKTU (istemci 405 alıyordu).
 *
 * Güvenlik:
 * - Roller: SCHOOL_ADMIN/SUPER_ADMIN tam liste; TEACHER kapsamlı alt-küme
 *   (öğrencilerde yalnız kendi öğrencileri, öğretmenlerde yalnız kendisi —
 *   PII minimizasyonu; değerlendirme ekranı kendi adını buradan çözer).
 * - STUDENT/BRANCH_MANAGER/HYPER_ADMIN/AI_AGENT fail-closed (403).
 * - `q` sunucu tarafında filtrelenir (tr-TR, case-insensitive); istemci
 *   tarafı filtreleme YOK — büyük kurumlarda tüm liste çekilmez.
 * - Pagination: `limit` (varsayılan 50, maks 100) + `offset`; yanıt
 *   `total/limit/offset` taşır. Sıra deterministik: ad (tr) + id.
 */

const listQuerySchema = z.object({
  q: z.string().max(100).optional(),
  active: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).max(100000).optional(),
});

function parseOrFail<T>(schema: z.ZodType<T>, input: unknown): ServiceResult<T> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error.flatten());
  return ok(parsed.data);
}

function normalize(q: string | undefined): string {
  return (q ?? "").trim().toLocaleLowerCase("tr-TR");
}

function paginate<T>(rows: T[], limit: number, offset: number): { rows: T[]; total: number } {
  return { rows: rows.slice(offset, offset + limit), total: rows.length };
}

export type AdminStudentRow = {
  id: string;
  name: string;
  instruments: string[];
  teacherId: string;
  teacherName?: string;
  active: boolean;
  parentName: string;
  parentPhone: string;
};

export async function listStudentsTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ students: AdminStudentRow[]; total: number; limit: number; offset: number }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN", "TEACHER"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(listQuerySchema, input);
  if (!v.ok) return v;
  const limit = v.data.limit ?? 50;
  const offset = v.data.offset ?? 0;
  const q = normalize(v.data.q);

  const data = await readData();
  const teacherNameOf = new Map(data.teachers.map((t) => [t.id, t.name]));
  const filtered = data.students
    .filter((s) => (ctx.role === "TEACHER" ? s.teacherId === ctx.teacherId : true))
    .filter((s) => (v.data.active === undefined ? true : v.data.active === "true" ? s.active : !s.active))
    .filter((s) =>
      !q
        ? true
        : s.name.toLocaleLowerCase("tr-TR").includes(q) || s.parentName.toLocaleLowerCase("tr-TR").includes(q)
    )
    .sort((a, b) => a.name.localeCompare(b.name, "tr") || a.id.localeCompare(b.id));

  const page = paginate(filtered, limit, offset);
  return ok({
    students: page.rows.map((s) => ({
      id: s.id,
      name: s.name,
      instruments: [...s.instruments],
      teacherId: s.teacherId,
      teacherName: teacherNameOf.get(s.teacherId),
      active: s.active,
      parentName: s.parentName,
      parentPhone: s.parentPhone,
    })),
    total: page.total,
    limit,
    offset,
  });
}

export type AdminTeacherRow = {
  id: string;
  name: string;
  instruments: string[];
  activeStudentCount: number;
  performanceScore: number | null;
  performanceLabel: "insufficient_data" | "scored";
  phone: string;
  email: string;
};

export async function listTeachersTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ teachers: AdminTeacherRow[]; total: number; limit: number; offset: number }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN", "TEACHER"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(listQuerySchema, input);
  if (!v.ok) return v;
  const limit = v.data.limit ?? 50;
  const offset = v.data.offset ?? 0;
  const q = normalize(v.data.q);

  const data = await readData();
  const filtered = data.teachers
    .filter((t) => (ctx.role === "TEACHER" ? t.id === ctx.teacherId : true))
    .filter((t) => (v.data.active === undefined ? true : v.data.active === "true" ? t.active : !t.active))
    .filter((t) => (!q ? true : t.name.toLocaleLowerCase("tr-TR").includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name, "tr") || a.id.localeCompare(b.id));

  const page = paginate(filtered, limit, offset);
  return ok({
    teachers: page.rows.map((t) => {
      const perf = computeTeacherPerformanceScore(data, t.id);
      return {
        id: t.id,
        name: t.name,
        instruments: [...t.instruments],
        activeStudentCount: perf.activeStudentCount,
        performanceScore: perf.score,
        performanceLabel: perf.score === null ? "insufficient_data" : "scored",
        phone: t.phone,
        email: t.email,
      } satisfies AdminTeacherRow;
    }),
    total: page.total,
    limit,
    offset,
  });
}

export type BranchRow = {
  id: string;
  name: string;
  shortName: string;
  address: string;
  phone: string;
  city: string;
};

/** Şube listesi — kurum ayarlarından salt-okunur (ders reassign + katalog). */
export async function listBranchesTool(ctx: ServiceContext): Promise<ServiceResult<{ branches: BranchRow[] }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN", "TEACHER"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const data = await readData();
  const branches = [...(data.settings.branches ?? [])]
    .sort((a, b) => a.name.localeCompare(b.name, "tr") || String(a.id).localeCompare(String(b.id)))
    .map((b) => ({ id: String(b.id), name: b.name, shortName: b.shortName, address: b.address, phone: b.phone, city: b.city }));
  return ok({ branches });
}

export type LessonListRow = {
  id: string;
  studentId: string;
  studentName?: string;
  teacherId: string;
  teacherName?: string;
  instrument: string;
  roomName?: string;
  branchName?: string;
  startAt: string;
  endAt: string;
  status: string;
  actualStartAt?: string | null;
  actualEndAt?: string | null;
  studentAttended?: boolean | null;
  studentAbsent?: boolean | null;
  studentExcused?: boolean | null;
  lessonProcessed?: boolean | null;
  opsMakeupFlag?: boolean | null;
  homeworkAssigned?: boolean;
};

const lessonsQuerySchema = z.object({
  from: z.string().datetime({ offset: true }),
  to: z.string().datetime({ offset: true }),
});

/**
 * Kurum gün/program listesi — admin Program sekmesi (`from`/`to` gün
 * aralığı, maks 62 gün). Öğretmen/öğrenci kendi schedule uçlarını kullanır
 * (bu liste yalnız admin).
 */
export async function listLessonsTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ lessons: LessonListRow[] }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(lessonsQuerySchema, input);
  if (!v.ok) return v;
  const fromMs = Date.parse(v.data.from);
  const toMs = Date.parse(v.data.to);
  if (!(fromMs < toMs) || toMs - fromMs > 62 * 86400000) {
    return fail("VALIDATION_ERROR", "Geçersiz tarih aralığı (from < to, en fazla 62 gün).");
  }

  const data = await readData();
  const studentNameById = new Map(data.students.map((s) => [s.id, s.name]));
  const teacherNameById = new Map(data.teachers.map((t) => [t.id, t.name]));
  const roomNameById = new Map((data.rooms ?? []).map((r) => [r.id, r.name]));
  const branchNameById = new Map((data.settings.branches ?? []).map((b) => [String(b.id), b.shortName ?? b.name]));
  const homeworkByLesson = new Set(
    (data as { homework?: Array<{ lessonId?: string }> }).homework?.map((h) => h.lessonId).filter(Boolean) ?? []
  );

  const lessons = data.lessons
    .filter((l) => {
      const ms = Date.parse(l.startAt);
      return ms >= fromMs && ms <= toMs;
    })
    .sort((a, b) => a.startAt.localeCompare(b.startAt) || a.id.localeCompare(b.id))
    .map((l) => ({
      id: l.id,
      studentId: l.studentId,
      studentName: studentNameById.get(l.studentId),
      teacherId: l.teacherId,
      teacherName: teacherNameById.get(l.teacherId),
      instrument: l.instrument,
      roomName: roomNameById.get(l.roomId),
      branchName: branchNameById.get(String(l.branchId)),
      startAt: l.startAt,
      endAt: l.endAt,
      status: l.status,
      actualStartAt: l.actualStartAt ?? null,
      actualEndAt: l.actualEndAt ?? null,
      studentAttended: l.studentAttended ?? null,
      studentAbsent: l.studentAbsent ?? null,
      studentExcused: l.studentExcused ?? null,
      lessonProcessed: l.lessonProcessed ?? null,
      opsMakeupFlag: l.opsMakeupFlag ?? null,
      homeworkAssigned: homeworkByLesson.has(l.id),
    }));
  return ok({ lessons });
}

export type CollectionSummary = {
  /** yyyy-MM-dd (UTC) — "bugün" tanımı. */
  today: string;
  /** Bugün tahsil edilen (paidAt=today, void hariç). */
  todayCollected: number;
  /** Bu ay tahsil edilen (paidAt bu ay). */
  monthCollected: number;
  /** Bekleyen toplam (amount - paidAmount, paid/void hariç). */
  pendingTotal: number;
  /** Gecikmiş toplam (status=overdue veya vadesi geçmiş bekleyen). */
  overdueTotal: number;
  pendingCount: number;
  overdueCount: number;
};

/**
 * Tahsilat özeti — admin Finans ekranı (Faz 3). Yalnız öğrenci ödeme
 * kayıtları (tahsilat vakalarıyla AYNI kaynak); bordro/gider/personel
 * YOK (onlar `getFinanceSummaryTool`, kurum-sahibi kapılı). Fiyat/hesap
 * sunucuda; istemci yalnız gösterir.
 */
export async function getCollectionSummaryTool(
  ctx: ServiceContext
): Promise<ServiceResult<CollectionSummary>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const data = await readData();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const month = now.toISOString().slice(0, 7);

  let todayCollected = 0;
  let monthCollected = 0;
  let pendingTotal = 0;
  let overdueTotal = 0;
  let pendingCount = 0;
  let overdueCount = 0;

  for (const p of data.payments) {
    if (p.status === "voided") continue;
    if (p.status === "paid" && p.paidAt) {
      if (p.paidAt.slice(0, 10) === today) todayCollected += p.paidAmount;
      if (p.paidAt.slice(0, 7) === month) monthCollected += p.paidAmount;
      continue;
    }
    const rest = Math.max(0, p.amount - p.paidAmount);
    pendingTotal += rest;
    pendingCount += 1;
    if (p.status === "overdue" || p.dueDate.slice(0, 10) < today) {
      overdueTotal += rest;
      overdueCount += 1;
    }
  }
  return ok({ today, todayCollected, monthCollected, pendingTotal, overdueTotal, pendingCount, overdueCount });
}

export type RoomRow = {
  id: string;
  name: string;
  branchId: string;
  capacity: number;
  instruments: string[];
  active: boolean;
};

/** Oda listesi — şube filtreli reassign akışı için (legacy kayıtta active=true varsayılır). */
export async function listRoomsTool(ctx: ServiceContext): Promise<ServiceResult<{ rooms: RoomRow[] }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN", "TEACHER"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const data = await readData();
  const rooms = [...(data.rooms ?? [])]
    .sort((a, b) => a.name.localeCompare(b.name, "tr") || a.id.localeCompare(b.id))
    .map((r) => ({
      id: r.id,
      name: r.name,
      branchId: String(r.branchId),
      capacity: r.capacity,
      instruments: [...r.instruments],
      active: r.active ?? true,
    }));
  return ok({ rooms });
}

import { z } from "zod";
import { serverCacheGetOrCompute, tenantCacheKey } from "../http/server-cache";
import { readData, readLessonWindow, readPaymentsPageData, readReferenceData } from "../store";
import { computeAllTeacherPerformanceScores, computeTeacherPerformanceScore } from "../insights/teacher-performance";
import { INSTRUMENTS } from "../types";
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

  // DB egress (2026-10-17) — mobil Kişiler/arama her tuşta çağırır: yalnız öğrenci/öğretmen (referans) dilimi.
  const data = await readReferenceData();
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
  const data = await readReferenceData();
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

  // DB egress (2026-10-17) — yalnız istenen aralığın dersleri (+1 gün pay; kesin süzgeç aşağıda aynen).
  const data = await readLessonWindow(new Date(fromMs - 86400000).toISOString(), new Date(toMs + 86400000).toISOString());
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
      studentAttendanceNote: l.studentAttendanceNote ?? null,
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

  // DB egress (2026-10-17) — yalnız ödeme satırları gerekir (ders/yoklama/telafi okunmaz).
  const data = await readPaymentsPageData();
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

export type DashboardSummary = {
  upcomingLessonCount: number;
  pendingAttendanceCount: number;
  overdueTaskCount: number;
  followUpNeededCount: number;
  attentionItems: Array<{ id: string; kind: string; label: string; detail?: string }>;
  topTeachers: Array<{ teacherId: string; teacherName: string; score: number | null; insufficientData: boolean }>;
};

/**
 * Yönetici gün özeti — Özet sekmesi (Faz 4). Yalnız karar verdiren kısa
 * sayılar; ağır analitik web'de kalır. Tanımlar mobil/yoklama ekranıyla
 * AYNI (bekleyen yoklama = süresi geçmiş + ops bayraksız + iptal değil).
 */
export async function getDashboardSummaryTool(
  ctx: ServiceContext
): Promise<ServiceResult<DashboardSummary>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  // Pahalı özet (full-scan + tüm skorlar + görev/tahsilat): 60sn best-effort
  // cache. Yetki DIŞARIDA (cache'e girmez); anahtar tenant-kapsamlı; her iki
  // admin rolü de aynı girdiyi görür (tool içi kullanıcı ayrımı yok).
  const { value } = await serverCacheGetOrCompute(
    tenantCacheKey(ctx.tenantId, "dashboard-summary", "v1"),
    60_000,
    () => computeDashboardSummary(ctx)
  );
  return ok(value);
}

async function computeDashboardSummary(ctx: ServiceContext): Promise<DashboardSummary> {
  const data = await readData();
  const nowMs = Date.now();
  const today = new Date(nowMs).toISOString().slice(0, 10);

  const upcomingLessonCount = data.lessons.filter(
    (l) => l.status !== "cancelled" && Date.parse(l.startAt) >= nowMs && l.startAt.slice(0, 10) === today
  ).length;
  const pendingAttendanceCount = data.lessons.filter(
    (l) =>
      l.status !== "cancelled" &&
      Date.parse(l.endAt) < nowMs &&
      !l.studentAttended &&
      !l.lessonProcessed &&
      !l.studentAbsent &&
      !l.studentExcused &&
      !l.opsMakeupFlag
  ).length;

  const { listTasks } = await import("../tasks");
  const tasks = await listTasks(ctx.tenantId);
  const overdueTaskCount = tasks.filter(
    (t) =>
      !["COMPLETED", "CANCELLED", "ARCHIVED"].includes(t.status) &&
      !!t.dueDate &&
      t.dueDate.slice(0, 10) < today
  ).length;

  const { listFollowUpCases } = await import("../tahsilat/cases");
  const { isOpenFollowUpStatus } = await import("../tahsilat/status");
  const openCases = (await listFollowUpCases(ctx.tenantId)).filter((c) => isOpenFollowUpStatus(c.status));

  const pendingPayments = data.payments.filter((p) => p.status !== "paid" && p.status !== "voided");
  const overduePayments = pendingPayments.filter((p) => p.status === "overdue" || p.dueDate.slice(0, 10) < today);
  const openMakeup = (data.makeupRequests ?? []).filter((m) =>
    ["pending", "suggested", "awaiting_info"].includes(m.status)
  );

  const attentionItems: DashboardSummary["attentionItems"] = [];
  if (overduePayments.length > 0) {
    attentionItems.push({
      id: "overdue-payments",
      kind: "payments",
      label: `${overduePayments.length} gecikmiş ödeme`,
      detail: "Tahsilat takibinden inceleyin",
    });
  }
  if (openMakeup.length > 0) {
    attentionItems.push({
      id: "open-makeup",
      kind: "makeup",
      label: `${openMakeup.length} bekleyen telafi talebi`,
      detail: "Telafi merkezinden karara bağlayın",
    });
  }
  if (overdueTaskCount > 0) {
    attentionItems.push({
      id: "overdue-tasks",
      kind: "tasks",
      label: `${overdueTaskCount} gecikmiş görev`,
      detail: "İş takipten inceleyin",
    });
  }

  const teacherNameById = new Map(data.teachers.map((t) => [t.id, t.name]));
  const topTeachers = computeAllTeacherPerformanceScores(data)
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
    .slice(0, 5)
    .map((p) => ({
      teacherId: p.teacherId,
      teacherName: teacherNameById.get(p.teacherId) ?? "—",
      score: p.score,
      insufficientData: p.score === null,
    }));

  return {
    upcomingLessonCount,
    pendingAttendanceCount,
    overdueTaskCount,
    followUpNeededCount: openCases.length,
    attentionItems,
    topTeachers,
  };
}

export type HomeworkReport = {
  totalCount: number;
  submittedCount: number;
  pendingCount: number;
  overdueCount: number;
  reviewedCount: number;
  byTeacher: Array<{ teacherId: string; teacherName: string; assignedCount: number; submittedCount: number }>;
};

/** Ödev raporu — kurum ödev durumu + öğretmen kırılımı (Faz 4, admin). */
export async function getHomeworkReportTool(
  ctx: ServiceContext
): Promise<ServiceResult<HomeworkReport>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  // Kurum geneli rapor (tüm ödev + tüm teslimler): 60sn best-effort cache.
  const { value } = await serverCacheGetOrCompute(
    tenantCacheKey(ctx.tenantId, "homework-report", "v1"),
    60_000,
    () => computeHomeworkReport(ctx)
  );
  return ok(value);
}

async function computeHomeworkReport(ctx: ServiceContext): Promise<HomeworkReport> {
  const { listAllHomework, listAllHomeworkSubmissions } = await import("../homework");
  const [all, subs] = await Promise.all([
    listAllHomework(ctx.tenantId),
    listAllHomeworkSubmissions(ctx.tenantId),
  ]);
  const data = await readData();
  const teacherNameById = new Map(data.teachers.map((t) => [t.id, t.name]));
  const nowMs = Date.now();

  const submittedIds = new Set(subs.map((s) => s.homeworkId));
  const reviewedCount = subs.filter((s) => !!s.reviewedAt).length;
  const overdueCount = all.filter((h) => !submittedIds.has(h.id) && Date.parse(h.dueDate) < nowMs).length;

  const byTeacherMap = new Map<string, { assignedCount: number; submittedCount: number }>();
  for (const h of all) {
    const row = byTeacherMap.get(h.teacherId) ?? { assignedCount: 0, submittedCount: 0 };
    row.assignedCount += 1;
    if (submittedIds.has(h.id)) row.submittedCount += 1;
    byTeacherMap.set(h.teacherId, row);
  }
  const byTeacher = [...byTeacherMap.entries()]
    .map(([teacherId, row]) => ({
      teacherId,
      teacherName: teacherNameById.get(teacherId) ?? "—",
      assignedCount: row.assignedCount,
      submittedCount: row.submittedCount,
    }))
    .sort((a, b) => a.teacherName.localeCompare(b.teacherName, "tr") || a.teacherId.localeCompare(b.teacherId));

  return {
    totalCount: all.length,
    submittedCount: submittedIds.size,
    pendingCount: all.length - submittedIds.size,
    overdueCount,
    reviewedCount,
    byTeacher,
  };
}

export type InstrumentsResponse = {
  entries: Array<{ id: string; name: string; status: "active" | "archived" }>;
  staticInstruments: string[];
};

/** Enstrüman kataloğu — katalog ekranı (salt-okunur mobil). */
export async function listInstrumentsTool(
  ctx: ServiceContext
): Promise<ServiceResult<InstrumentsResponse>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN", "TEACHER"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const { listInstrumentCatalog } = await import("../instrument-catalog");
  const entries = (await listInstrumentCatalog(ctx.tenantId)).map((e) => ({
    id: e.id,
    name: e.name,
    status: e.status,
  }));
  return ok({ entries, staticInstruments: [...INSTRUMENTS] });
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
  const data = await readReferenceData();
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

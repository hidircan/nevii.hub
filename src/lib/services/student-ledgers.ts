import { z } from "zod";
import { effectiveLessonOpsStatus } from "../lesson-ops";
import { canViewReceipt } from "../receipt";
import { readData } from "../store";
import type { AppData, Lesson } from "../types";
import { assertStudentAccess, requireRole, type ServiceContext } from "./context";
import { fail, fromZodError, ok, type ServiceResult } from "./result";

/**
 * Öğrenci/veli salt-okunur ledger modelleri (mobil yoklama/ödeme/telafi
 * detay ekranları). Üç model de server-authoritative'tir: kapsam YALNIZ
 * oturumdan (`assertStudentAccess`), istemci tenant/studentId üretemez.
 * Sıralama deterministiktir (zaman + id); sayfalama limit/offset.
 */

export type LedgerDisplayKey =
  | "attended"
  | "processed"
  | "makeup"
  | "absent"
  | "excused"
  | "cancelled"
  | "in_progress"
  | "pending"
  | "upcoming";

export const LEDGER_DISPLAY_KEYS: LedgerDisplayKey[] = [
  "attended",
  "processed",
  "makeup",
  "absent",
  "excused",
  "cancelled",
  "in_progress",
  "pending",
  "upcoming",
];

function parseOrFail<T>(schema: z.ZodType<T>, input: unknown): ServiceResult<T> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error.flatten());
  return ok(parsed.data);
}

function isMobileExcluded(ctx: ServiceContext): boolean {
  return ctx.loginRole === "BRANCH_MANAGER" || ctx.role === "BRANCH_MANAGER";
}

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).max(100000).optional(),
});

function paginationOf(input: { limit?: number; offset?: number }) {
  return { limit: input.limit ?? 50, offset: input.offset ?? 0 };
}

/**
 * Ders görüntü statüsü — TEK öncelik zinciri (mobil `lessonStatusBadge` ile
 * aynı sıra): iptal > gelmedi(no_show) > ops bayrağı > devam ediyor >
 * (geçmişse) sonuçlanmadı > planlandı. "Yoklama bekliyor" operasyon jargonu
 * bu sözleşmede YOK — yerine `pending` anahtarı döner, istemci nötr metin basar.
 */
export function lessonDisplayKey(lesson: Lesson, nowMs: number): LedgerDisplayKey {
  if (lesson.status === "cancelled") return "cancelled";
  if (lesson.status === "no_show") return "absent";
  const ops = effectiveLessonOpsStatus(lesson);
  if (ops) return ops;
  if (lesson.status === "in_progress") return "in_progress";
  if (new Date(lesson.endAt).getTime() < nowMs) return "pending";
  return "upcoming";
}

/** Kazanan statünün değişiklik zamanı — yalnız bayrak/hareketin kendi damgası, tahmin yok. */
function lessonStatusChangedAt(lesson: Lesson, key: LedgerDisplayKey): string | null {
  switch (key) {
    case "attended":
      return lesson.studentAttendedAt ?? null;
    case "processed":
      return lesson.lessonProcessedAt ?? null;
    case "makeup":
      return lesson.opsMakeupFlagAt ?? null;
    case "absent":
      return lesson.studentAbsentAt ?? null;
    case "excused":
      return lesson.studentExcusedAt ?? null;
    default:
      return null;
  }
}

/**
 * Statü notu — role-aware. `lessonProcessedReason`/`notes` operasyonel iç
 * metindir; STUDENT (SELF/GUARDIAN) yüzeyine SIZMAZ (null). Öğretmen/admin
 * kendi girdiği metni görebilir.
 */
function lessonStatusNote(ctx: ServiceContext, lesson: Lesson, key: LedgerDisplayKey): string | null {
  if (ctx.role === "STUDENT") return null;
  if (key === "processed") return lesson.lessonProcessedReason ?? null;
  return lesson.notes ?? null;
}

function teacherNameById(data: AppData): Map<string, string> {
  return new Map(data.teachers.map((t) => [t.id, t.name]));
}

function branchNameById(data: AppData): Map<string, string> {
  return new Map((data.settings?.branches ?? []).map((b) => [b.id, b.shortName ?? b.name]));
}

function roomNameById(data: AppData): Map<string, string> {
  return new Map((data.rooms ?? []).map((r) => [r.id, r.name]));
}

function durationMinutes(startAt: string, endAt: string): number | null {
  const ms = new Date(endAt).getTime() - new Date(startAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.round(ms / 60000);
}

export type AttendanceLedgerItem = {
  lessonId: string;
  startAt: string;
  endAt: string;
  durationMinutes: number | null;
  teacherId: string;
  teacherName?: string;
  branchName?: string;
  roomName?: string;
  instrument: string;
  lessonType: string;
  lessonStatus: Lesson["status"];
  opsStatus: ReturnType<typeof effectiveLessonOpsStatus>;
  displayKey: LedgerDisplayKey;
  statusChangedAt: string | null;
  statusNote: string | null;
  attendance: { id: string; status: string; markedAt: string } | null;
  makeup: { requestId: string; role: "source" | "confirmed"; linkedLessonId: string | null } | null;
};

export type AttendanceLedgerCounts = Record<LedgerDisplayKey, number>;

const attendanceLedgerSchema = z.object({
  studentId: z.string().min(1),
  status: z.array(z.enum(LEDGER_DISPLAY_KEYS)).optional(),
  direction: z.enum(["past", "upcoming", "all"]).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  sort: z.enum(["asc", "desc"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).max(100000).optional(),
});

export async function getStudentAttendanceLedgerTool(
  ctx: ServiceContext,
  input: unknown,
  now = new Date()
): Promise<
  ServiceResult<{
    studentId: string;
    total: number;
    limit: number;
    offset: number;
    counts: AttendanceLedgerCounts;
    items: AttendanceLedgerItem[];
  }>
> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "TEACHER", "STUDENT", "AI_AGENT", "SUPER_ADMIN"]);
  if (!auth.ok || isMobileExcluded(ctx)) return fail("FORBIDDEN", auth.ok ? "Bu hesap bu listeye erişemez." : auth.message);

  const v = parseOrFail(attendanceLedgerSchema, input);
  if (!v.ok) return v;

  const data = await readData();
  const student = data.students.find((s) => s.id === v.data.studentId);
  const access = await assertStudentAccess(ctx, student, v.data.studentId);
  if (!access.ok) return fail(access.code, access.message);

  const nowMs = now.getTime();
  const teacherNames = teacherNameById(data);
  const branchNames = branchNameById(data);
  const roomNames = roomNameById(data);
  const confirmedByLessonId = new Map(data.makeupRequests.filter((m) => m.confirmedLessonId).map((m) => [m.confirmedLessonId as string, m]));
  const attendanceByLessonId = new Map(data.attendances.map((a) => [a.lessonId, a]));

  const fromTs = v.data.from ? new Date(v.data.from).getTime() : undefined;
  const toTs = v.data.to ? new Date(v.data.to).getTime() : undefined;
  const direction = v.data.direction ?? "all";

  const base = data.lessons.filter((l) => {
    if (l.studentId !== v.data.studentId) return false;
    const startTs = new Date(l.startAt).getTime();
    if (fromTs !== undefined && !(startTs >= fromTs)) return false;
    if (toTs !== undefined && !(startTs <= toTs)) return false;
    if (direction === "past" && !(startTs <= nowMs)) return false;
    if (direction === "upcoming" && !(startTs > nowMs)) return false;
    return true;
  });

  const counts = Object.fromEntries(LEDGER_DISPLAY_KEYS.map((k) => [k, 0])) as AttendanceLedgerCounts;
  const withKeys = base.map((lesson) => ({ lesson, key: lessonDisplayKey(lesson, nowMs) }));
  for (const { key } of withKeys) counts[key]++;

  const statusFilter = v.data.status ? new Set(v.data.status) : null;
  const filtered = statusFilter ? withKeys.filter(({ key }) => statusFilter.has(key)) : withKeys;

  const sortDir = v.data.sort ?? "desc";
  filtered.sort((a, b) => {
    const d = a.lesson.startAt.localeCompare(b.lesson.startAt) || a.lesson.id.localeCompare(b.lesson.id);
    return sortDir === "asc" ? d : -d;
  });

  const { limit, offset } = paginationOf(v.data);
  const page = filtered.slice(offset, offset + limit);

  const items: AttendanceLedgerItem[] = page.map(({ lesson, key }) => {
    const attendance = attendanceByLessonId.get(lesson.id) ?? null;
    const confirmed = confirmedByLessonId.get(lesson.id) ?? null;
    return {
      lessonId: lesson.id,
      startAt: lesson.startAt,
      endAt: lesson.endAt,
      durationMinutes: durationMinutes(lesson.startAt, lesson.endAt),
      teacherId: lesson.teacherId,
      teacherName: teacherNames.get(lesson.teacherId),
      branchName: branchNames.get(lesson.branchId),
      roomName: roomNames.get(lesson.roomId),
      instrument: lesson.instrument,
      lessonType: lesson.type,
      lessonStatus: lesson.status,
      opsStatus: effectiveLessonOpsStatus(lesson),
      displayKey: key,
      statusChangedAt: lessonStatusChangedAt(lesson, key),
      statusNote: lessonStatusNote(ctx, lesson, key),
      attendance: attendance ? { id: attendance.id, status: attendance.status, markedAt: attendance.markedAt } : null,
      makeup: lesson.makeupRequestId
        ? {
            requestId: lesson.makeupRequestId,
            role: "source",
            linkedLessonId: data.makeupRequests.find((m) => m.id === lesson.makeupRequestId)?.confirmedLessonId ?? null,
          }
        : confirmed
          ? { requestId: confirmed.id, role: "confirmed", linkedLessonId: confirmed.sourceLessonId }
          : null,
    };
  });

  return ok({ studentId: v.data.studentId, total: filtered.length, limit, offset, counts, items });
}

export type MakeupLedgerLessonRef = {
  id: string;
  startAt: string;
  endAt: string;
  teacherName?: string;
  branchName?: string;
  roomName?: string;
  instrument: string;
  displayKey: LedgerDisplayKey;
} | null;

export type MakeupLedgerItem = {
  id: string;
  studentId: string;
  status: string;
  reason: string;
  policyNote: string;
  decisionNote: string | null;
  decidedAt: string | null;
  expiresAt: string;
  createdAt: string;
  sourceLesson: MakeupLedgerLessonRef;
  confirmedLesson: MakeupLedgerLessonRef;
  attendanceId: string;
  branchName?: string;
  teacherName?: string;
  instrument: string;
};

const makeupLedgerSchema = z.object({
  studentId: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).max(100000).optional(),
});

export async function getStudentMakeupLedgerTool(
  ctx: ServiceContext,
  input: unknown,
  now = new Date()
): Promise<ServiceResult<{ studentId: string; total: number; limit: number; offset: number; items: MakeupLedgerItem[] }>> {
  const auth = requireRole(ctx, ["TEACHER", "STUDENT", "SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok || isMobileExcluded(ctx)) return fail("FORBIDDEN", "Bu hesap telafi listesine erişemez.");

  const v = parseOrFail(makeupLedgerSchema, input);
  if (!v.ok) return v;

  const data = await readData();
  const student = data.students.find((s) => s.id === v.data.studentId);
  const access = await assertStudentAccess(ctx, student, v.data.studentId);
  if (!access.ok) return fail(access.code, access.message);

  const nowMs = now.getTime();
  const teacherNames = teacherNameById(data);
  const branchNames = branchNameById(data);
  const roomNames = roomNameById(data);
  const lessonById = new Map(data.lessons.map((l) => [l.id, l]));

  const toRef = (lessonId: string | undefined): MakeupLedgerLessonRef => {
    if (!lessonId) return null;
    const l = lessonById.get(lessonId);
    if (!l) return null;
    return {
      id: l.id,
      startAt: l.startAt,
      endAt: l.endAt,
      teacherName: teacherNames.get(l.teacherId),
      branchName: branchNames.get(l.branchId),
      roomName: roomNames.get(l.roomId),
      instrument: l.instrument,
      displayKey: lessonDisplayKey(l, nowMs),
    };
  };

  const rows = data.makeupRequests
    .filter((m) => m.studentId === v.data.studentId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));

  const { limit, offset } = paginationOf(v.data);
  const items: MakeupLedgerItem[] = rows.slice(offset, offset + limit).map((m) => ({
    id: m.id,
    studentId: m.studentId,
    status: m.status,
    reason: m.reason,
    policyNote: m.policyNote,
    // Karar notu operasyonel iç metin olabilir — öğrenci/veli yüzeyine sızmaz.
    decisionNote: ctx.role === "STUDENT" ? null : (m.decisionNote ?? null),
    decidedAt: m.decidedAt ?? null,
    expiresAt: m.expiresAt,
    createdAt: m.createdAt,
    sourceLesson: toRef(m.sourceLessonId),
    confirmedLesson: toRef(m.confirmedLessonId),
    attendanceId: m.attendanceId,
    branchName: branchNames.get(m.branchId),
    teacherName: teacherNames.get(m.teacherId),
    instrument: m.instrument,
  }));

  return ok({ studentId: v.data.studentId, total: rows.length, limit, offset, items });
}

export type PaymentLedgerLessonRef = {
  id: string;
  startAt: string;
  endAt: string;
  teacherName?: string;
  branchName?: string;
  roomName?: string;
  instrument: string;
  displayKey: LedgerDisplayKey;
} | null;

export type PaymentLedgerItem = {
  id: string;
  description: string;
  amount: number;
  paidAmount: number;
  remaining: number;
  status: string;
  source?: string;
  dueDate: string;
  paidAt?: string;
  method?: string;
  paymentNote?: string;
  receiptAvailable: boolean;
  contract: { id: string; contractNumber: string; programmeName: string; installmentSequence?: number } | null;
  lesson: PaymentLedgerLessonRef;
};

export type PaymentLedgerMonth = {
  month: string;
  accrued: number;
  paid: number;
  remaining: number;
  status: "paid" | "partial" | "pending" | "overdue" | "voided";
  earliestUnpaidDueDate: string | null;
  itemCount: number;
};

const paymentLedgerSchema = z.object({
  studentId: z.string().min(1),
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).max(100000).optional(),
});

export type PaymentLedgerQuery = z.infer<typeof paymentLedgerSchema>;

function monthStatus(items: Array<{ status: string; amount: number; paidAmount: number }>): PaymentLedgerMonth["status"] {
  if (items.length > 0 && items.every((p) => p.status === "voided")) return "voided";
  const accrued = items.reduce((n, p) => n + p.amount, 0);
  const paid = items.reduce((n, p) => n + p.paidAmount, 0);
  if (accrued - paid <= 0 && accrued > 0) return "paid";
  if (items.some((p) => p.status === "overdue")) return "overdue";
  if (paid > 0) return "partial";
  return "pending";
}

export async function queryPaymentLedger(
  ctx: ServiceContext,
  query: PaymentLedgerQuery,
  now = new Date()
): Promise<
  ServiceResult<{
    studentId: string;
    outstanding: number;
    onlinePayEnabled: boolean;
    months: PaymentLedgerMonth[];
    total: number;
    items: PaymentLedgerItem[];
  }>
> {
  const data = await readData();
  const nowMs = now.getTime();
  const teacherNames = teacherNameById(data);
  const branchNames = branchNameById(data);
  const roomNames = roomNameById(data);
  const lessonById = new Map(data.lessons.map((l) => [l.id, l]));
  // Sözleşmeler ayrı dosyadadır (data/student-contracts.json) — AppData içinde değil.
  const { listContractsForStudent } = await import("../contracts");
  const contractById = new Map((await listContractsForStudent(ctx.tenantId, query.studentId)).map((c) => [c.id, c]));

  const all = data.payments.filter((p) => p.studentId === query.studentId);
  // Mevcut finans matematiği AYNI (`getParentBalanceTool`): ödenmemiş = paid
  // dışındakilerin (amount - paidAmount) toplamı. Değiştirilmedi.
  const outstanding = all.filter((p) => p.status !== "paid").reduce((s, p) => s + (p.amount - p.paidAmount), 0);

  const monthFilter = query.month;
  const fromTs = query.from ? new Date(query.from).getTime() : undefined;
  const toTs = query.to ? new Date(query.to).getTime() : undefined;
  const scoped = all.filter((p) => {
    if (monthFilter && p.dueDate.slice(0, 7) !== monthFilter) return false;
    const dueTs = new Date(p.dueDate).getTime();
    if (fromTs !== undefined && !(dueTs >= fromTs)) return false;
    if (toTs !== undefined && !(dueTs <= toTs)) return false;
    return true;
  });

  const toItem = (p: (typeof scoped)[number]): PaymentLedgerItem => {
    const lesson = p.lessonId ? lessonById.get(p.lessonId) ?? null : null;
    const contract = p.contractId ? contractById.get(p.contractId) ?? null : null;
    return {
      id: p.id,
      description: p.description,
      amount: p.amount,
      paidAmount: p.paidAmount,
      remaining: Math.max(p.amount - p.paidAmount, 0),
      status: p.status,
      source: p.source,
      dueDate: p.dueDate,
      paidAt: p.paidAt,
      method: p.method,
      paymentNote: p.paymentNote,
      receiptAvailable: canViewReceipt(p),
      contract: contract
        ? {
            id: contract.id,
            contractNumber: contract.contractNumber,
            programmeName: contract.programmeName,
            installmentSequence: p.installmentSequence,
          }
        : null,
      lesson: lesson
        ? {
            id: lesson.id,
            startAt: lesson.startAt,
            endAt: lesson.endAt,
            teacherName: teacherNames.get(lesson.teacherId),
            branchName: branchNames.get(lesson.branchId),
            roomName: roomNames.get(lesson.roomId),
            instrument: lesson.instrument,
            displayKey: lessonDisplayKey(lesson, nowMs),
          }
        : null,
    };
  };

  const sorted = [...scoped].sort((a, b) => b.dueDate.localeCompare(a.dueDate) || a.id.localeCompare(b.id));

  const byMonth = new Map<string, typeof scoped>();
  for (const p of all) {
    const key = p.dueDate.slice(0, 7);
    const list = byMonth.get(key) ?? [];
    list.push(p);
    byMonth.set(key, list);
  }
  const months: PaymentLedgerMonth[] = [...byMonth.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([month, list]) => {
      const accrued = list.reduce((n, p) => n + p.amount, 0);
      const paid = list.reduce((n, p) => n + p.paidAmount, 0);
      const unpaidDue = list
        .filter((p) => p.status !== "paid" && p.status !== "voided")
        .map((p) => p.dueDate)
        .sort();
      return {
        month,
        accrued,
        paid,
        remaining: Math.max(accrued - paid, 0),
        status: monthStatus(list),
        earliestUnpaidDueDate: unpaidDue[0] ?? null,
        itemCount: list.length,
      };
    });

  const { limit, offset } = paginationOf(query);
  const { getPaymentProvider } = await import("../payment-provider/provider-factory");

  return ok({
    studentId: query.studentId,
    outstanding,
    onlinePayEnabled: getPaymentProvider().isConfigured(),
    months,
    total: sorted.length,
    items: sorted.slice(offset, offset + limit).map(toItem),
  });
}

/** CSV hücre kaçışı — `;` ayraçlı TR-Excel uyumu, formül enjeksiyonuna karşı `=`/`+`/`-`/`@` öneki nötrlenir. */
function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  const safe = /^[=+\-@]/.test(s.trimStart()) ? `'${s}` : s;
  return /[;"\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const EXPORT_MAX_ROWS = 2000;

export type PaymentLedgerExportQuery = { studentId: string; month?: string; from?: string; to?: string };

/**
 * Ödeme dökümü CSV — ledger ile AYNI sorgu + AYNI toplamlar (istemci yeniden
 * hesaplamaz). TR-Excel uyumu için `;` ayraç + BOM. Tutarlar tam sayı TL.
 */
export async function buildPaymentLedgerCsv(
  ctx: ServiceContext,
  query: PaymentLedgerExportQuery
): Promise<ServiceResult<{ filename: string; csv: string; rowCount: number; truncated: boolean }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "STUDENT", "AI_AGENT", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(
    z.object({
      studentId: z.string().min(1),
      month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
      from: z.string().optional(),
      to: z.string().optional(),
    }),
    query
  );
  if (!v.ok) return v;

  const data = await readData();
  const student = data.students.find((s) => s.id === v.data.studentId);
  const access = await assertStudentAccess(ctx, student, v.data.studentId);
  if (!access.ok) return fail(access.code, access.message);

  const ledger = await queryPaymentLedger(ctx, { ...v.data, limit: EXPORT_MAX_ROWS, offset: 0 });
  if (!ledger.ok) return ledger;
  const { months, outstanding } = ledger.data;
  const truncated = ledger.data.total > EXPORT_MAX_ROWS;
  const all = ledger;

  const STATUS_TR: Record<string, string> = {
    paid: "Ödendi",
    pending: "Bekliyor",
    overdue: "Gecikti",
    partial: "Kısmi ödendi",
    voided: "İptal edildi",
  };
  const lines: string[] = [];
  lines.push(`\uFEFF${["Öğrenci", student?.name ?? v.data.studentId].map(csvCell).join(";")}`);
  lines.push(
    ["Dönem", v.data.month ?? [v.data.from ?? "kayıt başı", v.data.to ?? "bugün"].join(" / ")].map(csvCell).join(";")
  );
  lines.push(
    [
      "Ay",
      "Vade",
      "Açıklama",
      "Tutar (TL)",
      "Ödenen (TL)",
      "Kalan (TL)",
      "Durum",
      "Yöntem",
      "Tahsilat tarihi",
      "Ders tarihi",
      "Ders",
      "Öğretmen",
      "Şube",
    ]
      .map(csvCell)
      .join(";")
  );
  for (const item of all.data.items) {
    lines.push(
      [
        item.dueDate.slice(0, 7),
        item.dueDate.slice(0, 10),
        item.description,
        item.amount,
        item.paidAmount,
        item.remaining,
        STATUS_TR[item.status] ?? item.status,
        item.method ?? "",
        item.paidAt ? item.paidAt.slice(0, 10) : "",
        item.lesson ? item.lesson.startAt.slice(0, 10) : "",
        item.lesson ? `${item.lesson.startAt.slice(11, 16)}-${item.lesson.endAt.slice(11, 16)} ${item.lesson.instrument}` : "",
        item.lesson?.teacherName ?? "",
        item.lesson?.branchName ?? "",
      ]
        .map(csvCell)
        .join(";")
    );
  }
  lines.push("");
  lines.push(["AY ÖZETLERİ", "Tahakkuk (TL)", "Ödenen (TL)", "Kalan (TL)", "Kayıt"].map(csvCell).join(";"));
  for (const m of months) {
    lines.push([m.month, m.accrued, m.paid, m.remaining, m.itemCount].map(csvCell).join(";"));
  }
  lines.push(["GENEL KALAN (TL)", outstanding].map(csvCell).join(";"));
  if (truncated) lines.push(["NOT", `Liste ${EXPORT_MAX_ROWS} satırla sınırlı; özetler tüm kayıtları kapsar.`].map(csvCell).join(";"));

  const stamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const scope = v.data.month ?? "tumu";
  return ok({ filename: `odeme-dokumu-${scope}-${stamp}.csv`, csv: lines.join("\r\n"), rowCount: all.data.items.length, truncated });
}

export async function getStudentPaymentLedgerTool(ctx: ServiceContext, input: unknown) {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "STUDENT", "AI_AGENT", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const v = parseOrFail(paymentLedgerSchema, input);
  if (!v.ok) return v;

  const data = await readData();
  const student = data.students.find((s) => s.id === v.data.studentId);
  const access = await assertStudentAccess(ctx, student, v.data.studentId);
  if (!access.ok) return fail(access.code, access.message);

  return queryPaymentLedger(ctx, v.data);
}

/**
 * 2026-10-23 — GRUP DERSİ (kulüpten AYRI domain).
 *
 * Mimari karar: grup dersi normal ders planlamanın bir varyantıdır, kulüp üyeliği değildir.
 * - Tanım (`GroupLesson`): öğretmen, branş/enstrüman, şube/oda, kapasite, süre, öğrenci başı aylık ücret, tekrar düzeni.
 * - Katılım = öğrencinin BRANŞ KAYDI (`StudentEnrollment.groupLessonId`). Öğrenci bilgileri, sözleşme, ödeme, ilk tahsilat
 *   ve aylık tahakkuk o kaydın NORMAL koşullarıyla yürür (kulübün `source: "club"` ücret satırları KULLANILMAZ).
 * - Ders satırları kanonik `Lesson` tablosundadır: oturum × katılımcı başına bir satır (`type: "regular"`,
 *   `groupLessonId`, `groupSessionId`, `enrollmentId`). Yoklama/telafi/ders başı faturalama satır bazında aynen çalışır;
 *   aynı oturumun satırları öğretmen/odayı paylaşır (`findSlotConflict`), hakediş oturum başına bir kez (teacher-payout.ts).
 * - Oturum anahtarı tanım + başlangıç saatinden türetilir (`groupSessionKey`): sonradan katılan öğrenci aynı oturuma bağlanır.
 * Kulüpten yeniden kullanılan YALNIZ ders omurgası kalıbıdır (oturum anahtarı, çakışma muafiyeti, kilit deseni).
 * STORE_MODE=db → Prisma `GroupLesson`; json/memory → dosya (clubs.ts ile aynı desen).
 */
import path from "path";
import { z } from "zod";
import { isDbMode, resolveDataDir } from "./config";
import { uid } from "./utils";
import { fail, ok, type ServiceResult } from "./services/result";
import { requireRole, type ServiceContext } from "./services/context";
import { DEFAULT_APP_TIMEZONE, addDaysYmd, toZonedYmd, zonedHm, zonedWallTimeToUtc, zonedWeekday } from "./timezone";
import type { Lesson, StudentEnrollment, StudentRef } from "./types";

export type GroupLessonRecurrence = "weekly" | "once";
export type GroupLessonStatus = "active" | "ended";

export type GroupLesson = {
  id: string;
  name: string;
  teacherId: string;
  instrument: string;
  branchId: string;
  roomId: string;
  capacity: number;
  durationMinutes: number;
  /** Öğrenci başı aylık ücret (TL) — yeni katılımın branş kaydına önerilir; mevcut kayıtları değiştirmez. */
  monthlyFee: number;
  recurrence: GroupLessonRecurrence;
  /** 0=Pazar … 6=Cumartesi. */
  weekday: number;
  /** "HH:mm" kurum saati. */
  startTime: string;
  /** YYYY-MM-DD */
  startsOn: string;
  endsOn: string;
  sessionOverrides: { extra: string[]; cancelled: string[] };
  status: GroupLessonStatus;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
};

export type PlannedGroupSession = { key: string; startAt: string; endAt: string; extra: boolean };

const ADMIN_ROLES = ["SCHOOL_ADMIN", "SUPER_ADMIN"] as ServiceContext["role"][];
const TZ = DEFAULT_APP_TIMEZONE;
const WEEKDAY_TR = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
const MAX_WEEKS = 52;

// ── Saf kurallar ─────────────────────────────────────────────────────────────

/** Oturum anahtarı: tanım + başlangıç anı (UTC dakika). Aynı oturumun tüm katılımcı satırları bunu taşır. */
export function groupSessionKey(groupId: string, startAtIso: string): string {
  return `gls_${groupId}_${new Date(startAtIso).toISOString().slice(0, 16).replace(/[-:T]/g, "")}`;
}

/** "Salı 18:00" — branş kaydının `lessonScheduleText` alanı (sözleşme ve görünümler bunu okur). */
export function groupScheduleText(g: Pick<GroupLesson, "weekday" | "startTime">): string {
  return `${WEEKDAY_TR[g.weekday] ?? ""} ${g.startTime}`.trim();
}

export function groupScheduleLabel(g: Pick<GroupLesson, "recurrence" | "weekday" | "startTime" | "startsOn" | "endsOn" | "durationMinutes">): string {
  const d = (ymd: string) => ymd.split("-").reverse().join(".");
  return g.recurrence === "once"
    ? `Tek seferlik · ${d(g.startsOn)} ${g.startTime} · ${g.durationMinutes} dk`
    : `Her ${groupScheduleText(g)} · ${d(g.startsOn)} – ${d(g.endsOn)} · ${g.durationMinutes} dk`;
}

/** Planlı oturumlar (tekrar düzeni + ek oturumlar − iptal edilenler), başlangıca göre artan. Kapalı gün süzmesi çağıranda. */
export function planGroupSessions(g: Pick<GroupLesson, "id" | "recurrence" | "weekday" | "startTime" | "startsOn" | "endsOn" | "durationMinutes" | "sessionOverrides">): PlannedGroupSession[] {
  const starts: { iso: string; extra: boolean }[] = [];
  if (g.recurrence === "once") {
    starts.push({ iso: zonedWallTimeToUtc(g.startsOn, g.startTime, TZ).toISOString(), extra: false });
  } else {
    let ymd = g.startsOn;
    // İlk oturum: startsOn'dan itibaren ilk `weekday`.
    for (let i = 0; i < 7 && zonedWeekday(zonedWallTimeToUtc(ymd, "12:00", TZ), TZ) !== g.weekday; i++) ymd = addDaysYmd(ymd, 1);
    for (let w = 0; w < MAX_WEEKS + 1 && ymd <= g.endsOn; w++, ymd = addDaysYmd(ymd, 7)) {
      starts.push({ iso: zonedWallTimeToUtc(ymd, g.startTime, TZ).toISOString(), extra: false });
    }
  }
  for (const iso of g.sessionOverrides.extra) starts.push({ iso: new Date(iso).toISOString(), extra: true });
  const cancelled = new Set(g.sessionOverrides.cancelled);
  const seen = new Set<string>();
  return starts
    .map(({ iso, extra }) => ({
      key: groupSessionKey(g.id, iso),
      startAt: iso,
      endAt: new Date(Date.parse(iso) + g.durationMinutes * 60_000).toISOString(),
      extra,
    }))
    .filter((s) => !cancelled.has(s.key) && !seen.has(s.key) && seen.add(s.key))
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
}

/** Katılım kaydı `dayYmd` gününü kapsar mı: ders başlangıcı (yoksa kayıt tarihi) dahil, bitiş tarihi DAHİL (branş kuralı). */
export function enrollmentCoversDay(e: Pick<StudentEnrollment, "active" | "startDate" | "lessonStartDate" | "endDate">, dayYmd: string): boolean {
  const from = e.lessonStartDate ?? e.startDate ?? "0000-00-00";
  if (from > dayYmd) return false;
  if (e.endDate) return dayYmd <= e.endDate;
  return e.active;
}

export type GroupMember = { student: StudentRef; enrollment: StudentEnrollment };

/** Grubun katılım kayıtları (geçmiş dahil). Pasif/silinmiş öğrencinin kaydı koltuk tutmaz (`isSeatHolder`). */
export function groupMembers(students: readonly StudentRef[], groupId: string): GroupMember[] {
  const out: GroupMember[] = [];
  for (const student of students) {
    for (const enrollment of student.enrollments ?? []) {
      if (enrollment.groupLessonId === groupId) out.push({ student, enrollment });
    }
  }
  return out;
}

/** Koltuk tutar mı: aktif, silinmemiş öğrencinin `dayYmd` günü (veya sonrası) için açık katılım kaydı. */
export function isSeatHolder(m: GroupMember, dayYmd: string): boolean {
  if (!m.student.active || m.student.deletedAt || m.student.purgedAt) return false;
  if (!m.enrollment.active) return false;
  return !m.enrollment.endDate || m.enrollment.endDate >= dayYmd;
}

export function seatCount(students: readonly StudentRef[], groupId: string, dayYmd: string): number {
  return new Set(groupMembers(students, groupId).filter((m) => isSeatHolder(m, dayYmd)).map((m) => m.student.id)).size;
}

/** Yoklama/işlem görmüş satır: iptal edilmez, taşınmaz (geçmiş ve hakediş korunur). */
export function groupRowTouched(l: Lesson): boolean {
  return Boolean(
    l.studentAttended ||
      l.lessonProcessed ||
      l.studentAbsent ||
      l.studentExcused ||
      l.opsMakeupFlag ||
      l.opsClosedFlag ||
      l.actualStartAt ||
      l.status === "in_progress" ||
      l.status === "completed"
  );
}

export type GroupSessionView = PlannedGroupSession & {
  /** İptal edilmemiş katılımcı satırları. */
  rows: Lesson[];
  teacherId: string;
  roomId: string;
  /** Plan dışı kalmış ama satırı olan oturum (ör. eski saat düzeni, yoklama girildiği için korunan). */
  orphan: boolean;
};

/** Plan + satırlar → oturum görünümü (satırı olmayan planlı oturum da listelenir). */
export function groupSessionViews(g: GroupLesson, lessons: readonly Lesson[]): GroupSessionView[] {
  const byKey = new Map<string, Lesson[]>();
  for (const l of lessons) {
    if (l.groupLessonId !== g.id || !l.groupSessionId || l.status === "cancelled") continue;
    byKey.set(l.groupSessionId, [...(byKey.get(l.groupSessionId) ?? []), l]);
  }
  const views: GroupSessionView[] = planGroupSessions(g).map((s) => {
    const rows = byKey.get(s.key) ?? [];
    byKey.delete(s.key);
    return { ...s, rows, teacherId: rows[0]?.teacherId ?? g.teacherId, roomId: rows[0]?.roomId ?? g.roomId, orphan: false };
  });
  for (const [key, rows] of byKey) {
    const first = rows[0]!;
    views.push({ key, startAt: first.startAt, endAt: first.endAt, extra: false, rows, teacherId: first.teacherId, roomId: first.roomId, orphan: true });
  }
  return views.sort((a, b) => a.startAt.localeCompare(b.startAt));
}

// ── Depolama ────────────────────────────────────────────────────────────────

const DATA_DIR = resolveDataDir(path.join(process.cwd(), "data"));
export const GROUP_LESSONS_FILE = path.join(DATA_DIR, "group-lessons.json");
type Row = GroupLesson & { tenantId: string };

async function loadFile(): Promise<Row[]> {
  try {
    const fs = await import("fs/promises");
    return JSON.parse(await fs.readFile(GROUP_LESSONS_FILE, "utf8")) as Row[];
  } catch {
    return [];
  }
}

async function saveFile(rows: Row[]): Promise<void> {
  const fs = await import("fs/promises");
  await fs.mkdir(path.dirname(GROUP_LESSONS_FILE), { recursive: true });
  await fs.writeFile(GROUP_LESSONS_FILE, JSON.stringify(rows, null, 2));
}

function normalize(r: Record<string, unknown>): GroupLesson {
  const o = (r.sessionOverrides ?? {}) as { extra?: unknown; cancelled?: unknown };
  const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v ?? ""));
  return {
    id: String(r.id),
    name: String(r.name),
    teacherId: String(r.teacherId),
    instrument: String(r.instrument),
    branchId: String(r.branchId),
    roomId: String(r.roomId),
    capacity: Number(r.capacity),
    durationMinutes: Number(r.durationMinutes),
    monthlyFee: Number(r.monthlyFee),
    recurrence: r.recurrence === "once" ? "once" : "weekly",
    weekday: Number(r.weekday),
    startTime: String(r.startTime),
    startsOn: String(r.startsOn),
    endsOn: String(r.endsOn),
    sessionOverrides: { extra: arr(o.extra), cancelled: arr(o.cancelled) },
    status: r.status === "ended" ? "ended" : "active",
    createdByUserId: String(r.createdByUserId),
    createdAt: iso(r.createdAt),
    updatedAt: iso(r.updatedAt),
  };
}

export async function listGroupLessons(tenantId: string): Promise<GroupLesson[]> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    const rows = await prisma.groupLesson.findMany({ where: { tenantId }, orderBy: { name: "asc" }, omit: { tenantId: true } });
    return rows.map((r) => normalize(r as unknown as Record<string, unknown>));
  }
  return (await loadFile())
    .filter((g) => g.tenantId === tenantId)
    .map((g) => normalize(g as unknown as Record<string, unknown>))
    .sort((a, b) => a.name.localeCompare(b.name, "tr"));
}

export async function getGroupLesson(tenantId: string, id: string): Promise<GroupLesson | undefined> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    const r = await prisma.groupLesson.findFirst({ where: { tenantId, id }, omit: { tenantId: true } });
    return r ? normalize(r as unknown as Record<string, unknown>) : undefined;
  }
  return (await listGroupLessons(tenantId)).find((g) => g.id === id);
}

async function writeGroupLesson(tenantId: string, g: GroupLesson, isNew: boolean): Promise<void> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    const data = {
      name: g.name,
      teacherId: g.teacherId,
      instrument: g.instrument,
      branchId: g.branchId,
      roomId: g.roomId,
      capacity: g.capacity,
      durationMinutes: g.durationMinutes,
      monthlyFee: g.monthlyFee,
      recurrence: g.recurrence,
      weekday: g.weekday,
      startTime: g.startTime,
      startsOn: g.startsOn,
      endsOn: g.endsOn,
      sessionOverrides: g.sessionOverrides,
      status: g.status,
    };
    if (isNew) await prisma.groupLesson.create({ data: { ...data, id: g.id, tenantId, createdByUserId: g.createdByUserId, createdAt: new Date(g.createdAt) } });
    else await prisma.groupLesson.updateMany({ where: { id: g.id, tenantId }, data });
    return;
  }
  const all = await loadFile();
  const i = all.findIndex((x) => x.id === g.id && x.tenantId === tenantId);
  if (i >= 0) all[i] = { ...g, tenantId };
  else all.push({ ...g, tenantId });
  await saveFile(all);
}

/**
 * Grup bazında SERİLEŞTİRME: kapasite/çakışma kontrolü ile satır yazımı arasında yarış kalmaz (çift tık, iki yönetici aynı
 * son koltuğa öğrenci ekler). db: transaction + `pg_advisory_xact_lock` (kulüp üyelik kilidiyle aynı desen; yalnız mutex —
 * içerideki okuma/yazmalar store'un normal yolunu kullanır). json/memory: dosya kilidi. Kilitler sıralı alınır.
 */
export async function withGroupLessonLock<T>(tenantId: string, groupIds: string[], fn: () => Promise<T>): Promise<T> {
  const ids = Array.from(new Set(groupIds)).sort();
  if (ids.length === 0) return fn();
  const [head, ...rest] = ids;
  const inner = () => withGroupLessonLock(tenantId, rest, fn);
  if (isDbMode) {
    const { prisma } = await import("./db");
    return prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}), hashtext(${`group-lesson:${head}`}))`;
        return inner();
      },
      { maxWait: 10_000, timeout: 30_000 }
    );
  }
  const { withFileLock } = await import("./atomic-json-file");
  return withFileLock(path.join(DATA_DIR, `group-lesson-${head!.replace(/[^\w-]/g, "_")}.lock`), inner);
}

// ── Okuma dilimleri (DB egress: tam okuma yok) ─────────────────────────────────

const ALL_TIME = ["1970-01-01T00:00:00.000Z", "2100-01-01T00:00:00.000Z"] as const;

/** Grubun TÜM katılımcı satırları + referans veri (öğrenciler branş kayıtlarıyla). */
export async function readGroupLessonData(groupId: string) {
  const { readLessonWindow } = await import("./store");
  return readLessonWindow(ALL_TIME[0], ALL_TIME[1], { groupLessonId: groupId });
}

/** Çakışma denetimi için hedef oturumların [ilk − 1 gün, son + 1 gün] penceresindeki tüm dersler. */
async function conflictWindowLessons(sessions: { startAt: string }[]): Promise<Lesson[]> {
  if (!sessions.length) return [];
  const { readLessonWindow } = await import("./store");
  const t = sessions.map((s) => Date.parse(s.startAt));
  // ponytail: 52 haftalık planda pencere ~1 yıl (ödeme/yoklama okunmaz); gerekirse oturum başına pencere.
  const win = await readLessonWindow(new Date(Math.min(...t) - 86_400_000).toISOString(), new Date(Math.max(...t) + 86_400_000).toISOString());
  return win.lessons;
}

// ── Satır üretimi (tek, idempotent yazıcı) ───────────────────────────────────

/** Geçmiş oturum önizlemesi/raporu: oluşturulacak · zaten var · kapalı gün · sorunlu · o tarihte katılımcı yok. */
export type GroupBackfillSession = { key: string; startAt: string; status: "create" | "exists" | "closed" | "issue" | "empty"; students: string[]; message?: string };
type SyncResult = { created: number; skippedClosedDays: number; sessions?: GroupBackfillSession[] };

/**
 * Katılımcıların GELECEK planlı oturumlarındaki eksik satırlarını üretir (TEK yazıcı: gruba ekleme, yeni öğrenci kaydı,
 * sözleşmeden program, ek oturum, düzenleme ve "satırları yenile" hep buradan geçer). İdempotent: (oturum, öğrenci) için
 * iptal edilmemiş satır varsa yenisi açılmaz. Katılım = aktif branş kaydı: kaydı açık öğrencinin iptal edilmiş gelecek
 * satırı (ör. sözleşme iptalinde dersleri iptal edildi) yeniden kurulur; koltuğu boşaltmak kaydı sonlandırmaktır. Önce TÜMÜ doğrulanır:
 * kapasite, öğretmen/oda/öğrenci çakışması, deneme dersi; biri bile tutmazsa hiçbiri yazılmaz. Kapalı gün atlanır.
 * Kilit altında çağrılmalıdır (`withGroupLessonLock`).
 */
export async function syncGroupLessonRowsLocked(
  ctx: ServiceContext,
  g: GroupLesson,
  /**
   * `ignoreRowIds`: bu işlemde iptal edilecek satırlar (yok sayılır). `dryRun`: yalnız doğrula, yazma.
   * `virtualMember`: henüz kaydı açılmamış katılımcı — katılım ön kontrolü yazıcıyla AYNI kurallardan geçer (kayıt + ilk
   * tahsilat yazılıp satırlar yazılamadığı yarım durum oluşmasın).
   * `past`: YALNIZ saati geçmiş oturumlar (geçmiş dersleri sisteme işleme — "Geçmiş oturumları tamamla"). Otomatik akışlar
   * (katılım, düzenleme, yenile) bunu KULLANMAZ: geçmiş satır yalnız yöneticinin önizleyip onayladığı açık işlemle yazılır.
   * Geçmiş modda iptal edilmiş satır yeniden açılmaz, sorunlu oturum (çakışma/kontenjan/eski düzen) bütünüyle atlanıp
   * raporlanır; `skipIssues` yoksa ve sorun varsa hiçbir şey yazılmaz. `onlyKeys`: yalnız bu oturumlar.
   */
  opts: {
    studentIds?: string[];
    ignoreRowIds?: Set<string>;
    dryRun?: boolean;
    virtualMember?: GroupMember;
    past?: boolean;
    onlyKeys?: Set<string>;
    skipIssues?: boolean;
  } = {}
): Promise<ServiceResult<SyncResult>> {
  if (g.status !== "active") return ok({ created: 0, skippedClosedDays: 0 });
  const data = await readGroupLessonData(g.id);
  const { assertSchedulableDate } = await import("./lesson-scheduling");
  const { findSlotConflict } = await import("./lesson-occupancy");
  const { formatDateTime } = await import("./utils");
  const nowMs = Date.now();
  const past = Boolean(opts.past);
  const members = groupMembers(data.students, g.id).filter(
    (m) => (!opts.studentIds || opts.studentIds.includes(m.student.id)) && m.student.active && !m.student.deletedAt && !m.student.purgedAt
  );
  if (opts.virtualMember) members.push(opts.virtualMember);
  const ignored = opts.ignoreRowIds ?? new Set<string>();
  const groupRows = data.lessons.filter((l) => l.groupLessonId === g.id && l.groupSessionId && !ignored.has(l.id));
  const liveRows = groupRows.filter((l) => l.status !== "cancelled");
  // Gelecek: kaydı açık öğrencinin iptal satırı yeniden kurulur. Geçmiş: iptal edilmiş satır KARARDIR, yeniden açılmaz.
  const existing = new Set((past ? groupRows : liveRows).map((l) => `${l.groupSessionId}|${l.studentId}`));
  const nameOf = (id: string) => data.students.find((x) => x.id === id)?.name ?? "Öğrenci";
  let skippedClosedDays = 0;
  const candidates: Lesson[] = [];
  const report: GroupBackfillSession[] = [];
  const room = data.rooms.find((r) => r.id === g.roomId);
  if (!room) return fail("VALIDATION_ERROR", "Grubun odası bulunamadı. Grup dersini düzenleyip aktif bir oda seçin.");
  for (const s of planGroupSessions(g)) {
    if (past ? Date.parse(s.startAt) > nowMs : Date.parse(s.startAt) <= nowMs) continue;
    if (opts.onlyKeys && !opts.onlyKeys.has(s.key)) continue;
    const closed = assertSchedulableDate(s.startAt, data);
    if (!closed.ok) {
      skippedClosedDays++;
      report.push({ key: s.key, startAt: s.startAt, status: "closed", students: [], message: closed.message });
      continue;
    }
    const ymd = toZonedYmd(new Date(s.startAt), TZ);
    const covering = members.filter((m) => enrollmentCoversDay(m.enrollment, ymd));
    const missing = covering.filter((m) => !existing.has(`${s.key}|${m.student.id}`));
    report.push({ key: s.key, startAt: s.startAt, status: missing.length ? "create" : covering.length ? "exists" : "empty", students: missing.map((m) => m.student.name) });
    for (const m of missing) {
      candidates.push({
        id: uid("les"),
        studentId: m.student.id,
        teacherId: g.teacherId,
        roomId: g.roomId,
        branchId: room.branchId,
        instrument: g.instrument as Lesson["instrument"],
        startAt: s.startAt,
        endAt: s.endAt,
        type: "regular",
        status: "scheduled",
        enrollmentId: m.enrollment.id,
        groupLessonId: g.id,
        groupSessionId: s.key,
        notes: g.name,
        createdByUserId: ctx.userId,
      });
    }
  }
  const done = (created: number) => ok({ created, skippedClosedDays, ...(past ? { sessions: report } : {}) });
  if (!candidates.length) return done(0);

  // Kapasite: oturum başına canlı satır + yeni satır ≤ kapasite (o tarihteki katılımcılar).
  const live = new Map<string, number>();
  for (const l of liveRows) live.set(l.groupSessionId!, (live.get(l.groupSessionId!) ?? 0) + 1);
  for (const c of candidates) live.set(c.groupSessionId!, (live.get(c.groupSessionId!) ?? 0) + 1);

  const { listTrialLessons } = await import("./trial-lessons");
  const [window, trials] = await Promise.all([conflictWindowLessons(candidates), listTrialLessons(ctx.tenantId)]);
  const others = window.filter((l) => !ignored.has(l.id));
  const issueOf = (c: Lesson): string | null => {
    const when = formatDateTime(c.startAt);
    if ((live.get(c.groupSessionId!) ?? 0) > g.capacity) {
      return `${when} oturumunda kontenjan (${g.capacity} öğrenci) doluyor. Grubun kapasitesini artırın veya başka bir grup seçin.`;
    }
    // Aynı gün grubun FARKLI anahtarlı canlı satırı (eski saat düzeni / ek oturum): ikinci kopya açılmaz.
    const day = toZonedYmd(new Date(c.startAt), TZ);
    if (past && liveRows.some((l) => l.groupSessionId !== c.groupSessionId && toZonedYmd(new Date(l.startAt), TZ) === day)) {
      return `${when}: Bu gün için grubun başka saatte kayıtlı oturumu var. O oturumu kontrol edin; aynı güne ikinci grup oturumu açılmadı.`;
    }
    const hit = findSlotConflict(others, c);
    if (hit) {
      if (hit.resource === "student") return `${when}: ${nameOf(c.studentId)} bu saatte başka bir derste. Önce o dersi taşıyın veya öğrenciyi başka bir gruba ekleyin.`;
      return `${when}: ${hit.resource === "teacher" ? "Öğretmenin" : `${room.name} odasının`} bu saatte başka dersi var. Grup dersinin gün/saatini veya odasını değiştirin ya da çakışan dersi taşıyın.`;
    }
    const s = Date.parse(c.startAt);
    const e = Date.parse(c.endAt);
    if (trials.some((t) => t.teacherId === g.teacherId && t.status !== "cancelled" && Date.parse(t.startAt) < e && s < Date.parse(t.endAt))) {
      return `${when}: Öğretmenin bu saatte deneme dersi var. Deneme dersini taşıyın veya grup saatini değiştirin.`;
    }
    return null;
  };

  let toWrite = candidates;
  if (!past) {
    for (const c of candidates) {
      const issue = issueOf(c);
      if (issue) return fail("CONFLICT", issue);
    }
  } else {
    // Sorunlu oturum BÜTÜNÜYLE atlanır (aynı oturumun katılımcıları ya hep birlikte ya hiç yazılır).
    const bad = new Map<string, string>();
    for (const c of candidates) {
      if (bad.has(c.groupSessionId!)) continue;
      const issue = issueOf(c);
      if (issue) bad.set(c.groupSessionId!, issue);
    }
    for (const r of report) {
      const msg = bad.get(r.key);
      if (msg) Object.assign(r, { status: "issue", message: msg });
    }
    if (bad.size && !opts.skipIssues && !opts.dryRun) {
      return fail("CONFLICT", `${bad.size} geçmiş oturumda sorun var (çakışma/kontenjan); hiçbir satır yazılmadı. Önizlemedeki sorunları giderin veya "Sorunlu oturumları atla" ile kalanları işleyin.`);
    }
    toWrite = candidates.filter((c) => !bad.has(c.groupSessionId!));
  }
  if (opts.dryRun || !toWrite.length) return done(opts.dryRun ? toWrite.length : 0);
  const { addGroupLessonRows } = await import("./store");
  try {
    await addGroupLessonRows(toWrite);
  } catch (e) {
    const { LessonSlotValidationError } = await import("./makeup-engine");
    if (e instanceof LessonSlotValidationError) return fail("CONFLICT", e.message);
    throw e;
  }
  return done(toWrite.length);
}

/**
 * Katılımcının `afterYmd` SONRASINDAKİ gelecek satırlarını iptal eder (kayıt sonlandı / gruptan çıktı). Yoklama girilmiş
 * satırlar korunur ve sayısı döner. Kilit altında çağrılmalıdır.
 */
export async function releaseGroupMemberRowsLocked(g: Pick<GroupLesson, "id">, studentId: string, afterYmd: string): Promise<{ cancelled: number; kept: number }> {
  const data = await readGroupLessonData(g.id);
  const nowMs = Date.now();
  const future = data.lessons.filter(
    (l) => l.groupLessonId === g.id && l.studentId === studentId && l.status !== "cancelled" && Date.parse(l.startAt) > nowMs && toZonedYmd(new Date(l.startAt), TZ) > afterYmd
  );
  const cancellable = future.filter((l) => !groupRowTouched(l)).map((l) => l.id);
  if (cancellable.length) {
    const { patchClubLessons } = await import("./store");
    await patchClubLessons(cancellable, { status: "cancelled" });
  }
  return { cancelled: cancellable.length, kept: future.length - cancellable.length };
}

// ── Katılım ön kontrolü (kayıt/branş ekleme akışları) ─────────────────────────

/**
 * Yeni katılım kaydı açılmadan ÖNCE: grup aktif mi, kontenjan var mı, branş koşulları gruba uyuyor mu. Mevcut öğrencide
 * ilk oturumlarda başka dersi varsa açık hata (satırlar yazılırken de aynı kural tekrar denetlenir).
 * Dönen `terms` branş kaydına ZORLA yazılır: enstrüman/öğretmen/süre/gün-saat gruptan gelir (istemci değeri değil).
 */
export async function prepareGroupJoin(
  ctx: ServiceContext,
  input: { groupLessonId: string; studentId?: string; startYmd: string }
): Promise<ServiceResult<{ group: GroupLesson; terms: { instrument: string; teacherId: string; lessonDurationMinutes: number; weeklyLessonCount: number; lessonScheduleText: string; branchId: string; endDate: string } }>> {
  const g = await getGroupLesson(ctx.tenantId, input.groupLessonId);
  if (!g) return fail("NOT_FOUND", "Seçilen grup dersi bulunamadı. Sayfayı yenileyip tekrar seçin.");
  if (g.status !== "active") return fail("VALIDATION_ERROR", `"${g.name}" grubu sona erdi; yeni öğrenci eklenemez. Aktif bir grup seçin.`);
  const last = planGroupSessions(g).at(-1);
  if (!last || toZonedYmd(new Date(last.startAt), TZ) < input.startYmd) {
    return fail("VALIDATION_ERROR", `"${g.name}" grubunun ${input.startYmd.split("-").reverse().join(".")} sonrasında planlı oturumu yok. Grup tarihlerini uzatın veya ders başlangıç tarihini düzeltin.`);
  }
  const { readReferenceData } = await import("./store");
  const ref = await readReferenceData();
  const today = toZonedYmd(new Date(), TZ);
  const seatDay = input.startYmd > today ? input.startYmd : today;
  const members = groupMembers(ref.students, g.id).filter((m) => isSeatHolder(m, seatDay));
  if (input.studentId && members.some((m) => m.student.id === input.studentId)) {
    return fail("CONFLICT", "Bu öğrenci zaten bu grubun katılımcısı. Öğrenci kartındaki mevcut grup kaydını düzenleyin.");
  }
  if (new Set(members.map((m) => m.student.id)).size >= g.capacity) {
    return fail("CONFLICT", `"${g.name}" grubunun kontenjanı dolu (${g.capacity}/${g.capacity}). Grubun kapasitesini artırın, başka bir grup seçin veya önce bir katılımcının kaydını sonlandırın.`);
  }
  const teacher = ref.teachers.find((t) => t.id === g.teacherId);
  if (!teacher || !teacher.active) return fail("VALIDATION_ERROR", `"${g.name}" grubunun öğretmeni pasif. Grup dersini düzenleyip aktif bir öğretmen seçin.`);
  // Yazıcının kendi kuralları (oturum başına kontenjan, öğretmen/oda/öğrenci çakışması, deneme dersi), sanal katılımcıyla.
  const virtualStudent = (input.studentId && ref.students.find((x) => x.id === input.studentId)) || ({ id: "__new_student__", name: "Yeni öğrenci", active: true } as StudentRef);
  const dry = await syncGroupLessonRowsLocked(ctx, g, {
    dryRun: true,
    studentIds: [],
    virtualMember: {
      student: { ...virtualStudent, active: true },
      enrollment: { id: "__group_join__", instrument: g.instrument as StudentEnrollment["instrument"], active: true, startDate: input.startYmd, lessonStartDate: input.startYmd, endDate: g.endsOn, createdAt: "", groupLessonId: g.id },
    },
  });
  if (!dry.ok) return dry;
  const room = ref.rooms.find((r) => r.id === g.roomId);
  return ok({
    group: g,
    terms: {
      instrument: g.instrument,
      teacherId: g.teacherId,
      lessonDurationMinutes: g.durationMinutes,
      weeklyLessonCount: 1,
      lessonScheduleText: groupScheduleText(g),
      branchId: room?.branchId ?? g.branchId,
      // Katılım grubun son günüyle biter: aylık tahakkuk bitmiş grup için borç yazmaz (tarih uzarsa kayıt da uzar).
      endDate: g.endsOn,
    },
  });
}

// ── Araçlar ─────────────────────────────────────────────────────────────────

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tarihi takvimden seçin.");
const hm = z.string().regex(/^\d{2}:\d{2}$/, "Saati seçin (SS:DD).");
const definitionSchema = z.object({
  name: z.string().trim().max(80).optional(),
  teacherId: z.string().min(1, "Öğretmen seçin."),
  instrument: z.string().trim().min(1, "Branş/enstrüman seçin."),
  roomId: z.string().min(1, "Oda seçin."),
  capacity: z.coerce.number().int("Kapasite tam sayı olmalı.").min(2, "Grup dersinin kapasitesi en az 2 öğrenci olmalı.").max(50, "Kapasite en fazla 50 olabilir."),
  // Bireysel dersle aynı süre kümesi: branş kaydı, ders başı ücret ve sabit hakediş politikası (30/40/50) aynen çalışsın.
  durationMinutes: z.coerce.number().refine((n) => [30, 40, 50].includes(n), "Ders süresi 30, 40 veya 50 dakika olmalı."),
  monthlyFee: z.coerce.number().int("Ücret tam TL olmalı.").min(0, "Ücret negatif olamaz.").max(1_000_000),
  recurrence: z.enum(["weekly", "once"], { error: "Tekrar düzenini seçin (haftalık / tek seferlik)." }),
  startTime: hm,
  startsOn: ymd,
  endsOn: ymd.optional(),
});

type DefinitionInput = z.infer<typeof definitionSchema>;

function weekdayOf(dayYmd: string): number {
  return zonedWeekday(zonedWallTimeToUtc(dayYmd, "12:00", TZ), TZ);
}

async function validateDefinition(ctx: ServiceContext, v: DefinitionInput, current?: GroupLesson): Promise<ServiceResult<Omit<GroupLesson, "id" | "createdByUserId" | "createdAt" | "updatedAt" | "status" | "sessionOverrides">>> {
  const { readReferenceData } = await import("./store");
  const { isRoomSchedulable } = await import("./makeup-engine");
  const { isTeacherSchedulable } = await import("./teacher-branches");
  const ref = await readReferenceData();
  const teacher = ref.teachers.find((t) => t.id === v.teacherId);
  if (!teacher || !isTeacherSchedulable(teacher)) return fail("VALIDATION_ERROR", "Seçilen öğretmen bulunamadı veya aktif değil. Aktif bir öğretmen seçin.");
  if (!teacher.instruments.includes(v.instrument as never)) {
    return fail("VALIDATION_ERROR", `${teacher.name} "${v.instrument}" dersi vermiyor. Bu branşı veren bir öğretmen seçin veya öğretmen kartına branşı ekleyin.`);
  }
  const room = ref.rooms.find((r) => r.id === v.roomId);
  if (!room || (!isRoomSchedulable(room) && room.id !== current?.roomId)) return fail("VALIDATION_ERROR", "Seçilen oda bulunamadı veya pasif. Aktif bir oda seçin.");
  if (current && current.instrument !== v.instrument) {
    return fail("VALIDATION_ERROR", "Grup dersinin branşı değiştirilemez (katılımcıların branş kaydı ve sözleşmeleri bu branşa bağlı). Farklı branş için yeni grup dersi açın.");
  }
  const endsOn = v.recurrence === "once" ? v.startsOn : v.endsOn;
  if (!endsOn) return fail("VALIDATION_ERROR", "Haftalık grup dersinin bitiş tarihini seçin.");
  if (endsOn < v.startsOn) return fail("VALIDATION_ERROR", "Bitiş tarihi başlangıç tarihinden önce olamaz.");
  if (Date.parse(`${endsOn}T00:00:00Z`) - Date.parse(`${v.startsOn}T00:00:00Z`) > MAX_WEEKS * 7 * 86_400_000) {
    return fail("VALIDATION_ERROR", `Grup dersi en fazla ${MAX_WEEKS} hafta için planlanabilir. Bitiş tarihini öne alın; dönem sonunda tarihleri uzatabilirsiniz.`);
  }
  const name = v.name?.trim() || `${v.instrument} grubu · ${WEEKDAY_TR[weekdayOf(v.startsOn)]} ${v.startTime}`;
  return ok({
    name,
    teacherId: v.teacherId,
    instrument: v.instrument,
    branchId: room.branchId,
    roomId: room.id,
    capacity: v.capacity,
    durationMinutes: v.durationMinutes,
    monthlyFee: v.monthlyFee,
    recurrence: v.recurrence,
    weekday: weekdayOf(v.startsOn),
    startTime: v.startTime,
    startsOn: v.startsOn,
    endsOn,
  });
}

/** Planlı oturumların öğretmen/oda çakışması (katılımcı yokken de: tanım takvime yanlış saatle oturmasın). */
async function checkPlanFree(g: GroupLesson, ignoreRowIds: Set<string>): Promise<string | null> {
  const { findSlotConflict } = await import("./lesson-occupancy");
  const { formatDateTime } = await import("./utils");
  const sessions = planGroupSessions(g).filter((s) => Date.parse(s.startAt) > Date.now());
  const window = (await conflictWindowLessons(sessions)).filter((l) => !ignoreRowIds.has(l.id));
  for (const s of sessions) {
    const hit = findSlotConflict(window, { teacherId: g.teacherId, roomId: g.roomId, studentId: "__group_none__", startAt: s.startAt, endAt: s.endAt, groupSessionId: s.key });
    if (hit && hit.resource !== "student") {
      return `${formatDateTime(s.startAt)}: ${hit.resource === "teacher" ? "Öğretmenin" : "Seçilen odanın"} bu saatte başka dersi var. Gün/saat veya odayı değiştirin ya da çakışan dersi taşıyın.`;
    }
  }
  return null;
}

function audit(ctx: ServiceContext, action: string, entityId: string, meta: Record<string, unknown>) {
  void import("./audit/log").then(({ recordAuditLog }) =>
    recordAuditLog({ tenantId: ctx.tenantId, actorUserId: ctx.userId, actorRole: ctx.role, action, entityType: "GroupLesson", entityId, outcome: "success", meta })
  );
}

function gate(ctx: ServiceContext) {
  const auth = requireRole(ctx, ADMIN_ROLES);
  return auth.ok ? null : fail("FORBIDDEN", "Grup derslerini yalnız kurum yöneticileri yönetebilir.");
}

export async function createGroupLessonTool(ctx: ServiceContext, input: unknown): Promise<ServiceResult<{ groupLessonId: string }>> {
  const denied = gate(ctx);
  if (denied) return denied;
  const parsed = definitionSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Grup dersi bilgilerini kontrol edin.");
  const def = await validateDefinition(ctx, parsed.data);
  if (!def.ok) return def;
  const now = new Date().toISOString();
  const g: GroupLesson = { ...def.data, id: uid("grp"), sessionOverrides: { extra: [], cancelled: [] }, status: "active", createdByUserId: ctx.userId, createdAt: now, updatedAt: now };
  // Geçmiş başlangıç serbest (geçmişte başlamış grubu sisteme işleme): geçmiş satırlar yalnız "Geçmiş oturumları tamamla" ile yazılır.
  if (!planGroupSessions(g).length) return fail("VALIDATION_ERROR", "Seçilen tarihlerde planlanacak oturum yok. Başlangıç/bitiş tarihini ve günü kontrol edin.");
  const busy = await checkPlanFree(g, new Set());
  if (busy) return fail("CONFLICT", busy);
  await writeGroupLesson(ctx.tenantId, g, true);
  audit(ctx, "group_lesson.create", g.id, { teacherId: g.teacherId, capacity: g.capacity, monthlyFee: g.monthlyFee, recurrence: g.recurrence });
  return ok({ groupLessonId: g.id });
}

/**
 * Tanımı düzenler. Ad/kapasite/ücret yalnız tanımı değiştirir (ücret mevcut katılımcıların kaydına dokunmaz). Gün/saat,
 * tarih, oda, öğretmen veya süre değişirse yalnız GELECEK ve yoklamasız satırlar yeni tanıma göre yeniden kurulur;
 * geçmiş ve yoklaması girilmiş satırlar (hakediş geçmişi) korunur. Öğretmen değişince katılımcıların grup branş kaydının
 * öğretmeni de güncellenir. Tüm yeni satırlar doğrulanmadan eski satır iptal edilmez.
 */
export async function updateGroupLessonTool(ctx: ServiceContext, input: unknown): Promise<ServiceResult<{ cancelled: number; created: number; kept: number }>> {
  const denied = gate(ctx);
  if (denied) return denied;
  const parsed = definitionSchema.extend({ groupLessonId: z.string().min(1) }).safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Grup dersi bilgilerini kontrol edin.");
  return withGroupLessonLock(ctx.tenantId, [parsed.data.groupLessonId], async () => {
    const current = await getGroupLesson(ctx.tenantId, parsed.data.groupLessonId);
    if (!current) return fail("NOT_FOUND", "Grup dersi bulunamadı. Sayfayı yenileyin.");
    if (current.status !== "active") return fail("VALIDATION_ERROR", "Sona ermiş grup dersi düzenlenemez.");
    const def = await validateDefinition(ctx, parsed.data, current);
    if (!def.ok) return def;
    const next: GroupLesson = { ...current, ...def.data, updatedAt: new Date().toISOString() };
    const data = await readGroupLessonData(current.id);
    const today = toZonedYmd(new Date(), TZ);
    const seats = seatCount(data.students, current.id, today);
    if (next.capacity < seats) return fail("VALIDATION_ERROR", `Grupta şu an ${seats} katılımcı var; kapasite ${seats}'den az olamaz.`);

    const planChanged = (["teacherId", "roomId", "durationMinutes", "recurrence", "weekday", "startTime", "startsOn", "endsOn"] as const).some((k) => next[k] !== current[k]);
    let cancelled = 0;
    let kept = 0;
    let created = 0;
    if (planChanged) {
      const nowMs = Date.now();
      const future = data.lessons.filter((l) => l.groupLessonId === current.id && l.status !== "cancelled" && Date.parse(l.startAt) > nowMs);
      const replace = future.filter((l) => !groupRowTouched(l));
      kept = future.length - replace.length;
      const replacing = new Set(replace.map((l) => l.id));
      const busy = await checkPlanFree(next, replacing);
      if (busy) return fail("CONFLICT", busy);
      // Önce yeni düzenin TÜM satırları doğrulanır (kapasite, öğrenci çakışması); eski satır ancak sonra iptal edilir.
      const dry = await syncGroupLessonRowsLocked(ctx, next, { ignoreRowIds: replacing, dryRun: true });
      if (!dry.ok) return dry;
      if (replace.length) {
        const { patchClubLessons } = await import("./store");
        await patchClubLessons(Array.from(replacing), { status: "cancelled", notes: `${current.name} — grup düzeni değişti (${today})` });
        cancelled = replace.length;
      }
      await writeGroupLesson(ctx.tenantId, next, false);
      await patchMemberTerms(data.students, current, next);
      // ponytail: iptal ile yeniden yazım arasında başka bir işlem saati alırsa yazım reddedilir; "Satırları yenile" onarır.
      const rebuilt = await syncGroupLessonRowsLocked(ctx, next);
      if (!rebuilt.ok) return fail(rebuilt.error.code, `${rebuilt.error.message} Grup düzeni kaydedildi; çakışmayı giderip "Satırları yenile"ye basın.`);
      created = rebuilt.data.created;
    } else {
      await writeGroupLesson(ctx.tenantId, next, false);
    }
    audit(ctx, "group_lesson.update", current.id, { planChanged, cancelled, created, kept, capacity: next.capacity, monthlyFee: next.monthlyFee });
    return ok({ cancelled, created, kept });
  });
}

/**
 * Grup düzeni değişince aktif katılımcıların grup kaydı izler: öğretmen (görünüm/mükerrer kuralı) ve grubun son gününe
 * bağlı bitiş tarihi (tahakkuk sınırı). Elle farklı bitiş verilmiş kayıt değişmez.
 */
async function patchMemberTerms(students: readonly StudentRef[], current: GroupLesson, next: GroupLesson): Promise<void> {
  if (next.teacherId === current.teacherId && next.endsOn === current.endsOn) return;
  const { changeStudentEnrollments } = await import("./store");
  const today = toZonedYmd(new Date(), TZ);
  for (const m of groupMembers(students, current.id)) {
    if (!isSeatHolder(m, today)) continue;
    const terms: Partial<StudentEnrollment> = {};
    if (next.teacherId !== current.teacherId) terms.teacherId = next.teacherId;
    if (next.endsOn !== current.endsOn && m.enrollment.endDate === current.endsOn) terms.endDate = next.endsOn;
    if (Object.keys(terms).length) await changeStudentEnrollments({ studentId: m.student.id, change: { kind: "patchTerms", enrollmentId: m.enrollment.id, terms } });
  }
}

const sessionRef = z.object({ groupLessonId: z.string().min(1), sessionKey: z.string().min(1) });

/** Gelecek, yoklamasız oturumu iptal eder (tüm katılımcı satırları İptal; plan bu oturumu bir daha üretmez). */
export async function cancelGroupSessionTool(ctx: ServiceContext, input: unknown): Promise<ServiceResult<{ cancelled: number }>> {
  const denied = gate(ctx);
  if (denied) return denied;
  const parsed = sessionRef.safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Oturum seçilmedi.");
  return withGroupLessonLock(ctx.tenantId, [parsed.data.groupLessonId], async () => {
    const g = await getGroupLesson(ctx.tenantId, parsed.data.groupLessonId);
    if (!g) return fail("NOT_FOUND", "Grup dersi bulunamadı.");
    const data = await readGroupLessonData(g.id);
    const view = groupSessionViews(g, data.lessons).find((s) => s.key === parsed.data.sessionKey);
    if (!view) return fail("NOT_FOUND", "Oturum bulunamadı veya zaten iptal edilmiş. Sayfayı yenileyin.");
    if (Date.parse(view.startAt) <= Date.now()) return fail("VALIDATION_ERROR", "Saati geçmiş oturum iptal edilemez (yoklama ve hakediş geçmişi korunur). Öğrenci bazında yoklama girin.");
    if (view.rows.some(groupRowTouched)) return fail("CONFLICT", "Bu oturuma yoklama girilmiş; iptal edilemez. Önce yoklamaları geri alın.");
    const ids = view.rows.map((r) => r.id);
    if (ids.length) {
      const { patchClubLessons } = await import("./store");
      await patchClubLessons(ids, { status: "cancelled" });
    }
    await writeGroupLesson(ctx.tenantId, { ...g, sessionOverrides: { ...g.sessionOverrides, cancelled: [...g.sessionOverrides.cancelled, view.key] }, updatedAt: new Date().toISOString() }, false);
    audit(ctx, "group_lesson.session_cancel", g.id, { sessionKey: view.key, rows: ids.length });
    return ok({ cancelled: ids.length });
  });
}

/** Tek seferlik EK oturum (ör. telafi oturumu): mevcut katılımcıların hepsine satır açar, aynı çakışma kurallarıyla. */
export async function addGroupSessionTool(ctx: ServiceContext, input: unknown): Promise<ServiceResult<SyncResult>> {
  const denied = gate(ctx);
  if (denied) return denied;
  const parsed = z
    .object({ groupLessonId: z.string().min(1), startLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Ek oturumun tarih ve saatini seçin.") })
    .safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Ek oturum bilgilerini kontrol edin.");
  return withGroupLessonLock(ctx.tenantId, [parsed.data.groupLessonId], async () => {
    const g = await getGroupLesson(ctx.tenantId, parsed.data.groupLessonId);
    if (!g) return fail("NOT_FOUND", "Grup dersi bulunamadı.");
    if (g.status !== "active") return fail("VALIDATION_ERROR", "Sona ermiş gruba oturum eklenemez.");
    const [day, time] = parsed.data.startLocal.split("T") as [string, string];
    const start = zonedWallTimeToUtc(day, time, TZ);
    // Geçmiş ek oturum: yapılmış dersi sisteme işler (yoklama ayrıca girilir; bildirim gitmez).
    const isPast = start.getTime() <= Date.now();
    const key = groupSessionKey(g.id, start.toISOString());
    if (planGroupSessions(g).some((s) => s.key === key)) return fail("CONFLICT", "Bu saatte grubun oturumu zaten planlı.");
    const { assertSchedulableDate } = await import("./lesson-scheduling");
    const { readReferenceData } = await import("./store");
    const closed = assertSchedulableDate(start.toISOString(), await readReferenceData());
    if (!closed.ok) return fail("VALIDATION_ERROR", closed.message);
    const next: GroupLesson = {
      ...g,
      sessionOverrides: { extra: [...g.sessionOverrides.extra, start.toISOString()], cancelled: g.sessionOverrides.cancelled.filter((k) => k !== key) },
      updatedAt: new Date().toISOString(),
    };
    const busy = await checkPlanFree({ ...next, recurrence: "once", startsOn: day, endsOn: day, sessionOverrides: { extra: [], cancelled: [] }, startTime: time }, new Set());
    if (busy) return fail("CONFLICT", busy);
    await writeGroupLesson(ctx.tenantId, next, false);
    const res = await syncGroupLessonRowsLocked(ctx, next, isPast ? { past: true, onlyKeys: new Set([key]) } : {});
    if (!res.ok) {
      await writeGroupLesson(ctx.tenantId, g, false); // plan geri alınır: yazılmamış oturum listede kalmasın
      return res;
    }
    audit(ctx, "group_lesson.session_add", g.id, { startAt: start.toISOString(), rows: res.data.created });
    return res;
  });
}

/** "Satırları yenile": eksik katılımcı satırlarını (ör. kayıt sonrası yazılamamış) idempotent olarak üretir. */
export async function syncGroupLessonTool(ctx: ServiceContext, input: unknown): Promise<ServiceResult<SyncResult>> {
  const denied = gate(ctx);
  if (denied) return denied;
  const parsed = z.object({ groupLessonId: z.string().min(1), studentId: z.string().optional() }).safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Grup dersi seçilmedi.");
  return withGroupLessonLock(ctx.tenantId, [parsed.data.groupLessonId], async () => {
    const g = await getGroupLesson(ctx.tenantId, parsed.data.groupLessonId);
    if (!g) return fail("NOT_FOUND", "Grup dersi bulunamadı.");
    return syncGroupLessonRowsLocked(ctx, g, parsed.data.studentId ? { studentIds: [parsed.data.studentId] } : {});
  });
}

/**
 * "Geçmiş oturumları tamamla": grubun başlangıcından bugüne planlı oturumlarında, o tarihte katılımı geçerli öğrencilerin
 * eksik satırlarını yazar (yapılmış dersleri sisteme işleme). `dryRun` önizleme döner. İdempotent (var olan / iptal edilmiş
 * satır yeniden açılmaz); satırlar "Planlandı" durumunda yazılır — yoklama/işlendi/telafi OTOMATİK verilmez, bildirim
 * gönderilmez, borç/tahsilat üretilmez (aylık tahakkuk kayda bağlıdır). Hakediş yalnız sonradan girilen yoklamayla oluşur.
 */
export async function backfillGroupSessionsTool(ctx: ServiceContext, input: unknown): Promise<ServiceResult<SyncResult>> {
  const denied = gate(ctx);
  if (denied) return denied;
  const parsed = z.object({ groupLessonId: z.string().min(1), dryRun: z.boolean().optional(), skipIssues: z.boolean().optional() }).safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Grup dersi seçilmedi.");
  return withGroupLessonLock(ctx.tenantId, [parsed.data.groupLessonId], async () => {
    const g = await getGroupLesson(ctx.tenantId, parsed.data.groupLessonId);
    if (!g) return fail("NOT_FOUND", "Grup dersi bulunamadı.");
    if (g.status !== "active") return fail("VALIDATION_ERROR", "Sona ermiş grubun geçmiş oturumları tamamlanamaz.");
    const res = await syncGroupLessonRowsLocked(ctx, g, { past: true, dryRun: parsed.data.dryRun, skipIssues: parsed.data.skipIssues });
    if (res.ok && !parsed.data.dryRun && res.data.created) audit(ctx, "group_lesson.backfill", g.id, { created: res.data.created });
    return res;
  });
}

/** Grubu sonlandırır: aktif katılımcı varken yapılamaz (önce kayıtlar sonlandırılır); gelecek yoklamasız satırlar iptal. */
export async function endGroupLessonTool(ctx: ServiceContext, input: unknown): Promise<ServiceResult<{ cancelled: number }>> {
  const denied = gate(ctx);
  if (denied) return denied;
  const parsed = z.object({ groupLessonId: z.string().min(1) }).safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Grup dersi seçilmedi.");
  return withGroupLessonLock(ctx.tenantId, [parsed.data.groupLessonId], async () => {
    const g = await getGroupLesson(ctx.tenantId, parsed.data.groupLessonId);
    if (!g) return fail("NOT_FOUND", "Grup dersi bulunamadı.");
    if (g.status === "ended") return ok({ cancelled: 0 });
    const data = await readGroupLessonData(g.id);
    const seats = seatCount(data.students, g.id, toZonedYmd(new Date(), TZ));
    if (seats > 0) return fail("CONFLICT", `Grupta ${seats} aktif katılımcı var. Önce her katılımcı için "Gruptan çıkar" ile grup kaydını sonlandırın (ücret ve sözleşme bu kayda bağlı).`);
    const ids = data.lessons.filter((l) => l.groupLessonId === g.id && l.status !== "cancelled" && Date.parse(l.startAt) > Date.now() && !groupRowTouched(l)).map((l) => l.id);
    if (ids.length) {
      const { patchClubLessons } = await import("./store");
      await patchClubLessons(ids, { status: "cancelled" });
    }
    await writeGroupLesson(ctx.tenantId, { ...g, status: "ended", updatedAt: new Date().toISOString() }, false);
    audit(ctx, "group_lesson.end", g.id, { cancelled: ids.length });
    return ok({ cancelled: ids.length });
  });
}

/** Ders satırı bir grup dersi katılımcı satırıysa grubun kimliği (tekil düzenleme engeli için). */
export async function groupLessonIdOfRow(tenantId: string, lessonId: string): Promise<string | undefined> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    return (await prisma.lesson.findFirst({ where: { id: lessonId, tenantId }, select: { groupLessonId: true } }))?.groupLessonId ?? undefined;
  }
  const { readLessonScope } = await import("./store");
  return (await readLessonScope(lessonId))?.lessons.find((l) => l.id === lessonId)?.groupLessonId;
}

/** Panel/mobil liste etiketi: oturum saati yerel. */
export function groupSessionLocalLabel(iso: string): string {
  const d = new Date(iso);
  return `${toZonedYmd(d, TZ).split("-").reverse().join(".")} ${zonedHm(d, TZ)}`;
}

/**
 * Branş kayıt formu için aktif grup seçenekleri (doluluk bugüne göre). Öğrenci listesi yalnız aktif grup varsa yüklenir
 * (fonksiyon verilebilir) — grup dersi kullanmayan kurumda ek okuma yok.
 */
export async function groupLessonFormOptions(
  tenantId: string,
  studentsOrLoader: readonly StudentRef[] | (() => Promise<readonly StudentRef[]>)
): Promise<import("./enrollment-form-context").EnrollmentFormGroupLesson[]> {
  const today = toZonedYmd(new Date(), TZ);
  const active = (await listGroupLessons(tenantId)).filter((g) => g.status === "active");
  if (!active.length) return [];
  const students = typeof studentsOrLoader === "function" ? await studentsOrLoader() : studentsOrLoader;
  return active.map((g) => ({
      id: g.id,
      name: g.name,
      instrument: g.instrument,
      teacherId: g.teacherId,
      branchId: g.branchId,
      durationMinutes: g.durationMinutes,
      monthlyFee: g.monthlyFee,
      lessonScheduleText: groupScheduleText(g),
      scheduleLabel: groupScheduleLabel(g),
      capacity: g.capacity,
      seats: seatCount(students, g.id, today),
    }));
}

export type GroupLessonListItem = {
  id: string;
  name: string;
  instrument: string;
  teacherName: string;
  roomName: string;
  scheduleLabel: string;
  capacity: number;
  seats: number;
  monthlyFee: number;
  status: GroupLessonStatus;
  nextSessionAt: string | null;
};

/** Liste (panel + mobil yönetici): doluluk bugüne göre, sonraki oturum plandan (ders satırı okunmaz). */
export async function listGroupLessonsTool(ctx: ServiceContext): Promise<ServiceResult<{ groups: GroupLessonListItem[] }>> {
  const denied = gate(ctx);
  if (denied) return denied;
  const { readReferenceData } = await import("./store");
  const [groups, ref] = await Promise.all([listGroupLessons(ctx.tenantId), readReferenceData()]);
  const today = toZonedYmd(new Date(), TZ);
  const nowMs = Date.now();
  return ok({
    groups: groups.map((g) => ({
      id: g.id,
      name: g.name,
      instrument: g.instrument,
      teacherName: ref.teachers.find((t) => t.id === g.teacherId)?.name ?? "—",
      roomName: ref.rooms.find((r) => r.id === g.roomId)?.name ?? "—",
      scheduleLabel: groupScheduleLabel(g),
      capacity: g.capacity,
      seats: seatCount(ref.students, g.id, today),
      monthlyFee: g.monthlyFee,
      status: g.status,
      nextSessionAt: g.status === "active" ? (planGroupSessions(g).find((x) => Date.parse(x.startAt) > nowMs)?.startAt ?? null) : null,
    })),
  });
}

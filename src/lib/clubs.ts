/**
 * 2026-10-05 — KULÜP SİSTEMİ (1. aşama: kulüp + üyelik + ücret). Owner kararları:
 * - Ücret AYLIK sabittir; üyelik katıldığı andaki ücreti dondurur. Devamsızlık ücreti düşürmez.
 * - Kulüp ücreti ayrı `Payment` satırıdır (`source: "club"`, `clubMembershipId`, dönem etiketi "Ekim 2026");
 *   sözleşmeye hiçbir koşulda girmez/taşınmaz. Üyelik + ay başına TEK satır (mükerrer yok).
 * - İlk ay katılınca yazılır (kayıtta ayrı "Kulüp ücreti" kutusundan tahsil edilebilir); sonraki aylar günlük
 *   tahakkuk işiyle (monthly-accrual cron). Üyelik silinmez; ayrılınca `endDate` dolar (son ücretli ay).
 * - Oturumlar / yoklama / hakediş 2. aşamadadır (ders programı + mevcut süre kuralı).
 * STORE_MODE=db → Prisma `Club`/`ClubMembership`; json/memory → dosya (panel-notes.ts ile aynı desen).
 */
import path from "path";
import { z } from "zod";
import { isDbMode, resolveDataDir } from "./config";
import { uid } from "./utils";
import { fail, ok, type ServiceResult } from "./services/result";
import { requireRole, type ServiceContext } from "./services/context";
import { DEFAULT_APP_TIMEZONE, toZonedYmd } from "./timezone";
import type { Payment, Student } from "./types";

export type Club = {
  id: string;
  name: string;
  instrument: string;
  branchId?: string;
  maxMembers: number;
  monthlyFee: number;
  durationMinutes: number;
  teacherIds: string[];
  description?: string;
  active: boolean;
  createdByUserId: string;
  createdAt: string;
};

/** Kulüp ders satırlarına izin verilen yama (patchClubLessons). */
export type ClubLessonPatch = Partial<
  Pick<
    import("./types").Lesson,
    "status" | "opsMakeupFlag" | "opsMakeupFlagAt" | "opsMakeupFlagBy" | "teacherAttendanceStatus" | "teacherAttendanceAt" | "teacherAttendanceBy" | "notes"
  >
>;

export type ClubMembership = {
  id: string;
  clubId: string;
  studentId: string;
  monthlyFee: number;
  startDate: string;
  endDate?: string;
  createdByUserId: string;
  createdAt: string;
  endedByUserId?: string;
  endedAt?: string;
};

const TR_MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
/** "2026-10" → "Ekim 2026" (kulüp ücreti satırının dönem etiketi; `installmentMonthKeys` bunu okur). */
export function clubPeriodLabel(month: string): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return `${TR_MONTHS[m - 1]} ${y}`;
}

export function isMembershipActive(m: Pick<ClubMembership, "endDate">, todayYmd: string): boolean {
  return !m.endDate || m.endDate >= todayYmd;
}

// ── Depolama ────────────────────────────────────────────────────────────────

const DATA_DIR = resolveDataDir(path.join(process.cwd(), "data"));
export const CLUBS_FILE = path.join(DATA_DIR, "clubs.json");
export const CLUB_MEMBERSHIPS_FILE = path.join(DATA_DIR, "club-memberships.json");
type WithTenant<T> = T & { tenantId: string };

async function loadFile<T>(file: string): Promise<WithTenant<T>[]> {
  try {
    const fs = await import("fs/promises");
    return JSON.parse(await fs.readFile(file, "utf8")) as WithTenant<T>[];
  } catch {
    return [];
  }
}

async function saveFile<T>(file: string, rows: WithTenant<T>[]): Promise<void> {
  const fs = await import("fs/promises");
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(rows, null, 2));
}

function strip<T extends { tenantId: string }>(row: T): Omit<T, "tenantId"> {
  const { tenantId: _ignored, ...rest } = row; // eslint-disable-line @typescript-eslint/no-unused-vars
  return rest;
}

export async function listClubs(tenantId: string): Promise<Club[]> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    const rows = await prisma.club.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { name: "asc" },
      omit: { tenantId: true, updatedAt: true, deletedAt: true, deletedByUserId: true, deletionReason: true },
    });
    return rows.map((r) => ({
      ...r,
      branchId: r.branchId ?? undefined,
      description: r.description ?? undefined,
      teacherIds: Array.isArray(r.teacherIds) ? (r.teacherIds as string[]) : [],
      createdAt: r.createdAt.toISOString(),
    }));
  }
  return (await loadFile<Club & { deletedAt?: string }>(CLUBS_FILE))
    .filter((c) => c.tenantId === tenantId && !c.deletedAt)
    .sort((a, b) => a.name.localeCompare(b.name, "tr"))
    .map(strip);
}

export async function listClubMemberships(tenantId: string): Promise<ClubMembership[]> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    const rows = await prisma.clubMembership.findMany({ where: { tenantId }, orderBy: { createdAt: "asc" }, omit: { tenantId: true } });
    return rows.map((r) => ({
      ...r,
      endDate: r.endDate ?? undefined,
      endedByUserId: r.endedByUserId ?? undefined,
      endedAt: r.endedAt?.toISOString(),
      createdAt: r.createdAt.toISOString(),
    }));
  }
  return (await loadFile<ClubMembership>(CLUB_MEMBERSHIPS_FILE)).filter((m) => m.tenantId === tenantId).map(strip);
}

async function writeClub(tenantId: string, club: Club, isNew: boolean): Promise<void> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    const data = {
      name: club.name,
      instrument: club.instrument,
      branchId: club.branchId ?? null,
      maxMembers: club.maxMembers,
      monthlyFee: club.monthlyFee,
      durationMinutes: club.durationMinutes,
      teacherIds: club.teacherIds,
      description: club.description ?? null,
      active: club.active,
    };
    if (isNew) {
      await prisma.club.create({ data: { ...data, id: club.id, tenantId, createdByUserId: club.createdByUserId, createdAt: new Date(club.createdAt) } });
    } else {
      await prisma.club.updateMany({ where: { id: club.id, tenantId }, data });
    }
    return;
  }
  const all = await loadFile<Club>(CLUBS_FILE);
  const i = all.findIndex((c) => c.id === club.id && c.tenantId === tenantId);
  if (i >= 0) all[i] = { ...club, tenantId };
  else all.push({ ...club, tenantId });
  await saveFile(CLUBS_FILE, all);
}

async function writeMembership(tenantId: string, m: ClubMembership, isNew: boolean): Promise<void> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    if (isNew) {
      await prisma.clubMembership.create({
        data: { id: m.id, tenantId, clubId: m.clubId, studentId: m.studentId, monthlyFee: m.monthlyFee, startDate: m.startDate, createdByUserId: m.createdByUserId, createdAt: new Date(m.createdAt) },
      });
    } else {
      await prisma.clubMembership.updateMany({
        where: { id: m.id, tenantId },
        data: { endDate: m.endDate ?? null, endedByUserId: m.endedByUserId ?? null, endedAt: m.endedAt ? new Date(m.endedAt) : null },
      });
    }
    return;
  }
  const all = await loadFile<ClubMembership>(CLUB_MEMBERSHIPS_FILE);
  const i = all.findIndex((x) => x.id === m.id && x.tenantId === tenantId);
  if (i >= 0) all[i] = { ...m, tenantId };
  else all.push({ ...m, tenantId });
  await saveFile(CLUB_MEMBERSHIPS_FILE, all);
}

// ── Ücret satırı ─────────────────────────────────────────────────────────────

/** Bu üyeliğin bu ay için kulüp ücreti satırı (iptal edilmiş dahil — iptal edilen ay yeniden borçlandırılmaz). */
export function findClubFeeRow(payments: Payment[], membershipId: string, month: string): Payment | undefined {
  const label = clubPeriodLabel(month);
  return payments.find((p) => p.source === "club" && p.clubMembershipId === membershipId && p.installmentPeriodLabel === label);
}

/**
 * Üyeliğin `month` ayı ücretini yazar (yoksa). ALS kurulmuş olmalı. Dönen id mevcut ya da yeni satırdır.
 * ponytail: oku-sonra-yaz; aynı üyelik+ay için eşzamanlı iki çağrı (cron + elle ekleme aynı saniye) çift satır
 * açabilir — tekil kısıt (clubMembershipId, installmentPeriodLabel) gerekirse eklenir.
 */
async function ensureClubFeeRow(club: Pick<Club, "name">, m: ClubMembership, month: string, payments: Payment[]): Promise<{ paymentId: string; created: boolean }> {
  const existing = findClubFeeRow(payments, m.id, month);
  if (existing) return { paymentId: existing.id, created: false };
  const { addPayment } = await import("./store");
  const paymentId = uid("pay");
  const due = m.startDate.slice(0, 7) === month ? m.startDate : `${month}-01`;
  await addPayment({
    id: paymentId,
    studentId: m.studentId,
    amount: m.monthlyFee,
    dueDate: due,
    description: `${club.name} — ${clubPeriodLabel(month)} kulüp ücreti`,
    source: "club",
    clubMembershipId: m.id,
    installmentPeriodLabel: clubPeriodLabel(month),
  });
  return { paymentId, created: true };
}

// ── Araçlar (yönetici) ──────────────────────────────────────────────────────

const ADMIN_ROLES = ["SCHOOL_ADMIN"] as ServiceContext["role"][];
const today = () => toZonedYmd(new Date(), DEFAULT_APP_TIMEZONE);

export type ClubsOverview = { clubs: Club[]; memberships: ClubMembership[] };

export async function listClubsTool(ctx: ServiceContext): Promise<ServiceResult<ClubsOverview>> {
  const auth = requireRole(ctx, ADMIN_ROLES);
  if (!auth.ok) return fail("FORBIDDEN", "Kulüpleri yalnız kurum yöneticileri yönetebilir.");
  const [clubs, memberships] = await Promise.all([listClubs(ctx.tenantId), listClubMemberships(ctx.tenantId)]);
  return ok({ clubs, memberships });
}

const clubSchema = z.object({
  id: z.string().max(80).optional(),
  name: z.string().trim().min(2, "Kulüp adı en az 2 karakter olmalı.").max(80, "Kulüp adı en fazla 80 karakter olabilir."),
  instrument: z.string().trim().min(1, "Kulübün enstrümanını/alanını seçin."),
  branchId: z.string().trim().max(80).optional(),
  maxMembers: z.coerce.number({ error: "Kontenjanı sayı olarak girin." }).int("Kontenjan tam sayı olmalı.").min(1, "Kontenjan en az 1 olmalı.").max(50, "Kontenjan en fazla 50 olabilir."),
  monthlyFee: z.coerce.number({ error: "Aylık ücreti sayı olarak girin." }).int("Aylık ücret tam TL olmalı.").min(0, "Aylık ücret negatif olamaz.").max(1_000_000),
  durationMinutes: z.coerce.number({ error: "Oturum süresini dakika olarak girin." }).int("Oturum süresi tam dakika olmalı.").min(20, "Oturum süresi en az 20 dakika olmalı.").max(240, "Oturum süresi en fazla 240 dakika olabilir."),
  teacherIds: z.array(z.string().min(1)).min(1, "Kulüp derslerini verecek en az bir öğretmen seçin.").max(10),
  description: z.string().trim().max(1000).optional(),
  active: z.boolean().optional(),
});

export async function saveClubTool(ctx: ServiceContext, input: unknown): Promise<ServiceResult<Club>> {
  const auth = requireRole(ctx, ADMIN_ROLES);
  if (!auth.ok) return fail("FORBIDDEN", "Kulüp oluşturmayı/düzenlemeyi yalnız kurum yöneticileri yapabilir.");
  const parsed = clubSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Kulüp bilgilerini kontrol edin.");
  const v = parsed.data;
  const [{ readReferenceData }, { resolveActiveInstrumentNames }] = await Promise.all([import("./store"), import("./instrument-catalog")]);
  const ref = await readReferenceData();
  if (!(await resolveActiveInstrumentNames(ctx.tenantId)).includes(v.instrument)) {
    return fail("VALIDATION_ERROR", `"${v.instrument}" enstrüman kataloğunda yok. Enstrümanlar ekranından ekleyin veya listeden seçin.`);
  }
  if (v.branchId && !ref.settings.branches.some((b) => b.id === v.branchId)) {
    return fail("VALIDATION_ERROR", "Seçilen şube bulunamadı. Listeden bir şube seçin.");
  }
  const missingTeacher = v.teacherIds.find((id) => !ref.teachers.some((t) => t.id === id && t.active));
  if (missingTeacher) return fail("VALIDATION_ERROR", "Seçilen öğretmenlerden biri bulunamadı veya pasif. Öğretmen seçimini yenileyin.");
  // Sadece kulüp kaydında öğrencinin öğretmeni bu kişidir; kayıt kuralı öğretmenin enstrümanı öğretmesini ister.
  if (!v.teacherIds.some((id) => ref.teachers.find((t) => t.id === id)?.instruments.includes(v.instrument as never))) {
    return fail(
      "VALIDATION_ERROR",
      `Seçilen öğretmenlerden en az biri "${v.instrument}" branşında kayıtlı olmalı. Öğretmenler ekranından öğretmene bu branşı ekleyin veya branşı olan bir öğretmen seçin.`
    );
  }

  const [clubs, memberships] = await Promise.all([listClubs(ctx.tenantId), listClubMemberships(ctx.tenantId)]);
  const current = v.id ? clubs.find((c) => c.id === v.id) : undefined;
  if (v.id && !current) return fail("NOT_FOUND", "Kulüp bulunamadı; silinmiş olabilir. Sayfayı yenileyin.");
  const nameKey = v.name.toLocaleLowerCase("tr");
  if (clubs.some((c) => c.id !== v.id && c.active && c.name.toLocaleLowerCase("tr") === nameKey)) {
    return fail("CONFLICT", `"${v.name}" adında aktif bir kulüp zaten var. Farklı bir ad verin.`);
  }
  const activeMembers = current ? memberships.filter((m) => m.clubId === current.id && isMembershipActive(m, today())).length : 0;
  if (current && v.maxMembers < activeMembers) {
    return fail("VALIDATION_ERROR", `Kontenjan ${v.maxMembers} olamaz: kulüpte şu an ${activeMembers} aktif üye var. Önce üye çıkarın ya da kontenjanı artırın.`);
  }
  const active = v.active ?? current?.active ?? true;
  if (current && current.active && !active && activeMembers > 0) {
    return fail("VALIDATION_ERROR", `Kulüp pasife alınamaz: ${activeMembers} aktif üyesi var. Önce üyelikleri sonlandırın.`);
  }
  const club: Club = {
    id: current?.id ?? uid("club"),
    name: v.name,
    instrument: v.instrument,
    branchId: v.branchId || undefined,
    maxMembers: v.maxMembers,
    // Ücret değişikliği mevcut üyelikleri değiştirmez (üyelik kendi ücretini dondurur); yeni üyeler yeni ücreti öder.
    monthlyFee: v.monthlyFee,
    durationMinutes: v.durationMinutes,
    teacherIds: Array.from(new Set(v.teacherIds)),
    description: v.description || undefined,
    active,
    createdByUserId: current?.createdByUserId ?? ctx.userId,
    createdAt: current?.createdAt ?? new Date().toISOString(),
  };
  await writeClub(ctx.tenantId, club, !current);
  const { recordAuditLog } = await import("./audit/log");
  void recordAuditLog({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    action: current ? "club.update" : "club.create",
    entityType: "Club",
    entityId: club.id,
    outcome: "success",
    meta: { monthlyFee: club.monthlyFee, maxMembers: club.maxMembers, active: club.active },
  });
  return ok(club);
}

const addMemberSchema = z.object({
  clubId: z.string().min(1),
  studentId: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/** Üye ekler + başlangıç ayının ücret satırını yazar (yoksa). Dönen `paymentId` kayıtta tahsil etmek içindir. */
export async function addClubMemberTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ membership: ClubMembership; paymentId: string; warnings: string[] }>> {
  const auth = requireRole(ctx, ADMIN_ROLES);
  if (!auth.ok) return fail("FORBIDDEN", "Kulübe üye eklemeyi yalnız kurum yöneticileri yapabilir.");
  const parsed = addMemberSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Kulüp ve öğrenci seçimini kontrol edin; tarih YYYY-AA-GG olmalı.");
  const v = parsed.data;
  const [clubs, memberships] = await Promise.all([listClubs(ctx.tenantId), listClubMemberships(ctx.tenantId)]);
  const club = clubs.find((c) => c.id === v.clubId);
  if (!club) return fail("NOT_FOUND", "Kulüp bulunamadı; silinmiş olabilir. Sayfayı yenileyin.");
  if (!club.active) return fail("VALIDATION_ERROR", `${club.name} pasif; önce kulübü aktif yapın.`);
  const { readData } = await import("./store");
  const data = await readData();
  const student: Student | undefined = data.students.find((s) => s.id === v.studentId);
  if (!student || student.deletedAt) return fail("NOT_FOUND", "Öğrenci bulunamadı veya silinmiş. Öğrenci listesinden yeniden seçin.");
  if (!student.active) return fail("VALIDATION_ERROR", `${student.name} pasif; kulübe eklemek için önce öğrenciyi aktif yapın.`);
  const t = today();
  if (memberships.some((m) => m.clubId === club.id && m.studentId === student.id && isMembershipActive(m, t))) {
    return fail("CONFLICT", `${student.name} zaten ${club.name} üyesi.`);
  }
  const active = memberships.filter((m) => m.clubId === club.id && isMembershipActive(m, t)).length;
  if (active >= club.maxMembers) {
    return fail("CONFLICT", `${club.name} kontenjanı dolu (${active}/${club.maxMembers}). Kontenjanı artırın veya bir üyeliği sonlandırın.`);
  }
  const membership: ClubMembership = {
    id: uid("cmem"),
    clubId: club.id,
    studentId: student.id,
    monthlyFee: club.monthlyFee,
    startDate: v.startDate ?? t,
    createdByUserId: ctx.userId,
    createdAt: new Date().toISOString(),
  };
  await writeMembership(ctx.tenantId, membership, true);
  const fee = await ensureClubFeeRow(club, membership, membership.startDate.slice(0, 7), data.payments);
  const { recordAuditLog } = await import("./audit/log");
  void recordAuditLog({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    action: "club.member_add",
    entityType: "ClubMembership",
    entityId: membership.id,
    outcome: "success",
    meta: { clubId: club.id, studentId: student.id, monthlyFee: membership.monthlyFee, paymentId: fee.paymentId },
  });
  // 2. aşama — planlı gelecek oturumlara bu üye de eklenir (kendi dersiyle çakışan oturum atlanır, uyarı döner).
  const warnings = await syncFutureSessionsForMember(ctx, membership, "join");
  return ok({ membership, paymentId: fee.paymentId, warnings });
}

const endSchema = z.object({ membershipId: z.string().min(1), endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });

/** Üyeliği sonlandırır (silmez). Son ücretli ay = bitiş ayı; sonraki aylar tahakkuk etmez. Mevcut satırlar değişmez. */
export async function endClubMembershipTool(ctx: ServiceContext, input: unknown): Promise<ServiceResult<ClubMembership>> {
  const auth = requireRole(ctx, ADMIN_ROLES);
  if (!auth.ok) return fail("FORBIDDEN", "Kulüp üyeliğini yalnız kurum yöneticileri sonlandırabilir.");
  const parsed = endSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Bitiş tarihi YYYY-AA-GG olmalı.");
  const m = (await listClubMemberships(ctx.tenantId)).find((x) => x.id === parsed.data.membershipId);
  if (!m) return fail("NOT_FOUND", "Üyelik bulunamadı. Sayfayı yenileyin.");
  if (m.endDate) return fail("CONFLICT", "Bu üyelik zaten sonlandırılmış.");
  const endDate = parsed.data.endDate ?? today();
  if (endDate < m.startDate) return fail("VALIDATION_ERROR", "Bitiş tarihi üyelik başlangıcından önce olamaz.");
  const ended: ClubMembership = { ...m, endDate, endedByUserId: ctx.userId, endedAt: new Date().toISOString() };
  await writeMembership(ctx.tenantId, ended, false);
  // Bitiş gününden sonraki planlı oturum satırları iptal (yoklama/hakediş geçmişi korunur).
  await syncFutureSessionsForMember(ctx, ended, "leave");
  const { recordAuditLog } = await import("./audit/log");
  void recordAuditLog({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    action: "club.member_end",
    entityType: "ClubMembership",
    entityId: m.id,
    outcome: "success",
    meta: { clubId: m.clubId, studentId: m.studentId, endDate },
  });
  return ok(ended);
}

// ── Aylık tahakkuk (cron) ──────────────────────────────────────────────────

/** Saf: `month` için yazılması gereken kulüp ücreti satırları (başlangıç ayı katılınca yazıldığı için hariç). */
export function planClubFeeAccruals(input: {
  clubs: Club[];
  memberships: ClubMembership[];
  students: Pick<Student, "id" | "active" | "deletedAt">[];
  payments: Payment[];
  month: string;
}): ClubMembership[] {
  return input.memberships.filter((m) => {
    const student = input.students.find((s) => s.id === m.studentId);
    if (!student || !student.active || student.deletedAt) return false;
    if (!input.clubs.some((c) => c.id === m.clubId)) return false;
    if (m.monthlyFee <= 0) return false;
    if (input.month <= m.startDate.slice(0, 7)) return false;
    if (m.endDate && m.endDate.slice(0, 7) < input.month) return false;
    return !findClubFeeRow(input.payments, m.id, input.month);
  });
}

/** Tek kurum — ALS kurulmuş olmalı. Günlük tahakkuk işi (standalone-monthly-accrual ile aynı rota) çağırır. */
export async function runClubFeeAccrual(tenantId: string, opts: { apply: boolean; month: string }): Promise<{ planned: number; created: number }> {
  const { readPaymentsPageData } = await import("./store");
  const [clubs, memberships, data] = await Promise.all([listClubs(tenantId), listClubMemberships(tenantId), readPaymentsPageData()]);
  const planned = planClubFeeAccruals({ clubs, memberships, students: data.students, payments: data.payments, month: opts.month });
  let created = 0;
  if (opts.apply) {
    const { recordAuditLog } = await import("./audit/log");
    for (const m of planned) {
      const club = clubs.find((c) => c.id === m.clubId)!;
      const fee = await ensureClubFeeRow(club, m, opts.month, data.payments);
      if (!fee.created) continue;
      created++;
      await recordAuditLog({
        tenantId,
        actorUserId: "cron",
        actorRole: "SYSTEM",
        action: "payment.club_fee_accrual",
        entityType: "Payment",
        entityId: fee.paymentId,
        outcome: "success",
        meta: { clubId: m.clubId, studentId: m.studentId, month: opts.month, amount: m.monthlyFee },
      });
    }
  }
  return { planned: planned.length, created };
}

// ── Yeni öğrenci kaydı (kayıt formu) ─────────────────────────────────────────

export type ClubRegistrationPlan = {
  clubs: { club: Club; amount: number }[];
  method?: "cash" | "transfer" | "credit_card";
  collectedAt?: string;
};

/**
 * Kayıt formundaki kulüp seçimini ÖĞRENCİ OLUŞMADAN doğrular (yarım kayıt olmasın). Alanlar: `clubIds`
 * (çoklu), `clubFee_<id>` (o kulüp için şimdi tahsil edilen tutar; 0/boş = tahsil edilmedi, borç açık kalır),
 * `clubPaymentMethod`, `clubPaymentDate`. Hata: Türkçe mesaj + `clubs` alan hatası.
 */
export async function parseClubRegistration(
  tenantId: string,
  formData: FormData,
  required: boolean
): Promise<{ ok: true; value: ClubRegistrationPlan } | { ok: false; message: string; fieldErrors: Record<string, string[]> }> {
  const bad = (message: string, field = "clubs") => ({ ok: false as const, message, fieldErrors: { [field]: [message] } });
  const ids = Array.from(new Set(formData.getAll("clubIds").map(String).filter(Boolean)));
  if (ids.length === 0) return required ? bad("Sadece kulüp kaydı için en az bir kulüp seçin.") : { ok: true, value: { clubs: [] } };
  const [clubs, memberships] = await Promise.all([listClubs(tenantId), listClubMemberships(tenantId)]);
  const t = today();
  const out: ClubRegistrationPlan["clubs"] = [];
  for (const id of ids) {
    const club = clubs.find((c) => c.id === id);
    if (!club || !club.active) return bad("Seçilen kulüplerden biri bulunamadı veya pasif. Sayfayı yenileyip yeniden seçin.");
    const used = memberships.filter((m) => m.clubId === id && isMembershipActive(m, t)).length;
    if (used >= club.maxMembers) return bad(`${club.name} kontenjanı dolu (${used}/${club.maxMembers}). Kulüpler ekranından kontenjanı artırın veya bu kulübü seçimden çıkarın.`);
    const raw = String(formData.get(`clubFee_${id}`) ?? "").trim();
    const digits = raw.replace(/[^\d]/g, "");
    if (raw && (!digits || raw.startsWith("-"))) return bad(`${club.name} için tahsil edilen tutar geçersiz — yalnız tam sayı TL girin (ör. ${club.monthlyFee} veya 0).`);
    const amount = digits ? Number(digits) : 0;
    if (amount > club.monthlyFee) {
      return bad(`${club.name} için tahsil edilen tutar (${amount} TL) aylık kulüp ücretinden (${club.monthlyFee} TL) fazla olamaz.`);
    }
    out.push({ club, amount });
  }
  const collecting = out.some((c) => c.amount > 0);
  const methodRaw = String(formData.get("clubPaymentMethod") || "");
  const method = methodRaw === "cash" || methodRaw === "transfer" || methodRaw === "credit_card" ? methodRaw : undefined;
  const collectedAt = String(formData.get("clubPaymentDate") || "").trim() || undefined;
  if (collecting && !method) return bad("Kulüp ücreti tahsil ediliyorsa ödeme türünü seçin.", "clubPaymentMethod");
  if (collecting && !collectedAt) return bad("Kulüp ücreti tahsil ediliyorsa tahsilat tarihini girin.", "clubPaymentDate");
  return { ok: true, value: { clubs: out, method: collecting ? method : undefined, collectedAt: collecting ? collectedAt : undefined } };
}

/** Öğrenci oluştuktan sonra: üyelikler + ilk ay ücreti; tutar girildiyse tahsil. Hata öğrenciyi geri almaz → uyarı. */
export async function applyClubRegistration(ctx: ServiceContext, studentId: string, plan: ClubRegistrationPlan): Promise<string[]> {
  const warnings: string[] = [];
  for (const { club, amount } of plan.clubs) {
    const added = await addClubMemberTool(ctx, { clubId: club.id, studentId });
    if (!added.ok) {
      warnings.push(`${club.name} üyeliği eklenemedi: ${added.error.message} Kulüpler → ${club.name} ekranından ekleyin.`);
      continue;
    }
    warnings.push(...added.data.warnings.map((w) => `${club.name}: ${w}`));
    if (amount > 0) {
      try {
        const { collectPayment } = await import("./payments/collect");
        await collectPayment(added.data.paymentId, {
          amount,
          method: plan.method,
          paidAt: plan.collectedAt,
          receivedByUserId: ctx.userId,
          actorUserId: ctx.userId,
          tenantId: ctx.tenantId,
          accumulate: true,
        });
      } catch (e) {
        warnings.push(`${club.name} ücreti tahsil olarak kaydedilemedi (${e instanceof Error ? e.message : "bilinmeyen hata"}); borç açık duruyor, Ödemeler ekranından tahsil edin.`);
      }
    }
  }
  return warnings;
}

// ── Oturumlar (2. aşama) ───────────────────────────────────────────────────
// Oturum = aynı `clubSessionId`'yi taşıyan ders satırları (`type: "group"`, üye başına bir satır). Ayrı tablo yok:
// ders programı, öğrenci yoklaması (mevcut Geldi/Gelmedi/Mazeretli/İşlendi/Telafi), yoklama takvimi ve çakışma
// kuralı bu satırları olduğu gibi görür. Öğretmen yoklaması (`teacherAttendanceStatus`) tüm satırlara birlikte
// yazılır; hakediş oturum başına bir kez ("geldi" ise, süresine göre — teacher-payout.ts).

export type ClubSessionView = {
  sessionId: string;
  clubId: string;
  teacherId: string;
  roomId: string;
  branchId: string;
  startAt: string;
  endAt: string;
  /** İptal edilmemiş üye satırları. */
  rows: import("./types").Lesson[];
  teacherAttendanceStatus?: import("./types").Lesson["teacherAttendanceStatus"];
  /** Tüm satırlar Telafi (oturum ertelendi). */
  postponed: boolean;
  cancelled: boolean;
};

/** Saf: ders satırlarından oturumlar (en yeni önce değil — başlangıca göre artan). */
export function groupClubSessions(lessons: import("./types").Lesson[], clubId?: string): ClubSessionView[] {
  const by = new Map<string, import("./types").Lesson[]>();
  for (const l of lessons) {
    if (l.type !== "group" || !l.clubSessionId || (clubId && l.clubId !== clubId)) continue;
    by.set(l.clubSessionId, [...(by.get(l.clubSessionId) ?? []), l]);
  }
  return [...by.entries()]
    .map(([sessionId, all]) => {
      const live = all.filter((l) => l.status !== "cancelled");
      const first = live[0] ?? all[0]!;
      return {
        sessionId,
        clubId: first.clubId ?? "",
        teacherId: first.teacherId,
        roomId: first.roomId,
        branchId: first.branchId,
        startAt: first.startAt,
        endAt: first.endAt,
        rows: live,
        teacherAttendanceStatus: live.find((l) => l.teacherAttendanceStatus)?.teacherAttendanceStatus,
        postponed: live.length > 0 && live.every((l) => l.opsMakeupFlag),
        cancelled: live.length === 0,
      };
    })
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
}

const scheduleSchema = z.object({
  clubId: z.string().min(1),
  teacherId: z.string().min(1, "Oturumu verecek öğretmeni seçin."),
  roomId: z.string().min(1, "Oda seçin."),
  /** Kurum saatiyle "YYYY-MM-DDTHH:mm" (datetime-local). */
  startLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Tarih ve saati seçin."),
  weeks: z.coerce.number({ error: "Tekrar sayısını girin." }).int().min(1, "En az 1 oturum.").max(26, "Tek seferde en fazla 26 hafta planlanabilir."),
});

type ScheduleCheck = { ok: true; rows: import("./types").Lesson[] } | { ok: false; message: string };

/**
 * Bir oturumun satırlarını kurar ve doğrular (yazmaz): kapalı gün, öğretmen/oda çakışması (merkezi
 * `findSlotConflict`; oda KAPASİTESİ aranmaz), deneme dersi çakışması, her üyenin kendi ders çakışması.
 */
async function buildSessionRows(
  ctx: ServiceContext,
  input: { club: Club; teacherId: string; roomId: string; startAt: Date; members: string[]; sessionId: string },
  data: import("./types").AppData,
  trials: Array<{ teacherId: string; startAt: string; endAt: string; status: string }>,
  extraLessons: import("./types").Lesson[] = []
): Promise<ScheduleCheck> {
  const { assertSchedulableDate } = await import("./lesson-scheduling");
  const { findSlotConflict } = await import("./lesson-occupancy");
  const { formatDateTime } = await import("./utils");
  const startAt = input.startAt.toISOString();
  const endAt = new Date(input.startAt.getTime() + input.club.durationMinutes * 60_000).toISOString();
  const when = formatDateTime(startAt);
  const sched = assertSchedulableDate(startAt, data);
  if (!sched.ok) return { ok: false, message: `${when}: ${sched.message}` };
  const room = data.rooms.find((r) => r.id === input.roomId)!;
  const lessons = [...data.lessons, ...extraLessons];
  const slot = { teacherId: input.teacherId, roomId: input.roomId, startAt, endAt, clubSessionId: input.sessionId };
  const tr = findSlotConflict(lessons, { ...slot, studentId: "__club_none__" });
  if (tr && tr.resource !== "student") {
    const who = tr.resource === "teacher" ? "Öğretmenin" : `${room.name} odasının`;
    return { ok: false, message: `${when}: ${who} bu saatte başka dersi var. Başka saat veya oda seçin.` };
  }
  const s = Date.parse(startAt);
  const e = Date.parse(endAt);
  if (trials.some((t) => t.teacherId === input.teacherId && t.status !== "cancelled" && Date.parse(t.startAt) < e && s < Date.parse(t.endAt))) {
    return { ok: false, message: `${when}: Öğretmenin bu saatte deneme dersi var. Başka saat seçin.` };
  }
  const busy = input.members.filter((studentId) =>
    findSlotConflict(lessons, { ...slot, teacherId: "__club_none__", roomId: "__club_none__", studentId })
  );
  if (busy.length) {
    const names = busy.map((id) => data.students.find((x) => x.id === id)?.name ?? "öğrenci").join(", ");
    return { ok: false, message: `${when}: ${names} bu saatte başka bir derste. Saati değiştirin veya önce o dersi taşıyın.` };
  }
  return {
    ok: true,
    rows: input.members.map((studentId) => ({
      id: uid("les"),
      studentId,
      teacherId: input.teacherId,
      roomId: input.roomId,
      branchId: room.branchId,
      instrument: input.club.instrument as import("./types").Instrument,
      startAt,
      endAt,
      type: "group",
      status: "scheduled",
      clubId: input.club.id,
      clubSessionId: input.sessionId,
      notes: input.club.name,
      createdByUserId: ctx.userId,
    })),
  };
}

function activeMemberIdsOn(memberships: ClubMembership[], clubId: string, dayYmd: string, students: Pick<Student, "id" | "active" | "deletedAt">[]): string[] {
  return memberships
    .filter((m) => m.clubId === clubId && m.startDate <= dayYmd && (!m.endDate || m.endDate >= dayYmd))
    .map((m) => m.studentId)
    .filter((id) => {
      const s = students.find((x) => x.id === id);
      return s && s.active && !s.deletedAt;
    });
}

async function loadClubAndData(ctx: ServiceContext, clubId: string) {
  const [{ readData }, { listTrialLessons }] = await Promise.all([import("./store"), import("./trial-lessons")]);
  const [clubs, memberships, data, trials] = await Promise.all([
    listClubs(ctx.tenantId),
    listClubMemberships(ctx.tenantId),
    readData(),
    listTrialLessons(ctx.tenantId),
  ]);
  return { club: clubs.find((c) => c.id === clubId), memberships, data, trials };
}

/** Oturum(lar) planlar: tek oturum veya haftalık tekrar. Tümü doğrulanmadan hiçbiri yazılmaz. */
export async function scheduleClubSessionsTool(ctx: ServiceContext, input: unknown): Promise<ServiceResult<{ sessionIds: string[] }>> {
  const auth = requireRole(ctx, ADMIN_ROLES);
  if (!auth.ok) return fail("FORBIDDEN", "Kulüp oturumunu yalnız kurum yöneticileri planlayabilir.");
  const parsed = scheduleSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Oturum bilgilerini kontrol edin.");
  const v = parsed.data;
  const { club, memberships, data, trials } = await loadClubAndData(ctx, v.clubId);
  if (!club) return fail("NOT_FOUND", "Kulüp bulunamadı. Sayfayı yenileyin.");
  if (!club.active) return fail("VALIDATION_ERROR", `${club.name} pasif; oturum planlamak için önce aktif yapın.`);
  if (!club.teacherIds.includes(v.teacherId) || !data.teachers.some((t) => t.id === v.teacherId && t.active)) {
    return fail("VALIDATION_ERROR", "Seçilen öğretmen bu kulübün öğretmenleri arasında değil veya pasif. Kulübü düzenleyip öğretmeni ekleyin.");
  }
  const { isRoomSchedulable } = await import("./makeup-engine");
  const room = data.rooms.find((r) => r.id === v.roomId);
  if (!room || !isRoomSchedulable(room)) return fail("VALIDATION_ERROR", "Seçilen oda bulunamadı veya pasif. Aktif bir oda seçin.");
  if (club.branchId && room.branchId !== club.branchId) return fail("VALIDATION_ERROR", "Oda kulübün şubesinde değil. Kulübün şubesindeki bir odayı seçin.");
  const { zonedWallTimeToUtc } = await import("./timezone");
  const [ymd0, hm] = v.startLocal.split("T") as [string, string];
  const rows: import("./types").Lesson[] = [];
  const sessionIds: string[] = [];
  for (let w = 0; w < v.weeks; w++) {
    const day = new Date(`${ymd0}T12:00:00Z`);
    day.setUTCDate(day.getUTCDate() + 7 * w);
    const ymd = day.toISOString().slice(0, 10);
    const startAt = zonedWallTimeToUtc(ymd, hm);
    if (startAt.getTime() < Date.now() - 60 * 60_000) return fail("VALIDATION_ERROR", "Geçmiş bir zamana oturum planlanamaz. Bugün veya ileri bir tarih seçin.");
    const members = activeMemberIdsOn(memberships, club.id, ymd, data.students);
    if (members.length === 0) return fail("VALIDATION_ERROR", `${ymd.split("-").reverse().join(".")} tarihinde kulübün aktif üyesi yok. Önce üye ekleyin.`);
    const sessionId = uid("cses");
    const built = await buildSessionRows(ctx, { club, teacherId: v.teacherId, roomId: v.roomId, startAt, members, sessionId }, data, trials, rows);
    if (!built.ok) return fail("CONFLICT", built.message);
    rows.push(...built.rows);
    sessionIds.push(sessionId);
  }
  const { addClubSessionLessons } = await import("./store");
  await addClubSessionLessons(rows);
  const { recordAuditLog } = await import("./audit/log");
  void recordAuditLog({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    action: "club.sessions_schedule",
    entityType: "Club",
    entityId: club.id,
    outcome: "success",
    meta: { sessions: sessionIds.length, rows: rows.length, teacherId: v.teacherId, roomId: v.roomId },
  });
  return ok({ sessionIds });
}

async function loadSession(ctx: ServiceContext, sessionId: string) {
  const { readData } = await import("./store");
  const data = await readData();
  const session = groupClubSessions(data.lessons).find((s) => s.sessionId === sessionId);
  return { data, session };
}

/** Öğretmen yoklaması — oturumun tüm (iptal edilmemiş) satırlarına birlikte. Hakediş "geldi" oturumu bir kez sayar. */
export async function markClubSessionTeacherTool(ctx: ServiceContext, input: unknown): Promise<ServiceResult<{ status: string }>> {
  const auth = requireRole(ctx, ADMIN_ROLES);
  if (!auth.ok) return fail("FORBIDDEN", "Kulüp oturumu öğretmen yoklamasını yalnız kurum yöneticileri girebilir.");
  const parsed = z.object({ sessionId: z.string().min(1), status: z.enum(["geldi", "gelmedi", "mazeretli"]) }).safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Öğretmen yoklaması için Geldi / Gelmedi / Mazeretli seçin.");
  const { session } = await loadSession(ctx, parsed.data.sessionId);
  if (!session || session.cancelled) return fail("NOT_FOUND", "Oturum bulunamadı veya iptal edilmiş. Sayfayı yenileyin.");
  if (session.postponed && parsed.data.status === "geldi") {
    return fail("VALIDATION_ERROR", "Bu oturum ertelendi (Telafi); yapılmadığı için öğretmen 'Geldi' işaretlenemez. Yeni tarihteki oturuma girin.");
  }
  if (Date.parse(session.startAt) > Date.now() && parsed.data.status === "geldi") {
    return fail("VALIDATION_ERROR", "Oturum henüz başlamadı; öğretmen yoklaması oturum saatinden sonra girilir.");
  }
  const { patchClubLessons } = await import("./store");
  await patchClubLessons(
    session.rows.map((r) => r.id),
    { teacherAttendanceStatus: parsed.data.status, teacherAttendanceAt: new Date().toISOString(), teacherAttendanceBy: ctx.userId }
  );
  const { recordAuditLog } = await import("./audit/log");
  void recordAuditLog({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    action: "club.session_teacher_attendance",
    entityType: "ClubSession",
    entityId: session.sessionId,
    outcome: "success",
    meta: { status: parsed.data.status, teacherId: session.teacherId },
  });
  return ok({ status: parsed.data.status });
}

/**
 * Oturumu toptan ertele (owner kararı): tüm üye satırları Telafi (bireysel telafi talebi YOK), aynı üyelerle yeni
 * tarihte yeni oturum açılır. Önce yeni oturum doğrulanır/yazılır, sonra eski satırlar işaretlenir.
 */
export async function postponeClubSessionTool(ctx: ServiceContext, input: unknown): Promise<ServiceResult<{ newSessionId: string }>> {
  const auth = requireRole(ctx, ADMIN_ROLES);
  if (!auth.ok) return fail("FORBIDDEN", "Kulüp oturumunu yalnız kurum yöneticileri erteleyebilir.");
  const parsed = z
    .object({
      sessionId: z.string().min(1),
      startLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Yeni tarih ve saati seçin."),
      roomId: z.string().optional(),
      reason: z.string().trim().min(3, "Erteleme gerekçesini yazın (ör. öğretmen hastalandı).").max(300),
    })
    .safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Erteleme bilgilerini kontrol edin.");
  const v = parsed.data;
  const { session, data } = await loadSession(ctx, v.sessionId);
  if (!session || session.cancelled) return fail("NOT_FOUND", "Oturum bulunamadı veya iptal edilmiş. Sayfayı yenileyin.");
  if (session.postponed) return fail("CONFLICT", "Bu oturum zaten ertelenmiş.");
  if (session.teacherAttendanceStatus === "geldi") return fail("CONFLICT", "Öğretmen yoklaması 'Geldi' — yapılmış oturum ertelenemez. Önce öğretmen yoklamasını düzeltin.");
  const marked = session.rows.filter((r) => r.studentAttended || r.lessonProcessed || r.status === "completed");
  if (marked.length) {
    return fail("CONFLICT", `${marked.length} üyenin yoklaması Geldi/İşlendi işaretli; ertelemeden önce bu işaretleri geri alın.`);
  }
  const clubs = await listClubs(ctx.tenantId);
  const club = clubs.find((c) => c.id === session.clubId);
  if (!club) return fail("NOT_FOUND", "Kulüp bulunamadı.");
  const { zonedWallTimeToUtc } = await import("./timezone");
  const [ymd, hm] = v.startLocal.split("T") as [string, string];
  const startAt = zonedWallTimeToUtc(ymd, hm);
  if (startAt.getTime() < Date.now() - 60 * 60_000) return fail("VALIDATION_ERROR", "Ertelenen oturum geçmiş bir zamana alınamaz.");
  const roomId = v.roomId || session.roomId;
  const { isRoomSchedulable } = await import("./makeup-engine");
  const room = data.rooms.find((r) => r.id === roomId);
  if (!room || !isRoomSchedulable(room)) return fail("VALIDATION_ERROR", "Seçilen oda bulunamadı veya pasif.");
  const { listTrialLessons } = await import("./trial-lessons");
  const newSessionId = uid("cses");
  const built = await buildSessionRows(
    ctx,
    { club, teacherId: session.teacherId, roomId, startAt, members: session.rows.map((r) => r.studentId), sessionId: newSessionId },
    // Ertelenen oturumun kendi satırları yeni saatle çakışma saymasın (aynı üyeler/öğretmen).
    { ...data, lessons: data.lessons.filter((l) => l.clubSessionId !== session.sessionId) },
    await listTrialLessons(ctx.tenantId)
  );
  if (!built.ok) return fail("CONFLICT", built.message);
  const { addClubSessionLessons, patchClubLessons } = await import("./store");
  const { formatDateTime } = await import("./utils");
  await addClubSessionLessons(built.rows.map((r) => ({ ...r, notes: `${club.name} — ${formatDateTime(session.startAt)} oturumunun telafisi` })));
  const now = new Date().toISOString();
  await patchClubLessons(
    session.rows.map((r) => r.id),
    { opsMakeupFlag: true, opsMakeupFlagAt: now, opsMakeupFlagBy: ctx.userId, notes: `${club.name} — ertelendi → ${formatDateTime(startAt.toISOString())} (${v.reason})` }
  );
  const { recordAuditLog } = await import("./audit/log");
  void recordAuditLog({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    action: "club.session_postpone",
    entityType: "ClubSession",
    entityId: session.sessionId,
    outcome: "success",
    meta: { newSessionId, rows: session.rows.length },
  });
  return ok({ newSessionId });
}

/** Henüz yapılmamış oturumu iptal eder (satırlar "İptal"; silinmez). Yoklama girilmiş oturum iptal edilemez. */
export async function cancelClubSessionTool(ctx: ServiceContext, input: unknown): Promise<ServiceResult<{ sessionId: string }>> {
  const auth = requireRole(ctx, ADMIN_ROLES);
  if (!auth.ok) return fail("FORBIDDEN", "Kulüp oturumunu yalnız kurum yöneticileri iptal edebilir.");
  const parsed = z.object({ sessionId: z.string().min(1) }).safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Oturum seçilmedi.");
  const { session } = await loadSession(ctx, parsed.data.sessionId);
  if (!session || session.cancelled) return fail("NOT_FOUND", "Oturum bulunamadı veya zaten iptal edilmiş.");
  const touched = session.rows.some((r) => r.studentAttended || r.lessonProcessed || r.studentAbsent || r.studentExcused || r.opsMakeupFlag);
  if (touched || session.teacherAttendanceStatus) {
    return fail("CONFLICT", "Bu oturuma yoklama girilmiş; iptal edilemez. Yapılmadıysa 'Oturumu ertele' kullanın ya da yoklamaları geri alın.");
  }
  const { patchClubLessons } = await import("./store");
  await patchClubLessons(session.rows.map((r) => r.id), { status: "cancelled" });
  const { recordAuditLog } = await import("./audit/log");
  void recordAuditLog({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    action: "club.session_cancel",
    entityType: "ClubSession",
    entityId: session.sessionId,
    outcome: "success",
    meta: { rows: session.rows.length },
  });
  return ok({ sessionId: session.sessionId });
}

/**
 * Üyelik değişince gelecek oturumlar: yeni üye → ileri tarihli, ertelenmemiş oturumlara satır (kendi dersiyle
 * çakışanlar atlanır, uyarı döner); ayrılan üye → bitiş gününden sonraki satırları "İptal".
 */
export async function syncFutureSessionsForMember(
  ctx: ServiceContext,
  m: ClubMembership,
  mode: "join" | "leave"
): Promise<string[]> {
  const { readData, addClubSessionLessons, patchClubLessons } = await import("./store");
  const data = await readData();
  const now = Date.now();
  const sessions = groupClubSessions(data.lessons, m.clubId).filter((s) => !s.cancelled && !s.postponed && Date.parse(s.startAt) > now);
  if (mode === "leave") {
    const ids = sessions
      .filter((s) => toZonedYmd(new Date(s.startAt), DEFAULT_APP_TIMEZONE) > (m.endDate ?? ""))
      .flatMap((s) => s.rows.filter((r) => r.studentId === m.studentId).map((r) => r.id));
    if (ids.length) await patchClubLessons(ids, { status: "cancelled" });
    return [];
  }
  const { findSlotConflict } = await import("./lesson-occupancy");
  const clubs = await listClubs(ctx.tenantId);
  const club = clubs.find((c) => c.id === m.clubId);
  if (!club) return [];
  const warnings: string[] = [];
  const rows: import("./types").Lesson[] = [];
  for (const s of sessions) {
    if (s.rows.some((r) => r.studentId === m.studentId)) continue;
    if (toZonedYmd(new Date(s.startAt), DEFAULT_APP_TIMEZONE) < m.startDate) continue;
    const clash = findSlotConflict(data.lessons, {
      teacherId: "__club_none__",
      roomId: "__club_none__",
      studentId: m.studentId,
      startAt: s.startAt,
      endAt: s.endAt,
      clubSessionId: s.sessionId,
    });
    if (clash) {
      const { formatDateTime } = await import("./utils");
      warnings.push(`${formatDateTime(s.startAt)} oturumuna eklenmedi: öğrencinin o saatte başka dersi var.`);
      continue;
    }
    rows.push({ ...s.rows[0]!, id: uid("les"), studentId: m.studentId, status: "scheduled", ...CLEAR_ROW_STATE, createdByUserId: ctx.userId });
  }
  if (rows.length) await addClubSessionLessons(rows);
  return warnings;
}

/** Kopyalanan satırdan taşınmaması gereken yoklama/ops alanları. */
const CLEAR_ROW_STATE: Partial<import("./types").Lesson> = {
  studentAttended: undefined,
  studentAttendedAt: undefined,
  studentAttendedBy: undefined,
  lessonProcessed: undefined,
  lessonProcessedAt: undefined,
  lessonProcessedBy: undefined,
  lessonProcessedReason: undefined,
  opsMakeupFlag: undefined,
  opsMakeupFlagAt: undefined,
  opsMakeupFlagBy: undefined,
  studentAbsent: undefined,
  studentAbsentAt: undefined,
  studentAbsentBy: undefined,
  studentExcused: undefined,
  studentExcusedAt: undefined,
  studentExcusedBy: undefined,
  actualStartAt: undefined,
  actualEndAt: undefined,
};

// ── Kulübü silme (yanlışlıkla oluşturulan kulüp) ───────────────────────────

export type ClubDeleteImpact = {
  activeMembers: number;
  openFeeRows: number;
  openFeeTotal: number;
  futureSessions: number;
  /** Silmeyi engelleyen neden (tahsilat görmüş ücret / yoklama girilmiş oturum). */
  blocker?: string;
};

async function clubDeleteImpact(tenantId: string, club: Club): Promise<ClubDeleteImpact> {
  const { readData } = await import("./store");
  const [data, memberships] = await Promise.all([readData(), listClubMemberships(tenantId)]);
  const mine = memberships.filter((m) => m.clubId === club.id);
  const ids = new Set(mine.map((m) => m.id));
  const fees = data.payments.filter((p) => p.source === "club" && p.clubMembershipId && ids.has(p.clubMembershipId) && p.status !== "voided");
  const paid = fees.filter((p) => p.paidAmount > 0);
  const sessions = groupClubSessions(data.lessons, club.id).filter((s) => !s.cancelled);
  // Yoklama = öğretmen yoklaması veya öğrenci statüsü. Toptan erteleme (tüm satırlar Telafi) planlama işlemidir, sayılmaz.
  const touched = sessions.filter(
    (s) =>
      s.teacherAttendanceStatus ||
      s.rows.some((r) => r.studentAttended || r.lessonProcessed || r.studentAbsent || r.studentExcused || (r.opsMakeupFlag && !s.postponed))
  );
  const open = fees.filter((p) => p.paidAmount === 0);
  const t = today();
  return {
    activeMembers: mine.filter((m) => isMembershipActive(m, t)).length,
    openFeeRows: open.length,
    openFeeTotal: open.reduce((s, p) => s + p.amount, 0),
    futureSessions: sessions.filter((s) => Date.parse(s.startAt) > Date.now()).length,
    blocker: paid.length
      ? `${paid.length} kulüp ücreti tahsil edilmiş. Silmeden önce Ödemeler ekranından bu tahsilatları geri alın; kulüp gerçekten kullanıldıysa silmek yerine pasife alın.`
      : touched.length
        ? `${touched.length} oturumda yoklama girilmiş. Kulüp kullanıldıysa silmek yerine pasife alın ya da yoklamaları geri alın.`
        : undefined,
  };
}

export async function getClubDeleteImpactTool(ctx: ServiceContext, input: unknown): Promise<ServiceResult<ClubDeleteImpact>> {
  const auth = requireRole(ctx, ADMIN_ROLES);
  if (!auth.ok) return fail("FORBIDDEN", "Kulübü yalnız kurum sahibi ve kurum yöneticileri silebilir.");
  const id = z.object({ clubId: z.string().min(1) }).safeParse(input);
  const club = id.success ? (await listClubs(ctx.tenantId)).find((c) => c.id === id.data.clubId) : undefined;
  if (!club) return fail("NOT_FOUND", "Kulüp bulunamadı; silinmiş olabilir. Sayfayı yenileyin.");
  return ok(await clubDeleteImpact(ctx.tenantId, club));
}

/**
 * Yanlışlıkla oluşturulan kulübü siler (gizler). Owner kuralı: rol + kritik işlem şifresi + gerekçe.
 * Tahsilat görmüş ücret veya yoklama girilmiş oturum varsa REDDEDİLİR (gerçek finans/yoklama kaydı korunur).
 * Aksi halde: ödenmemiş kulüp ücretleri iptal (silinmez), gelecek oturum satırları iptal, açık üyelikler bugün biter.
 */
export async function deleteClubTool(ctx: ServiceContext, input: unknown): Promise<ServiceResult<{ clubId: string }>> {
  const auth = requireRole(ctx, ADMIN_ROLES);
  if (!auth.ok) return fail("FORBIDDEN", "Kulübü yalnız kurum sahibi ve kurum yöneticileri silebilir.");
  const { criticalDeleteFields, guardCriticalDelete } = await import("./services/tools");
  const parsed = z.object({ clubId: z.string().min(1), ...criticalDeleteFields }).safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Silme bilgilerini kontrol edin.");
  const club = (await listClubs(ctx.tenantId)).find((c) => c.id === parsed.data.clubId);
  if (!club) return fail("NOT_FOUND", "Kulüp bulunamadı; zaten silinmiş olabilir. Sayfayı yenileyin.");
  const denied = await guardCriticalDelete(ctx, { action: "club.delete", entityType: "Club", entityId: club.id, entityName: club.name }, parsed.data.criticalPassword);
  if (denied) return denied;
  const impact = await clubDeleteImpact(ctx.tenantId, club);
  if (impact.blocker) return fail("CONFLICT", impact.blocker);

  const { readData, patchClubLessons } = await import("./store");
  const data = await readData();
  const memberships = (await listClubMemberships(ctx.tenantId)).filter((m) => m.clubId === club.id);
  const ids = new Set(memberships.map((m) => m.id));
  const { collectPayment } = await import("./payments/collect");
  for (const p of data.payments.filter((x) => x.source === "club" && x.clubMembershipId && ids.has(x.clubMembershipId) && x.status !== "voided" && x.paidAmount === 0)) {
    await collectPayment(p.id, {
      voided: true,
      paymentNote: `Kulüp silindi (${club.name}): ${parsed.data.reason}`,
      actorUserId: ctx.userId,
      tenantId: ctx.tenantId,
      onlyIfUntouchedOpenDebt: true,
    });
  }
  const rowIds = groupClubSessions(data.lessons, club.id)
    .filter((s) => !s.cancelled)
    .flatMap((s) => s.rows.map((r) => r.id));
  if (rowIds.length) await patchClubLessons(rowIds, { status: "cancelled" });
  const t = today();
  for (const m of memberships.filter((x) => isMembershipActive(x, t))) {
    await writeMembership(ctx.tenantId, { ...m, endDate: m.startDate > t ? m.startDate : t, endedByUserId: ctx.userId, endedAt: new Date().toISOString() }, false);
  }
  const deletedAt = new Date().toISOString();
  if (isDbMode) {
    const { prisma } = await import("./db");
    await prisma.club.updateMany({
      where: { id: club.id, tenantId: ctx.tenantId },
      data: { active: false, deletedAt: new Date(deletedAt), deletedByUserId: ctx.userId, deletionReason: parsed.data.reason },
    });
  } else {
    const all = await loadFile<Club & { deletedAt?: string; deletedByUserId?: string; deletionReason?: string }>(CLUBS_FILE);
    await saveFile(
      CLUBS_FILE,
      all.map((c) => (c.id === club.id && c.tenantId === ctx.tenantId ? { ...c, active: false, deletedAt, deletedByUserId: ctx.userId, deletionReason: parsed.data.reason } : c))
    );
  }
  const { recordAuditLog } = await import("./audit/log");
  void recordAuditLog({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    action: "club.delete",
    entityType: "Club",
    entityId: club.id,
    outcome: "success",
    meta: { entityName: club.name, voidedFees: impact.openFeeRows, cancelledRows: rowIds.length, endedMemberships: impact.activeMembers },
  });
  return ok({ clubId: club.id });
}

/**
 * Tek ders değiştiren araçlar (taşı, iptal, sil, revize, öğretmen değiştir) kulüp satırına uygulanmaz: oturumun
 * satırları birlikte yönetilir. db'de tek alanlık dar sorgu (tam veri okunmaz).
 */
export async function clubRowGuard(tenantId: string, lessonId: string): Promise<ServiceResult<never> | null> {
  let type: string | undefined;
  if (isDbMode) {
    const { prisma } = await import("./db");
    type = (await prisma.lesson.findFirst({ where: { id: lessonId, tenantId }, select: { type: true } }))?.type;
  } else {
    const { readData } = await import("./store");
    type = (await readData()).lessons.find((l) => l.id === lessonId)?.type;
  }
  return type === "group"
    ? fail("VALIDATION_ERROR", "Bu bir kulüp oturumu satırı. Saat, oda, öğretmen, iptal ve erteleme işlemlerini Kulüpler → ilgili kulüp → oturum ekranından yapın.")
    : null;
}

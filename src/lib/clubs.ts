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
    const rows = await prisma.club.findMany({ where: { tenantId }, orderBy: { name: "asc" }, omit: { tenantId: true, updatedAt: true } });
    return rows.map((r) => ({
      ...r,
      branchId: r.branchId ?? undefined,
      description: r.description ?? undefined,
      teacherIds: Array.isArray(r.teacherIds) ? (r.teacherIds as string[]) : [],
      createdAt: r.createdAt.toISOString(),
    }));
  }
  return (await loadFile<Club>(CLUBS_FILE))
    .filter((c) => c.tenantId === tenantId)
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
): Promise<ServiceResult<{ membership: ClubMembership; paymentId: string }>> {
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
  return ok({ membership, paymentId: fee.paymentId });
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

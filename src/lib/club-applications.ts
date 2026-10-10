/**
 * 2026-10-07 — GRUP DERSİ (KULÜP) BAŞVURUSU. Aday /basvuru/[kurum]/kulup portalından kuruma ait, başvuruya açık
 * bir kulübü seçip başvurur. Başvuru KESİN KAYIT DEĞİLDİR: ücret tahsil etmez; sözleşme, ödeme, borç, portal hesabı
 * veya üyelik oluşturmaz. Yönetici Kulüpler → Başvurular'dan durumunu yönetir ve "Kulübe ekle" ile başvuruyu mevcut
 * bir öğrenciyle eşleştirip talep edilen kulübe (varsa dahil solfej ile) ekler — tek transaction, kilitli, idempotent.
 *
 * Halka açık veri: `buildClubOffer` AÇIK ALAN LİSTESİ kurar — öğretmen (ad/id/foto/iletişim), yönetim notu, üye
 * listesi ve kalan kontenjan sayısı ASLA çıkmaz. Başvuru anındaki teklif `clubSnapshot` olarak saklanır.
 * STORE_MODE=db → Prisma `ClubApplication`; json/memory → dosya (trial-applications.ts ile aynı desen).
 */
import path from "path";
import { createHash } from "crypto";
import { z } from "zod";
import { isDbMode, resolveDataDir } from "./config";
import { uid } from "./utils";
import { fail, ok, type ServiceResult } from "./services/result";
import { requireRole, type ServiceContext } from "./services/context";
import { DEFAULT_APP_TIMEZONE, toZonedYmd, zonedWallTimeToUtc } from "./timezone";
import { logger } from "./logger";
import {
  activeMemberCount,
  clubApplicationIssues,
  insertMembershipChecked,
  isMembershipActive,
  isSolfegeClub,
  listClubMemberships,
  listClubs,
  withClubMembershipLock,
  writeClubMembershipRow,
  type Club,
  type ClubAudience,
  type ClubFeePeriod,
  type ClubMembership,
} from "./clubs";
import type { Prisma, ClubApplication as DbRow } from "@prisma/client";

import { CLUB_APPLICATION_STATUSES, type ClubApplicationStatus } from "./club-application-status";
export { CLUB_APPLICATION_STATUSES, CLUB_APPLICATION_STATUS_LABEL, type ClubApplicationStatus } from "./club-application-status";

/** Halka açık kulüp teklifi — portalda gösterilen ve başvuruda saklanan TEK biçim (açık alan listesi). */
export type ClubOffer = {
  clubId: string;
  name: string;
  instrument: string;
  audience?: ClubAudience;
  minAge?: number;
  maxAge?: number;
  description?: string;
  startDate?: string;
  endDate?: string;
  scheduleText?: string;
  durationMinutes: number;
  branchId?: string;
  branchName?: string;
  branchAddress?: string;
  branchPhone?: string;
  fee: number;
  feePeriod: ClubFeePeriod;
  /** Aylık ücrette ödeme alınacak ay sayısı (yoksa belirtilmemiş = üyelik sürdükçe). */
  feeMonths?: number;
  /** Yöneticinin girdiği toplam ders sayısı (yetkili kaynak). Yoksa portal "belirtilmedi" der, 0 göstermez. */
  totalLessons?: number;
  includesText?: string;
  includedSolfege?: {
    clubId: string;
    name: string;
    scheduleText?: string;
    startDate?: string;
    endDate?: string;
    durationMinutes: number;
    totalLessons?: number;
    branchName?: string;
  };
  /**
   * 2026-10-09 — kulübe dahil solfej BAĞLI (`includedSolfegeClubId`) ama bağlı kulüp artık yok/pasif: süre UYDURULMAZ,
   * portal "solfej süresi şu an belirtilemiyor" der (yanıltıcı "+ 0" yok).
   */
  includedSolfegeUnavailable?: true;
};

/** Portal listesi: teklif + doluluk DURUMU (sayı yok). */
export type PublicClub = ClubOffer & { full: boolean; waitlistOnly: boolean };

export type ClubApplication = {
  id: string;
  reference: string;
  clubId: string;
  branchId?: string;
  status: ClubApplicationStatus;
  waitlistRequested: boolean;
  participantName: string;
  birthDate?: string;
  age?: number;
  phone: string;
  email?: string;
  parentName?: string;
  /**
   * Ekranda "Eğitim geçmişi" (2026-10-07; eski etiket "Notlar"). Yeni başvuruda zorunlu; eski başvurularda boş
   * olabilir — boş değer "Belirtilmemiş" gösterilir, hiçbir yönetici işlemini engellemez.
   */
  note?: string;
  kvkkConsentAt: string;
  kvkkTextVersionId?: string;
  clubSnapshot: ClubOffer;
  studentId?: string;
  membershipId?: string;
  solfegeMembershipId?: string;
  solfegePending: boolean;
  staffNote?: string;
  handledByUserId?: string;
  handledAt?: string;
  source?: string;
  createdAt: string;
  updatedAt: string;
};

type Branch = { id: string; name: string; shortName?: string; address?: string; phone?: string };

// ── Saf yardımcılar ─────────────────────────────────────────────────────────

/** Türkiye telefonu → yalnız rakam, başında 0 (0532…). Arama ve mükerrer işareti bu biçimle yapılır. */
export function normalizePhone(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("90")) d = `0${d.slice(2)}`;
  if (d.length === 10 && d.startsWith("5")) d = `0${d}`;
  return d;
}

export function formatPhone(digits: string): string {
  return /^0\d{10}$/.test(digits) ? `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 9)} ${digits.slice(9)}` : digits;
}

/** Tam yaş (YYYY-MM-DD doğum, YYYY-MM-DD gün). */
export function ageOn(birthDate: string, dayYmd: string): number {
  const [by, bm, bd] = birthDate.split("-").map(Number) as [number, number, number];
  const [y, m, d] = dayYmd.split("-").map(Number) as [number, number, number];
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

/** Başvuru kimliğinden türetilen rastgele görünümlü referans (sıra numarası değil — hacim ifşa etmez). */
export function referenceFor(id: string): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const h = createHash("sha256").update(id).digest();
  let out = "";
  for (let i = 0; i < 6; i++) out += alphabet[h[i]! % alphabet.length];
  return `KB-${out}`;
}

/** Halka açık teklif (AÇIK ALAN LİSTESİ). Öğretmen, yönetim notu, üye ve kontenjan sayısı yoktur. */
export function buildClubOffer(club: Club, clubs: Club[], branches: Branch[]): ClubOffer {
  const branch = club.branchId ? branches.find((b) => b.id === club.branchId) : undefined;
  const solfege = club.includedSolfegeClubId ? clubs.find((c) => c.id === club.includedSolfegeClubId && c.active) : undefined;
  const solfegeBranch = solfege?.branchId ? branches.find((b) => b.id === solfege.branchId) : undefined;
  return {
    clubId: club.id,
    name: club.name,
    instrument: club.instrument,
    ...(club.audience ? { audience: club.audience } : {}),
    ...(club.minAge !== undefined ? { minAge: club.minAge } : {}),
    ...(club.maxAge !== undefined ? { maxAge: club.maxAge } : {}),
    ...(club.description ? { description: club.description } : {}),
    ...(club.startDate ? { startDate: club.startDate } : {}),
    ...(club.endDate ? { endDate: club.endDate } : {}),
    ...(club.scheduleText ? { scheduleText: club.scheduleText } : {}),
    durationMinutes: club.durationMinutes,
    ...(branch
      ? {
          branchId: branch.id,
          branchName: branch.shortName || branch.name,
          ...(branch.address?.trim() ? { branchAddress: branch.address.trim() } : {}),
          ...(branch.phone?.trim() ? { branchPhone: branch.phone.trim() } : {}),
        }
      : {}),
    fee: club.monthlyFee,
    feePeriod: club.feePeriod,
    ...(club.feePeriod === "monthly" && club.feeMonths !== undefined ? { feeMonths: club.feeMonths } : {}),
    ...(club.totalLessons !== undefined ? { totalLessons: club.totalLessons } : {}),
    ...(club.includesText ? { includesText: club.includesText } : {}),
    ...(solfege
      ? {
          includedSolfege: {
            clubId: solfege.id,
            name: solfege.name,
            ...(solfege.scheduleText ? { scheduleText: solfege.scheduleText } : {}),
            ...(solfege.startDate ? { startDate: solfege.startDate } : {}),
            ...(solfege.endDate ? { endDate: solfege.endDate } : {}),
            durationMinutes: solfege.durationMinutes,
            ...(solfege.totalLessons !== undefined ? { totalLessons: solfege.totalLessons } : {}),
            ...(solfegeBranch ? { branchName: solfegeBranch.shortName || solfegeBranch.name } : {}),
          },
        }
      : club.includedSolfegeClubId && !isSolfegeClub(club)
        ? { includedSolfegeUnavailable: true as const }
        : {}),
  };
}

/** Başvuru anındaki teklif ile güncel teklif arasındaki farklar (yöneticiye gösterilir). */
export function diffOffers(then: ClubOffer, now: ClubOffer | undefined): { field: string; then: string; now: string }[] {
  if (!now) return [{ field: "Kulüp", then: then.name, now: "Kulüp silinmiş" }];
  const fmt = (v: unknown) => (v === undefined || v === null || v === "" ? "—" : String(v));
  const rows: [string, unknown, unknown][] = [
    ["Kulüp adı", then.name, now.name],
    ["Ücret (TL)", then.fee, now.fee],
    ["Ücret niteliği", then.feePeriod, now.feePeriod],
    ["Ödeme alınacak ay sayısı", then.feeMonths, now.feeMonths],
    ["Toplam ders sayısı", then.totalLessons, now.totalLessons],
    ["Başlangıç", then.startDate, now.startDate],
    ["Bitiş", then.endDate, now.endDate],
    ["Gün/saat", then.scheduleText, now.scheduleText],
    ["Ders süresi (dk)", then.durationMinutes, now.durationMinutes],
    ["Şube", then.branchName, now.branchName],
    ["Ücrete dahil", then.includesText, now.includesText],
    ["Dahil solfej", then.includedSolfege?.name, now.includedSolfege?.name],
  ];
  return rows.filter(([, a, b]) => fmt(a) !== fmt(b)).map(([field, a, b]) => ({ field, then: fmt(a), now: fmt(b) }));
}

/** Saf: kulüp şu an başvuru alabilir mi? Kapalı/bitmiş/dolu-bekleme-listesiz → neden. */
export function clubAcceptance(
  club: Club | undefined,
  memberships: ClubMembership[],
  todayYmd: string
): { ok: true; full: boolean } | { ok: false; message: string } {
  if (!club || !club.active || !club.applicationsOpen) return { ok: false, message: "Bu kulüp şu an başvuru almıyor. Listeden başvuruya açık bir kulüp seçin." };
  if (club.endDate && club.endDate < todayYmd) return { ok: false, message: "Bu kulübün dönemi sona erdi; başvuru alınmıyor. Listeden başka bir kulüp seçin." };
  if (clubApplicationIssues(club, todayYmd).length) return { ok: false, message: "Bu kulüp şu an başvuru almıyor. Listeden başvuruya açık bir kulüp seçin." };
  const full = activeMemberCount(memberships, club.id, todayYmd) >= club.maxMembers;
  if (full && !club.waitlistEnabled) return { ok: false, message: "Bu kulübün kontenjanı dolu ve şu an başvuru almıyor. Listeden başka bir kulüp seçin." };
  return { ok: true, full };
}

// ── Depolama ────────────────────────────────────────────────────────────────

export const CLUB_APPLICATIONS_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "club-applications.json");
type Stored = ClubApplication & { tenantId: string };
type Tx = Prisma.TransactionClient;

async function loadAll(): Promise<Stored[]> {
  try {
    const fs = await import("fs/promises");
    return JSON.parse(await fs.readFile(CLUB_APPLICATIONS_FILE, "utf8")) as Stored[];
  } catch {
    return [];
  }
}

async function saveAll(rows: Stored[]): Promise<void> {
  const { writeJsonFileAtomic } = await import("./atomic-json-file");
  await writeJsonFileAtomic(CLUB_APPLICATIONS_FILE, rows);
}

async function withFile<T>(fn: () => Promise<T>): Promise<T> {
  const { withFileLock } = await import("./atomic-json-file");
  return withFileLock(CLUB_APPLICATIONS_FILE, fn);
}

const str = (v: string | null | undefined) => (v == null || v === "" ? undefined : v);

function fromDb(r: DbRow): ClubApplication {
  return {
    id: r.id,
    reference: r.reference,
    clubId: r.clubId,
    branchId: str(r.branchId),
    status: (CLUB_APPLICATION_STATUSES.includes(r.status as ClubApplicationStatus) ? r.status : "new") as ClubApplicationStatus,
    waitlistRequested: r.waitlistRequested,
    participantName: r.participantName,
    birthDate: str(r.birthDate),
    age: r.age ?? undefined,
    phone: r.phone,
    email: str(r.email),
    parentName: str(r.parentName),
    note: str(r.note),
    kvkkConsentAt: r.kvkkConsentAt.toISOString(),
    kvkkTextVersionId: str(r.kvkkTextVersionId),
    clubSnapshot: r.clubSnapshot as unknown as ClubOffer,
    studentId: str(r.studentId),
    membershipId: str(r.membershipId),
    solfegeMembershipId: str(r.solfegeMembershipId),
    solfegePending: r.solfegePending,
    staffNote: str(r.staffNote),
    handledByUserId: str(r.handledByUserId),
    handledAt: r.handledAt?.toISOString(),
    source: str(r.source),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

const strip = ({ tenantId: _ignored, ...a }: Stored): ClubApplication => a; // eslint-disable-line @typescript-eslint/no-unused-vars

export async function getClubApplication(tenantId: string, id: string, tx?: Tx | null): Promise<ClubApplication | null> {
  if (isDbMode) {
    const db = tx ?? (await import("./db")).prisma;
    const r = await db.clubApplication.findFirst({ where: { id, tenantId } });
    return r ? fromDb(r) : null;
  }
  const r = (await loadAll()).find((a) => a.id === id && a.tenantId === tenantId);
  return r ? strip(r) : null;
}

/** false = aynı kimlikli başvuru zaten var (tekrar deneme) — ikinci satır yazılmadı. */
async function insertApplication(tenantId: string, a: ClubApplication): Promise<boolean> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    try {
      await prisma.clubApplication.create({
        data: {
          ...a,
          tenantId,
          clubSnapshot: a.clubSnapshot as unknown as Prisma.InputJsonValue,
          kvkkConsentAt: new Date(a.kvkkConsentAt),
          handledAt: undefined,
          createdAt: new Date(a.createdAt),
          updatedAt: new Date(a.updatedAt),
        },
      });
      return true;
    } catch (e) {
      if ((e as { code?: string })?.code === "P2002") return false;
      throw e;
    }
  }
  return withFile(async () => {
    const all = await loadAll();
    if (all.some((x) => x.id === a.id)) return false;
    await saveAll([...all, { ...a, tenantId }]);
    return true;
  });
}

type AppPatch = Partial<
  Pick<ClubApplication, "status" | "staffNote" | "studentId" | "membershipId" | "solfegeMembershipId" | "solfegePending" | "handledByUserId" | "handledAt">
>;

async function patchApplication(tenantId: string, id: string, patch: AppPatch, tx?: Tx | null): Promise<boolean> {
  const now = new Date().toISOString();
  if (isDbMode) {
    const db = tx ?? (await import("./db")).prisma;
    const res = await db.clubApplication.updateMany({
      where: { id, tenantId },
      data: { ...patch, handledAt: patch.handledAt ? new Date(patch.handledAt) : undefined, updatedAt: new Date(now) },
    });
    return res.count > 0;
  }
  const apply = async () => {
    const all = await loadAll();
    const i = all.findIndex((a) => a.id === id && a.tenantId === tenantId);
    if (i < 0) return false;
    all[i] = { ...all[i]!, ...patch, updatedAt: now };
    await saveAll(all);
    return true;
  };
  // json: başvuru dosyası kendi kilidinde (kulüp üyelik kilidinden ayrı anahtar — iç içe çağrı kilitlenmez).
  return withFile(apply);
}

export type ClubApplicationFilters = {
  clubId?: string;
  branchId?: string;
  status?: ClubApplicationStatus;
  /** YYYY-MM-DD (kurum saati), dahil. */
  from?: string;
  to?: string;
  /** Ad / veli adı / telefon / referans. */
  q?: string;
  page?: number;
  pageSize?: number;
};

export type ClubApplicationPage = { items: ClubApplication[]; total: number; page: number; pageSize: number };

const dayStartUtc = (ymd: string) => zonedWallTimeToUtc(ymd, "00:00", DEFAULT_APP_TIMEZONE);
const nextDay = (ymd: string) => {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

export async function queryClubApplications(tenantId: string, f: ClubApplicationFilters): Promise<ClubApplicationPage> {
  const pageSize = Math.min(Math.max(f.pageSize ?? 20, 5), 100);
  const page = Math.max(f.page ?? 1, 1);
  const q = f.q?.trim().slice(0, 80) ?? "";
  const qDigits = q.replace(/\D/g, "");
  if (isDbMode) {
    const { prisma } = await import("./db");
    const where: Prisma.ClubApplicationWhereInput = {
      tenantId,
      ...(f.clubId ? { clubId: f.clubId } : {}),
      ...(f.branchId ? { branchId: f.branchId } : {}),
      ...(f.status ? { status: f.status } : {}),
      ...(f.from || f.to
        ? { createdAt: { ...(f.from ? { gte: dayStartUtc(f.from) } : {}), ...(f.to ? { lt: dayStartUtc(nextDay(f.to)) } : {}) } }
        : {}),
      ...(q
        ? {
            OR: [
              { participantName: { contains: q, mode: "insensitive" as const } },
              { parentName: { contains: q, mode: "insensitive" as const } },
              { reference: { contains: q.toUpperCase() } },
              ...(qDigits.length >= 3 ? [{ phone: { contains: qDigits } }] : []),
            ],
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      prisma.clubApplication.count({ where }),
      prisma.clubApplication.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    return { items: rows.map(fromDb), total, page, pageSize };
  }
  const qLower = q.toLocaleLowerCase("tr");
  const all = (await loadAll())
    .filter((a) => a.tenantId === tenantId)
    .filter((a) => (!f.clubId || a.clubId === f.clubId) && (!f.branchId || a.branchId === f.branchId) && (!f.status || a.status === f.status))
    .filter((a) => (!f.from || a.createdAt >= dayStartUtc(f.from).toISOString()) && (!f.to || a.createdAt < dayStartUtc(nextDay(f.to)).toISOString()))
    .filter(
      (a) =>
        !q ||
        a.participantName.toLocaleLowerCase("tr").includes(qLower) ||
        (a.parentName ?? "").toLocaleLowerCase("tr").includes(qLower) ||
        a.reference.includes(q.toUpperCase()) ||
        (qDigits.length >= 3 && a.phone.includes(qDigits))
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { items: all.slice((page - 1) * pageSize, page * pageSize).map(strip), total: all.length, page, pageSize };
}

/** Kulüp başına açık (Yeni + İletişime geçildi + Bekleme listesi) başvuru sayısı ve toplam "Yeni". */
export async function countOpenClubApplications(tenantId: string): Promise<{ byClub: Record<string, number>; newTotal: number }> {
  const open: ClubApplicationStatus[] = ["new", "contacted", "waitlisted"];
  const byClub: Record<string, number> = {};
  let newTotal = 0;
  if (isDbMode) {
    const { prisma } = await import("./db");
    const rows = await prisma.clubApplication.groupBy({ by: ["clubId", "status"], where: { tenantId, status: { in: open } }, _count: { _all: true } });
    for (const r of rows) {
      byClub[r.clubId] = (byClub[r.clubId] ?? 0) + r._count._all;
      if (r.status === "new") newTotal += r._count._all;
    }
    return { byClub, newTotal };
  }
  for (const a of (await loadAll()).filter((x) => x.tenantId === tenantId && open.includes(x.status))) {
    byClub[a.clubId] = (byClub[a.clubId] ?? 0) + 1;
    if (a.status === "new") newTotal++;
  }
  return { byClub, newTotal };
}

async function recentCounts(tenantId: string, phone: string, now: Date): Promise<{ samePhoneDay: number; tenantTenMinutes: number }> {
  const dayAgo = new Date(now.getTime() - 86_400_000);
  const tenMinAgo = new Date(now.getTime() - 10 * 60_000);
  if (isDbMode) {
    const { prisma } = await import("./db");
    const [samePhoneDay, tenantTenMinutes] = await Promise.all([
      prisma.clubApplication.count({ where: { tenantId, phone, createdAt: { gte: dayAgo } } }),
      prisma.clubApplication.count({ where: { tenantId, createdAt: { gte: tenMinAgo } } }),
    ]);
    return { samePhoneDay, tenantTenMinutes };
  }
  const all = (await loadAll()).filter((a) => a.tenantId === tenantId);
  return {
    samePhoneDay: all.filter((a) => a.phone === phone && a.createdAt >= dayAgo.toISOString()).length,
    tenantTenMinutes: all.filter((a) => a.createdAt >= tenMinAgo.toISOString()).length,
  };
}

// ── Halka açık okuma ─────────────────────────────────────────────────────────

async function loadTenantClubContext(tenantId: string) {
  const { runWithTenantAsync } = await import("./tenant-context");
  return runWithTenantAsync(tenantId, async () => {
    const { readReferenceData } = await import("./store");
    const [clubs, memberships, ref] = await Promise.all([listClubs(tenantId), listClubMemberships(tenantId), readReferenceData()]);
    return { clubs, memberships, branches: ref.settings.branches as Branch[] };
  });
}

/** Portal listesi — yalnız bu kurumun başvuruya açık, dönemi bitmemiş kulüpleri. */
export async function listPublicClubs(tenantId: string, now = new Date()): Promise<PublicClub[]> {
  const { clubs, memberships, branches } = await loadTenantClubContext(tenantId);
  const t = toZonedYmd(now, DEFAULT_APP_TIMEZONE);
  const out: PublicClub[] = [];
  for (const c of clubs) {
    const acc = clubAcceptance(c, memberships, t);
    if (!acc.ok) continue;
    out.push({ ...buildClubOffer(c, clubs, branches), full: acc.full, waitlistOnly: acc.full });
  }
  return out;
}

// ── Halka açık gönderim ─────────────────────────────────────────────────────

const ymdRe = /^\d{4}-\d{2}-\d{2}$/;

export const EDUCATION_HISTORY_REQUIRED =
  "Eğitim geçmişi alanını doldurun. Daha önce müzik eğitimi almadıysanız “Daha önce eğitim almadım” yazmanız yeterli.";

const publicSchema = z.object({
  clubId: z.string().trim().min(1, "Başvurmak istediğiniz kulübü seçin.").max(80),
  participantName: z.string().trim().min(2, "Katılımcının adını ve soyadını yazın.").max(120, "Ad soyad en fazla 120 karakter olabilir."),
  birthDate: z.string().trim().regex(/^(\d{4}-\d{2}-\d{2})?$/, "Doğum tarihini seçin.").optional(),
  age: z.union([z.literal(""), z.coerce.number().int("Yaşı tam sayı olarak yazın.").min(3, "Yaş 3 ile 99 arasında olmalı.").max(99, "Yaş 3 ile 99 arasında olmalı.")]).optional(),
  phone: z.string().trim().max(30),
  email: z.string().trim().max(160).email("E-posta adresi geçerli görünmüyor; düzeltin ya da boş bırakın.").optional().or(z.literal("")),
  parentName: z.string().trim().max(120).optional(),
  /** Ekrandaki "Eğitim geçmişi" — ZORUNLU; boş/yalnız boşluk reddedilir (eğitim almış olmak şart değildir). */
  note: z
    .string({ error: EDUCATION_HISTORY_REQUIRED })
    .trim()
    .min(1, EDUCATION_HISTORY_REQUIRED)
    .max(1000, "Eğitim geçmişi en fazla 1000 karakter olabilir."),
  kvkkConsent: z.literal(true, { message: "Başvurunun alınması için aydınlatma metnini okuyup onaylamanız gerekiyor." }),
  source: z.string().trim().max(80).optional(),
  submissionKey: z.string().trim().regex(/^[A-Za-z0-9_-]{8,64}$/).optional(),
  /** Formun açık kaldığı süre (ms) — çok hızlı gönderim bot sayılır. */
  elapsedMs: z.coerce.number().int().min(0).optional(),
});

export type PublicClubSubmitResult =
  | { ok: true; reference?: string; clubName?: string; waitlist?: boolean }
  | { ok: false; status: number; message: string; field?: string };

const bad = (message: string, field?: string, status = 400): PublicClubSubmitResult => ({ ok: false, status, message, ...(field ? { field } : {}) });

/**
 * Herkese açık gönderim. Kurum slug'dan çözülmüş olmalı (istemciden tenant alınmaz). Kapalı/bitmiş/dolu kulüp
 * SUNUCUDA reddedilir. Aynı telefon farklı çocuklar için kullanılabilir — mükerrer diye engellenmez (panelde
 * işaretlenir). Kalıcı sınırlar (DB): aynı telefondan 24 saatte 10, kurumda 10 dakikada 30 başvuru.
 */
export async function submitPublicClubApplication(
  tenant: { tenantId: string },
  input: unknown,
  now = new Date()
): Promise<PublicClubSubmitResult> {
  const parsed = publicSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return bad(issue?.message ?? "Formdaki bilgileri kontrol edin.", issue?.path[0] ? String(issue.path[0]) : undefined);
  }
  const v = parsed.data;
  if (v.elapsedMs !== undefined && v.elapsedMs < 2500) return { ok: true };
  const phone = normalizePhone(v.phone);
  if (!/^0\d{10}$/.test(phone)) return bad("Telefon numarasını alan koduyla eksiksiz yazın (ör. 0532 123 45 67).", "phone");
  const t = toZonedYmd(now, DEFAULT_APP_TIMEZONE);

  const { clubs, memberships, branches } = await loadTenantClubContext(tenant.tenantId);
  const club = clubs.find((c) => c.id === v.clubId);
  const acc = clubAcceptance(club, memberships, t);
  if (!acc.ok || !club) return bad(acc.ok ? "Bu kulüp şu an başvuru almıyor." : acc.message, "clubId", 409);

  // Yaş: çocuk grubunda doğum tarihi + veli zorunlu; yetişkinde yaş (veya doğum tarihi) zorunlu.
  let age: number | undefined;
  const birthDate = v.birthDate || undefined;
  if (birthDate) {
    const d = new Date(`${birthDate}T12:00:00Z`);
    if (!ymdRe.test(birthDate) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== birthDate || birthDate > t) {
      return bad("Doğum tarihi geçerli bir tarih değil; düzeltin.", "birthDate");
    }
    age = ageOn(birthDate, t);
    if (age < 3 || age > 99) return bad("Doğum tarihini kontrol edin; yaş 3 ile 99 arasında olmalı.", "birthDate");
  } else if (typeof v.age === "number") {
    age = v.age;
  }
  if (club.audience === "child") {
    if (!birthDate) return bad("Çocuk grubu için katılımcının doğum tarihini seçin.", "birthDate");
    if (!v.parentName || v.parentName.length < 2) return bad("Çocuk grubu için veli adı ve soyadını yazın.", "parentName");
  } else if (age === undefined) {
    return bad("Yaşınızı yazın.", "age");
  }
  if (age !== undefined && club.minAge !== undefined && age < club.minAge) {
    return bad(`${club.name} ${club.minAge} yaş ve üzeri içindir; katılımcının yaşı (${age}) uygun değil. Size uygun başka bir kulüp seçebilirsiniz.`, birthDate ? "birthDate" : "age");
  }
  if (age !== undefined && club.maxAge !== undefined && age > club.maxAge) {
    return bad(`${club.name} en fazla ${club.maxAge} yaş içindir; katılımcının yaşı (${age}) uygun değil. Size uygun başka bir kulüp seçebilirsiniz.`, birthDate ? "birthDate" : "age");
  }

  const id = v.submissionKey
    ? `capp_${createHash("sha256").update(`${tenant.tenantId}:club:${v.submissionKey}`).digest("hex").slice(0, 24)}`
    : uid("capp");
  // Tekrar deneme (ağ kesintisi/çift tıklama): aynı form anahtarı → aynı başvuru, aynı referans.
  const existing = await getClubApplication(tenant.tenantId, id);
  if (existing) return { ok: true, reference: existing.reference, clubName: existing.clubSnapshot.name, waitlist: existing.waitlistRequested };

  const counts = await recentCounts(tenant.tenantId, phone, now);
  if (counts.samePhoneDay >= 10) return bad("Bu telefon numarasıyla bugün çok sayıda başvuru yapıldı. Yarın tekrar deneyin veya kurumu arayın.", "phone", 429);
  if (counts.tenantTenMinutes >= 30) return bad("Şu an çok yoğun başvuru alıyoruz. Lütfen birkaç dakika sonra tekrar deneyin.", undefined, 429);

  let kvkkTextVersionId: string | undefined;
  try {
    const { getCurrentConsentTextVersion } = await import("./kvkk-consent");
    kvkkTextVersionId = (await getCurrentConsentTextVersion(tenant.tenantId, "kvkk_general", now))?.id;
  } catch {
    kvkkTextVersionId = undefined;
  }

  const iso = now.toISOString();
  const app: ClubApplication = {
    id,
    reference: referenceFor(id),
    clubId: club.id,
    ...(club.branchId ? { branchId: club.branchId } : {}),
    status: acc.full ? "waitlisted" : "new",
    waitlistRequested: acc.full,
    participantName: v.participantName,
    ...(birthDate ? { birthDate } : {}),
    ...(age !== undefined ? { age } : {}),
    phone,
    ...(v.email ? { email: v.email } : {}),
    ...(v.parentName ? { parentName: v.parentName } : {}),
    note: v.note,
    kvkkConsentAt: iso,
    ...(kvkkTextVersionId ? { kvkkTextVersionId } : {}),
    clubSnapshot: buildClubOffer(club, clubs, branches),
    solfegePending: false,
    ...(v.source ? { source: v.source } : {}),
    createdAt: iso,
    updatedAt: iso,
  };
  const inserted = await insertApplication(tenant.tenantId, app);
  if (!inserted) {
    const again = await getClubApplication(tenant.tenantId, id);
    return { ok: true, reference: again?.reference ?? app.reference, clubName: club.name, waitlist: app.waitlistRequested };
  }
  // Kayıt KALICI yazıldıktan sonra bildirim. Hata başvuruyu kaybettirmez; dedupeKey = başvuru kimliği.
  await notifyNewClubApplication(tenant.tenantId, app, club.name);
  return { ok: true, reference: app.reference, clubName: club.name, waitlist: app.waitlistRequested };
}

/** Yeni başvuru bildirimi — kurum yöneticilerine uygulama içi (mevcut altyapı). Adayın yazdığı metin bildirime girmez. */
export async function notifyNewClubApplication(tenantId: string, app: Pick<ClubApplication, "id" | "reference" | "waitlistRequested">, clubName: string) {
  try {
    const { notifyAdmins } = await import("./manager-notifications");
    const outcomes = await notifyAdmins(
      tenantId,
      "club_new_application",
      {
        title: "Yeni grup dersi başvurusu",
        body: `${app.reference} — ${clubName} için yeni başvuru${app.waitlistRequested ? " (kontenjan dolu, bekleme listesi)" : ""}. Detay: /panel/kulupler/basvurular/${app.id}`,
      },
      { dedupeKey: app.id, windowMs: 30 * 86_400_000 }
    );
    if (outcomes.length === 0) logger.warn("club application: bildirim hedefi yok", { tenantId, applicationId: app.id });
    else if (outcomes.includes("failed")) logger.error("club application: bildirim kısmen/tamamen başarısız", { tenantId, applicationId: app.id, outcomes });
    return outcomes;
  } catch (e) {
    logger.error("club application: bildirim gönderilemedi", { tenantId, applicationId: app.id, error: e instanceof Error ? e.message : String(e) });
    return ["failed" as const];
  }
}

// ── Yönetici araçları ───────────────────────────────────────────────────────

/** Kurum yöneticileri (SUPER_ADMIN requireRole'da geçer). Öğretmen/öğrenci/veli/anonim başvuru yönetemez. */
const ADMIN_ROLES = ["SCHOOL_ADMIN"] as ServiceContext["role"][];
const today = () => toZonedYmd(new Date(), DEFAULT_APP_TIMEZONE);

const filterSchema = z.object({
  clubId: z.string().max(80).optional(),
  branchId: z.string().max(80).optional(),
  status: z.enum(CLUB_APPLICATION_STATUSES as [ClubApplicationStatus, ...ClubApplicationStatus[]]).optional(),
  from: z.string().regex(ymdRe).optional(),
  to: z.string().regex(ymdRe).optional(),
  q: z.string().max(80).optional(),
  page: z.coerce.number().int().min(1).max(10_000).optional(),
  pageSize: z.coerce.number().int().min(5).max(100).optional(),
});

export async function listClubApplicationsTool(ctx: ServiceContext, input: unknown): Promise<ServiceResult<ClubApplicationPage>> {
  const auth = requireRole(ctx, ADMIN_ROLES);
  if (!auth.ok) return fail("FORBIDDEN", "Grup dersi başvurularını yalnız kurum yöneticileri görebilir.");
  const f = filterSchema.safeParse(input ?? {});
  if (!f.success) return fail("VALIDATION_ERROR", "Filtreler okunamadı. Filtreleri temizleyip tekrar deneyin.");
  return ok(await queryClubApplications(ctx.tenantId, f.data));
}

export type ClubApplicationDetail = {
  application: ClubApplication;
  club?: Club;
  currentOffer?: ClubOffer;
  offerDiff: { field: string; then: string; now: string }[];
  /** Aynı telefon + aynı kulüp ile verilmiş diğer başvurular (yalnız işaret; engel değil). */
  related: Pick<ClubApplication, "id" | "reference" | "participantName" | "status" | "createdAt" | "clubId">[];
};

export async function getClubApplicationTool(ctx: ServiceContext, input: unknown): Promise<ServiceResult<ClubApplicationDetail>> {
  const auth = requireRole(ctx, ADMIN_ROLES);
  if (!auth.ok) return fail("FORBIDDEN", "Grup dersi başvurularını yalnız kurum yöneticileri görebilir.");
  const parsed = z.object({ id: z.string().min(1).max(80) }).safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Başvuru seçilmedi.");
  const application = await getClubApplication(ctx.tenantId, parsed.data.id);
  if (!application) return fail("NOT_FOUND", "Başvuru bulunamadı; başka kuruma ait ya da silinmiş olabilir. Başvurular listesine dönün.");
  const { clubs, branches } = await loadTenantClubContext(ctx.tenantId);
  const club = clubs.find((c) => c.id === application.clubId);
  const currentOffer = club ? buildClubOffer(club, clubs, branches) : undefined;
  const samePhone = await queryClubApplications(ctx.tenantId, { q: application.phone, pageSize: 50 });
  return ok({
    application,
    club,
    currentOffer,
    offerDiff: diffOffers(application.clubSnapshot, currentOffer),
    related: samePhone.items
      .filter((a) => a.id !== application.id && a.phone === application.phone)
      .map(({ id, reference, participantName, status, createdAt, clubId }) => ({ id, reference, participantName, status, createdAt, clubId })),
  });
}

const statusSchema = z.object({
  id: z.string().min(1).max(80),
  status: z.enum(["new", "contacted", "waitlisted", "declined", "withdrawn"]).optional(),
  staffNote: z.string().trim().max(2000, "Not en fazla 2000 karakter olabilir.").optional(),
});

/** Durum / yönetim notu. "Kulübe eklendi" yalnız "Kulübe ekle" akışıyla verilir; eklenmiş başvurunun durumu geri alınmaz. */
export async function updateClubApplicationTool(ctx: ServiceContext, input: unknown): Promise<ServiceResult<ClubApplication>> {
  const auth = requireRole(ctx, ADMIN_ROLES);
  if (!auth.ok) return fail("FORBIDDEN", "Grup dersi başvurusunu yalnız kurum yöneticileri güncelleyebilir.");
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) {
    const st = (input as { status?: unknown } | null)?.status;
    return fail(
      "VALIDATION_ERROR",
      st === "added" ? "\"Kulübe eklendi\" durumu \"Kulübe ekle\" düğmesiyle verilir; öğrenciyi seçip ekleyin." : parsed.error.issues[0]?.message ?? "Başvuru güncellemesi okunamadı."
    );
  }
  const v = parsed.data;
  const current = await getClubApplication(ctx.tenantId, v.id);
  if (!current) return fail("NOT_FOUND", "Başvuru bulunamadı; başka kuruma ait ya da silinmiş olabilir. Sayfayı yenileyin.");
  if (v.status && current.status === "added") {
    return fail("CONFLICT", "Bu başvuru kulübe eklendi; durumu değiştirilemez. Üyeliği bitirmek için Kulüpler → kulüp → Üyeler'den \"Üyeliği sonlandır\"ı kullanın.");
  }
  const handled = { handledByUserId: ctx.userId, handledAt: new Date().toISOString() };
  await patchApplication(ctx.tenantId, v.id, {
    ...(v.status ? { status: v.status } : {}),
    ...(v.staffNote !== undefined ? { staffNote: v.staffNote || undefined } : {}),
    ...handled,
  });
  const { recordAuditLog } = await import("./audit/log");
  void recordAuditLog({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    action: v.status && v.status !== current.status ? "club_application.status" : "club_application.note",
    entityType: "ClubApplication",
    entityId: v.id,
    outcome: "success",
    meta: { from: current.status, to: v.status ?? current.status, noteChanged: v.staffNote !== undefined },
  });
  const updated = await getClubApplication(ctx.tenantId, v.id);
  return updated ? ok(updated) : fail("NOT_FOUND", "Başvuru bulunamadı. Sayfayı yenileyin.");
}

// ── Kulübe ekle (önizleme + onay) ───────────────────────────────────────────

export type AddToClubPreview = {
  application: Pick<ClubApplication, "id" | "reference" | "participantName" | "status" | "membershipId" | "solfegePending">;
  student: { id: string; name: string; phone?: string; parentPhone?: string; birthDate?: string; branchName?: string };
  club: { id: string; name: string; branchName?: string; used: number; max: number; full: boolean; fee: number; feePeriod: ClubFeePeriod; active: boolean };
  /** Öğrencinin bu kulüpte zaten aktif üyeliği (bu başvuruya bağlı ya da değil). */
  existingMain?: { membershipId: string; linkedToThisApplication: boolean };
  startDate: string;
  solfege?: {
    id: string;
    name: string;
    used: number;
    max: number;
    full: boolean;
    /** create: yeni ücretsiz dahil üyelik · grant: mevcut üyeliğe hak eklenir (yeni üyelik/ücret yok) · already: zaten bu haktan üye */
    action: "create" | "grant" | "already";
    existingIndependent: boolean;
  };
  blockers: string[];
  /** Solfej dolu: ancak yöneticinin açık onayıyla (bekleme) ilerlenir. */
  needsSolfegeWaitlistConfirm: boolean;
  /** Bu işlem tahsilat/borç/sözleşme yazmaz; ücretin nasıl ilerleyeceği. */
  feeNote: string;
};

const addSchema = z.object({
  applicationId: z.string().min(1).max(80),
  studentId: z.string().min(1).max(80),
  startDate: z.string().regex(ymdRe, "Üyelik başlangıç tarihini seçin.").optional(),
  confirmSolfegeWaitlist: z.boolean().optional(),
});

function defaultStartDate(club: Club | undefined, t: string): string {
  return club?.startDate && club.startDate > t ? club.startDate : t;
}

function feeNoteFor(club: Club, startDate: string): string {
  if (club.monthlyFee <= 0) return "Bu kulüp ücretsiz; borç yazılmaz.";
  const month = startDate.slice(0, 7);
  if (club.feePeriod === "monthly") {
    const span = club.feeMonths !== undefined ? ` (ödeme alınacak ay sayısı ${club.feeMonths}; başlangıç ayı 1. aydır)` : "";
    return `Bu işlem tahsilat, borç veya sözleşme oluşturmaz. Aylık ${club.monthlyFee} TL kulüp ücreti${span}, başlangıç ayından (${month}) SONRAKİ aylarda mevcut aylık kulüp tahakkukuyla yazılır; başlangıç ayının ücretini isterseniz Kulüp ekranındaki üye satırından "Başlangıç ücretini yaz" ile ayrıca ekleyin.`;
  }
  return `Bu işlem tahsilat, borç veya sözleşme oluşturmaz. ${club.feePeriod === "term" ? "Dönemlik" : "Toplam"} ${club.monthlyFee} TL ücret otomatik borçlanmaz; Kulüp ekranındaki üye satırından "Başlangıç ücretini yaz" ile ya da Ödemeler ekranından ayrıca yazın.`;
}

async function buildPreview(ctx: ServiceContext, input: z.infer<typeof addSchema>, tx: Tx | null | undefined): Promise<ServiceResult<AddToClubPreview & { _club: Club; _solfegeClub?: Club; _memberships: ClubMembership[]; _application: ClubApplication; _studentName: string }>> {
  const application = await getClubApplication(ctx.tenantId, input.applicationId, tx);
  if (!application) return fail("NOT_FOUND", "Başvuru bulunamadı; başka kuruma ait ya da silinmiş olabilir. Sayfayı yenileyin.");
  const [{ readReferenceData, readStudentById }] = await Promise.all([import("./store")]);
  const [ref, student, clubs, memberships] = await Promise.all([
    readReferenceData(),
    readStudentById(input.studentId),
    listClubs(ctx.tenantId),
    listClubMemberships(ctx.tenantId, tx),
  ]);
  if (!student || student.deletedAt) return fail("NOT_FOUND", "Öğrenci bulunamadı veya silinmiş. Öğrenciyi listeden yeniden seçin.");
  const club = clubs.find((c) => c.id === application.clubId);
  if (!club) return fail("NOT_FOUND", "Başvurunun kulübü bulunamadı (silinmiş olabilir). Başvuruyu reddedin veya başka bir kulübe ayrı ekleme yapın.");
  const t = today();
  const branchName = (id?: string) => (id ? (ref.settings.branches.find((b) => b.id === id)?.shortName || ref.settings.branches.find((b) => b.id === id)?.name) : undefined);
  const used = activeMemberCount(memberships, club.id, t);
  const startDate = input.startDate ?? defaultStartDate(club, t);
  const blockers: string[] = [];
  if (!student.active) blockers.push(`${student.name} pasif; önce öğrenciyi aktif yapın.`);
  if (!club.active) blockers.push(`${club.name} pasif; önce kulübü aktif yapın.`);
  if (club.endDate && startDate > club.endDate) blockers.push(`Başlangıç tarihi kulübün bitişinden (${club.endDate}) sonra olamaz.`);
  const mainExisting = memberships.find((m) => m.clubId === club.id && m.studentId === student.id && isMembershipActive(m, t));
  if (!mainExisting && used >= club.maxMembers) {
    blockers.push(`${club.name} kontenjanı dolu (${used}/${club.maxMembers}). Kontenjanı artırın, bir üyeliği sonlandırın ya da başvuruyu "Bekleme listesi"ne alın.`);
  }
  if (application.status === "added" && application.membershipId && mainExisting && mainExisting.id !== application.membershipId) {
    blockers.push("Bu başvuru başka bir üyelikle zaten eklenmiş.");
  }
  if (application.status === "added" && application.studentId && application.studentId !== student.id) {
    blockers.push("Bu başvuru başka bir öğrenciyle eklenmiş; öğrenci değiştirilemez.");
  }
  let solfege: AddToClubPreview["solfege"];
  const solfegeClub = club.includedSolfegeClubId ? clubs.find((c) => c.id === club.includedSolfegeClubId) : undefined;
  let needsSolfegeWaitlistConfirm = false;
  if (club.includedSolfegeClubId && !isSolfegeClub(club)) {
    if (!solfegeClub || !solfegeClub.active) {
      blockers.push("Kulübe bağlı dahil solfej kulübü bulunamadı veya pasif. Kulübü düzenleyip dahil solfej seçimini düzeltin.");
    } else {
      const sUsed = activeMemberCount(memberships, solfegeClub.id, t);
      const sExisting = memberships.find((m) => m.clubId === solfegeClub.id && m.studentId === student.id && isMembershipActive(m, t));
      const grantedByThis = !!(sExisting && mainExisting && sExisting.includedByMembershipIds?.includes(mainExisting.id));
      const action: "create" | "grant" | "already" = grantedByThis ? "already" : sExisting ? "grant" : "create";
      const full = action === "create" && sUsed >= solfegeClub.maxMembers;
      solfege = {
        id: solfegeClub.id,
        name: solfegeClub.name,
        used: sUsed,
        max: solfegeClub.maxMembers,
        full,
        action,
        existingIndependent: !!sExisting && !(sExisting.includedByMembershipIds?.length),
      };
      needsSolfegeWaitlistConfirm = full;
    }
  }
  return ok({
    application: {
      id: application.id,
      reference: application.reference,
      participantName: application.participantName,
      status: application.status,
      membershipId: application.membershipId,
      solfegePending: application.solfegePending,
    },
    student: {
      id: student.id,
      name: student.name,
      phone: student.phone || undefined,
      parentPhone: student.parentPhone || undefined,
      birthDate: student.birthDate || undefined,
      branchName: branchName(student.branchId),
    },
    club: { id: club.id, name: club.name, branchName: branchName(club.branchId), used, max: club.maxMembers, full: used >= club.maxMembers, fee: club.monthlyFee, feePeriod: club.feePeriod, active: club.active },
    ...(mainExisting ? { existingMain: { membershipId: mainExisting.id, linkedToThisApplication: mainExisting.id === application.membershipId } } : {}),
    startDate,
    ...(solfege ? { solfege } : {}),
    blockers,
    needsSolfegeWaitlistConfirm,
    feeNote: feeNoteFor(club, startDate),
    _club: club,
    _solfegeClub: solfegeClub,
    _memberships: memberships,
    _application: application,
    _studentName: student.name,
  });
}

function publicPreview(p: AddToClubPreview & Record<string, unknown>): AddToClubPreview {
  const { _club, _solfegeClub, _memberships, _application, _studentName, ...rest } = p; // eslint-disable-line @typescript-eslint/no-unused-vars
  return rest as AddToClubPreview;
}

export async function previewAddToClubTool(ctx: ServiceContext, input: unknown): Promise<ServiceResult<AddToClubPreview>> {
  const auth = requireRole(ctx, ADMIN_ROLES);
  if (!auth.ok) return fail("FORBIDDEN", "Başvurudan kulübe eklemeyi yalnız kurum yöneticileri yapabilir.");
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Başvuru ve öğrenci seçimini kontrol edin.");
  const p = await buildPreview(ctx, parsed.data, undefined);
  return p.ok ? ok(publicPreview(p.data)) : p;
}

export type AddToClubResult = { membershipId: string; solfegeMembershipId?: string; solfegePending: boolean; created: boolean; warnings: string[] };

/**
 * Onay: tek kilit/transaction içinde başvuru + üyelik(ler) yeniden okunur, kapasite/mükerrer/yetki yeniden denetlenir,
 * üyelikler yazılır ve başvuru "Kulübe eklendi" olur. Tekrar (çift tıklama, eşzamanlı istek) aynı sonucu döner —
 * ikinci üyelik açılmaz. Tahsilat/borç/sözleşme YAZILMAZ. Dahil solfej doluysa ancak `confirmSolfegeWaitlist` ile.
 */
export async function commitAddToClubTool(ctx: ServiceContext, input: unknown): Promise<ServiceResult<AddToClubResult>> {
  const auth = requireRole(ctx, ADMIN_ROLES);
  if (!auth.ok) return fail("FORBIDDEN", "Başvurudan kulübe eklemeyi yalnız kurum yöneticileri yapabilir.");
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Başvuru ve öğrenci seçimini kontrol edin.");
  const v = parsed.data;
  const t = today();
  type Out = ServiceResult<AddToClubResult & { newMemberships: ClubMembership[] }>;
  // Yazım başladıktan sonraki her ret transaction'ı GERİ ALMALI (geri çağrı değer döndürürse Prisma commit eder).
  class Abort extends Error {
    constructor(readonly result: Out) {
      super("club-application-add-abort");
    }
  }
  let outcome: Out;
  try {
    outcome = await withClubMembershipLock(ctx.tenantId, async (tx): Promise<Out> => {
      const pr = await buildPreview(ctx, v, tx);
      if (!pr.ok) return pr;
      const p = pr.data;
      if (p.blockers.length) return fail("CONFLICT", p.blockers.join(" "));
      // Ön kontrol (yazımdan ÖNCE): dahil solfej dolu ve açık onay yok → hiçbir şey yazılmaz.
      if (p.solfege?.full && !v.confirmSolfegeWaitlist && p._solfegeClub) {
        return fail(
          "CONFLICT",
          `${p._solfegeClub.name} (dahil solfej) kontenjanı dolu (${p.solfege.used}/${p.solfege.max}). Ana üyeliği solfej bekleme listesiyle tamamlamak için önizlemede "bekleme listesine al" seçeneğini açıkça işaretleyin ya da solfej kontenjanını artırın.`
        );
      }
      const app = p._application;
      const club = p._club;
      const newMemberships: ClubMembership[] = [];
      // 1) Ana üyelik: varsa (bu başvuruyla ya da elle açılmış) bağlanır; yoksa açılır.
      let mainId = p.existingMain?.membershipId;
      if (!mainId) {
        const ins = await insertMembershipChecked(ctx.tenantId, tx, {
          club,
          studentId: p.student.id,
          studentName: p.student.name,
          startDate: p.startDate,
          monthlyFee: club.monthlyFee,
          createdByUserId: ctx.userId,
          applicationId: app.id,
        });
        if (!ins.ok) throw new Abort(fail(ins.code, ins.message));
        mainId = ins.membership.id;
        newMemberships.push(ins.membership);
      }
      // 2) Dahil solfej.
      let solfegeMembershipId = app.solfegeMembershipId;
      let solfegePending = false;
      if (p.solfege && p._solfegeClub) {
        const sClub = p._solfegeClub;
        const all = await listClubMemberships(ctx.tenantId, tx);
        const sExisting = all.find((m) => m.clubId === sClub.id && m.studentId === p.student.id && isMembershipActive(m, t));
        if (sExisting) {
          if (!sExisting.includedByMembershipIds?.includes(mainId)) {
            await writeClubMembershipRow(ctx.tenantId, { ...sExisting, includedByMembershipIds: [...(sExisting.includedByMembershipIds ?? []), mainId] }, false, tx);
          }
          solfegeMembershipId = sExisting.id;
        } else if (p.solfege.full) {
          if (!v.confirmSolfegeWaitlist) throw new Abort(fail("CONFLICT", `${sClub.name} (dahil solfej) kontenjanı dolu; açık onay olmadan devam edilmez.`));
          solfegePending = true;
        } else {
          const ins = await insertMembershipChecked(ctx.tenantId, tx, {
            club: sClub,
            studentId: p.student.id,
            studentName: p.student.name,
            startDate: sClub.startDate && sClub.startDate > p.startDate ? sClub.startDate : p.startDate,
            // Dahil solfej ek ücret üretmez.
            monthlyFee: 0,
            createdByUserId: ctx.userId,
            applicationId: app.id,
            includedByMembershipIds: [mainId],
          });
          if (!ins.ok) throw new Abort(fail(ins.code, ins.message));
          solfegeMembershipId = ins.membership.id;
          newMemberships.push(ins.membership);
        }
      }
      await patchApplication(
        ctx.tenantId,
        app.id,
        {
          status: "added",
          studentId: p.student.id,
          membershipId: mainId,
          ...(solfegeMembershipId ? { solfegeMembershipId } : {}),
          solfegePending,
          handledByUserId: ctx.userId,
          handledAt: new Date().toISOString(),
        },
        tx
      );
      return ok({ membershipId: mainId, solfegeMembershipId, solfegePending, created: newMemberships.length > 0, warnings: [], newMemberships });
    });
  } catch (e) {
    if (e instanceof Abort) return e.result as ServiceResult<AddToClubResult>;
    throw e;
  }
  if (!outcome.ok) return outcome;
  const { newMemberships, ...result } = outcome.data;
  const { syncFutureSessionsForMember } = await import("./clubs");
  const warnings: string[] = [];
  for (const m of newMemberships) warnings.push(...(await syncFutureSessionsForMember(ctx, m, "join")));
  const { recordAuditLog } = await import("./audit/log");
  void recordAuditLog({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    action: "club_application.add_to_club",
    entityType: "ClubApplication",
    entityId: v.applicationId,
    outcome: "success",
    meta: {
      studentId: v.studentId,
      membershipId: result.membershipId,
      solfegeMembershipId: result.solfegeMembershipId ?? null,
      solfegePending: result.solfegePending,
      newMembershipIds: newMemberships.map((m) => m.id),
    },
  });
  return ok({ ...result, warnings });
}

/**
 * 2026-10-07 — "Üyeliği sil" sonrası: silinen üyelik kimliklerine bağlı başvurular SİLİNMEZ; bağlantı temizlenir ki
 * kişi sonradan yeniden eklenebilsin. Ana üyeliği silinen "Kulübe eklendi" başvurusu "İletişime geçildi"ye döner
 * (öğrenci bağlantısı korunur). Dönen değer: güncellenen başvuru kimlikleri.
 */
export async function unlinkDeletedMembershipFromApplications(tenantId: string, membershipIds: string[]): Promise<string[]> {
  if (membershipIds.length === 0) return [];
  const ids = new Set(membershipIds);
  const now = new Date().toISOString();
  if (isDbMode) {
    const { prisma } = await import("./db");
    const rows = await prisma.clubApplication.findMany({
      where: { tenantId, OR: [{ membershipId: { in: membershipIds } }, { solfegeMembershipId: { in: membershipIds } }] },
      select: { id: true, status: true, membershipId: true, solfegeMembershipId: true },
    });
    for (const r of rows) {
      const mainGone = !!r.membershipId && ids.has(r.membershipId);
      await prisma.clubApplication.updateMany({
        where: { id: r.id, tenantId },
        data: {
          ...(mainGone ? { membershipId: null, ...(r.status === "added" ? { status: "contacted" } : {}) } : {}),
          ...(r.solfegeMembershipId && ids.has(r.solfegeMembershipId) ? { solfegeMembershipId: null } : {}),
          updatedAt: new Date(now),
        },
      });
    }
    return rows.map((r) => r.id);
  }
  return withFile(async () => {
    const all = await loadAll();
    const touched: string[] = [];
    const next = all.map((a) => {
      if (a.tenantId !== tenantId) return a;
      const mainGone = !!a.membershipId && ids.has(a.membershipId);
      const solGone = !!a.solfegeMembershipId && ids.has(a.solfegeMembershipId);
      if (!mainGone && !solGone) return a;
      touched.push(a.id);
      const out: Stored = { ...a, updatedAt: now };
      if (mainGone) {
        delete out.membershipId;
        if (a.status === "added") out.status = "contacted";
      }
      if (solGone) delete out.solfegeMembershipId;
      return out;
    });
    if (touched.length) await saveAll(next);
    return touched;
  });
}

/** Yeni öğrenci kaydı başvurudan açıldıysa: öğrenciyi başvuruya bağlar (üyelik AÇMAZ; durum değişmez). */
export async function linkStudentToClubApplication(ctx: ServiceContext, applicationId: string, studentId: string): Promise<boolean> {
  const auth = requireRole(ctx, ADMIN_ROLES);
  if (!auth.ok) return false;
  const app = await getClubApplication(ctx.tenantId, applicationId);
  if (!app || app.status === "added") return false;
  await patchApplication(ctx.tenantId, applicationId, { studentId });
  const { recordAuditLog } = await import("./audit/log");
  void recordAuditLog({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    action: "club_application.student_created",
    entityType: "ClubApplication",
    entityId: applicationId,
    outcome: "success",
    meta: { studentId },
  });
  return true;
}

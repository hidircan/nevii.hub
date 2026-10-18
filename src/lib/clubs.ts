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

import { CLUB_AUDIENCE_LABEL, isClubAudience, type ClubAudience } from "./club-audience";
// Yaş grubu tek kaynağı `club-audience.ts` (istemci bileşenleri de okur; 2026-10-07 "Genç" eklendi).
export { CLUB_AUDIENCES, CLUB_AUDIENCE_LABEL, isClubAudience, type ClubAudience } from "./club-audience";
/** `monthlyFee` alanındaki tutarın niteliği. Aylık tahakkuk yalnız "monthly" kulüplerde çalışır. */
export type ClubFeePeriod = "monthly" | "term" | "total";
export const CLUB_FEE_PERIOD_LABEL: Record<ClubFeePeriod, string> = { monthly: "aylık", term: "dönemlik", total: "toplam" };

export type Club = {
  id: string;
  name: string;
  instrument: string;
  branchId?: string;
  maxMembers: number;
  /** Ücret tutarı (TL). Niteliği `feePeriod` (alan adı geriye dönük uyum için korunur). */
  monthlyFee: number;
  durationMinutes: number;
  /** 2026-10-07 — taslak kulüpte boş olabilir; oturum planlamak / sadece-kulüp kaydı için gerekir. */
  teacherIds: string[];
  /** Halka açık açıklama (başvuru portalında görünür). */
  description?: string;
  active: boolean;
  createdByUserId: string;
  createdAt: string;
  // ── 2026-10-07 — grup dersi başvuru portalı ──
  audience?: ClubAudience;
  minAge?: number;
  maxAge?: number;
  /** YYYY-MM-DD — kulüp dönemi. */
  startDate?: string;
  endDate?: string;
  /** Halka açık gün/saat (ör. "Cumartesi 10:00–11:00"). */
  scheduleText?: string;
  feePeriod: ClubFeePeriod;
  /**
   * 2026-10-07 — "Ödeme alınacak ay sayısı" (yalnız aylık ücrette). Üyeliğin başlangıç ayı 1. ay sayılır; bu kadar
   * aydan sonra aylık tahakkuk yazılmaz. Boş = üyelik sonlanana kadar her ay (eski davranış). Yazılmış satırlar değişmez.
   */
  feeMonths?: number;
  /**
   * 2026-10-07 — "Toplam ders sayısı": başvuranlara gösterilen yetkili toplam (yönetici girer). Oturum planlamadaki
   * "Haftalık tekrar sayısı" ilk hafta DAHİL toplam oturum sayısıdır; panel ikisini karşılaştırır.
   */
  totalLessons?: number;
  /** Halka açık "ücrete dahil olanlar". */
  includesText?: string;
  /** Yalnız panel — halka açık yanıta asla girmez. */
  internalNote?: string;
  applicationsOpen: boolean;
  /** Dolu kulüp bekleme listesi için başvuru alır mı (yönetici açıkça seçer). */
  waitlistEnabled: boolean;
  /** Ana kulübe dahil (ek ücretsiz) solfej kulübü. */
  includedSolfegeClubId?: string;
};

/** Kulüp ders satırlarına izin verilen yama (patchClubLessons). */
export type ClubLessonPatch = Partial<
  Pick<
    import("./types").Lesson,
    | "status"
    | "opsMakeupFlag"
    | "opsMakeupFlagAt"
    | "opsMakeupFlagBy"
    | "teacherAttendanceStatus"
    | "teacherAttendanceAt"
    | "teacherAttendanceBy"
    | "notes"
    // 2026-10-07 — yanlış girilen oturumun tarih/saat/oda/öğretmen düzeltmesi (yoklamasız oturum).
    | "startAt"
    | "endAt"
    | "roomId"
    | "branchId"
    | "teacherId"
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
  /** 2026-10-07 — üyeliği açan grup dersi başvurusu. */
  applicationId?: string;
  /** Dahil solfej üyeliği: bu hakkı veren ANA üyelikler. Boş = bağımsız üyelik. */
  includedByMembershipIds?: string[];
};

const TR_MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
/** "2026-10" → "Ekim 2026" (kulüp ücreti satırının dönem etiketi; `installmentMonthKeys` bunu okur). */
export function clubPeriodLabel(month: string): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return `${TR_MONTHS[m - 1]} ${y}`;
}

/**
 * TEK aktif üyelik tanımı (2026-10-07 kök düzeltme). `endDate` = SONLANMA tarihi: o günden itibaren üye değildir.
 * Önceden `endDate >= bugün` aktif sayılıyordu; "Üyeliği sonlandır" bitişi BUGÜNE yazdığı için sonlanan üye gün
 * boyunca aktif listede kalıyor, aynı satırda hem "Üyeliği sonlandır" hem "zaten sonlandırılmış" görünüyordu.
 * Liste, sayaç, kontenjan, seçiciler, oturum kapsamı (`membershipCoversDay`) ve tahakkuk bu iki fonksiyonu kullanır.
 */
export function isMembershipActive(m: Pick<ClubMembership, "endDate">, todayYmd: string): boolean {
  return !m.endDate || m.endDate > todayYmd;
}

/** Üyelik `dayYmd` gününü kapsar mı (oturum satırı açma/iptal). Başlangıç dahil, sonlanma günü HARİÇ. */
export function membershipCoversDay(m: Pick<ClubMembership, "startDate" | "endDate">, dayYmd: string): boolean {
  return m.startDate <= dayYmd && isMembershipActive(m, dayYmd);
}

/** Bitiş tarihi planlanmış ama henüz gelmemiş (aktif) üyelik — sonlandırma eylemi gösterilmez, tarih düzeltilir. */
export function membershipEndScheduled(m: Pick<ClubMembership, "endDate">, todayYmd: string): boolean {
  return !!m.endDate && m.endDate > todayYmd;
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

const strOrUndef = (v: string | null | undefined) => (v == null || v === "" ? undefined : v);
const numOrUndef = (v: number | null | undefined) => (v == null ? undefined : v);
const audienceOf = (v: unknown): ClubAudience | undefined => (isClubAudience(v) ? v : undefined);
const feePeriodOf = (v: unknown): ClubFeePeriod => (v === "term" || v === "total" ? v : "monthly");
const stringArray = (v: unknown): string[] | undefined =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : undefined;

/** Eski (2026-10-07 öncesi) json satırları ve db satırları için tek biçim — yeni alanlar güvenli varsayılan alır. */
function normalizeClub(r: Record<string, unknown>): Club {
  return {
    id: String(r.id),
    name: String(r.name),
    instrument: String(r.instrument),
    branchId: strOrUndef(r.branchId as string | null | undefined),
    maxMembers: Number(r.maxMembers),
    monthlyFee: Number(r.monthlyFee),
    durationMinutes: Number(r.durationMinutes),
    teacherIds: stringArray(r.teacherIds) ?? [],
    description: strOrUndef(r.description as string | null | undefined),
    active: r.active !== false,
    createdByUserId: String(r.createdByUserId),
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    audience: audienceOf(r.audience),
    minAge: numOrUndef(r.minAge as number | null | undefined),
    maxAge: numOrUndef(r.maxAge as number | null | undefined),
    startDate: strOrUndef(r.startDate as string | null | undefined),
    endDate: strOrUndef(r.endDate as string | null | undefined),
    scheduleText: strOrUndef(r.scheduleText as string | null | undefined),
    feePeriod: feePeriodOf(r.feePeriod),
    feeMonths: numOrUndef(r.feeMonths as number | null | undefined),
    totalLessons: numOrUndef(r.totalLessons as number | null | undefined),
    includesText: strOrUndef(r.includesText as string | null | undefined),
    internalNote: strOrUndef(r.internalNote as string | null | undefined),
    applicationsOpen: r.applicationsOpen === true,
    waitlistEnabled: r.waitlistEnabled === true,
    includedSolfegeClubId: strOrUndef(r.includedSolfegeClubId as string | null | undefined),
  };
}

function normalizeMembership(r: Record<string, unknown>): ClubMembership {
  const grants = stringArray(r.includedByMembershipIds);
  return {
    id: String(r.id),
    clubId: String(r.clubId),
    studentId: String(r.studentId),
    monthlyFee: Number(r.monthlyFee),
    startDate: String(r.startDate),
    endDate: strOrUndef(r.endDate as string | null | undefined),
    createdByUserId: String(r.createdByUserId),
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    endedByUserId: strOrUndef(r.endedByUserId as string | null | undefined),
    endedAt: r.endedAt instanceof Date ? r.endedAt.toISOString() : strOrUndef(r.endedAt as string | null | undefined),
    applicationId: strOrUndef(r.applicationId as string | null | undefined),
    ...(grants && grants.length ? { includedByMembershipIds: grants } : {}),
  };
}

type Tx = import("@prisma/client").Prisma.TransactionClient;

export async function listClubs(tenantId: string): Promise<Club[]> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    const rows = await prisma.club.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { name: "asc" },
      omit: { tenantId: true, updatedAt: true, deletedAt: true, deletedByUserId: true, deletionReason: true },
    });
    return rows.map((r) => normalizeClub(r as unknown as Record<string, unknown>));
  }
  return (await loadFile<Club & { deletedAt?: string }>(CLUBS_FILE))
    .filter((c) => c.tenantId === tenantId && !c.deletedAt)
    .sort((a, b) => a.name.localeCompare(b.name, "tr"))
    .map((c) => normalizeClub(strip(c) as unknown as Record<string, unknown>));
}

export async function listClubMemberships(tenantId: string, tx?: Tx | null): Promise<ClubMembership[]> {
  if (isDbMode) {
    const db = tx ?? (await import("./db")).prisma;
    const rows = await db.clubMembership.findMany({ where: { tenantId }, orderBy: { createdAt: "asc" }, omit: { tenantId: true } });
    return rows.map((r) => normalizeMembership(r as unknown as Record<string, unknown>));
  }
  return (await loadFile<ClubMembership>(CLUB_MEMBERSHIPS_FILE))
    .filter((m) => m.tenantId === tenantId)
    .map((m) => normalizeMembership(strip(m) as unknown as Record<string, unknown>));
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
      audience: club.audience ?? null,
      minAge: club.minAge ?? null,
      maxAge: club.maxAge ?? null,
      startDate: club.startDate ?? null,
      endDate: club.endDate ?? null,
      scheduleText: club.scheduleText ?? null,
      feePeriod: club.feePeriod,
      feeMonths: club.feeMonths ?? null,
      totalLessons: club.totalLessons ?? null,
      includesText: club.includesText ?? null,
      internalNote: club.internalNote ?? null,
      applicationsOpen: club.applicationsOpen,
      waitlistEnabled: club.waitlistEnabled,
      includedSolfegeClubId: club.includedSolfegeClubId ?? null,
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
  if (i >= 0) all[i] = { ...all[i]!, ...club, tenantId };
  else all.push({ ...club, tenantId });
  await saveFile(CLUBS_FILE, all);
}

async function writeMembership(tenantId: string, m: ClubMembership, isNew: boolean, tx?: Tx | null): Promise<void> {
  if (isDbMode) {
    const db = tx ?? (await import("./db")).prisma;
    const grants = m.includedByMembershipIds && m.includedByMembershipIds.length ? m.includedByMembershipIds : undefined;
    if (isNew) {
      await db.clubMembership.create({
        data: {
          id: m.id,
          tenantId,
          clubId: m.clubId,
          studentId: m.studentId,
          monthlyFee: m.monthlyFee,
          startDate: m.startDate,
          createdByUserId: m.createdByUserId,
          createdAt: new Date(m.createdAt),
          applicationId: m.applicationId ?? null,
          ...(grants ? { includedByMembershipIds: grants } : {}),
        },
      });
    } else {
      await db.clubMembership.updateMany({
        where: { id: m.id, tenantId },
        data: {
          startDate: m.startDate,
          endDate: m.endDate ?? null,
          endedByUserId: m.endedByUserId ?? null,
          endedAt: m.endedAt ? new Date(m.endedAt) : null,
          includedByMembershipIds: grants ?? (await import("@prisma/client")).Prisma.DbNull,
        },
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

/**
 * Üyelik yazımlarını kurum bazında SERİLEŞTİRİR: kapasite + mükerrer üyelik kontrolü ile yazım arasında yarış
 * kalmaz (çift tıklama / eşzamanlı iki yönetici). db: tek transaction + `pg_advisory_xact_lock` (store-db
 * ders yuvası kilidiyle aynı desen); `fn` içindeki tüm okuma/yazmalar `tx` ile yapılmalı. json/memory: süreç içi kuyruk.
 */
export async function withClubMembershipLock<T>(tenantId: string, fn: (tx: Tx | null) => Promise<T>): Promise<T> {
  return withTenantClubLock(tenantId, "club-membership", `${CLUB_MEMBERSHIPS_FILE}.lock`, fn);
}

async function withTenantClubLock<T>(tenantId: string, key: string, lockFile: string, fn: (tx: Tx | null) => Promise<T>): Promise<T> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    return prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}), hashtext(${key}))`;
        return fn(tx);
      },
      { maxWait: 10_000, timeout: 20_000 }
    );
  }
  const { withFileLock } = await import("./atomic-json-file");
  return withFileLock(lockFile, () => fn(null));
}

/**
 * Oturum planlamayı kulüp bazında serileştirir (çift tıklama / iki sekme aynı planı aynı anda kaydedip mükerrer
 * oturum açamasın). Kilit yalnız mutex'tir: içerideki okuma/yazmalar store'un normal yolunu kullanır.
 */
function withClubSessionLock<T>(tenantId: string, clubId: string, fn: () => Promise<T>): Promise<T> {
  return withTenantClubLock(tenantId, `club-sessions:${clubId}`, path.join(DATA_DIR, `club-sessions-${clubId.replace(/[^\w-]/g, "_")}.lock`), () => fn());
}

export { writeMembership as writeClubMembershipRow };

// ── Ücret satırı ─────────────────────────────────────────────────────────────

/** Bu üyeliğin bu ay için kulüp ücreti satırı (iptal edilmiş dahil — iptal edilen ay yeniden borçlandırılmaz). */
export function findClubFeeRow(payments: Payment[], membershipId: string, month: string): Payment | undefined {
  const label = clubPeriodLabel(month);
  return payments.find((p) => p.source === "club" && p.clubMembershipId === membershipId && p.installmentPeriodLabel === label);
}

function clubFeeDescription(club: Pick<Club, "name" | "feePeriod">, month: string): string {
  if (club.feePeriod === "term") return `${club.name} — dönem ücreti (${clubPeriodLabel(month)} başlangıç)`;
  if (club.feePeriod === "total") return `${club.name} — toplam kulüp ücreti (${clubPeriodLabel(month)} başlangıç)`;
  return `${club.name} — ${clubPeriodLabel(month)} kulüp ücreti`;
}

/**
 * Üyeliğin `month` ayı ücretini yazar (yoksa). ALS kurulmuş olmalı. Ücreti 0 olan üyelik (ücretsiz kulüp,
 * dahil solfej) için satır YAZILMAZ — 0 TL borç satırı açılmaz.
 * ponytail: oku-sonra-yaz; aynı üyelik+ay için eşzamanlı iki çağrı (cron + elle ekleme aynı saniye) çift satır
 * açabilir — tekil kısıt (clubMembershipId, installmentPeriodLabel) gerekirse eklenir.
 */
async function ensureClubFeeRow(
  club: Pick<Club, "name" | "feePeriod">,
  m: ClubMembership,
  month: string,
  payments: Payment[]
): Promise<{ paymentId?: string; created: boolean }> {
  if (m.monthlyFee <= 0) return { created: false };
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
    description: clubFeeDescription(club, month),
    source: "club",
    clubMembershipId: m.id,
    installmentPeriodLabel: clubPeriodLabel(month),
  });
  return { paymentId, created: true };
}

// ── Kurallar (saf) ──────────────────────────────────────────────────────────

const today = () => toZonedYmd(new Date(), DEFAULT_APP_TIMEZONE);

/** Solfej kulübü mü? Enstrüman/alan adı katalogdaki "Solfej" (büyük/küçük harf ve ek farkı önemsiz). */
export function isSolfegeClub(c: Pick<Club, "instrument">): boolean {
  return c.instrument.toLocaleLowerCase("tr").includes("solfej");
}

export function activeMemberCount(memberships: ClubMembership[], clubId: string, todayYmd: string): number {
  return memberships.filter((m) => m.clubId === clubId && isMembershipActive(m, todayYmd)).length;
}

/**
 * Saf: kulübün BAŞVURUYA AÇILABİLMESİ için eksikler (boş = açılabilir). Taslak kulüp bunlar olmadan da kaydedilir.
 * Öğretmen istenmez (halka açık değildir); oturum planlamak için ayrıca gerekir.
 */
export function clubApplicationIssues(club: Club, todayYmd: string): string[] {
  const issues: string[] = [];
  if (!club.active) issues.push("kulüp pasif");
  if (!club.audience) issues.push("çocuk/yetişkin grubu seçilmedi");
  if (!club.branchId) issues.push("şube seçilmedi");
  if (!club.startDate) issues.push("başlangıç tarihi girilmedi");
  if (!club.endDate) issues.push("bitiş tarihi girilmedi");
  if (club.endDate && club.endDate < todayYmd) issues.push("kulüp dönemi bitmiş (bitiş tarihi geçmişte)");
  return issues;
}

/**
 * Saf: kulübü başvuruya AÇMAK / açık kulübü kaydetmek için eksikler. `clubApplicationIssues` + toplam ders sayısı
 * (başvuranlara "Toplam ders sayısı: X" gösterilir; yanıltıcı 0 yerine yönetici açıkça girer). Halka açık kabul
 * (`clubAcceptance`) bunu ARAMAZ: bu sürümden önce açılmış kulüpler portaldan habersizce düşmez.
 */
export function clubOpeningIssues(club: Club, todayYmd: string): string[] {
  const issues = clubApplicationIssues(club, todayYmd);
  if (!club.totalLessons) issues.push("toplam ders sayısı girilmedi");
  return issues;
}

/** Saf: ana kulübe bağlanabilecek dahil solfej kulübü uygun mu? Uygunsa null, değilse Türkçe neden. */
export function includedSolfegeProblem(main: Pick<Club, "id" | "instrument" | "audience" | "branchId" | "startDate" | "endDate">, solfege: Club | undefined): string | null {
  if (!solfege) return "Seçilen dahil solfej kulübü bulunamadı veya silinmiş. Listeden yeniden seçin.";
  if (solfege.id === main.id) return "Kulüp kendisine dahil solfej olarak bağlanamaz.";
  if (isSolfegeClub(main)) return "Solfej kulübüne ayrıca dahil solfej bağlanamaz; dahil solfej yalnız enstrüman/şan kulüplerinde seçilir.";
  if (!isSolfegeClub(solfege)) return `"${solfege.name}" bir solfej kulübü değil (enstrüman/alanı "Solfej" olmalı).`;
  if (!solfege.active) return `"${solfege.name}" pasif; dahil solfej olarak bağlamak için önce aktif yapın.`;
  if (main.audience && solfege.audience && main.audience !== solfege.audience) {
    return `"${solfege.name}" ${CLUB_AUDIENCE_LABEL[solfege.audience].toLocaleLowerCase("tr")} grubu; bu kulüp ${CLUB_AUDIENCE_LABEL[main.audience].toLocaleLowerCase("tr")} grubu. Aynı yaş grubundaki solfej kulübünü seçin.`;
  }
  if (main.branchId && solfege.branchId && main.branchId !== solfege.branchId) {
    return `"${solfege.name}" başka bir şubede. Aynı şubedeki (veya şube bağımsız) solfej kulübünü seçin.`;
  }
  if (main.startDate && main.endDate && solfege.startDate && solfege.endDate && (solfege.endDate < main.startDate || solfege.startDate > main.endDate)) {
    return `"${solfege.name}" dönemi (${solfege.startDate} – ${solfege.endDate}) bu kulübün dönemiyle örtüşmüyor. Uyumlu dönemdeki solfej kulübünü seçin.`;
  }
  return null;
}

// ── Araçlar (yönetici) ──────────────────────────────────────────────────────

const ADMIN_ROLES = ["SCHOOL_ADMIN"] as ServiceContext["role"][];

export type ClubsOverview = { clubs: Club[]; memberships: ClubMembership[] };

export async function listClubsTool(ctx: ServiceContext): Promise<ServiceResult<ClubsOverview>> {
  const auth = requireRole(ctx, ADMIN_ROLES);
  if (!auth.ok) return fail("FORBIDDEN", "Kulüpleri yalnız kurum yöneticileri yönetebilir.");
  const [clubs, memberships] = await Promise.all([listClubs(ctx.tenantId), listClubMemberships(ctx.tenantId)]);
  return ok({ clubs, memberships });
}

const ymdOpt = z
  .string()
  .trim()
  .regex(/^(\d{4}-\d{2}-\d{2})?$/, "Tarihi GG.AA.YYYY olarak seçin.")
  .optional();
const ageOpt = z.union([z.literal(""), z.coerce.number({ error: "Yaş sınırını sayı olarak girin." }).int("Yaş tam sayı olmalı.").min(3, "Yaş sınırı 3 ile 99 arasında olmalı.").max(99, "Yaş sınırı 3 ile 99 arasında olmalı.")]).optional();

const clubSchema = z.object({
  id: z.string().max(80).optional(),
  name: z.string().trim().min(2, "Kulüp adı en az 2 karakter olmalı.").max(80, "Kulüp adı en fazla 80 karakter olabilir."),
  instrument: z.string().trim().min(1, "Kulübün enstrümanını/alanını seçin."),
  branchId: z.string().trim().max(80).optional(),
  maxMembers: z.coerce.number({ error: "Kontenjanı sayı olarak girin." }).int("Kontenjan tam sayı olmalı.").min(1, "Kontenjan en az 1 olmalı.").max(50, "Kontenjan en fazla 50 olabilir."),
  monthlyFee: z.coerce.number({ error: "Ücreti sayı olarak girin." }).int("Ücret tam TL olmalı.").min(0, "Ücret negatif olamaz.").max(1_000_000),
  durationMinutes: z.coerce.number({ error: "Oturum süresini dakika olarak girin." }).int("Oturum süresi tam dakika olmalı.").min(20, "Oturum süresi en az 20 dakika olmalı.").max(240, "Oturum süresi en fazla 240 dakika olabilir."),
  // 2026-10-07 — taslak kulüp öğretmensiz kaydedilebilir (öğretmen halka açık değildir; oturum planlamada gerekir).
  teacherIds: z.array(z.string().min(1)).max(10).default([]),
  description: z.string().trim().max(2000, "Açıklama en fazla 2000 karakter olabilir.").optional(),
  active: z.boolean().optional(),
  audience: z.enum(["child", "youth", "adult", ""]).optional(),
  minAge: ageOpt,
  maxAge: ageOpt,
  startDate: ymdOpt,
  endDate: ymdOpt,
  scheduleText: z.string().trim().max(200, "Gün/saat metni en fazla 200 karakter olabilir.").optional(),
  feePeriod: z.enum(["monthly", "term", "total"]).optional(),
  /** "" = boş (üyelik sonlanana kadar her ay). Tam sayı; ondalık/negatif reddedilir. */
  feeMonths: z
    .union([
      z.literal(""),
      z.coerce
        .number({ error: "Ödeme alınacak ay sayısını tam sayı olarak girin." })
        .int("Ödeme alınacak ay sayısı tam sayı olmalı (ör. 8).")
        .min(1, "Ödeme alınacak ay sayısı en az 1 olmalı.")
        .max(120, "Ödeme alınacak ay sayısı en fazla 120 olabilir."),
    ])
    .optional(),
  totalLessons: z
    .union([
      z.literal(""),
      z.coerce
        .number({ error: "Toplam ders sayısını tam sayı olarak girin." })
        .int("Toplam ders sayısı tam sayı olmalı.")
        .min(1, "Toplam ders sayısı en az 1 olmalı.")
        .max(500, "Toplam ders sayısı en fazla 500 olabilir."),
    ])
    .optional(),
  includesText: z.string().trim().max(1000, "Dahil olanlar metni en fazla 1000 karakter olabilir.").optional(),
  internalNote: z.string().trim().max(2000, "Yönetim notu en fazla 2000 karakter olabilir.").optional(),
  applicationsOpen: z.boolean().optional(),
  waitlistEnabled: z.boolean().optional(),
  includedSolfegeClubId: z.string().trim().max(80).optional(),
});

export async function saveClubTool(ctx: ServiceContext, input: unknown): Promise<ServiceResult<Club>> {
  const auth = requireRole(ctx, ADMIN_ROLES);
  if (!auth.ok) return fail("FORBIDDEN", "Kulüp oluşturmayı/düzenlemeyi yalnız kurum yöneticileri yapabilir.");
  const parsed = clubSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Kulüp bilgilerini kontrol edin.");
  const v = parsed.data;
  const [{ readReferenceData }, { resolveActiveInstrumentNames }] = await Promise.all([import("./store"), import("./instrument-catalog")]);
  const ref = await readReferenceData();
  const [clubs, memberships] = await Promise.all([listClubs(ctx.tenantId), listClubMemberships(ctx.tenantId)]);
  const current = v.id ? clubs.find((c) => c.id === v.id) : undefined;
  if (v.id && !current) return fail("NOT_FOUND", "Kulüp bulunamadı; silinmiş olabilir. Sayfayı yenileyin.");
  // Katalogdan sonradan pasife alınan enstrüman, mevcut kulübün diğer alanlarının düzeltilmesini engellemez.
  if (v.instrument !== current?.instrument && !(await resolveActiveInstrumentNames(ctx.tenantId)).includes(v.instrument)) {
    return fail("VALIDATION_ERROR", `"${v.instrument}" enstrüman kataloğunda yok. Enstrümanlar ekranından ekleyin veya listeden seçin.`);
  }
  if (v.branchId && !ref.settings.branches.some((b) => b.id === v.branchId)) {
    return fail("VALIDATION_ERROR", "Seçilen şube bulunamadı. Listeden bir şube seçin.");
  }
  const teacherIds = Array.from(new Set(v.teacherIds));
  const missingTeacher = teacherIds.find((id) => !ref.teachers.some((t) => t.id === id && t.active));
  if (missingTeacher) return fail("VALIDATION_ERROR", "Seçilen öğretmenlerden biri bulunamadı veya pasif. Öğretmen seçimini yenileyin.");
  // Sadece kulüp kaydında öğrencinin öğretmeni bu kişidir; kayıt kuralı öğretmenin enstrümanı öğretmesini ister.
  if (teacherIds.length > 0 && !teacherIds.some((id) => ref.teachers.find((t) => t.id === id)?.instruments.includes(v.instrument as never))) {
    return fail(
      "VALIDATION_ERROR",
      `Seçilen öğretmenlerden en az biri "${v.instrument}" branşında kayıtlı olmalı. Öğretmenler ekranından öğretmene bu branşı ekleyin, branşı olan bir öğretmen seçin ya da öğretmeni şimdilik boş bırakın.`
    );
  }
  const minAge = typeof v.minAge === "number" ? v.minAge : undefined;
  const maxAge = typeof v.maxAge === "number" ? v.maxAge : undefined;
  if (minAge !== undefined && maxAge !== undefined && minAge > maxAge) {
    return fail("VALIDATION_ERROR", `En küçük yaş (${minAge}) en büyük yaştan (${maxAge}) büyük olamaz. Yaş sınırlarını düzeltin.`);
  }
  const startDate = v.startDate || undefined;
  const endDate = v.endDate || undefined;
  if (startDate && endDate && endDate < startDate) {
    return fail("VALIDATION_ERROR", "Bitiş tarihi başlangıç tarihinden önce olamaz. Tarihleri düzeltin.");
  }
  const nameKey = v.name.toLocaleLowerCase("tr");
  if (clubs.some((c) => c.id !== v.id && c.active && c.name.toLocaleLowerCase("tr") === nameKey)) {
    return fail("CONFLICT", `"${v.name}" adında aktif bir kulüp zaten var. Farklı bir ad verin.`);
  }
  const activeMembers = current ? activeMemberCount(memberships, current.id, today()) : 0;
  if (current && v.maxMembers < activeMembers) {
    return fail("VALIDATION_ERROR", `Kontenjan ${v.maxMembers} olamaz: kulüpte şu an ${activeMembers} aktif üye var. Önce üye çıkarın ya da kontenjanı artırın.`);
  }
  const active = v.active ?? current?.active ?? true;
  if (current && current.active && !active && activeMembers > 0) {
    return fail("VALIDATION_ERROR", `Kulüp pasife alınamaz: ${activeMembers} aktif üyesi var. Önce üyelikleri sonlandırın.`);
  }
  const feePeriod = v.feePeriod ?? current?.feePeriod ?? "monthly";
  // Ücret niteliği aylık tahakkuku belirler; aktif üyeli kulüpte değişirse mevcut üyelerin borçlanması değişirdi.
  if (current && current.feePeriod !== feePeriod && activeMembers > 0) {
    return fail(
      "VALIDATION_ERROR",
      `Ücretin niteliği (${CLUB_FEE_PERIOD_LABEL[current.feePeriod]} → ${CLUB_FEE_PERIOD_LABEL[feePeriod]}) aktif üyesi olan kulüpte değiştirilemez; mevcut üyelerin borçlanması değişirdi. Yeni dönem için ayrı kulüp oluşturun.`
    );
  }
  const includedSolfegeClubId = v.includedSolfegeClubId || undefined;
  // Alan gönderilmezse mevcut değer korunur; "" açıkça temizler. Ay sayısı yalnız aylık ücrette anlamlıdır.
  const feeMonthsRaw = v.feeMonths === undefined ? current?.feeMonths : typeof v.feeMonths === "number" ? v.feeMonths : undefined;
  const feeMonths = feePeriod === "monthly" ? feeMonthsRaw : undefined;
  const totalLessons = v.totalLessons === undefined ? current?.totalLessons : typeof v.totalLessons === "number" ? v.totalLessons : undefined;
  const draft: Club = {
    id: current?.id ?? uid("club"),
    name: v.name,
    instrument: v.instrument,
    branchId: v.branchId || undefined,
    maxMembers: v.maxMembers,
    // Ücret değişikliği mevcut üyelikleri değiştirmez (üyelik kendi ücretini dondurur); yeni üyeler yeni ücreti öder.
    monthlyFee: v.monthlyFee,
    durationMinutes: v.durationMinutes,
    teacherIds,
    description: v.description || undefined,
    active,
    createdByUserId: current?.createdByUserId ?? ctx.userId,
    createdAt: current?.createdAt ?? new Date().toISOString(),
    audience: v.audience === undefined ? current?.audience : v.audience || undefined,
    minAge,
    maxAge,
    startDate,
    endDate,
    scheduleText: v.scheduleText || undefined,
    feePeriod,
    feeMonths,
    totalLessons,
    includesText: v.includesText || undefined,
    internalNote: v.internalNote || undefined,
    // Yeni ve geçmiş kulüpler başvuruya KAPALI başlar; yönetici açıkça açar.
    applicationsOpen: v.applicationsOpen ?? current?.applicationsOpen ?? false,
    waitlistEnabled: v.waitlistEnabled ?? current?.waitlistEnabled ?? false,
    includedSolfegeClubId,
  };
  if (includedSolfegeClubId) {
    const problem = includedSolfegeProblem(draft, clubs.find((c) => c.id === includedSolfegeClubId));
    if (problem) return fail("VALIDATION_ERROR", problem);
  }
  if (isSolfegeClub(draft) && clubs.some((c) => c.id !== draft.id && c.includedSolfegeClubId === draft.id && c.audience && draft.audience && c.audience !== draft.audience)) {
    return fail("VALIDATION_ERROR", "Bu solfej kulübü farklı yaş grubundaki bir kulübe dahil olarak bağlı. Önce o kulübün dahil solfej seçimini değiştirin.");
  }
  if (draft.applicationsOpen) {
    const issues = clubOpeningIssues(draft, today());
    if (issues.length) {
      return fail("VALIDATION_ERROR", `Kulüp başvuruya açılamaz: ${issues.join(", ")}. Eksikleri tamamlayın ya da "Başvuruya açık" seçimini kaldırarak taslak olarak kaydedin.`);
    }
  }
  await writeClub(ctx.tenantId, draft, !current);
  const { recordAuditLog } = await import("./audit/log");
  void recordAuditLog({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    action: current ? "club.update" : "club.create",
    entityType: "Club",
    entityId: draft.id,
    outcome: "success",
    meta: {
      monthlyFee: draft.monthlyFee,
      feePeriod: draft.feePeriod,
      feeMonths: draft.feeMonths ?? null,
      totalLessons: draft.totalLessons ?? null,
      maxMembers: draft.maxMembers,
      active: draft.active,
      applicationsOpen: draft.applicationsOpen,
      waitlistEnabled: draft.waitlistEnabled,
      includedSolfegeClubId: draft.includedSolfegeClubId ?? null,
      ...(current && current.applicationsOpen !== draft.applicationsOpen ? { applicationsOpenChanged: true } : {}),
    },
  });
  return ok(draft);
}

/** Kulüpler ekranındaki "Başvuruya aç / kapat" anahtarı. Açarken eksikler tek tek söylenir. */
export async function setClubApplicationsOpenTool(ctx: ServiceContext, input: unknown): Promise<ServiceResult<Club>> {
  const auth = requireRole(ctx, ADMIN_ROLES);
  if (!auth.ok) return fail("FORBIDDEN", "Kulübü başvuruya açıp kapatmayı yalnız kurum yöneticileri yapabilir.");
  const parsed = z.object({ clubId: z.string().min(1), open: z.boolean() }).safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Kulüp ve aç/kapat seçimi okunamadı. Sayfayı yenileyin.");
  const club = (await listClubs(ctx.tenantId)).find((c) => c.id === parsed.data.clubId);
  if (!club) return fail("NOT_FOUND", "Kulüp bulunamadı; silinmiş olabilir. Sayfayı yenileyin.");
  if (parsed.data.open) {
    const issues = clubOpeningIssues(club, today());
    if (issues.length) return fail("VALIDATION_ERROR", `${club.name} başvuruya açılamaz: ${issues.join(", ")}. "Kulübü düzenle" bölümünden tamamlayın.`);
  }
  const next = { ...club, applicationsOpen: parsed.data.open };
  await writeClub(ctx.tenantId, next, false);
  const { recordAuditLog } = await import("./audit/log");
  void recordAuditLog({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    action: parsed.data.open ? "club.applications_open" : "club.applications_close",
    entityType: "Club",
    entityId: club.id,
    outcome: "success",
  });
  return ok(next);
}

const addMemberSchema = z.object({
  clubId: z.string().min(1),
  studentId: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/**
 * Kilit içinde: kapasite + mükerrer kontrolü ve üyelik satırı. Ücret/oturum yazmaz (çağıran karar verir).
 * `tx` verildiyse (withClubMembershipLock içinde) okuma ve yazma aynı transaction'dadır.
 */
export async function insertMembershipChecked(
  tenantId: string,
  tx: Tx | null,
  input: { club: Club; studentId: string; studentName: string; startDate: string; monthlyFee: number; createdByUserId: string; applicationId?: string; includedByMembershipIds?: string[] }
): Promise<{ ok: true; membership: ClubMembership } | { ok: false; code: "CONFLICT"; message: string }> {
  const memberships = await listClubMemberships(tenantId, tx);
  const t = today();
  if (memberships.some((m) => m.clubId === input.club.id && m.studentId === input.studentId && isMembershipActive(m, t))) {
    return { ok: false, code: "CONFLICT", message: `${input.studentName} zaten ${input.club.name} üyesi.` };
  }
  const used = activeMemberCount(memberships, input.club.id, t);
  if (used >= input.club.maxMembers) {
    return { ok: false, code: "CONFLICT", message: `${input.club.name} kontenjanı dolu (${used}/${input.club.maxMembers}). Kontenjanı artırın veya bir üyeliği sonlandırın.` };
  }
  const membership: ClubMembership = {
    id: uid("cmem"),
    clubId: input.club.id,
    studentId: input.studentId,
    monthlyFee: input.monthlyFee,
    startDate: input.startDate,
    createdByUserId: input.createdByUserId,
    createdAt: new Date().toISOString(),
    ...(input.applicationId ? { applicationId: input.applicationId } : {}),
    ...(input.includedByMembershipIds?.length ? { includedByMembershipIds: input.includedByMembershipIds } : {}),
  };
  await writeMembership(tenantId, membership, true, tx);
  return { ok: true, membership };
}

/** Üye ekler + başlangıç ayının ücret satırını yazar (yoksa; ücret 0 ise yazılmaz). Dönen `paymentId` kayıtta tahsil etmek içindir. */
export async function addClubMemberTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ membership: ClubMembership; paymentId?: string; warnings: string[] }>> {
  const auth = requireRole(ctx, ADMIN_ROLES);
  if (!auth.ok) return fail("FORBIDDEN", "Kulübe üye eklemeyi yalnız kurum yöneticileri yapabilir.");
  const parsed = addMemberSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Kulüp ve öğrenci seçimini kontrol edin; tarih YYYY-AA-GG olmalı.");
  const v = parsed.data;
  const clubs = await listClubs(ctx.tenantId);
  const club = clubs.find((c) => c.id === v.clubId);
  if (!club) return fail("NOT_FOUND", "Kulüp bulunamadı; silinmiş olabilir. Sayfayı yenileyin.");
  if (!club.active) return fail("VALIDATION_ERROR", `${club.name} pasif; önce kulübü aktif yapın.`);
  // DB egress (2026-10-19): öğrenci referansı + yalnız kulüp ücretleri (tam kurum okuması değil).
  const { readPaymentsPageData } = await import("./store");
  const data = await readPaymentsPageData({ clubOnly: true });
  const student = data.students.find((s) => s.id === v.studentId);
  if (!student || student.deletedAt) return fail("NOT_FOUND", "Öğrenci bulunamadı veya silinmiş. Öğrenci listesinden yeniden seçin.");
  if (!student.active) return fail("VALIDATION_ERROR", `${student.name} pasif; kulübe eklemek için önce öğrenciyi aktif yapın.`);
  const inserted = await withClubMembershipLock(ctx.tenantId, (tx) =>
    insertMembershipChecked(ctx.tenantId, tx, {
      club,
      studentId: student.id,
      studentName: student.name,
      startDate: v.startDate ?? today(),
      monthlyFee: club.monthlyFee,
      createdByUserId: ctx.userId,
    })
  );
  if (!inserted.ok) return fail(inserted.code, inserted.message);
  const membership = inserted.membership;
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
    meta: { clubId: club.id, studentId: student.id, monthlyFee: membership.monthlyFee, paymentId: fee.paymentId ?? null },
  });
  // 2. aşama — planlı gelecek oturumlara bu üye de eklenir (kendi dersiyle çakışan oturum atlanır, uyarı döner).
  const warnings = await syncFutureSessionsForMember(ctx, membership, "join");
  return ok({ membership, paymentId: fee.paymentId, warnings });
}

/**
 * Başvurudan eklenen (ücret yazılmadan açılan) üyeliğin BAŞLANGIÇ ayı ücretini yöneticinin açık işlemiyle yazar.
 * Satır zaten varsa tekrar yazmaz (iptal edilmiş satır dahil). Ücret 0 ise yazılacak bir şey yoktur.
 */
export async function writeClubMemberStartFeeTool(ctx: ServiceContext, input: unknown): Promise<ServiceResult<{ paymentId: string }>> {
  const auth = requireRole(ctx, ADMIN_ROLES);
  if (!auth.ok) return fail("FORBIDDEN", "Kulüp ücretini yalnız kurum yöneticileri borçlandırabilir.");
  const parsed = z.object({ membershipId: z.string().min(1) }).safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Üyelik seçilmedi. Sayfayı yenileyin.");
  const [clubs, memberships] = await Promise.all([listClubs(ctx.tenantId), listClubMemberships(ctx.tenantId)]);
  const m = memberships.find((x) => x.id === parsed.data.membershipId);
  if (!m) return fail("NOT_FOUND", "Üyelik bulunamadı. Sayfayı yenileyin.");
  const club = clubs.find((c) => c.id === m.clubId);
  if (!club) return fail("NOT_FOUND", "Kulüp bulunamadı.");
  if (m.monthlyFee <= 0) return fail("VALIDATION_ERROR", "Bu üyeliğin ücreti 0 TL (ücretsiz/dahil üyelik); borç yazılmaz.");
  const { readPaymentsPageData } = await import("./store");
  const month = m.startDate.slice(0, 7);
  const fee = await ensureClubFeeRow(club, m, month, (await readPaymentsPageData({ clubOnly: true })).payments);
  if (!fee.created) return fail("CONFLICT", `${clubPeriodLabel(month)} ücret satırı zaten var; Ödemeler ekranından görebilirsiniz.`);
  const { recordAuditLog } = await import("./audit/log");
  void recordAuditLog({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    action: "club.member_start_fee",
    entityType: "ClubMembership",
    entityId: m.id,
    outcome: "success",
    meta: { clubId: club.id, studentId: m.studentId, paymentId: fee.paymentId, amount: m.monthlyFee },
  });
  return ok({ paymentId: fee.paymentId! });
}

const endSchema = z.object({ membershipId: z.string().min(1), endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });

/**
 * Üyeliği sonlandırır (silmez). `endDate` (varsayılan bugün) = sonlanma günü: o günden itibaren aktif değildir
 * (`isMembershipActive`). Sonlanma ayından sonraki aylar tahakkuk etmez; mevcut ücret satırları değişmez.
 * İdempotent: zaten sonlanmış üyelikte yazım yapmadan `alreadyEnded: true` döner.
 * Öğrenci kaydı, geçmiş dersler, yoklama, tahsilat ve sözleşme DEĞİŞMEZ; yalnız bitişten sonraki planlı oturum
 * satırları iptal olur. Dahil solfej: bu ana üyeliğin verdiği hak geri alınır; başka hak yoksa ve solfej üyeliği
 * yalnız dahil (ücretsiz) ise o da aynı tarihte sonlanır — bağımsız/ücretli solfej üyeliğine dokunulmaz.
 */
export async function endClubMembershipTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<ClubMembership & { endedIncluded: string[]; alreadyEnded?: boolean }>> {
  const auth = requireRole(ctx, ADMIN_ROLES);
  if (!auth.ok) return fail("FORBIDDEN", "Kulüp üyeliğini yalnız kurum yöneticileri sonlandırabilir.");
  const parsed = endSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Bitiş tarihi YYYY-AA-GG olmalı.");
  const t = today();
  type EndOutcome =
    | { kind: "error"; error: ServiceResult<never> }
    | { kind: "already"; membership: ClubMembership }
    | { kind: "ended"; ended: ClubMembership; endedIncluded: ClubMembership[] };
  const result = await withClubMembershipLock(ctx.tenantId, async (tx): Promise<EndOutcome> => {
    const all = await listClubMemberships(ctx.tenantId, tx);
    const m = all.find((x) => x.id === parsed.data.membershipId);
    if (!m) return { kind: "error", error: fail("NOT_FOUND", "Üyelik bulunamadı; silinmiş olabilir. Sayfayı yenileyin.") };
    // İdempotent: tekrar tıklama / iki sekme — zaten sonlanmış üyelik hata değil, mevcut durum döner (yazım yok).
    if (m.endDate && !isMembershipActive(m, t)) return { kind: "already", membership: m };
    if (m.endDate) {
      return {
        kind: "error",
        error: fail(
          "CONFLICT",
          `Bu üyeliğin sonlanma tarihi zaten ${m.endDate.split("-").reverse().join(".")} olarak planlanmış. Değiştirmek için üye satırındaki "Tarihleri düzelt"i kullanın.`
        ),
      };
    }
    const endDate = parsed.data.endDate ?? t;
    if (endDate < m.startDate) return { kind: "error", error: fail("VALIDATION_ERROR", "Bitiş tarihi üyelik başlangıcından önce olamaz.") };
    const ended: ClubMembership = { ...m, endDate, endedByUserId: ctx.userId, endedAt: new Date().toISOString() };
    await writeMembership(ctx.tenantId, ended, false, tx);
    const endedIncluded: ClubMembership[] = [];
    for (const g of all.filter((x) => x.id !== m.id && x.includedByMembershipIds?.includes(m.id))) {
      const remaining = (g.includedByMembershipIds ?? []).filter((id) => id !== m.id);
      const stillGranted = remaining.some((id) => {
        const src = all.find((x) => x.id === id);
        return src && isMembershipActive(src, t);
      });
      const next: ClubMembership = { ...g, includedByMembershipIds: remaining };
      if (!stillGranted && g.monthlyFee === 0 && isMembershipActive(g, t)) {
        Object.assign(next, { endDate: endDate < g.startDate ? g.startDate : endDate, endedByUserId: ctx.userId, endedAt: new Date().toISOString() });
        endedIncluded.push(next);
      }
      await writeMembership(ctx.tenantId, next, false, tx);
    }
    return { kind: "ended", ended, endedIncluded };
  });
  if (result.kind === "error") return result.error;
  if (result.kind === "already") return ok({ ...result.membership, endedIncluded: [], alreadyEnded: true });
  const { ended, endedIncluded } = result;
  // Sonlanma gününden itibaren planlı (ileri tarihli, yoklamasız) oturum satırları iptal (geçmiş korunur).
  await syncFutureSessionsForMember(ctx, ended, "leave");
  for (const g of endedIncluded) await syncFutureSessionsForMember(ctx, g, "leave");
  const clubs = await listClubs(ctx.tenantId);
  const { recordAuditLog } = await import("./audit/log");
  void recordAuditLog({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    action: "club.member_end",
    entityType: "ClubMembership",
    entityId: ended.id,
    outcome: "success",
    meta: { clubId: ended.clubId, studentId: ended.studentId, endDate: ended.endDate, endedIncludedMembershipIds: endedIncluded.map((g) => g.id) },
  });
  return ok({ ...ended, endedIncluded: endedIncluded.map((g) => clubs.find((c) => c.id === g.clubId)?.name ?? "Dahil solfej") });
}

const updateMembershipSchema = z.object({
  membershipId: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Başlangıç tarihini seçin.").optional(),
  /** "" = sonlandırmayı geri al (üyelik yeniden aktif). */
  endDate: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, "Bitiş tarihini seçin.").optional(),
});

/**
 * Yanlış girilen üyelik tarihlerini düzeltir: başlangıç tarihi, bitiş tarihi veya sonlandırmayı geri alma.
 * Finans güvenliği: başlangıç AYI değişirken o ayın kulüp ücreti satırı (iptal dahil) varsa reddedilir — önce
 * Ödemeler ekranından o satır düzeltilir. Yeniden aktif etmede kontenjan ve mükerrer üyelik kilit içinde kontrol edilir.
 */
export async function updateClubMembershipTool(ctx: ServiceContext, input: unknown): Promise<ServiceResult<ClubMembership>> {
  const auth = requireRole(ctx, ADMIN_ROLES);
  if (!auth.ok) return fail("FORBIDDEN", "Kulüp üyeliğini yalnız kurum yöneticileri düzenleyebilir.");
  const parsed = updateMembershipSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Üyelik tarihlerini kontrol edin.");
  const v = parsed.data;
  const [clubs, { readPaymentsPageData }] = await Promise.all([listClubs(ctx.tenantId), import("./store")]);
  const payments = (await readPaymentsPageData({ clubOnly: true })).payments;
  const t = today();
  const result = await withClubMembershipLock(ctx.tenantId, async (tx) => {
    const all = await listClubMemberships(ctx.tenantId, tx);
    const m = all.find((x) => x.id === v.membershipId);
    if (!m) return { error: fail("NOT_FOUND", "Üyelik bulunamadı. Sayfayı yenileyin.") } as const;
    const club = clubs.find((c) => c.id === m.clubId);
    if (!club) return { error: fail("NOT_FOUND", "Kulüp bulunamadı.") } as const;
    const startDate = v.startDate ?? m.startDate;
    const endDate = v.endDate === undefined ? m.endDate : v.endDate || undefined;
    if (endDate && endDate < startDate) return { error: fail("VALIDATION_ERROR", "Bitiş tarihi başlangıç tarihinden önce olamaz. Tarihleri düzeltin.") } as const;
    if (startDate.slice(0, 7) !== m.startDate.slice(0, 7) && findClubFeeRow(payments, m.id, m.startDate.slice(0, 7))) {
      return {
        error: fail(
          "CONFLICT",
          `Başlangıç ayı değiştirilemez: ${clubPeriodLabel(m.startDate.slice(0, 7))} için bu üyeliğin ücret satırı var. Aynı ay içinde günü düzeltebilirsiniz; ayı değiştirmek için önce Ödemeler ekranından o satırı düzeltin/iptal edin.`
        ),
      } as const;
    }
    const reactivating = !!m.endDate && !isMembershipActive(m, t) && isMembershipActive({ endDate }, t);
    if (reactivating) {
      if (all.some((x) => x.id !== m.id && x.clubId === m.clubId && x.studentId === m.studentId && isMembershipActive(x, t))) {
        return { error: fail("CONFLICT", "Öğrencinin bu kulüpte zaten aktif bir üyeliği var; eski üyelik yeniden açılamaz.") } as const;
      }
      const used = activeMemberCount(all, m.clubId, t);
      if (used >= club.maxMembers) return { error: fail("CONFLICT", `${club.name} kontenjanı dolu (${used}/${club.maxMembers}); üyelik yeniden açılamaz. Kontenjanı artırın.`) } as const;
    }
    const next: ClubMembership = {
      ...m,
      startDate,
      endDate,
      ...(endDate ? { endedByUserId: m.endedByUserId ?? ctx.userId, endedAt: m.endedAt ?? new Date().toISOString() } : { endedByUserId: undefined, endedAt: undefined }),
    };
    await writeMembership(ctx.tenantId, next, false, tx);
    return { next, before: m } as const;
  });
  if ("error" in result) return result.error!;
  const { next, before } = result;
  // Oturumlar: başlangıçtan önceki / bitişten sonraki gelecek satırlar iptal; kapsam genişlediyse eksik satırlar eklenir.
  await syncFutureSessionsForMember(ctx, next, "leave");
  await syncFutureSessionsForMember(ctx, next, "join");
  const { recordAuditLog } = await import("./audit/log");
  void recordAuditLog({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    action: "club.member_update",
    entityType: "ClubMembership",
    entityId: next.id,
    outcome: "success",
    meta: { clubId: next.clubId, studentId: next.studentId, from: { startDate: before.startDate, endDate: before.endDate ?? null }, to: { startDate: next.startDate, endDate: next.endDate ?? null } },
  });
  return ok(next);
}

// ── Üyeliği silme (yanlışlıkla eklenen üyelik) ──────────────────────────────

export type ClubMembershipDeleteResult = {
  membershipId: string;
  /** Tekrar tıklama: üyelik zaten silinmişti (yazım yapılmadı). */
  alreadyDeleted?: boolean;
  /** İptal edilen (silinmeyen) ödenmemiş kulüp ücreti satırları. */
  voidedFeeRows: number;
  /** İptal edilen yoklamasız oturum satırları. */
  cancelledSessionRows: number;
  /** Bu üyeliğin verdiği hakla açılmış, aynı işlemde silinen/sonlanan dahil solfej üyelikleri (kulüp adları). */
  removedIncluded: string[];
};

/**
 * Saf: üyeliğin FİZİKSEL silinmesini engelleyen korunan kayıt (yoksa null). Korunanlar: tahsilat görmüş (kısmi dahil)
 * kulüp ücreti, yoklama/öğretmen yoklaması girilmiş oturum satırı. Ödenmemiş ücret satırı SİLİNMEZ, iptal edilir.
 */
/**
 * DB egress (2026-10-19) — silme/etki araçları için: referans veri + TÜM kulüp ücretleri + TÜM zamanların TÜM kulüp
 * satırları (dahil solfej üyeliği başka kulübün satırlarına bakar). Tam `readData()` yerine (~%3 ders, ~%1 ödeme).
 */
async function readClubRows() {
  const { readPaymentsPageData, readLessonWindow } = await import("./store");
  const [pay, win] = await Promise.all([
    readPaymentsPageData({ clubOnly: true }),
    readLessonWindow("1970-01-01T00:00:00.000Z", "2100-01-01T00:00:00.000Z", { clubOnly: true }),
  ]);
  return { students: pay.students, payments: pay.payments, lessons: win.lessons };
}

export function clubMembershipDeleteBlocker(
  m: ClubMembership,
  payments: Payment[],
  lessons: import("./types").Lesson[],
  memberships: ClubMembership[] = []
): string | null {
  const fees = payments.filter((p) => p.source === "club" && p.clubMembershipId === m.id && p.status !== "voided");
  const paid = fees.filter((p) => p.paidAmount > 0);
  if (paid.length) {
    const total = paid.reduce((s, p) => s + p.paidAmount, 0);
    return `Bu üyeliğe ait ${paid.length} kulüp ücretinde toplam ${total} TL tahsilat var; tahsilat kaydı korunduğu için üyelik silinemez. Yanlışlıkla eklendiyse önce Ödemeler ekranından tahsilatı geri alın; üye gerçekten kulübe katıldıysa silmek yerine "Üyeliği sonlandır"ı kullanın (geçmiş korunur).`;
  }
  const touched = membershipLessonRows(m, lessons, memberships).filter((r) => rowTouched(r) || !!r.teacherAttendanceStatus);
  if (touched.length) {
    return `Bu üyeliğin ${touched.length} oturumunda yoklama girilmiş; yoklama geçmişi korunduğu için üyelik silinemez. Yoklamaları geri alın ya da silmek yerine "Üyeliği sonlandır"ı kullanın.`;
  }
  return null;
}

/**
 * Bu üyelik döneminde açılmış (iptal edilmemiş) kulüp oturum satırları. Sonlanma günü DAHİL taranır (sonlanmadan önce
 * o güne açılmış satır olabilir); aynı öğrencinin aynı kulüpteki BAŞKA üyeliğinin kapsadığı günler hariç.
 */
function membershipLessonRows(m: ClubMembership, lessons: import("./types").Lesson[], memberships: ClubMembership[]): import("./types").Lesson[] {
  const others = memberships.filter((o) => o.id !== m.id && o.clubId === m.clubId && o.studentId === m.studentId);
  return lessons.filter((l) => {
    if (l.type !== "group" || l.clubId !== m.clubId || l.studentId !== m.studentId || l.status === "cancelled") return false;
    const ymd = toZonedYmd(new Date(l.startAt), DEFAULT_APP_TIMEZONE);
    if (ymd < m.startDate || (m.endDate && ymd > m.endDate)) return false;
    return !others.some((o) => membershipCoversDay(o, ymd));
  });
}

async function deleteMembershipRow(tenantId: string, id: string, tx: Tx | null): Promise<boolean> {
  if (isDbMode) {
    const db = tx ?? (await import("./db")).prisma;
    return (await db.clubMembership.deleteMany({ where: { id, tenantId } })).count > 0;
  }
  const all = await loadFile<ClubMembership>(CLUB_MEMBERSHIPS_FILE);
  const next = all.filter((x) => !(x.id === id && x.tenantId === tenantId));
  if (next.length === all.length) return false;
  await saveFile(CLUB_MEMBERSHIPS_FILE, next);
  return true;
}

/**
 * "Üyeliği sil" — yanlışlıkla eklenen kulüp üyeliğini KALICI siler (sonlandırmadan ayrı işlem). Öğrenci ana kaydı,
 * ödeme/tahsilat, sözleşme ve başvuru kayıtları SİLİNMEZ. Sıra: korunan kayıt varsa ret (alternatif: sonlandır) →
 * ödenmemiş kulüp ücreti satırları iptal (silinmez, not düşülür) → yoklamasız oturum satırları iptal → kilit içinde
 * üyelik satırı silinir; bu üyeliğin tek başına verdiği ücretsiz dahil solfej üyeliği de (korunan kaydı yoksa) silinir,
 * varsa sonlandırılır; başvuru bağlantısı temizlenir (kişi sonra yeniden eklenebilir). Tekrar tıklama güvenli.
 */
export async function deleteClubMembershipTool(ctx: ServiceContext, input: unknown): Promise<ServiceResult<ClubMembershipDeleteResult>> {
  const auth = requireRole(ctx, ADMIN_ROLES);
  if (!auth.ok) return fail("FORBIDDEN", "Kulüp üyeliğini yalnız kurum yöneticileri silebilir.");
  const parsed = z.object({ membershipId: z.string().min(1).max(80) }).safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Silinecek üyelik seçilmedi. Sayfayı yenileyin.");
  const id = parsed.data.membershipId;
  const memberships = await listClubMemberships(ctx.tenantId);
  const m = memberships.find((x) => x.id === id);
  if (!m) return ok({ membershipId: id, alreadyDeleted: true, voidedFeeRows: 0, cancelledSessionRows: 0, removedIncluded: [] });
  const clubs = await listClubs(ctx.tenantId);
  const club = clubs.find((c) => c.id === m.clubId);
  const { patchClubLessons } = await import("./store");
  const data = await readClubRows();
  const blocker = clubMembershipDeleteBlocker(m, data.payments, data.lessons, memberships);
  if (blocker) return fail("CONFLICT", blocker);
  const t = today();
  // Bu üyeliğin TEK hakkıyla açılmış ücretsiz dahil solfej üyelikleri de yanlışlıktır → birlikte kaldırılır.
  const dependents = memberships.filter((g) => g.id !== m.id && g.includedByMembershipIds?.includes(m.id));
  const soleIncluded = dependents.filter((g) => g.monthlyFee === 0 && (g.includedByMembershipIds ?? []).every((x) => x === m.id));
  const includedDeletable = soleIncluded.filter((g) => !clubMembershipDeleteBlocker(g, data.payments, data.lessons, memberships));
  const includedToEnd = soleIncluded.filter((g) => !includedDeletable.includes(g) && isMembershipActive(g, t));

  // 1) Ödenmemiş ücret satırları: SİLİNMEZ, iptal edilir (eşzamanlı tahsilat olduysa collectPayment reddeder → dur).
  const { collectPayment } = await import("./payments/collect");
  const studentName = data.students.find((s) => s.id === m.studentId)?.name ?? "Öğrenci";
  const clubName = club?.name ?? "Kulüp";
  let voidedFeeRows = 0;
  for (const p of data.payments.filter((x) => x.source === "club" && x.clubMembershipId === m.id && x.status !== "voided" && x.paidAmount === 0)) {
    try {
      await collectPayment(p.id, {
        voided: true,
        paymentNote: `Kulüp üyeliği silindi (${clubName}) — yanlışlıkla eklenen üyelik.`,
        actorUserId: ctx.userId,
        tenantId: ctx.tenantId,
        onlyIfUntouchedOpenDebt: true,
      });
      voidedFeeRows++;
    } catch {
      // Eşzamanlı ikinci istek (iki sekme): ilk istek üyeliği zaten sildiyse bu bir hata değildir.
      if (!(await listClubMemberships(ctx.tenantId)).some((x) => x.id === m.id)) {
        return ok({ membershipId: id, alreadyDeleted: true, voidedFeeRows, cancelledSessionRows: 0, removedIncluded: [] });
      }
      return fail(
        "CONFLICT",
        `${studentName} için ${p.installmentPeriodLabel ?? ""} kulüp ücreti bu sırada değişti (tahsilat girilmiş olabilir); üyelik silinmedi. Sayfayı yenileyip tekrar deneyin.`
      );
    }
  }
  // 2) Yoklamasız oturum satırları iptal (ders programından kalkar; satır izi korunur).
  const rowIds = [m, ...includedDeletable].flatMap((x) => membershipLessonRows(x, data.lessons, memberships).map((r) => r.id));
  if (rowIds.length) await patchClubLessons(rowIds, { status: "cancelled" });

  // 3) Üyelik satır(lar)ı kilit içinde: yeniden oku, sil; diğer dahil haklardan bu kimliği çıkar.
  const removed = await withClubMembershipLock(ctx.tenantId, async (tx) => {
    const all = await listClubMemberships(ctx.tenantId, tx);
    if (!all.some((x) => x.id === m.id)) return false;
    for (const g of all.filter((x) => x.id !== m.id && x.includedByMembershipIds?.includes(m.id))) {
      if (includedDeletable.some((d) => d.id === g.id)) continue;
      const next: ClubMembership = { ...g, includedByMembershipIds: (g.includedByMembershipIds ?? []).filter((x) => x !== m.id) };
      if (includedToEnd.some((d) => d.id === g.id) && !g.endDate) {
        Object.assign(next, { endDate: g.startDate > t ? g.startDate : t, endedByUserId: ctx.userId, endedAt: new Date().toISOString() });
      }
      await writeMembership(ctx.tenantId, next, false, tx);
    }
    for (const d of includedDeletable) await deleteMembershipRow(ctx.tenantId, d.id, tx);
    return deleteMembershipRow(ctx.tenantId, m.id, tx);
  });
  if (!removed) return ok({ membershipId: id, alreadyDeleted: true, voidedFeeRows, cancelledSessionRows: rowIds.length, removedIncluded: [] });
  for (const g of includedToEnd) await syncFutureSessionsForMember(ctx, { ...g, endDate: g.startDate > t ? g.startDate : t }, "leave");

  // 4) Başvuru bağlantısı (başvuru kaydı SİLİNMEZ): "Kulübe eklendi" → "İletişime geçildi", üyelik kimliği temizlenir.
  const { unlinkDeletedMembershipFromApplications } = await import("./club-applications");
  const unlinked = await unlinkDeletedMembershipFromApplications(ctx.tenantId, [m.id, ...includedDeletable.map((d) => d.id)]);

  const { recordAuditLog } = await import("./audit/log");
  void recordAuditLog({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    action: "club.member_delete",
    entityType: "ClubMembership",
    entityId: m.id,
    outcome: "success",
    meta: {
      clubId: m.clubId,
      studentId: m.studentId,
      startDate: m.startDate,
      endDate: m.endDate ?? null,
      monthlyFee: m.monthlyFee,
      applicationId: m.applicationId ?? null,
      voidedFeeRows,
      cancelledSessionRows: rowIds.length,
      deletedIncludedMembershipIds: includedDeletable.map((d) => d.id),
      endedIncludedMembershipIds: includedToEnd.map((d) => d.id),
      unlinkedApplicationIds: unlinked,
    },
  });
  const nameOf = (g: ClubMembership) => clubs.find((c) => c.id === g.clubId)?.name ?? "Dahil solfej";
  return ok({
    membershipId: m.id,
    voidedFeeRows,
    cancelledSessionRows: rowIds.length,
    removedIncluded: [...includedDeletable.map((g) => `${nameOf(g)} (silindi)`), ...includedToEnd.map((g) => `${nameOf(g)} (sonlandırıldı)`)],
  });
}

// ── Üye ekleme araması ──────────────────────────────────────────────────────

export type ClubMemberCandidate = {
  id: string;
  name: string;
  /** Aynı adlı kişileri ayırmak için en az bilgi: şube · doğum yılı · telefonun son 4 hanesi. */
  hint: string;
  /** Bu kulüpte zaten aktif üyeliği var — seçilemez. */
  alreadyMember: boolean;
};

type CandidateRow = { id: string; name: string; phone?: string | null; parentPhone?: string | null; birthYear?: string; branchId?: string | null };

async function loadCandidateRows(tenantId: string): Promise<{ rows: CandidateRow[]; branches: { id: string; name: string }[] }> {
  if (isDbMode) {
    // DB egress: tam okuma yerine dar sütunlar (tuş başına çağrılır).
    const { prisma } = await import("./db");
    const [students, branches] = await Promise.all([
      prisma.student.findMany({
        where: { tenantId, active: true, deletedAt: null },
        select: { id: true, name: true, phone: true, parentPhone: true, birthDate: true, branchId: true },
      }),
      prisma.branch.findMany({ where: { tenantId }, select: { id: true, name: true, shortName: true } }),
    ]);
    return {
      rows: students.map((s) => ({ ...s, birthYear: s.birthDate ? String(s.birthDate.getUTCFullYear()) : undefined })),
      branches: branches.map((b) => ({ id: b.id, name: b.shortName || b.name })),
    };
  }
  const { readReferenceData } = await import("./store");
  const ref = await readReferenceData();
  return {
    rows: ref.students
      .filter((s) => s.active && !s.deletedAt)
      .map((s) => ({ id: s.id, name: s.name, phone: s.phone, parentPhone: s.parentPhone, birthYear: s.birthDate ? String(s.birthDate).slice(0, 4) : undefined, branchId: s.branchId })),
    branches: ref.settings.branches.map((b) => ({ id: b.id, name: b.shortName || b.name })),
  };
}

/**
 * Kulübe üye ekleme araması (yalnız kurum yöneticisi, yalnız oturumdaki kurum). Ad ile, Türkçe harf/büyük-küçük
 * farkı gözetmeden (`foldTurkishForSearch`). Boş sorgu sonuç döndürmez. En fazla 20 sonuç; `total` toplam eşleşme.
 */
export async function searchClubMemberCandidatesTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ items: ClubMemberCandidate[]; total: number }>> {
  const auth = requireRole(ctx, ADMIN_ROLES);
  if (!auth.ok) return fail("FORBIDDEN", "Kulübe üye eklemeyi yalnız kurum yöneticileri yapabilir.");
  const parsed = z.object({ clubId: z.string().min(1).max(80), q: z.string().max(80).default("") }).safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Arama okunamadı. Sayfayı yenileyip tekrar deneyin.");
  const { foldTurkishForSearch } = await import("./normalize");
  const q = foldTurkishForSearch(parsed.data.q.trim());
  if (!q) return ok({ items: [], total: 0 });
  const [clubs, memberships, { rows, branches }] = await Promise.all([listClubs(ctx.tenantId), listClubMemberships(ctx.tenantId), loadCandidateRows(ctx.tenantId)]);
  const club = clubs.find((c) => c.id === parsed.data.clubId);
  if (!club) return fail("NOT_FOUND", "Kulüp bulunamadı; silinmiş olabilir. Sayfayı yenileyin.");
  const t = today();
  const members = new Set(memberships.filter((m) => m.clubId === club.id && isMembershipActive(m, t)).map((m) => m.studentId));
  const matches = rows
    .map((r) => ({ r, key: foldTurkishForSearch(r.name) }))
    .filter((x) => x.key.includes(q))
    .sort((a, b) => Number(b.key.startsWith(q)) - Number(a.key.startsWith(q)) || a.r.name.localeCompare(b.r.name, "tr"));
  const items = matches.slice(0, 20).map(({ r }) => {
    const digits = String(r.parentPhone || r.phone || "").replace(/\D/g, "");
    const parts = [
      r.branchId ? branches.find((b) => b.id === r.branchId)?.name : undefined,
      r.birthYear ? `d. ${r.birthYear}` : undefined,
      digits.length >= 4 ? `tel. …${digits.slice(-4)}` : undefined,
    ].filter(Boolean);
    return { id: r.id, name: r.name, hint: parts.join(" · "), alreadyMember: members.has(r.id) };
  });
  return ok({ items, total: matches.length });
}

// ── Aylık tahakkuk (cron) ──────────────────────────────────────────────────

/** Saf: üyeliğin kaçıncı ücret ayı (başlangıç ayı = 1). "Ödeme alınacak ay sayısı" bununla karşılaştırılır. */
export function clubFeeMonthIndex(startDate: string, month: string): number {
  const [sy, sm] = startDate.slice(0, 7).split("-").map(Number) as [number, number];
  const [y, m] = month.split("-").map(Number) as [number, number];
  return (y - sy) * 12 + (m - sm) + 1;
}

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
    const club = input.clubs.find((c) => c.id === m.clubId);
    if (!club) return false;
    // Dönemlik/toplam ücret tek seferliktir (başlangıç ayında); aylık tahakkuk yalnız aylık kulüpte.
    if (club.feePeriod !== "monthly") return false;
    if (m.monthlyFee <= 0) return false;
    if (input.month <= m.startDate.slice(0, 7)) return false;
    // Sonlanma günü üyelik dışıdır: ayın 1'inde (veya önce) sonlanan üyelik o ayı borçlanmaz.
    if (m.endDate && m.endDate <= `${input.month}-01`) return false;
    if (club.feeMonths !== undefined && clubFeeMonthIndex(m.startDate, input.month) > club.feeMonths) return false;
    return !findClubFeeRow(input.payments, m.id, input.month);
  });
}

/** Tek kurum — ALS kurulmuş olmalı. Günlük tahakkuk işi (standalone-monthly-accrual ile aynı rota) çağırır. */
export async function runClubFeeAccrual(tenantId: string, opts: { apply: boolean; month: string }): Promise<{ planned: number; created: number }> {
  const { readPaymentsPageData } = await import("./store");
  const [clubs, memberships, data] = await Promise.all([listClubs(tenantId), listClubMemberships(tenantId), readPaymentsPageData({ clubOnly: true })]);
  const planned = planClubFeeAccruals({ clubs, memberships, students: data.students, payments: data.payments, month: opts.month });
  let created = 0;
  if (opts.apply) {
    const { recordAuditLog } = await import("./audit/log");
    for (const m of planned) {
      const club = clubs.find((c) => c.id === m.clubId)!;
      const fee = await ensureClubFeeRow(club, m, opts.month, data.payments);
      if (!fee.created || !fee.paymentId) continue;
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
  required: boolean,
  /** 2026-10-07 — başvurudan kayıt: üyelik burada açılmaz (başvuru ekranında "Kulübe ekle"), kontenjan orada denetlenir. */
  opts: { skipCapacity?: boolean } = {}
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
    if (!opts.skipCapacity && used >= club.maxMembers) return bad(`${club.name} kontenjanı dolu (${used}/${club.maxMembers}). Kulüpler ekranından kontenjanı artırın veya bu kulübü seçimden çıkarın.`);
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
    if (amount > 0 && added.data.paymentId) {
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
  /**
   * "Haftalık tekrar sayısı" = İLK HAFTA DAHİL toplam oturum sayısı (1 = yalnız ilk oturum, 8 = ilk oturum + 7 hafta).
   * Elle yazılır; tam sayı olmalı (ondalık/negatif/boş reddedilir).
   */
  weeks: z.coerce
    .number({ error: "Haftalık tekrar sayısını tam sayı olarak girin (ör. 8)." })
    .int("Haftalık tekrar sayısı tam sayı olmalı (ör. 8).")
    .min(1, "Haftalık tekrar sayısı en az 1 olmalı (1 = yalnız ilk oturum).")
    .max(52, "Tek seferde en fazla 52 haftalık oturum planlanabilir."),
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
    .filter((m) => m.clubId === clubId && membershipCoversDay(m, dayYmd))
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
  // Kulüp bazında kilit: aynı planın iki kez gönderilmesi (çift tıklama / iki sekme) ikinci kez yazamaz.
  return withClubSessionLock(ctx.tenantId, parsed.data.clubId, () => scheduleClubSessionsLocked(ctx, parsed.data));
}

async function scheduleClubSessionsLocked(ctx: ServiceContext, v: z.infer<typeof scheduleSchema>): Promise<ServiceResult<{ sessionIds: string[] }>> {
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
  const existing = groupClubSessions(data.lessons, club.id).filter((x) => !x.cancelled && !x.postponed);
  const { formatDateTime } = await import("./utils");
  for (let w = 0; w < v.weeks; w++) {
    const day = new Date(`${ymd0}T12:00:00Z`);
    day.setUTCDate(day.getUTCDate() + 7 * w);
    const ymd = day.toISOString().slice(0, 10);
    const startAt = zonedWallTimeToUtc(ymd, hm);
    if (startAt.getTime() < Date.now() - 60 * 60_000) return fail("VALIDATION_ERROR", "Geçmiş bir zamana oturum planlanamaz. Bugün veya ileri bir tarih seçin.");
    // Aynı planı yeniden kaydetmek mükerrer oturum açmaz: bu kulübün aynı başlangıçlı oturumu varsa hiçbiri yazılmaz.
    const dup = existing.find((x) => Date.parse(x.startAt) === startAt.getTime());
    if (dup) {
      return fail(
        "CONFLICT",
        `${formatDateTime(dup.startAt)} için bu kulübün oturumu zaten planlı; aynı oturum ikinci kez oluşturulmadı. Yalnız eksik haftaları planlamak için ilk oturumu ilk eksik tarihe alıp tekrar sayısını azaltın.`
      );
    }
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

const rescheduleSchema = z.object({
  sessionId: z.string().min(1),
  /** Kurum saatiyle "YYYY-MM-DDTHH:mm". */
  startLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Yeni tarih ve saati seçin."),
  roomId: z.string().optional(),
  teacherId: z.string().optional(),
  /** true: aynı gün+saatteki SONRAKİ (yoklamasız) oturumlar da aynı farkla kaydırılır (yanlış kurulmuş haftalık seri). */
  applyToFollowing: z.boolean().optional(),
});

/**
 * 2026-10-07 — YANLIŞ GİRİLEN oturumu düzeltir (erteleme DEĞİL; Telafi statüsü açılmaz): tarih/saat, oda,
 * öğretmen. Yalnız yoklaması/öğretmen yoklaması girilmemiş oturumlar. Tüm hedefler doğrulanmadan hiçbiri yazılmaz.
 */
export async function rescheduleClubSessionTool(ctx: ServiceContext, input: unknown): Promise<ServiceResult<{ moved: number }>> {
  const auth = requireRole(ctx, ADMIN_ROLES);
  if (!auth.ok) return fail("FORBIDDEN", "Kulüp oturumunu yalnız kurum yöneticileri düzenleyebilir.");
  const parsed = rescheduleSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Oturum bilgilerini kontrol edin.");
  const v = parsed.data;
  const { session, data } = await loadSession(ctx, v.sessionId);
  if (!session || session.cancelled) return fail("NOT_FOUND", "Oturum bulunamadı veya iptal edilmiş. Sayfayı yenileyin.");
  if (session.postponed) return fail("CONFLICT", "Bu oturum ertelenmiş (Telafi); yeni tarihteki oturumu düzenleyin.");
  const touched = (x: ClubSessionView) => x.rows.some(rowTouched) || !!x.teacherAttendanceStatus;
  if (touched(session)) {
    return fail("CONFLICT", "Bu oturuma yoklama girilmiş; tarihi düzeltilemez. Önce yoklamaları geri alın ya da yapılamadıysa 'Oturumu ertele' kullanın.");
  }
  const club = (await listClubs(ctx.tenantId)).find((c) => c.id === session.clubId);
  if (!club) return fail("NOT_FOUND", "Kulüp bulunamadı.");
  const teacherId = v.teacherId || session.teacherId;
  if (teacherId !== session.teacherId && (!club.teacherIds.includes(teacherId) || !data.teachers.some((t) => t.id === teacherId && t.active))) {
    return fail("VALIDATION_ERROR", "Seçilen öğretmen bu kulübün öğretmenleri arasında değil veya pasif. Kulübü düzenleyip öğretmeni ekleyin.");
  }
  const roomId = v.roomId || session.roomId;
  const { isRoomSchedulable } = await import("./makeup-engine");
  const room = data.rooms.find((r) => r.id === roomId);
  if (!room || (roomId !== session.roomId && !isRoomSchedulable(room))) return fail("VALIDATION_ERROR", "Seçilen oda bulunamadı veya pasif. Aktif bir oda seçin.");
  if (club.branchId && room.branchId !== club.branchId) return fail("VALIDATION_ERROR", "Oda kulübün şubesinde değil. Kulübün şubesindeki bir odayı seçin.");
  const { zonedWallTimeToUtc } = await import("./timezone");
  const [ymd, hm] = v.startLocal.split("T") as [string, string];
  const newStart = zonedWallTimeToUtc(ymd, hm);
  const delta = newStart.getTime() - Date.parse(session.startAt);
  // Seri: aynı kulüpte, bu oturumdan sonraki, aynı hafta günü + saat (kurum saati), yoklamasız oturumlar.
  const localKey = (iso: string) => {
    const d = new Date(iso);
    return `${new Date(`${toZonedYmd(d, DEFAULT_APP_TIMEZONE)}T12:00:00Z`).getUTCDay()}-${d.toLocaleTimeString("en-GB", { timeZone: DEFAULT_APP_TIMEZONE, hour: "2-digit", minute: "2-digit" })}`;
  };
  const targets = [session];
  if (v.applyToFollowing) {
    const key = localKey(session.startAt);
    targets.push(
      ...groupClubSessions(data.lessons, club.id).filter(
        (x) => x.sessionId !== session.sessionId && !x.cancelled && !x.postponed && x.startAt > session.startAt && localKey(x.startAt) === key && !touched(x)
      )
    );
  }
  const movingIds = new Set(targets.map((x) => x.sessionId));
  const others = { ...data, lessons: data.lessons.filter((l) => !l.clubSessionId || !movingIds.has(l.clubSessionId)) };
  const { listTrialLessons } = await import("./trial-lessons");
  const trials = await listTrialLessons(ctx.tenantId);
  const planned: import("./types").Lesson[] = [];
  const moves: { ids: string[]; startAt: string; endAt: string }[] = [];
  for (const x of targets) {
    const startAt = new Date(Date.parse(x.startAt) + delta);
    const built = await buildSessionRows(
      ctx,
      { club, teacherId, roomId, startAt, members: x.rows.map((r) => r.studentId), sessionId: x.sessionId },
      others,
      trials,
      planned
    );
    if (!built.ok) return fail("CONFLICT", built.message);
    planned.push(...built.rows);
    moves.push({ ids: x.rows.map((r) => r.id), startAt: built.rows[0]!.startAt, endAt: built.rows[0]!.endAt });
  }
  const { patchClubLessons } = await import("./store");
  for (const mv of moves) {
    await patchClubLessons(mv.ids, { startAt: mv.startAt, endAt: mv.endAt, roomId, branchId: room.branchId, teacherId });
  }
  const { recordAuditLog } = await import("./audit/log");
  void recordAuditLog({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    action: "club.session_reschedule",
    entityType: "ClubSession",
    entityId: session.sessionId,
    outcome: "success",
    meta: { sessions: moves.length, from: session.startAt, to: moves[0]!.startAt, roomId, teacherId },
  });
  return ok({ moved: moves.length });
}

/**
 * Üyelik değişince gelecek oturumlar: yeni üye → ileri tarihli, ertelenmemiş oturumlara satır (kendi dersiyle
 * çakışanlar atlanır, uyarı döner); ayrılan üye → kapsam dışı kalan (sonlanma günü ve sonrası) satırları "İptal".
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
    // Bitişten sonraki ve (başlangıç düzeltildiyse) başlangıçtan önceki gelecek satırlar; yoklama girilmiş satıra dokunulmaz.
    const outside = (ymd: string) => !membershipCoversDay(m, ymd);
    const ids = sessions
      .filter((s) => outside(toZonedYmd(new Date(s.startAt), DEFAULT_APP_TIMEZONE)))
      .flatMap((s) => s.rows.filter((r) => r.studentId === m.studentId && !rowTouched(r)).map((r) => r.id));
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
    const ymd = toZonedYmd(new Date(s.startAt), DEFAULT_APP_TIMEZONE);
    if (!membershipCoversDay(m, ymd)) continue;
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

/** Satıra öğrenci yoklaması/ops işareti girilmiş mi (bu satırlar iptal edilmez/taşınmaz). */
function rowTouched(r: import("./types").Lesson): boolean {
  return !!(r.studentAttended || r.lessonProcessed || r.studentAbsent || r.studentExcused || r.opsMakeupFlag || r.status === "completed");
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
  const [data, memberships] = await Promise.all([readClubRows(), listClubMemberships(tenantId)]);
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

  const { patchClubLessons } = await import("./store");
  const data = await readClubRows();
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

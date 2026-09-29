/**
 * 2026-09-30 — öğrenci sözleşmesi bitiş uyarısı. Mevcut bildirim mimarisine köprü (paralel sistem yok):
 * kategori `student_contract_expiring` (kullanıcı başına aç/kapa — Bildirim Ayarları), süre kurum ayarı
 * `notifications.studentContractExpiryDays` (varsayılan 15), gönderim `notifyAdmins` (yalnız bu kurumun
 * yöneticileri, yalnız uygulama içi — öğrenciye/veliye SMS/e-posta YOK).
 *
 * Tekilleştirme anahtarı = bildirimdeki bağlantı (öğrenci + sözleşme + bitiş günü). Aynı sözleşme/bitiş
 * için bir kez; bitiş tarihi değişir veya sözleşme yenilenirse anahtar değişir → yeni tarih değerlendirilir.
 */
import { isTerminalContractStatus } from "./contract-list-helpers";
import { calendarDaysBetween, DEFAULT_APP_TIMEZONE, toZonedYmd } from "./timezone";
import type { Student } from "./types";

export const STUDENT_CONTRACT_EXPIRY_SETTING_KEY = "notifications.studentContractExpiryDays";
export const DEFAULT_STUDENT_CONTRACT_EXPIRY_DAYS = 15;
/** Olay başına tek bildirim — pencere, en uzun sözleşmeden uzun. */
const DEDUPE_WINDOW_MS = 400 * 24 * 60 * 60 * 1000;

export type ContractSummaryLike = { contractId: string; status: string; enrollmentEndDate: string };

export type ContractExpiryCandidate = {
  studentId: string;
  studentName: string;
  contractId: string;
  endDate: string;
  daysLeft: number;
};

/** Saf: bitişine 0..windowDays gün kalan güncel sözleşmeler. Sözleşmesiz/bitişsiz/pasif öğrenci güvenle atlanır. */
export function findExpiringStudentContracts(
  students: Pick<Student, "id" | "name" | "active">[],
  summaries: Map<string, ContractSummaryLike>,
  todayYmd: string,
  windowDays: number
): ContractExpiryCandidate[] {
  const out: ContractExpiryCandidate[] = [];
  for (const student of students) {
    if (student.active === false) continue;
    const c = summaries.get(student.id);
    // Taslak henüz yürürlükte değil; iptal/yenilenmiş sözleşme güncel değil.
    if (!c || c.status === "draft" || isTerminalContractStatus(c.status)) continue;
    const endDate = /^\d{4}-\d{2}-\d{2}/.exec(c.enrollmentEndDate ?? "")?.[0];
    if (!endDate) continue;
    const daysLeft = calendarDaysBetween(todayYmd, endDate);
    if (daysLeft < 0 || daysLeft > windowDays) continue;
    out.push({ studentId: student.id, studentName: student.name, contractId: c.contractId, endDate, daysLeft });
  }
  return out;
}

export function contractExpiryNotificationText(c: ContractExpiryCandidate): { title: string; body: string } {
  const [y, m, d] = c.endDate.split("-");
  const when = c.daysLeft === 0 ? "bugün bitiyor" : `${d}.${m}.${y} tarihinde bitiyor (${c.daysLeft} gün kaldı)`;
  return {
    title: "Öğrenci sözleşmesi bitiyor",
    body:
      `${c.studentName} adlı öğrencinin sözleşmesi ${when}. Yenileme veya uzatma için öğrencinin sözleşme bölümünü kontrol edin. ` +
      `Detay: /panel/ogrenciler/${c.studentId}?sozlesme=${c.contractId}&bitis=${c.endDate}`,
  };
}

export function parseExpiryDays(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 90 ? n : DEFAULT_STUDENT_CONTRACT_EXPIRY_DAYS;
}

/** Tek kurum için kontrol — çağıran kurum kapsamını (ALS) kurmuş olmalı. */
export async function runStudentContractExpiryCheck(
  tenantId: string,
  now: Date = new Date()
): Promise<{ candidates: number; created: number; duplicates: number; skipped: number; failed: number }> {
  const [{ readData }, { listContractSummariesByStudent }, { resolveSetting }, { notifyAdmins }] = await Promise.all([
    import("./store"),
    import("./contracts"),
    import("./platform/resolve"),
    import("./manager-notifications"),
  ]);
  const days = parseExpiryDays((await resolveSetting({ tenantId }, STUDENT_CONTRACT_EXPIRY_SETTING_KEY))?.effectiveValue);
  const data = await readData();
  const summaries = await listContractSummariesByStudent(tenantId);
  const candidates = findExpiringStudentContracts(data.students, summaries, toZonedYmd(now, DEFAULT_APP_TIMEZONE), days);
  const result = { candidates: candidates.length, created: 0, duplicates: 0, skipped: 0, failed: 0 };
  for (const c of candidates) {
    const text = contractExpiryNotificationText(c);
    const dedupeKey = text.body.slice(text.body.indexOf("/panel/"));
    // Sıralı: json store'da aynı kullanıcıya eşzamanlı yazımda okuma-kontrolü yarışmasın.
    const outcomes = await notifyAdmins(tenantId, "student_contract_expiring", text, { dedupeKey, windowMs: DEDUPE_WINDOW_MS });
    for (const o of outcomes) {
      if (o === "created") result.created++;
      else if (o === "duplicate") result.duplicates++;
      else if (o === "skipped") result.skipped++;
      else result.failed++;
    }
  }
  return result;
}

const lastRunDay = new Map<string, string>();

/**
 * Günlük kontrolün zamanlayıcıdan BAĞIMSIZ yolu: bir yönetici bildirimlerini açtığında, o kurum için
 * bu sunucu örneğinde o gün henüz çalışmadıysa çalıştırır. Vercel Cron yalnız production'da çalıştığı
 * için test ortamında da gerçek tetikleyicidir; tekilleştirme mükerrer bildirimi engeller.
 */
export async function ensureStudentContractExpiryCheckedToday(tenantId: string, now: Date = new Date()): Promise<void> {
  const today = toZonedYmd(now, DEFAULT_APP_TIMEZONE);
  if (lastRunDay.get(tenantId) === today) return;
  lastRunDay.set(tenantId, today);
  try {
    await runStudentContractExpiryCheck(tenantId, now);
  } catch (error) {
    lastRunDay.delete(tenantId);
    const { logger } = await import("./logger");
    logger.error("studentContractExpiryCheck başarısız", { tenantId, error: error instanceof Error ? error.message : String(error) });
  }
}

/** Test yardımcı — bellek içi günlük işareti sıfırlar. */
export function resetStudentContractExpiryMemo(): void {
  lastRunDay.clear();
}

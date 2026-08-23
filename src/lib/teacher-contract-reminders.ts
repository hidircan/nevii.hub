/**
 * PRODUCT_BACKLOG §3.3 — öğretmen sözleşme bitiş hatırlatma motoru. SAF
 * sınıflandırma + metin üretimi (I/O yok) — `task-reminders.ts` ile AYNI
 * ayrım deseni: tick/route bu fonksiyonları çağırır, mantık kopyalanmaz.
 * İş Takip (task-reminders.ts) motoruna KASITLI OLARAK dokunulmaz/eklenmez —
 * tamamen ayrı, küçük bir modül.
 */

import { formatDate } from "./utils";
import type { Teacher } from "./types";
import { toZonedYmd, calendarDaysBetween } from "./timezone";

export const CONTRACT_REMINDER_WINDOW_DAYS = 30;

export type TeacherContractReminderClassification = {
  /** Bugünden sözleşme bitişine kalan takvim günü — 0 (bugün) ile 30 arası. */
  daysLeft: number;
};

/**
 * Aday kuralları: `active !== false` VE `contractEndDate` dolu. Bitiş bugünden
 * itibaren 0–30 takvim günü arasındaysa (dahil) aday; geçmişse veya 30 günden
 * uzaksa `null`.
 */
export function classifyTeacherContractReminder(
  teacher: Pick<Teacher, "active" | "contractEndDate">,
  nowUtc: Date,
  timeZone: string
): TeacherContractReminderClassification | null {
  if (teacher.active === false) return null;
  if (!teacher.contractEndDate) return null;

  const endDate = new Date(teacher.contractEndDate);
  if (Number.isNaN(endDate.getTime())) return null;

  const endYmd = toZonedYmd(endDate, timeZone);
  const nowYmd = toZonedYmd(nowUtc, timeZone);
  const daysLeft = calendarDaysBetween(nowYmd, endYmd);

  if (daysLeft < 0 || daysLeft > CONTRACT_REMINDER_WINDOW_DAYS) return null;
  return { daysLeft };
}

/**
 * Tekilleştirme anahtarının bir parçası olarak `Notification.kind` alanına
 * yazılır (teacherId + contractEndDate kodlanır) — ayrı bir dedup tablosu/
 * migration gerektirmez, mevcut `kind` alanı bu amaç için yeterlidir.
 * `contractEndDate` normalize edilir ("yyyy-MM-dd" — Teacher.contractEndDate
 * saat bileşeni içerse bile) böylece aynı gün için farklı saat damgaları
 * yanlışlıkla farklı anahtar üretmez.
 */
export function buildTeacherContractReminderKind(teacherId: string, contractEndDate: string): string {
  const normalizedDay = contractEndDate.slice(0, 10);
  return `teacher_contract_expiring:${teacherId}:${normalizedDay}`;
}

/** Türkçe, doğal bildirim metni — "0 gün" için "bugün bitiyor" biçimi. */
export function buildTeacherContractReminderText(
  teacherName: string,
  teacherId: string,
  contractEndDate: string,
  daysLeft: number
): { title: string; body: string } {
  const link = `/panel/ogretmenler/${teacherId}`;
  const dateLabel = formatDate(contractEndDate, "d MMMM yyyy");
  const whenPhrase = daysLeft === 0 ? "bugün bitiyor" : `${dateLabel} tarihinde bitiyor (${daysLeft} gün kaldı)`;
  return {
    title: "Öğretmen sözleşmesi bitiyor",
    body: `${teacherName} öğretmeninin sözleşmesi ${whenPhrase}. Detay: ${link}`,
  };
}

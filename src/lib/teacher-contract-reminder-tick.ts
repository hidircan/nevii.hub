/**
 * Öğretmen sözleşme bitiş hatırlatma tick motoru — tenant'lar arası dolaşır,
 * her tenant'ta aktif öğretmenleri sınıflandırır (`classifyTeacherContractReminder`)
 * ve hak eden varsa `notifyTeacherContractReminder`'ı çağırır (tekilleştirme
 * ORADA yapılır, burada TEKRARLANMAZ).
 *
 * SAF bir orkestrasyon katmanıdır — `/api/v1/teachers/contracts/reminders/tick`
 * route'u (kimlik doğrulama/secret kontrolü) bu fonksiyonu çağırır; motor
 * kendisi hiçbir kimlik doğrulaması yapmaz. `task-reminder-tick.ts`'e KASITLI
 * OLARAK dokunulmaz/eklenmez — ayrı, küçük bir modül (İş Takip ile ilgisiz).
 */

import { listTenants, readData } from "./store";
import { classifyTeacherContractReminder } from "./teacher-contract-reminders";
import { notifyTeacherContractReminder } from "./teacher-contract-notifications";
import { resolveAppTimezone } from "./timezone";
import { runWithTenantAsync } from "./tenant-context";

/** Makul üst sınırlar — task-reminder-tick.ts ile AYNI gerekçe. */
export const MAX_TENANTS_PER_TICK = 200;
export const MAX_TEACHERS_PER_TENANT_PER_TICK = 500;
const MAX_ERROR_DETAILS = 20;

export type TeacherContractReminderTickSummary = {
  tenantsProcessed: number;
  teachersEvaluated: number;
  remindersCreated: number;
  duplicatesSkipped: number;
  /** Aday değil (pasif, contractEndDate yok, pencere dışı). */
  skipped: number;
  errors: number;
  errorDetails: string[];
};

function emptySummary(): TeacherContractReminderTickSummary {
  return {
    tenantsProcessed: 0,
    teachersEvaluated: 0,
    remindersCreated: 0,
    duplicatesSkipped: 0,
    skipped: 0,
    errors: 0,
    errorDetails: [],
  };
}

function pushError(summary: TeacherContractReminderTickSummary, message: string) {
  summary.errors++;
  if (summary.errorDetails.length < MAX_ERROR_DETAILS) summary.errorDetails.push(message);
}

/**
 * Tüm tenant'lar için bir hatırlatma tick'i çalıştırır. Bir tenant'ın veya
 * bir öğretmenin hata vermesi diğerlerini DURDURMAZ (her seviyede try/catch).
 */
export async function runTeacherContractReminderTick(
  now: Date = new Date()
): Promise<TeacherContractReminderTickSummary> {
  const summary = emptySummary();

  let tenants: { tenantId: string; name: string }[] = [];
  try {
    tenants = await listTenants();
  } catch (e) {
    pushError(summary, `listTenants: ${e instanceof Error ? e.message : String(e)}`);
    return summary;
  }

  for (const tenant of tenants.slice(0, MAX_TENANTS_PER_TICK)) {
    try {
      await runWithTenantAsync(tenant.tenantId, async () => {
        const data = await readData();
        const timeZone = resolveAppTimezone();
        const teachers = data.teachers.slice(0, MAX_TEACHERS_PER_TENANT_PER_TICK);

        for (const teacher of teachers) {
          summary.teachersEvaluated++;
          try {
            const classification = classifyTeacherContractReminder(teacher, now, timeZone);
            if (!classification || !teacher.contractEndDate) {
              summary.skipped++;
              continue;
            }
            const result = await notifyTeacherContractReminder({
              tenantId: tenant.tenantId,
              teacherId: teacher.id,
              teacherName: teacher.name,
              contractEndDate: teacher.contractEndDate,
              daysLeft: classification.daysLeft,
            });
            summary.remindersCreated += result.recipientsNotified;
            summary.duplicatesSkipped += result.duplicatesSkipped;
          } catch (e) {
            pushError(
              summary,
              `tenant=${tenant.tenantId} teacher=${teacher.id}: ${e instanceof Error ? e.message : String(e)}`
            );
          }
        }
      });
      summary.tenantsProcessed++;
    } catch (e) {
      pushError(summary, `tenant=${tenant.tenantId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return summary;
}

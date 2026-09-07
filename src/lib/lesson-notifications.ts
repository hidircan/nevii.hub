import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { readData, listTenants } from "./store";
import { runWithTenantAsync } from "./tenant-context";
import { getUserIdByTeacherId } from "./auth/users";
import { notifyAdmins } from "./manager-notifications";
import { notifyStudentIfEnabled, notifyUserIfEnabled, type NotifyOutcome } from "./notification-dispatch";
import { logger } from "./logger";
import type { Lesson } from "./types";

/**
 * Bir ders olayının bildirim turunun ÖLÇÜLEBİLİR sonucu. Çağıran (tool)
 * bunu denetim kaydına yazabilsin diye döner — "best-effort" artık
 * "görünmez" demek değildir.
 */
export type LessonNotificationSummary = {
  created: number;
  duplicate: number;
  skipped: number;
  failed: number;
};

function emptySummary(): LessonNotificationSummary {
  return { created: 0, duplicate: 0, skipped: 0, failed: 0 };
}

/**
 * Birbirinden BAĞIMSIZ bildirim görevlerini paralel yürütür ve HER sonucu
 * açıkça ele alır.
 *
 * Neden güvenli: hedefler farklı kullanıcılardır (öğretmen / öğrenci+veli /
 * yöneticiler), yani ayrı satırlara yazılır. Aynı kaynağa (json dosyası)
 * yazan kısım `mutateAllUnderLock` ile serileştirilir; aynı (hedef, olay)
 * çiftine iki satır yazılması ise türetilmiş satır kimliğiyle engellenir.
 *
 * `Promise.allSettled` kullanılır ve reddedilen görevler LOGLANIR —
 * `.catch(() => {})` gibi sessiz bir yutma YOKTUR. Bildirim başarısızlığı
 * çağıran mutasyonu ASLA başarısız yapmaz (bkz. çağrı yerlerindeki yorum).
 */
async function settleNotifications(
  label: string,
  context: { tenantId: string; lessonId: string },
  tasks: Array<Promise<NotifyOutcome | NotifyOutcome[]>>
): Promise<LessonNotificationSummary> {
  const settled = await Promise.allSettled(tasks);
  const summary = emptySummary();
  for (const entry of settled) {
    if (entry.status === "rejected") {
      summary.failed += 1;
      logger.error(`${label}: bildirim görevi reddedildi`, {
        ...context,
        error: entry.reason instanceof Error ? entry.reason.message : String(entry.reason),
      });
      continue;
    }
    for (const outcome of Array.isArray(entry.value) ? entry.value : [entry.value]) {
      summary[outcome] += 1;
    }
  }
  if (summary.failed > 0) {
    logger.warn(`${label}: ${summary.failed} bildirim teslim edilemedi`, { ...context, ...summary });
  }
  return summary;
}

/** Öğretmenin portal kullanıcısı yoksa bu bir hata değil, `skipped`'tır. */
async function notifyTeacherUser(
  tenantId: string,
  teacherId: string,
  payload: { category: Parameters<typeof notifyUserIfEnabled>[0]["category"]; title: string; body: string; dedupeKey: string }
): Promise<NotifyOutcome> {
  const teacherUserId = await getUserIdByTeacherId(tenantId, teacherId);
  if (!teacherUserId) return "skipped";
  return notifyUserIfEnabled({ tenantId, userId: teacherUserId, ...payload });
}

export const UPCOMING_WINDOW_MIN = 15;
export const UPCOMING_WINDOW_MAX = 90;

function fmt(iso: string): string {
  return format(new Date(iso), "d MMM yyyy HH:mm", { locale: tr });
}

function lessonHref(role: "teacher" | "admin" | "student"): string {
  if (role === "teacher") return "/ogretmen/program";
  if (role === "student") return "/ogrenci";
  return "/panel/program";
}

export async function notifyLessonCancelled(input: {
  tenantId: string;
  lesson: Lesson;
  actorUserId?: string;
  reason?: string;
}): Promise<LessonNotificationSummary> {
  const reasonBit = input.reason ? ` ${input.reason.slice(0, 80)}` : "";
  const title = "Ders iptal edildi";
  const bodyAdmin = `"${input.lesson.instrument}" dersi iptal edildi (${fmt(input.lesson.startAt)}).${reasonBit} Detay: ${lessonHref("admin")}`;
  const bodyParty = `"${input.lesson.instrument}" dersiniz iptal edildi (${fmt(input.lesson.startAt)}). Detay: ${lessonHref("student")}`;
  return settleNotifications(
    "notifyLessonCancelled",
    { tenantId: input.tenantId, lessonId: input.lesson.id },
    [
      notifyTeacherUser(input.tenantId, input.lesson.teacherId, {
        category: "lesson_cancelled",
        title,
        body: `"${input.lesson.instrument}" dersi iptal edildi (${fmt(input.lesson.startAt)}). Detay: ${lessonHref("teacher")}`,
        dedupeKey: input.lesson.id,
      }),
      notifyStudentIfEnabled({
        tenantId: input.tenantId,
        studentId: input.lesson.studentId,
        category: "lesson_cancelled",
        title,
        body: bodyParty,
        dedupeKey: input.lesson.id,
      }),
      notifyAdmins(
        input.tenantId,
        "lesson_cancelled",
        { title, body: bodyAdmin },
        { excludeUserId: input.actorUserId, dedupeKey: input.lesson.id }
      ),
    ]
  );
}

export async function notifyLessonRescheduled(input: {
  tenantId: string;
  lesson: Lesson;
  previousStartAt: string;
  actorUserId?: string;
}): Promise<LessonNotificationSummary> {
  if (input.previousStartAt === input.lesson.startAt) return emptySummary();
  const title = "Ders saati değişti";
  const when = `${fmt(input.previousStartAt)} → ${fmt(input.lesson.startAt)}`;
  const dedupeKey = `${input.lesson.id}:${input.lesson.startAt}`;
  /**
   * P0 performans (2026-09-07, onaylı) — bu üç bildirim BİRBİRİNDEN
   * BAĞIMSIZDIR (öğretmen / öğrenci+veli / yöneticiler = ayrı kullanıcılar,
   * ayrı satırlar) ve ardışık `await` edildiklerinde ders taşımayı BLOKLAYAN
   * yolda 19 gidiş-dönüşün 3 ayrı dalgasını oluşturuyordu.
   *
   * Paralelleştirme bir kez DENENİP GERİ ALINMIŞTI: `json`/`memory` modunda
   * `createNotification` kilitsiz bir oku-değiştir-yaz'dı ve eşzamanlı
   * yazımdan biri sessizce kayboluyordu. O kök neden kapatıldı
   * (`notifications/index.ts` → `mutateAllUnderLock`, kilit + atomik yazım) ve
   * üzerine türetilmiş satır kimliğiyle yarışa dayanıklı idempotans eklendi;
   * ikisi de regresyon testleriyle kilitlendi.
   */
  return settleNotifications(
    "notifyLessonRescheduled",
    { tenantId: input.tenantId, lessonId: input.lesson.id },
    [
      notifyTeacherUser(input.tenantId, input.lesson.teacherId, {
        category: "lesson_rescheduled",
        title,
        body: `"${input.lesson.instrument}" dersi taşındı (${when}). Detay: ${lessonHref("teacher")}`,
        dedupeKey,
      }),
      notifyStudentIfEnabled({
        tenantId: input.tenantId,
        studentId: input.lesson.studentId,
        category: "lesson_rescheduled",
        title,
        body: `"${input.lesson.instrument}" dersi ${when} olarak güncellendi. Detay: ${lessonHref("student")}`,
        dedupeKey,
      }),
      notifyAdmins(
        input.tenantId,
        "lesson_rescheduled",
        {
          title,
          body: `"${input.lesson.instrument}" dersi taşındı (${when}). Detay: ${lessonHref("admin")}`,
        },
        { excludeUserId: input.actorUserId, dedupeKey }
      ),
    ]
  );
}

/**
 * Faz 13 — bir dersin öğretmeni ve/veya şubesi değiştirildiğinde. Eski VE
 * yeni öğretmen (farklıysa) ayrı ayrı bilgilendirilir; `dedupeKey` yeni
 * atamayı da içerir ki AYNI değişiklik ikinci kez bildirim üretmesin, ama
 * FARKLI bir sonraki değişiklik (ör. tekrar başka bir öğretmene) yeni bir
 * bildirim üretsin.
 */
export async function notifyLessonReassigned(input: {
  tenantId: string;
  lesson: Lesson;
  previousTeacherId: string;
  previousBranchId: string;
  actorUserId?: string;
}): Promise<void> {
  if (input.previousTeacherId === input.lesson.teacherId && input.previousBranchId === input.lesson.branchId) return;
  const title = "Ders ataması değişti";
  const dedupeKey = `${input.lesson.id}:${input.lesson.teacherId}:${input.lesson.branchId}`;
  try {
    if (input.previousTeacherId !== input.lesson.teacherId) {
      const oldTeacherUserId = await getUserIdByTeacherId(input.tenantId, input.previousTeacherId);
      if (oldTeacherUserId) {
        await notifyUserIfEnabled({
          tenantId: input.tenantId,
          userId: oldTeacherUserId,
          category: "lesson_reassigned",
          title,
          body: `"${input.lesson.instrument}" dersiniz (${fmt(input.lesson.startAt)}) başka bir öğretmene devredildi.`,
          dedupeKey: `${dedupeKey}:old`,
        });
      }
      const newTeacherUserId = await getUserIdByTeacherId(input.tenantId, input.lesson.teacherId);
      if (newTeacherUserId) {
        await notifyUserIfEnabled({
          tenantId: input.tenantId,
          userId: newTeacherUserId,
          category: "lesson_reassigned",
          title,
          body: `"${input.lesson.instrument}" dersi (${fmt(input.lesson.startAt)}) size atandı. Detay: ${lessonHref("teacher")}`,
          dedupeKey: `${dedupeKey}:new`,
        });
      }
    }
    await notifyStudentIfEnabled({
      tenantId: input.tenantId,
      studentId: input.lesson.studentId,
      category: "lesson_reassigned",
      title,
      body: `"${input.lesson.instrument}" dersinizin öğretmeni/şubesi güncellendi (${fmt(input.lesson.startAt)}). Detay: ${lessonHref("student")}`,
      dedupeKey,
    });
    await notifyAdmins(
      input.tenantId,
      "lesson_reassigned",
      {
        title,
        body: `"${input.lesson.instrument}" dersi (${fmt(input.lesson.startAt)}) yeniden atandı. Detay: ${lessonHref("admin")}`,
      },
      { excludeUserId: input.actorUserId, dedupeKey }
    );
  } catch {
    // best-effort
  }
}

/** Telafi planı — lesson_rescheduled (ayrı kategori yok). */
export async function notifyMakeupLessonScheduled(input: {
  tenantId: string;
  lesson: Lesson;
  actorUserId?: string;
}): Promise<void> {
  const title = "Telafi dersi planlandı";
  const when = fmt(input.lesson.startAt);
  const key = input.lesson.id;
  try {
    const teacherUserId = await getUserIdByTeacherId(input.tenantId, input.lesson.teacherId);
    if (teacherUserId) {
      await notifyUserIfEnabled({
        tenantId: input.tenantId,
        userId: teacherUserId,
        category: "lesson_rescheduled",
        title,
        body: `"${input.lesson.instrument}" telafi dersi ${when} için planlandı. Detay: ${lessonHref("teacher")}`,
        dedupeKey: key,
      });
    }
    await notifyStudentIfEnabled({
      tenantId: input.tenantId,
      studentId: input.lesson.studentId,
      category: "lesson_rescheduled",
      title,
      body: `"${input.lesson.instrument}" telafi dersi ${when} tarihinde. Detay: ${lessonHref("student")}`,
      dedupeKey: key,
    });
    await notifyAdmins(
      input.tenantId,
      "lesson_rescheduled",
      {
        title,
        body: `Telafi dersi planlandı: ${input.lesson.instrument} · ${when}. Detay: /panel/telafi`,
      },
      { excludeUserId: input.actorUserId, dedupeKey: key }
    );
  } catch {
    // best-effort
  }
}

export type UpcomingSweepSummary = {
  tenants: number;
  evaluated: number;
  created: number;
  skipped: number;
};

export function isLessonInUpcomingWindow(lesson: Pick<Lesson, "startAt" | "status">, now: Date): boolean {
  if (lesson.status === "cancelled" || lesson.status === "completed" || lesson.status === "no_show") {
    return false;
  }
  const start = new Date(lesson.startAt).getTime();
  const deltaMin = (start - now.getTime()) / 60000;
  return deltaMin >= UPCOMING_WINDOW_MIN && deltaMin <= UPCOMING_WINDOW_MAX;
}

export async function sweepUpcomingLessons(now: Date = new Date()): Promise<UpcomingSweepSummary> {
  const summary: UpcomingSweepSummary = { tenants: 0, evaluated: 0, created: 0, skipped: 0 };
  const tenants = await listTenants();
  for (const t of tenants.slice(0, 200)) {
    await runWithTenantAsync(t.tenantId, async () => {
      const data = await readData();
      summary.tenants++;
      for (const lesson of data.lessons) {
        if (!isLessonInUpcomingWindow(lesson, now)) continue;
        summary.evaluated++;
        const title = "Yaklaşan ders";
        const when = fmt(lesson.startAt);
        const teacherUserId = await getUserIdByTeacherId(t.tenantId, lesson.teacherId);
        let created = false;
        if (teacherUserId) {
          const r = await notifyUserIfEnabled({
            tenantId: t.tenantId,
            userId: teacherUserId,
            category: "lesson_upcoming",
            title,
            body: `"${lesson.instrument}" dersi ${when} başlayacak. Detay: ${lessonHref("teacher")}`,
            dedupeKey: lesson.id,
            windowMs: 20 * 60 * 60 * 1000,
          });
          if (r === "created") created = true;
        }
        await notifyStudentIfEnabled({
          tenantId: t.tenantId,
          studentId: lesson.studentId,
          category: "lesson_upcoming",
          title,
          body: `"${lesson.instrument}" dersi ${when} başlayacak. Detay: ${lessonHref("student")}`,
          dedupeKey: lesson.id,
          windowMs: 20 * 60 * 60 * 1000,
        });
        if (created) summary.created++;
        else summary.skipped++;
      }
    });
  }
  return summary;
}

import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { readData, listTenants } from "./store";
import { runWithTenantAsync } from "./tenant-context";
import { getUserIdByTeacherId } from "./auth/users";
import { notifyAdmins } from "./manager-notifications";
import { notifyStudentIfEnabled, notifyUserIfEnabled } from "./notification-dispatch";
import type { Lesson } from "./types";

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
}): Promise<void> {
  const reasonBit = input.reason ? ` ${input.reason.slice(0, 80)}` : "";
  const title = "Ders iptal edildi";
  const bodyAdmin = `"${input.lesson.instrument}" dersi iptal edildi (${fmt(input.lesson.startAt)}).${reasonBit} Detay: ${lessonHref("admin")}`;
  const bodyParty = `"${input.lesson.instrument}" dersiniz iptal edildi (${fmt(input.lesson.startAt)}). Detay: ${lessonHref("student")}`;
  try {
    const teacherUserId = await getUserIdByTeacherId(input.tenantId, input.lesson.teacherId);
    if (teacherUserId) {
      await notifyUserIfEnabled({
        tenantId: input.tenantId,
        userId: teacherUserId,
        category: "lesson_cancelled",
        title,
        body: `"${input.lesson.instrument}" dersi iptal edildi (${fmt(input.lesson.startAt)}). Detay: ${lessonHref("teacher")}`,
        dedupeKey: input.lesson.id,
      });
    }
    await notifyStudentIfEnabled({
      tenantId: input.tenantId,
      studentId: input.lesson.studentId,
      category: "lesson_cancelled",
      title,
      body: bodyParty,
      dedupeKey: input.lesson.id,
    });
    await notifyAdmins(
      input.tenantId,
      "lesson_cancelled",
      { title, body: bodyAdmin },
      { excludeUserId: input.actorUserId, dedupeKey: input.lesson.id }
    );
  } catch {
    // best-effort
  }
}

export async function notifyLessonRescheduled(input: {
  tenantId: string;
  lesson: Lesson;
  previousStartAt: string;
  actorUserId?: string;
}): Promise<void> {
  if (input.previousStartAt === input.lesson.startAt) return;
  const title = "Ders saati değişti";
  const when = `${fmt(input.previousStartAt)} → ${fmt(input.lesson.startAt)}`;
  try {
    /**
     * P0 performans (2026-09-07) — bu üç bildirim BİRBİRİNDEN BAĞIMSIZ ve
     * ardışık `await` edildikleri için ders taşımayı BLOKLAYAN yolda üç ayrı
     * gidiş-dönüş oluşturuyorlar. `Promise.allSettled` ile paralelleştirmek
     * DENENDİ ve GERİ ALINDI: `json`/`memory` modunda `createNotification`
     * kilitsiz bir oku-değiştir-yaz'dır (`loadAll()` → `saveAll([...all, rec])`,
     * bkz. src/lib/notifications/index.ts) — eşzamanlı iki yazımdan biri
     * SESSİZCE KAYBOLUYOR. `notification-center-v2.test.ts > "taşıma eski→yeni
     * saat yazar"` bunu yakaladı. Paralelleştirmenin ön koşulu, o dosyaya
     * store-json'daki gibi bir yazma kilidi eklemektir (bkz.
     * docs/performance/ADMIN_WEB_P0_BASELINE.md §7).
     */
    const teacherUserId = await getUserIdByTeacherId(input.tenantId, input.lesson.teacherId);
    if (teacherUserId) {
      await notifyUserIfEnabled({
        tenantId: input.tenantId,
        userId: teacherUserId,
        category: "lesson_rescheduled",
        title,
        body: `"${input.lesson.instrument}" dersi taşındı (${when}). Detay: ${lessonHref("teacher")}`,
        dedupeKey: `${input.lesson.id}:${input.lesson.startAt}`,
      });
    }
    await notifyStudentIfEnabled({
      tenantId: input.tenantId,
      studentId: input.lesson.studentId,
      category: "lesson_rescheduled",
      title,
      body: `"${input.lesson.instrument}" dersi ${when} olarak güncellendi. Detay: ${lessonHref("student")}`,
      dedupeKey: `${input.lesson.id}:${input.lesson.startAt}`,
    });
    await notifyAdmins(
      input.tenantId,
      "lesson_rescheduled",
      {
        title,
        body: `"${input.lesson.instrument}" dersi taşındı (${when}). Detay: ${lessonHref("admin")}`,
      },
      { excludeUserId: input.actorUserId, dedupeKey: `${input.lesson.id}:${input.lesson.startAt}` }
    );
  } catch {
    // best-effort
  }
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

import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { BackButton } from "@/components/back-button";
import { addDays, isSameDay, parseISO } from "date-fns";
import { readData } from "@/lib/store";
import { requireSessionContext } from "@/lib/auth/session";
import { ownWeekLessons } from "@/lib/teacher-portal-scope";
import {
  normalizeWeekStart,
  previousWeekParam,
  nextWeekParam,
  todayWeekParam,
  isCurrentWeek,
} from "@/lib/program-week";
import { Badge, Card } from "@/components/ui";
import { formatDate, formatTime } from "@/lib/utils";
import { computeLiveDisplayStatus } from "@/lib/lesson-live-status";
import { LessonLiveActions } from "@/components/lesson-live-actions";
import { LessonCountdown } from "@/components/lesson-countdown";
import { LessonOpsActions, LessonOpsBadges } from "@/components/lesson-ops-actions";
import { isMonday } from "@/lib/closed-days";
import { NotificationBell } from "@/components/notification-bell";
import { ProgramLiveRefresh } from "@/components/program-live-refresh";

export const dynamic = "force-dynamic";

/**
 * Öğretmenin kendi haftalık programı — yalnızca session.teacherId'nin
 * dersleri gösterilir. Hafta seçimi `?week=YYYY-MM-DD` query'siyle yapılır;
 * `normalizeWeekStart` her zaman geçerli bir pazartesiye düşürür, hiçbir
 * girdi hata fırlatmaz.
 */
export default async function TeacherOwnProgramPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/ogretmen/program");
  }
  if (session.role === "PARENT") redirect("/veli");

  const data = await readData();
  const teacherId = session.teacherId;
  if (!teacherId) redirect("/login");
  const teacher = data.teachers.find((t) => t.id === teacherId);
  if (!teacher) redirect("/login");

  const { week } = await searchParams;
  const now = new Date();
  const weekStart = normalizeWeekStart(week, now);
  // Pazartesi okul kapalı — öğretmenin kendi haftalık görünümünde de hiç gösterilmez.
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).filter((d) => !isMonday(d));
  const weekEndExclusive = addDays(weekStart, 7);
  const showingCurrentWeek = isCurrentWeek(weekStart, now);

  const prevHref = `/ogretmen/program?week=${previousWeekParam(weekStart)}`;
  const nextHref = `/ogretmen/program?week=${nextWeekParam(weekStart)}`;
  const todayHref = `/ogretmen/program?week=${todayWeekParam(now)}`;

  // Erişim kapsamı değişmedi: yalnızca bu öğretmenin (session.teacherId)
  // dersleri — başka bir teacherId'ye bu sayfadan hiçbir şekilde ulaşılamaz.
  const lessons = ownWeekLessons(
    data.lessons,
    teacher.id,
    weekStart.toISOString(),
    weekEndExclusive.toISOString()
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-cyan-50 to-slate-50">
      <header className="border-b border-cyan-100 bg-[var(--color-surface)]/90 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-4">
          <BackButton fallbackHref="/ogretmen" />
          <p className="text-sm font-semibold text-[var(--color-text)] dark:text-slate-50">Ders Programım</p>
          <NotificationBell />
        </div>
      </header>

      <ProgramLiveRefresh />

      <main className="mx-auto max-w-lg space-y-3 px-4 py-6 pb-24">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <Link
            href={prevHref}
            aria-label="Önceki hafta"
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Önceki hafta
          </Link>

          {showingCurrentWeek ? (
            <span
              aria-current="true"
              aria-label="Bugünün haftasını görüntülüyorsunuz"
              className="rounded-lg border border-cyan-300 bg-cyan-100 px-2.5 py-1.5 text-xs font-semibold text-cyan-800"
            >
              Bugün
            </span>
          ) : (
            <Link
              href={todayHref}
              aria-label="Bugünün haftasına dön"
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
            >
              Bugün
            </Link>
          )}

          <Link
            href={nextHref}
            aria-label="Sonraki hafta"
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
          >
            Sonraki hafta <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <p className="px-1 text-center text-xs text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
          {formatDate(weekStart.toISOString(), "d MMM")} –{" "}
          {formatDate(addDays(weekStart, 6).toISOString(), "d MMM yyyy")}
        </p>

        {days.map((day) => {
          // "Bugün" rozeti yalnızca gerçekten bugünün bulunduğu haftadayken
          // gösterilir — `showingCurrentWeek` kontrolü olmadan `isSameDay`
          // başka bir haftadaki günle rastlantısal eşleşmez zaten (farklı
          // haftaların günleri hiçbir zaman `now` ile aynı takvim günü
          // olamaz), ama iki koşulu birlikte tutmak niyeti kod okuyana da
          // açıkça belirtir.
          const today = showingCurrentWeek && isSameDay(day, now);
          const dayLessons = lessons.filter((l) => isSameDay(parseISO(l.startAt), day));
          return (
            <Card key={day.toISOString()} className={today ? "border-cyan-200 bg-cyan-50/30" : undefined}>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold text-[var(--color-text)] dark:text-slate-50">
                  {formatDate(day.toISOString(), "EEEE d MMM")}
                </p>
                {today ? <Badge status="scheduled">Bugün</Badge> : null}
              </div>
              {dayLessons.length === 0 ? (
                <p className="text-xs text-[var(--color-text-muted)]">Bu gün dersiniz yok.</p>
              ) : (
                <div className="space-y-2">
                  {dayLessons.map((lesson) => {
                    const student = data.students.find((s) => s.id === lesson.studentId);
                    const room = data.rooms.find((r) => r.id === lesson.roomId);
                    const branch = data.settings.branches.find((b) => b.id === lesson.branchId);
                    const liveStatus = computeLiveDisplayStatus(lesson);
                    return (
                      <div
                        key={lesson.id}
                        className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-2 text-xs"
                        style={{ borderLeftWidth: 3, borderLeftColor: teacher.color }}
                      >
                        <p className="font-semibold text-[var(--color-text)] dark:text-slate-200">
                          {formatTime(lesson.startAt)} · {student?.name ?? "—"}
                        </p>
                        <p className="text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
                          {lesson.instrument} · {branch?.shortName ?? "—"} · {room?.name ?? "—"}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          <Badge status={lesson.type === "makeup" ? "makeup" : liveStatus} />
                          <LessonOpsBadges
                            studentAttended={lesson.studentAttended}
                            lessonProcessed={lesson.lessonProcessed}
                            opsMakeupFlag={lesson.opsMakeupFlag}
                            studentAbsent={lesson.studentAbsent}
                            studentExcused={lesson.studentExcused}
                          />
                        </div>
                        {today ? (
                          <>
                            <LessonLiveActions lessonId={lesson.id} displayStatus={liveStatus} />
                            {liveStatus === "in_progress" && lesson.actualStartAt ? (
                              <LessonCountdown
                                actualStartAt={lesson.actualStartAt}
                                plannedDurationMinutes={Math.round(
                                  (new Date(lesson.endAt).getTime() - new Date(lesson.startAt).getTime()) / 60_000
                                )}
                              />
                            ) : null}
                            <LessonOpsActions
                              compact
                              lessonId={lesson.id}
                              studentAttended={lesson.studentAttended}
                              lessonProcessed={lesson.lessonProcessed}
                              opsMakeupFlag={lesson.opsMakeupFlag}
                              studentAbsent={lesson.studentAbsent}
                              studentExcused={lesson.studentExcused}
                            />
                          </>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          );
        })}
      </main>
    </div>
  );
}

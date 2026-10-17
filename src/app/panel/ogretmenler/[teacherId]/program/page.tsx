import Link from "@/components/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui";
import { computeLessonDurationRow } from "@/lib/lesson-duration-report";
import { formatDate, formatTime } from "@/lib/utils";
import { loadTeacherLessonsData, loadTeacherPageContext } from "../_context";
import { MiniStat } from "../_components/fields";

export const dynamic = "force-dynamic";

/** Ders programı özeti + fiili süre kayıtları; tam ızgara /panel/program'da. */
export default async function TeacherProgramTab({ params }: { params: Promise<{ teacherId: string }> }) {
  const { teacherId } = await params;
  const [{ teacher, canManage }, data] = await Promise.all([loadTeacherPageContext(teacherId), loadTeacherLessonsData(teacherId)]);
  if (!teacher) notFound();

  const lessons = data.lessons
    .filter((l) => l.teacherId === teacher.id)
    .sort((a, b) => b.startAt.localeCompare(a.startAt));
  const now = new Date();
  const upcomingLessons = lessons.filter((l) => new Date(l.startAt) >= now).length;
  const registeredCount = lessons.filter((l) => l.status !== "cancelled").length;

  const recentTimingRows = lessons
    .filter((l) => l.status === "completed" || l.status === "in_progress" || l.actualStartAt)
    .slice(0, 10)
    .map((l) => {
      const student = data.students.find((s) => s.id === l.studentId);
      return { ...computeLessonDurationRow(l), studentName: student?.name ?? "—" };
    });

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-3 flex items-center justify-between text-sm font-semibold text-[var(--color-text)]">
          Ders Programı
          <Link
            href={`/panel/ogretmenler/${teacher.id}/musaitlik`}
            className="text-xs font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]"
          >
            {canManage ? "Müsaitliği düzenle →" : "Müsaitlikte Aç →"}
          </Link>
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <MiniStat label="Kayıtlı ders" value={String(registeredCount)} />
          <MiniStat label="Yaklaşan ders" value={String(upcomingLessons)} />
        </div>
        <Link
          href="/panel/program"
          className="mt-3 inline-block text-sm font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]"
        >
          Programda Aç →
        </Link>
      </section>

      <section>
        <h3 className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          Fiili başlangıç / bitiş kayıtları
          <Link
            href="/panel/ders-duzeltme"
            className="text-xs font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]"
          >
            Tüm kayıtlar →
          </Link>
        </h3>
        {recentTimingRows.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">Henüz başlatılmış/tamamlanmış ders kaydı yok.</p>
        ) : (
          <div className="space-y-1.5">
            {recentTimingRows.map((r) => (
              <Card key={r.lessonId} className="!p-2.5 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[var(--color-text)]">
                    {formatDate(r.plannedStartAt)} · {r.studentName}
                  </span>
                  <span className="text-xs text-[var(--color-text-muted)]">
                    Planlanan {formatTime(r.plannedStartAt)}–{formatTime(r.plannedEndAt)}
                    {" · "}
                    Fiili {r.actualStartAt ? formatTime(r.actualStartAt) : "—"}–
                    {r.actualEndAt ? formatTime(r.actualEndAt) : "—"}
                    {r.diffMinutes !== undefined ? (
                      <span className={r.diffMinutes < 0 ? "text-rose-600" : r.diffMinutes > 0 ? "text-amber-600" : ""}>
                        {" "}
                        ({r.diffMinutes > 0 ? "+" : ""}
                        {r.diffMinutes} dk)
                      </span>
                    ) : null}
                  </span>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

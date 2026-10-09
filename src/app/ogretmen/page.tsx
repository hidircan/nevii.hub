import Link from "@/components/link";
import { redirect } from "next/navigation";
import { PORTAL_RECORD_MISSING_REDIRECT } from "@/lib/auth/portal-record-missing";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { tr } from "date-fns/locale";
import { readData } from "@/lib/store";
import { Badge, Card } from "@/components/ui";
import { LessonStatusBadge } from "@/components/lesson-status-badge";
import { formatDate, formatDateTime, formatMoney, formatTime } from "@/lib/utils";
import { computeTeacherEarningsWithRevisions } from "@/lib/teacher-payout";
import { payoutNetAmount } from "@/lib/payout-ledger";
import { CalendarDays, Music2, Users, Wallet } from "lucide-react";
import { requireSessionContext } from "@/lib/auth/session";
import { AssistantPageContext } from "@/components/ai/assistant-page-context";
import { computeLiveDisplayStatus, resolveLessonFinalStatus } from "@/lib/lesson-live-status";
import { LessonCountdown } from "@/components/lesson-countdown";
import { effectiveStudentTypes } from "@/lib/student-types";
import { isOwnStudent } from "@/lib/teacher-portal-scope";

export const dynamic = "force-dynamic";

/** Öğretmen portalı — oturumdaki teacherId ile kapsamlanır */
export default async function OgretmenPortalPage() {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/ogretmen");
  }

  const data = await readData();
  const teacherId = session.teacherId || "t2";
  const teacher = data.teachers.find((t) => t.id === teacherId) ?? data.teachers[0];
  if (!teacher) redirect(PORTAL_RECORD_MISSING_REDIRECT);
  const students = data.students.filter((s) => isOwnStudent(s, teacher.id) && s.active);

  const today = new Date().toISOString().slice(0, 10);
  const todayLessons = data.lessons
    .filter((l) => l.teacherId === teacher.id && l.startAt.startsWith(today))
    .sort((a, b) => a.startAt.localeCompare(b.startAt));

  const fiveDaysAhead = new Date();
  fiveDaysAhead.setDate(fiveDaysAhead.getDate() + 5);
  fiveDaysAhead.setHours(23, 59, 59, 999);
  const weekLessons = data.lessons
    .filter((l) => l.teacherId === teacher.id && l.status === "scheduled")
    .filter((l) => new Date(l.startAt) >= new Date() && new Date(l.startAt) <= fiveDaysAhead)
    .sort((a, b) => a.startAt.localeCompare(b.startAt))
    .slice(0, 8);

  // Hakediş yalnızca oturumdaki (veya demo fallback) öğretmenin kendi
  // teacherId'siyle hesaplanır — başka bir öğretmenin verisine erişim yok.
  const now = new Date();
  const periodStart = format(startOfMonth(now), "yyyy-MM-dd");
  const periodEnd = format(endOfMonth(now), "yyyy-MM-dd");
  const currentMonthEarnings = computeTeacherEarningsWithRevisions(data, teacher.id, periodStart, periodEnd);
  const recentPayouts = data.teacherPayouts
    .filter((p) => p.teacherId === teacher.id && p.status !== "cancelled")
    .sort((a, b) => b.periodStart.localeCompare(a.periodStart))
    .slice(0, 3);

  return (
    <div>
      <AssistantPageContext entity={{ kind: "teacher", id: teacher.id, label: teacher.name }} />

      <main className="mx-auto max-w-lg space-y-4 px-4 py-6">
        <Card className="glass-hero border-cyan-100">
          <div className="flex items-center gap-2 text-cyan-700">
            <Music2 className="h-4 w-4" />
            <p className="text-xs font-medium uppercase tracking-wide">{data.settings.name}</p>
          </div>
          <h1 className="mt-2 text-xl font-semibold text-[var(--hero-text)]">Bugünkü programın</h1>
          <p className="text-sm text-[var(--hero-text-muted)]">
            {todayLessons.length} ders · {students.length} aktif öğrenci
          </p>
          <Link
            href="/ogretmen/program"
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-cyan-700 hover:text-cyan-800"
          >
            <CalendarDays className="h-4 w-4" /> Ders Programım →
          </Link>
        </Card>

        <section>
          <div className="mb-2 flex items-center gap-2 px-1">
            <CalendarDays className="h-4 w-4 text-cyan-700" />
            <h2 className="text-sm font-semibold text-[var(--color-text)] dark:text-slate-200">Bugün</h2>
          </div>
          {todayLessons.length === 0 ? (
            <Card>
              <p className="text-sm text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">Bugün dersin yok.</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {todayLessons.map((lesson) => {
                const student = data.students.find((s) => s.id === lesson.studentId);
                const room = data.rooms.find((r) => r.id === lesson.roomId);
                const lessonBranch = data.settings.branches.find((b) => b.id === lesson.branchId);
                const liveStatus = computeLiveDisplayStatus(lesson);
                const plannedMinutes = Math.round(
                  (new Date(lesson.endAt).getTime() - new Date(lesson.startAt).getTime()) / 60_000
                );
                return (
                  <Card key={lesson.id} className="!p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-[var(--color-text)] dark:text-slate-50">
                          {formatTime(lesson.startAt)} · {student?.name}
                        </p>
                        <p className="text-sm text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
                          {lesson.instrument} · {lessonBranch?.shortName ?? "—"} · {room?.name}
                          {lesson.type === "makeup" ? " · Telafi" : ""}
                        </p>
                      </div>
                      <LessonStatusBadge status={resolveLessonFinalStatus(lesson)} plannedMakeup={lesson.type === "makeup"} />
                    </div>
                    {liveStatus === "in_progress" && lesson.actualStartAt ? (
                      <LessonCountdown actualStartAt={lesson.actualStartAt} plannedDurationMinutes={plannedMinutes} />
                    ) : null}
                    {/* 2026-09-17 — yoklama yalnız yöneticide; öğretmen durumu yalnız görür. */}
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between gap-2 px-1">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]" />
              <h2 className="text-sm font-semibold text-[var(--color-text)] dark:text-slate-200">Öğrencilerim</h2>
            </div>
            {students.length > 5 ? (
              <Link href="/ogretmen/ogrenciler" className="text-xs font-medium text-cyan-700 hover:text-cyan-800">
                Tümünü gör ({students.length}) →
              </Link>
            ) : null}
          </div>
          <div className="space-y-2">
            {students.length === 0 ? (
              <Card>
                <p className="text-sm text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">Aktif öğrenciniz yok.</p>
              </Card>
            ) : (
              students.slice(0, 5).map((s) => (
                <Link key={s.id} href={`/ogretmen/ogrenciler/${s.id}`} className="block">
                  <Card className="!p-3 transition hover:border-cyan-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-[var(--color-text)] dark:text-slate-50">{s.name}</p>
                        <p className="text-xs text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
                          {s.instruments.join(", ")} · Veli: {s.parentName}
                        </p>
                        {effectiveStudentTypes(s).length > 0 || s.targetExam ? (
                          <p className="mt-0.5 text-xs text-amber-600">
                            {[effectiveStudentTypes(s).join(", "), s.targetExam].filter(Boolean).join(" · ")}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge>{s.packageName.split("—")[0]?.trim()}</Badge>
                        <span className="text-[11px] font-medium text-cyan-700">Çalışma alanı →</span>
                      </div>
                    </div>
                  </Card>
                </Link>
              ))
            )}
          </div>
        </section>

        <section>
          <div className="mb-2 flex items-center gap-2 px-1">
            <Wallet className="h-4 w-4 text-cyan-700" />
            <h2 className="text-sm font-semibold text-[var(--color-text)] dark:text-slate-200">Hakedişim</h2>
          </div>
          <Card className="!p-4">
            <p className="text-xs text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
              {format(now, "MMMM yyyy", { locale: tr })}
            </p>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-lg font-semibold text-[var(--color-text)] dark:text-slate-50">{currentMonthEarnings.totalLessons}</p>
                <p className="text-[11px] text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">Ders</p>
              </div>
              <div>
                <p className="text-lg font-semibold text-[var(--color-text)] dark:text-slate-50">{currentMonthEarnings.totalMinutes}</p>
                <p className="text-[11px] text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">Dakika</p>
              </div>
              <div>
                <p className="text-lg font-semibold text-emerald-700">
                  {formatMoney(currentMonthEarnings.totalAmount)}
                </p>
                <p className="text-[11px] text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">Hakediş</p>
              </div>
            </div>
            {currentMonthEarnings.missingFeeRuleLessonIds.length > 0 ? (
              <p className="mt-3 rounded-lg bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
                {currentMonthEarnings.missingFeeRuleLessonIds.length} derste ücret kuralı tanımlı değil —
                kurumunuzla iletişime geçin.
              </p>
            ) : null}
          </Card>

          {recentPayouts.length > 0 ? (
            <div className="mt-2 space-y-2">
              {recentPayouts.map((p) => (
                <Link key={p.id} href={`/ogretmen/hakedis/${p.id}`}>
                  <Card className="!p-3 transition hover:border-cyan-200">
                    <div className="flex items-center justify-between text-sm">
                      <div>
                        <p className="font-medium text-[var(--color-text)] dark:text-slate-200">
                          {formatDate(p.periodStart)} – {formatDate(p.periodEnd)}
                        </p>
                        <p className="text-xs text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">{formatMoney(payoutNetAmount(p))}</p>
                      </div>
                      <Badge status={p.status} />
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          ) : null}
          <Link
            href="/ogretmen/hakedis"
            className="mt-3 inline-block text-sm font-medium text-cyan-700 hover:text-cyan-800"
          >
            Geçmiş hakedişlerim →
          </Link>
        </section>

        <section>
          <Link href="/ogretmen/is-takip">
            <Card className="!p-4 transition hover:border-cyan-200">
              <p className="text-sm font-semibold text-[var(--color-text)] dark:text-slate-50">İş Takip</p>
              <p className="mt-0.5 text-xs text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
                Size atanan/takipçisi olduğunuz görevler
              </p>
            </Card>
          </Link>
        </section>

        <section>
          <Link href="/ogretmen/geri-bildirim">
            <Card className="!p-4 transition hover:border-cyan-200">
              <p className="text-sm font-semibold text-[var(--color-text)] dark:text-slate-50">Geri Bildirim Özeti</p>
              <p className="mt-0.5 text-xs text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
                Anonim, toplulaştırılmış — yeterli yanıt olduğunda görünür
              </p>
            </Card>
          </Link>
        </section>

        <section>
          <h2 className="mb-2 px-1 text-sm font-semibold text-[var(--color-text)] dark:text-slate-200">Yaklaşan seanslar (5 gün içinde)</h2>
          <div className="space-y-2">
            {weekLessons.map((l) => {
              const student = data.students.find((s) => s.id === l.studentId);
              return (
                <Card key={l.id} className="!p-3">
                  <div className="flex items-center justify-between text-sm">
                    <div>
                      <p className="font-medium text-[var(--color-text)] dark:text-slate-200">{formatDateTime(l.startAt)}</p>
                      <p className="text-xs text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
                        {student?.name} · {l.instrument}
                      </p>
                    </div>
                    {l.type === "makeup" ? <Badge status="makeup" /> : null}
                  </div>
                </Card>
              );
            })}
          </div>
        </section>

        <p className="px-1 text-center text-[11px] text-[var(--color-text-muted)]">
          Demo ·{" "}
          <Link href="/panel" className="text-cyan-700">
            Yönetim paneli
          </Link>
        </p>
      </main>
    </div>
  );
}

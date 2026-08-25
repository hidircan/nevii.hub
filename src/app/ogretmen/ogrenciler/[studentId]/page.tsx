import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BookOpen,
  CalendarDays,
  ClipboardList,
  FileText,
  GraduationCap,
  User,
} from "lucide-react";
import { BackButton } from "@/components/back-button";
import { readData } from "@/lib/store";
import { requireSessionContext } from "@/lib/auth/session";
import { findOwnStudent, ownStudentLessons } from "@/lib/teacher-portal-scope";
import {
  getAssessmentReportTool,
  listCurriculumForStudentTool,
  listHomeworkForStudentTool,
  listHomeworkSubmissionsTool,
  listTeachingMaterialsForStudentTool,
} from "@/lib/services";
import { computeOverallScore } from "@/lib/assessment/score";
import { Badge, Card, EmptyState } from "@/components/ui";
import { HomeworkCreateForm } from "@/components/homework-create-form";
import { HomeworkReviewForm } from "@/components/homework-review-form";
import { LessonAssessmentForm } from "@/components/lesson-assessment-form";
import { CurriculumTopicForm } from "@/components/curriculum-topic-form";
import { CurriculumTopicUpdateForm } from "@/components/curriculum-topic-update-form";
import { StudentFeedbackForm } from "@/components/student-feedback-form";
import { getOwnStudentFeedbackThisMonthTool } from "@/lib/services";
import { ClipboardCheck } from "lucide-react";
import { formatDate, formatDateTime, formatTime } from "@/lib/utils";
import { computeLiveDisplayStatus } from "@/lib/lesson-live-status";
import { LessonLiveActions } from "@/components/lesson-live-actions";
import type { StudentCurriculumTopic } from "@/lib/types";
import { effectiveStudentTypes, formatStudentTypes } from "@/lib/student-types";

export const dynamic = "force-dynamic";

/**
 * Öğretmen öğrenci çalışma alanı.
 *
 * Güvenlik: studentId URL'den gelir ama teacherId ASLA URL'den alınmaz —
 * yalnızca oturumdan. `findOwnStudent` kaydın bu öğretmene ait olduğunu
 * doğrular; değilse (başka öğretmen / tenant dışı id) "bulunamadı"
 * gösterilir, hiçbir öğrenci verisi sızmaz.
 */
export default async function TeacherStudentWorkspacePage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;

  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect(`/login?next=/ogretmen/ogrenciler/${studentId}`);
  }
  if (session.role === "STUDENT") redirect("/ogrenci");

  const data = await readData();
  // Oturum teacherId yoksa (admin demo) rastgele öğretmen düşme — erişim yok.
  const teacherId = session.teacherId;
  if (!teacherId) {
    return (
      <NotFoundShell
        backHref="/ogretmen"
        message="Bu sayfaya yalnızca öğretmen hesabıyla erişilebilir."
      />
    );
  }

  const teacher = data.teachers.find((t) => t.id === teacherId);
  if (!teacher) {
    return <NotFoundShell backHref="/ogretmen" message="Öğretmen kaydı bulunamadı." />;
  }

  const student = findOwnStudent(data.students, studentId, teacherId);
  if (!student) {
    return (
      <NotFoundShell
        backHref="/ogretmen"
        message="Öğrenci bulunamadı veya size atanmamış."
      />
    );
  }

  const branch = data.settings.branches.find((b) => b.id === student.branchId);
  const lessons = ownStudentLessons(data.lessons, teacherId, student.id);
  // Aktif/yaklaşan: in_progress + scheduled (gelecek veya son 6 saatte gecikmiş).
  // Eşik ISO string karşılaştırması — sunucu render anında sabit.
  const delayedCutoffIso = new Date(Date.parse(new Date().toISOString()) - 6 * 60 * 60 * 1000).toISOString();
  const upcoming = [...lessons]
    .filter((l) => {
      if (l.status === "in_progress") return true;
      if (l.status !== "scheduled") return false;
      return l.startAt >= delayedCutoffIso;
    })
    .sort((a, b) => a.startAt.localeCompare(b.startAt))
    .slice(0, 8);
  const upcomingIds = new Set(upcoming.map((l) => l.id));
  const past = lessons
    .filter((l) => !upcomingIds.has(l.id) && l.status !== "in_progress")
    .slice(0, 8);

  const lessonIds = new Set(lessons.map((l) => l.id));
  const attendances = data.attendances.filter((a) => lessonIds.has(a.lessonId));
  const attendanceSummary = {
    present: attendances.filter((a) => a.status === "present").length,
    late: attendances.filter((a) => a.status === "late").length,
    absent: attendances.filter((a) => a.status === "absent").length,
    cancelled: attendances.filter((a) => a.status === "cancelled_by_school").length,
  };

  // Ödev / materyal — tool katmanı TEACHER sahipliğini zaten zorlar.
  const homeworkResult = await listHomeworkForStudentTool(session, { studentId: student.id });
  const homeworkList = homeworkResult.ok ? homeworkResult.data.homework : [];
  const homeworkWithSubs = await Promise.all(
    homeworkList.map(async (hw) => {
      const subResult = await listHomeworkSubmissionsTool(session, { homeworkId: hw.id });
      return {
        homework: hw,
        submissions: subResult.ok ? subResult.data.submissions : [],
      };
    })
  );
  const materialsResult = await listTeachingMaterialsForStudentTool(session, {
    studentId: student.id,
  });
  const materials = materialsResult.ok ? materialsResult.data.materials : [];

  // Gelişim — EPIC 7 LessonAssessment modeli (ikinci paralel form yok).
  const assessmentReport = await getAssessmentReportTool(session, { studentId: student.id });
  const pastAssessments = assessmentReport.ok ? assessmentReport.data.assessments : [];
  const trend = assessmentReport.ok ? assessmentReport.data.trend : [];
  const assessmentLessons = lessons.map((l) => ({ id: l.id, startAt: l.startAt }));

  const curriculumResult = await listCurriculumForStudentTool(session, { studentId: student.id });
  const curriculumTopics = (curriculumResult.ok ? curriculumResult.data.topics : []) as StudentCurriculumTopic[];
  const curriculumOverall = curriculumResult.ok ? curriculumResult.data.overallPercent : 0;
  const curriculumExplain = curriculumResult.ok
    ? curriculumResult.data.progressExplanation
    : "Müfredat yüklenemedi.";

  const ownFeedbackResult = await getOwnStudentFeedbackThisMonthTool(session, { studentId: student.id });
  const ownFeedback = ownFeedbackResult.ok ? ownFeedbackResult.data.feedback : null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-cyan-50 to-slate-50">
      <header className="border-b border-cyan-100 bg-[var(--color-surface)]/90 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-4">
          <BackButton fallbackHref="/ogretmen" />
          <p className="text-sm font-semibold text-[var(--color-text)] dark:text-slate-50">Öğrenci</p>
          <span className="w-10" aria-hidden />
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-4 px-4 py-6 pb-24">
        {/* Genel bakış */}
        <Card className="border-cyan-100">
          <div className="flex items-start gap-3">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white"
              style={{ background: teacher.color }}
              aria-hidden
            >
              {student.name
                .split(" ")
                .map((p) => p[0])
                .join("")
                .slice(0, 2)}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-semibold text-[var(--color-text)] dark:text-slate-50">{student.name}</h1>
              <p className="text-sm text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
                {student.instruments.join(", ")}
                {branch ? ` · ${branch.shortName}` : ""}
              </p>
              <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                Veli: {student.parentName} · {student.parentPhone}
              </p>
            </div>
            <Badge>{student.packageName.split("—")[0]?.trim()}</Badge>
          </div>
        </Card>

        <nav aria-label="Bölümler" className="flex flex-wrap gap-2 px-1">
          <SectionChip href="#genel" icon={<User className="h-3 w-3" />} label="Genel" />
          <SectionChip href="#dersler" icon={<CalendarDays className="h-3 w-3" />} label="Dersler" />
          <SectionChip href="#odevler" icon={<ClipboardList className="h-3 w-3" />} label="Ödevler" />
          <SectionChip href="#materyal" icon={<BookOpen className="h-3 w-3" />} label="Materyal" />
          <SectionChip href="#gelisim" icon={<GraduationCap className="h-3 w-3" />} label="Gelişim" />
          <SectionChip href="#degerlendirme" icon={<ClipboardCheck className="h-3 w-3" />} label="Değerlendirme" />
        </nav>

        <section id="genel" aria-labelledby="genel-heading">
          <h2 id="genel-heading" className="mb-2 px-1 text-sm font-semibold text-[var(--color-text)] dark:text-slate-200">
            Genel bakış
          </h2>
          <Card className="!p-4">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <ProfileField label="Eğitim türü" value={formatStudentTypes(effectiveStudentTypes(student))} />
              <ProfileField label="Seviye" value={student.level ?? "Belirtilmemiş"} />
              <ProfileField label="Hedef" value={student.targetExam ?? "—"} />
              <ProfileField
                label="Haftalık ders"
                value={`${student.weeklyLessonCount} seans`}
              />
              <ProfileField
                label="Kayıt başlangıcı"
                value={
                  student.enrollmentStartDate
                    ? formatDate(student.enrollmentStartDate)
                    : "—"
                }
              />
              <ProfileField
                label="Paket"
                value={student.packageName.split("—")[0]?.trim() ?? "—"}
              />
            </dl>
            {student.specialNotes || student.notes ? (
              <p className="mt-3 rounded-lg bg-[var(--color-surface-muted)] px-3 py-2 text-xs text-[var(--color-text-muted)] dark:bg-slate-800 dark:text-slate-300">
                {student.specialNotes || student.notes}
              </p>
            ) : null}
          </Card>

          <div className="mt-2 grid grid-cols-4 gap-2">
            <MiniStat label="Geldi" value={attendanceSummary.present} />
            <MiniStat label="Geç" value={attendanceSummary.late} />
            <MiniStat label="Yok" value={attendanceSummary.absent} />
            <MiniStat label="İptal" value={attendanceSummary.cancelled} />
          </div>
        </section>

        <section id="dersler" aria-labelledby="dersler-heading">
          <h2 id="dersler-heading" className="mb-2 px-1 text-sm font-semibold text-[var(--color-text)] dark:text-slate-200">
            Dersler
          </h2>

          <p className="mb-1.5 px-1 text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
            Yaklaşan
          </p>
          {upcoming.length === 0 ? (
            <EmptyState title="Yaklaşan ders yok" description="Planlanmış seans bulunmuyor." />
          ) : (
            <div className="mb-3 space-y-2">
              {upcoming.map((lesson) => {
                const room = data.rooms.find((r) => r.id === lesson.roomId);
                const liveStatus = computeLiveDisplayStatus(lesson);
                return (
                  <Card key={lesson.id} className="!p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-[var(--color-text)] dark:text-slate-50">
                          {formatDateTime(lesson.startAt)}
                        </p>
                        <p className="text-xs text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
                          {lesson.instrument} · {room?.name ?? "—"}
                          {lesson.type === "makeup" ? " · Telafi" : ""}
                        </p>
                      </div>
                      <Badge status={liveStatus} />
                    </div>
                    {(liveStatus === "scheduled" ||
                      liveStatus === "delayed" ||
                      liveStatus === "in_progress") && (
                      <LessonLiveActions lessonId={lesson.id} displayStatus={liveStatus} />
                    )}
                  </Card>
                );
              })}
            </div>
          )}

          <p className="mb-1.5 px-1 text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
            Geçmiş
          </p>
          {past.length === 0 ? (
            <EmptyState title="Geçmiş ders yok" />
          ) : (
            <div className="space-y-2">
              {past.map((lesson) => {
                const attendance = data.attendances.find((a) => a.lessonId === lesson.id);
                return (
                  <Card key={lesson.id} className="!p-3">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <div>
                        <p className="font-medium text-[var(--color-text)] dark:text-slate-200">
                          {formatDate(lesson.startAt)} · {formatTime(lesson.startAt)}
                        </p>
                        <p className="text-xs text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">{lesson.instrument}</p>
                      </div>
                      <Badge status={attendance?.status ?? lesson.status} />
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        <section id="odevler" aria-labelledby="odevler-heading">
          <h2 id="odevler-heading" className="mb-2 px-1 text-sm font-semibold text-[var(--color-text)] dark:text-slate-200">
            Ödevler
          </h2>

          <Card className="mb-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-cyan-600">
              Bu öğrenciye ödev ver
            </p>
            <HomeworkCreateForm
              students={[{ id: student.id, name: student.name }]}
              defaultStudentId={student.id}
              lockStudent
            />
          </Card>

          {homeworkWithSubs.length === 0 ? (
            <EmptyState
              title="Henüz ödev yok"
              description="Yukarıdan bu öğrenciye ilk ödevi verebilirsiniz."
            />
          ) : (
            <div className="space-y-2">
              {homeworkWithSubs.map(({ homework: hw, submissions }) => (
                <Card key={hw.id} className="!p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-[var(--color-text)] dark:text-slate-50">{hw.title}</p>
                      <p className="mt-1 text-sm text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">{hw.description}</p>
                      <p className="mt-1 text-xs text-[var(--color-text-muted)]">Son teslim: {formatDate(hw.dueDate)}</p>
                    </div>
                    <Badge status={submissions.length > 0 ? "completed" : "pending"}>
                      {submissions.length > 0 ? "Teslim edildi" : "Bekliyor"}
                    </Badge>
                  </div>
                  {submissions.map((sub) => (
                    <div
                      key={sub.id}
                      className="mt-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-2.5 dark:border-slate-800 dark:bg-slate-800/50"
                    >
                      <p className="text-xs text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
                        Teslim: {formatDateTime(sub.submittedAt)}
                        {sub.fileName ? ` · ${sub.fileName}` : ""}
                      </p>
                      {sub.note ? (
                        <p className="mt-1 text-sm text-[var(--color-text-muted)] dark:text-slate-300">{sub.note}</p>
                      ) : null}
                      {sub.fileData ? (
                        <a
                          href={`/api/v1/homework-submissions/${sub.id}/file`}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-block text-xs font-medium text-cyan-700 hover:underline"
                        >
                          Dosyayı görüntüle
                        </a>
                      ) : null}
                      {sub.teacherFeedback ? (
                        <p className="mt-2 rounded-md bg-emerald-50 p-1.5 text-xs font-medium text-emerald-800">
                          Geri bildirim: {sub.teacherFeedback}
                        </p>
                      ) : (
                        <div className="mt-2">
                          <HomeworkReviewForm submissionId={sub.id} />
                        </div>
                      )}
                    </div>
                  ))}
                </Card>
              ))}
            </div>
          )}
        </section>

        <section id="materyal" aria-labelledby="materyal-heading">
          <h2 id="materyal-heading" className="mb-2 px-1 text-sm font-semibold text-[var(--color-text)] dark:text-slate-200">
            Materyal / müfredat
          </h2>

          <Card className="mb-3 !p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Profil</p>
            <dl className="mt-2 grid grid-cols-2 gap-3 text-sm">
              <ProfileField label="Program türü" value={formatStudentTypes(effectiveStudentTypes(student))} />
              <ProfileField label="Seviye" value={student.level ?? "Belirtilmemiş"} />
              <ProfileField label="Hedef sınav" value={student.targetExam ?? "—"} />
              <ProfileField label="Enstrüman" value={student.instruments.join(", ") || "—"} />
            </dl>
          </Card>

          <Card className="mb-3 !p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-cyan-600">Konu ilerlemesi</p>
              <p className="text-lg font-semibold text-cyan-800" aria-label="Genel ilerleme yüzdesi">
                %{curriculumOverall}
              </p>
            </div>
            <p className="mt-1 text-[11px] text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">{curriculumExplain}</p>
          </Card>

          <Card className="mb-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-cyan-600">Yeni konu hedefi</p>
            <CurriculumTopicForm studentId={student.id} />
          </Card>

          {curriculumTopics.length === 0 ? (
            <EmptyState
              title="Henüz konu yok"
              description="Yukarıdan bu öğrenci için müfredat konuları ekleyebilirsiniz."
            />
          ) : (
            <div className="mb-4 space-y-2">
              {curriculumTopics.map((topic) => (
                <Card key={topic.id} className="!p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-[var(--color-text)] dark:text-slate-50">{topic.title}</p>
                      {topic.description ? (
                        <p className="mt-0.5 text-sm text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">{topic.description}</p>
                      ) : null}
                      <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                        Son güncelleme: {formatDateTime(topic.updatedAt)} · {topic.updatedBy}
                      </p>
                      {topic.notes ? (
                        <p className="mt-1 text-xs text-[var(--color-text-muted)]">Not: {topic.notes}</p>
                      ) : null}
                    </div>
                    <div className="text-right">
                      <Badge status={topic.status}>{topic.status}</Badge>
                      <p className="mt-1 text-sm font-semibold text-cyan-700">%{topic.progressPercent}</p>
                    </div>
                  </div>
                  {topic.history?.length ? (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-[11px] font-medium text-[var(--color-text-muted)]">
                        Geçmiş ({topic.history.length})
                      </summary>
                      <ul className="mt-1 space-y-1 text-[11px] text-[var(--color-text-muted)]">
                        {[...topic.history].reverse().slice(0, 8).map((ev, i) => (
                          <li key={`${topic.id}-h-${i}`}>
                            {formatDateTime(ev.at)} · {ev.action}
                            {ev.fromProgress !== undefined && ev.toProgress !== undefined
                              ? ` · %${ev.fromProgress}→%${ev.toProgress}`
                              : ""}
                            {ev.note ? ` — ${ev.note}` : ""} · {ev.byUserId}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                  <CurriculumTopicUpdateForm
                    topicId={topic.id}
                    currentStatus={topic.status}
                    currentProgress={topic.progressPercent}
                  />
                </Card>
              ))}
            </div>
          )}

          <p className="mb-1.5 px-1 text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
            Paylaşılan materyaller
          </p>
          {materials.length === 0 ? (
            <EmptyState
              title="Bu öğrenciye görünen materyal yok"
              description="Materyal paylaşımı için Materyaller sayfasını kullanın."
            />
          ) : (
            <div className="space-y-2">
              {materials.map((m) => (
                <Card key={m.id} className="!p-4">
                  <p className="font-medium text-[var(--color-text)] dark:text-slate-50">{m.title}</p>
                  <p className="mt-1 text-sm text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">{m.description}</p>
                  <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                    {[m.targetStudentType, m.targetInstrument, m.targetLevel].filter(Boolean).join(" · ") ||
                      "Tüm öğrencilere görünür"}
                  </p>
                </Card>
              ))}
            </div>
          )}
          <Link
            href="/ogretmen/materyaller"
            className="mt-2 inline-block text-sm font-medium text-cyan-700 hover:text-cyan-800"
          >
            Materyal paylaş →
          </Link>
        </section>

        <section id="gelisim" aria-labelledby="gelisim-heading">
          <h2 id="gelisim-heading" className="mb-2 px-1 text-sm font-semibold text-[var(--color-text)] dark:text-slate-200">
            Gelişim
          </h2>

          {trend.length > 0 ? (
            <Card className="mb-3 !p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                Son skor trendi
              </p>
              <div className="mt-2 flex flex-wrap items-end gap-2">
                {trend.map((point) => (
                  <div
                    key={point.assessmentId}
                    className="flex min-w-[3.5rem] flex-col items-center rounded-lg bg-amber-50 px-2 py-1.5"
                  >
                    <span className="text-sm font-semibold text-amber-700">
                      {point.overallScore.toFixed(1)}
                    </span>
                    <span className="text-[10px] text-[var(--color-text-muted)]">
                      {formatDate(point.date, "d MMM")}
                    </span>
                  </div>
                ))}
              </div>
              {pastAssessments.length > 0 ? (
                <p className="mt-2 text-xs text-[var(--color-text-muted)]">
                  Son ortalama:{" "}
                  <span className="font-semibold text-amber-700">
                    {computeOverallScore(pastAssessments[0]!).toFixed(1)} / 5
                  </span>
                  {" · "}
                  <Link
                    href={`/degerlendirme/rapor/${student.id}`}
                    className="font-medium text-cyan-700 hover:underline"
                  >
                    4 haftalık rapor
                  </Link>
                </p>
              ) : null}
            </Card>
          ) : null}

          <Card className="mb-3">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-cyan-600">
              Yeni gelişim değerlendirmesi
            </p>
            {assessmentLessons.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
                Bu öğrenciyle henüz ders kaydı yok; değerlendirme bir derse bağlanır.
              </p>
            ) : (
              <LessonAssessmentForm
                studentId={student.id}
                lessons={assessmentLessons}
                defaultTeacherName={teacher.name}
              />
            )}
          </Card>

          <p className="mb-1.5 px-1 text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
            Geçmiş değerlendirmeler
          </p>
          {pastAssessments.length === 0 ? (
            <EmptyState
              title="Henüz değerlendirme yok"
              description="Yukarıdaki formla ilk gelişim kaydını oluşturabilirsiniz."
            />
          ) : (
            <div className="space-y-2">
              {pastAssessments.map((a) => (
                <Link key={a.id} href={`/degerlendirme/${a.id}`}>
                  <Card className="!p-4 transition hover:border-amber-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-amber-500" aria-hidden />
                        <div>
                          <p className="text-sm font-medium text-[var(--color-text)] dark:text-slate-50">
                            {formatDate(a.createdAt, "d MMMM yyyy")}
                          </p>
                          <p className="text-xs text-[var(--color-text-muted)] line-clamp-1">{a.strengthNote}</p>
                        </div>
                      </div>
                      <p className="text-sm font-semibold text-amber-700">
                        {computeOverallScore(a).toFixed(1)} / 5
                      </p>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section id="degerlendirme" aria-labelledby="degerlendirme-heading">
          <h2 id="degerlendirme-heading" className="mb-2 px-1 text-sm font-semibold text-[var(--color-text)] dark:text-slate-200">
            Öğrenci Değerlendirmesi
          </h2>
          <Card className="!p-4">
            <StudentFeedbackForm
              studentId={student.id}
              studentName={student.name}
              initialFeedback={ownFeedback ? { scores: ownFeedback.scores, comment: ownFeedback.comment } : null}
            />
          </Card>
        </section>
      </main>
    </div>
  );
}

function NotFoundShell({ backHref, message }: { backHref: string; message: string }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-cyan-50 to-slate-50">
      <header className="border-b border-cyan-100 bg-[var(--color-surface)]/90 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center gap-3 px-4 py-4">
          <BackButton fallbackHref={backHref} />
        </div>
      </header>
      <main className="mx-auto max-w-lg px-4 py-8">
        <EmptyState title="Bulunamadı" description={message} />
      </main>
    </div>
  );
}

function SectionChip({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-text-muted)] hover:border-cyan-200 hover:text-cyan-800"
    >
      {icon}
      {label}
    </a>
  );
}

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">{label}</dt>
      <dd className="mt-0.5 font-medium text-[var(--color-text)] dark:text-slate-200">{value}</dd>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <Card className="!p-2 text-center">
      <p className="text-lg font-semibold text-[var(--color-text)] dark:text-slate-50">{value}</p>
      <p className="text-[10px] text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">{label}</p>
    </Card>
  );
}

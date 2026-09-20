import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, EmptyState } from "@/components/ui";
import {
  getAssessmentReportTool,
  listCurriculumForStudentTool,
  listHomeworkForStudentTool,
  listTeachingMaterialsForStudentTool,
  listTeacherFeedbackTool,
  listStudentFeedbackTool,
} from "@/lib/services";
import { AiFeedbackSummaryButton } from "@/components/ai-feedback-summary-button";
import { TEACHER_FEEDBACK_CRITERIA } from "@/lib/teacher-feedback";
import { STUDENT_FEEDBACK_CRITERIA } from "@/lib/student-feedback";
import type {
  TeacherFeedback,
  TeacherFeedbackCriterionKey,
  StudentFeedback,
  StudentFeedbackCriterionKey,
} from "@/lib/types";
import { computeOverallScore } from "@/lib/assessment/score";
import { formatDate } from "@/lib/utils";
import { loadStudentPageContext } from "../_context";

export const dynamic = "force-dynamic";

/**
 * Gelişim sekmesi — müfredat ilerlemesi, değerlendirme raporları, ödev/materyal
 * ve karşılıklı değerlendirmeler. Hepsi "öğrenci ne kadar ilerledi?" sorusunun
 * parçası; eski sayfada üç ayrı bölüm hâlinde dağıtılmıştı.
 */
export default async function StudentProgressTab({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params;
  const { session, data, student, canManage } = await loadStudentPageContext(studentId);
  if (!student) notFound();

  const [homeworkResult, materialsResult, curriculumResult, assessmentResult] = await Promise.all([
    listHomeworkForStudentTool(session, { studentId: student.id }),
    listTeachingMaterialsForStudentTool(session, { studentId: student.id }),
    listCurriculumForStudentTool(session, { studentId: student.id }),
    getAssessmentReportTool(session, { studentId: student.id }),
  ]);

  const homework = homeworkResult.ok ? homeworkResult.data.homework : [];
  const materials = materialsResult.ok ? materialsResult.data.materials : [];
  const curriculumTopics = curriculumResult.ok ? curriculumResult.data.topics : [];
  const curriculumOverall = curriculumResult.ok ? curriculumResult.data.overallPercent : 0;
  const assessments = assessmentResult.ok ? assessmentResult.data.assessments : [];

  // Karşılıklı değerlendirmeler yalnız yöneticiye ve yalnız bu öğrenciye kapsamlı.
  let teacherFeedbackAboutTeachers: TeacherFeedback[] = [];
  let studentFeedbackFromTeachers: StudentFeedback[] = [];
  if (canManage) {
    const [tfResult, sfResult] = await Promise.all([
      listTeacherFeedbackTool(session, {}),
      listStudentFeedbackTool(session, { studentId: student.id }),
    ]);
    teacherFeedbackAboutTeachers = tfResult.ok ? tfResult.data.feedback.filter((f) => f.studentId === student.id) : [];
    studentFeedbackFromTeachers = sfResult.ok ? sfResult.data.feedback : [];
  }

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Eğitim / Müzikal Gelişim</h2>
        <Card className="mb-3 !p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
              Müfredat ilerlemesi
            </p>
            <p className="text-lg font-semibold text-[var(--color-primary)]">%{curriculumOverall}</p>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-muted)]">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.min(100, Math.max(0, curriculumOverall))}%`, background: "var(--color-primary)" }}
            />
          </div>
        </Card>
        {curriculumTopics.length > 0 ? (
          <div className="mb-3 grid gap-2 sm:grid-cols-2">
            {curriculumTopics.slice(0, 8).map((topic) => (
              <Card key={topic.id} className="!p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-[var(--color-text)]">{topic.title}</p>
                  <Badge status={topic.status}>{topic.status}</Badge>
                </div>
              </Card>
            ))}
          </div>
        ) : null}
        {assessments.length === 0 ? (
          <EmptyState title="Henüz gelişim değerlendirmesi yok" />
        ) : (
          <div className="space-y-2">
            {assessments.slice(0, 5).map((a) => (
              <Link key={a.id} href={`/degerlendirme/${a.id}`}>
                <Card className="!p-3 transition hover:border-[var(--color-primary)]">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-[var(--color-text)]">{formatDate(a.createdAt)}</p>
                    <p className="text-sm font-semibold text-[var(--color-primary)]">
                      {computeOverallScore(a).toFixed(1)} / 5
                    </p>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
        <Link
          href={`/degerlendirme/rapor/${student.id}`}
          className="mt-2 inline-block text-sm font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]"
        >
          Tam raporu görüntüle →
        </Link>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Ödevler ve Materyaller</h2>
        {homework.length === 0 ? (
          <EmptyState title="Ödev yok" />
        ) : (
          <div className="mb-3 grid gap-2 sm:grid-cols-2">
            {homework.slice(0, 6).map((hw) => (
              <Card key={hw.id} className="!p-3">
                <p className="text-sm font-medium text-[var(--color-text)]">{hw.title}</p>
                <p className="text-xs text-[var(--color-text-muted)]">Son teslim: {formatDate(hw.dueDate)}</p>
              </Card>
            ))}
          </div>
        )}
        {materials.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {materials.slice(0, 6).map((m) => (
              <Card key={m.id} className="!p-3">
                <p className="text-sm font-medium text-[var(--color-text)]">{m.title}</p>
              </Card>
            ))}
          </div>
        ) : null}
      </section>

      {canManage ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Karşılıklı Değerlendirmeler</h2>
          <div className="mb-4">
            <AiFeedbackSummaryButton subject="student" subjectId={student.id} />
          </div>

          <div className="mb-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
              Öğrencinin öğretmen değerlendirmeleri
            </p>
            {teacherFeedbackAboutTeachers.length === 0 ? (
              <EmptyState
                title="Henüz değerlendirme yok"
                description="Bu öğrencinin öğretmenleri hakkında yaptığı değerlendirme bulunmuyor."
              />
            ) : (
              <div className="space-y-2">
                {teacherFeedbackAboutTeachers.map((f) => {
                  const t = data.teachers.find((tt) => tt.id === f.teacherId);
                  return (
                    <Card key={f.id} className="!p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium text-[var(--color-text)]">
                          {t?.name ?? "Bilinmeyen öğretmen"}{" "}
                          <span className="text-xs font-normal text-[var(--color-text-muted)]">
                            · {formatDate(f.createdAt)}
                          </span>
                        </p>
                        <Badge status={f.status}>{f.status}</Badge>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                        {TEACHER_FEEDBACK_CRITERIA.map(
                          ({ key, label }: { key: TeacherFeedbackCriterionKey; label: string }) => (
                            <div key={key} className="text-center">
                              <p className="text-sm font-semibold text-[var(--color-primary)]">{f.scores[key]}</p>
                              <p className="text-[10px] text-[var(--color-text-muted)]">{label}</p>
                            </div>
                          )
                        )}
                      </div>
                      {f.comment ? <p className="mt-2 text-xs text-[var(--color-text-muted)]">{f.comment}</p> : null}
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
              Öğretmenlerin öğrenci değerlendirmeleri
            </p>
            {studentFeedbackFromTeachers.length === 0 ? (
              <EmptyState
                title="Henüz değerlendirme yok"
                description="Öğretmenlerin bu öğrenci için yaptığı değerlendirme bulunmuyor."
              />
            ) : (
              <div className="space-y-2">
                {studentFeedbackFromTeachers.map((f) => {
                  const t = data.teachers.find((tt) => tt.id === f.teacherId);
                  return (
                    <Card key={f.id} className="!p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium text-[var(--color-text)]">
                          {t?.name ?? "Bilinmeyen öğretmen"}{" "}
                          <span className="text-xs font-normal text-[var(--color-text-muted)]">
                            · {formatDate(f.createdAt)}
                          </span>
                        </p>
                        <Badge status={f.status}>{f.status}</Badge>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                        {STUDENT_FEEDBACK_CRITERIA.map(
                          ({ key, label }: { key: StudentFeedbackCriterionKey; label: string }) => (
                            <div key={key} className="text-center">
                              <p className="text-sm font-semibold text-[var(--color-primary)]">{f.scores[key]}</p>
                              <p className="text-[10px] text-[var(--color-text-muted)]">{label}</p>
                            </div>
                          )
                        )}
                      </div>
                      {f.comment ? <p className="mt-2 text-xs text-[var(--color-text-muted)]">{f.comment}</p> : null}
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}

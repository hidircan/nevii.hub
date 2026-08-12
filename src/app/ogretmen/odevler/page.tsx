import { redirect } from "next/navigation";
import { BackButton } from "@/components/back-button";
import { readData } from "@/lib/store";
import { requireSessionContext } from "@/lib/auth/session";
import { listHomeworkForTeacherTool, listHomeworkSubmissionsTool } from "@/lib/services";
import { Badge, Card, EmptyState } from "@/components/ui";
import { HomeworkCreateForm } from "@/components/homework-create-form";
import { HomeworkReviewForm } from "@/components/homework-review-form";
import { formatDate, formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * EPIC 6D (IMPLEMENTATION_PLAN.md) — öğretmenin kendi öğrencilerine ödev
 * verdiği ve teslimlere geri bildirim yazdığı ekran. Yalnızca kendi
 * öğrencileri seçilebilir (tool katmanında zaten zorlanıyor, bkz.
 * createHomeworkTool); bu sayfa `/ogretmen`'e DOKUNMADAN ayrı bir
 * kardeş route olarak eklendi (o sayfa önceki oturumdan kalma
 * değişikliklerle iç içe geçmişti — EPIC 7/8/9 ile aynı gerekçe).
 */
export default async function TeacherHomeworkPage() {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/ogretmen/odevler");
  }
  if (session.role === "PARENT") redirect("/veli");

  const data = await readData();
  const teacherId = session.teacherId || "t2";
  const teacher = data.teachers.find((t) => t.id === teacherId) ?? data.teachers[0];
  if (!teacher) redirect("/login");

  const students = data.students
    .filter((s) => s.active && s.teacherId === teacher.id)
    .map((s) => ({ id: s.id, name: s.name }));

  const homeworkResult = await listHomeworkForTeacherTool(session);
  const homework = homeworkResult.ok ? homeworkResult.data.homework : [];

  const withSubmissions = await Promise.all(
    homework.map(async (hw) => {
      const result = await listHomeworkSubmissionsTool(session, { homeworkId: hw.id });
      const student = data.students.find((s) => s.id === hw.studentId);
      return {
        homework: hw,
        studentName: student?.name ?? "—",
        submissions: result.ok ? result.data.submissions : [],
      };
    })
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-cyan-50 to-slate-50">
      <header className="border-b border-cyan-100 bg-[var(--color-surface)]/90 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-4">
          <BackButton fallbackHref="/ogretmen" />
          <p className="text-sm font-semibold text-[var(--color-text)] dark:text-slate-50">Ödevler</p>
          <span className="w-10" />
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-4 px-4 py-6 pb-24">
        <Card>
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-cyan-600">
            Yeni ödev ver
          </p>
          {students.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
              Ödev verebileceğiniz aktif öğrenci bulunamadı.
            </p>
          ) : (
            <HomeworkCreateForm students={students} />
          )}
        </Card>

        <section>
          <p className="mb-2 px-1 text-sm font-semibold text-[var(--color-text)] dark:text-slate-200">
            Verdiğim ödevler
          </p>
          {withSubmissions.length === 0 ? (
            <EmptyState title="Henüz ödev vermediniz" />
          ) : (
            <div className="space-y-2">
              {withSubmissions.map(({ homework: hw, studentName, submissions }) => (
                <Card key={hw.id}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-[var(--color-text)] dark:text-slate-50">
                        {hw.title} · {studentName}
                      </p>
                      <p className="mt-1 text-sm text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">{hw.description}</p>
                      <p className="mt-1 text-xs text-[var(--color-text-muted)]">Son teslim: {formatDate(hw.dueDate)}</p>
                    </div>
                    <Badge status={submissions.length > 0 ? "completed" : "pending"}>
                      {submissions.length > 0 ? "Teslim edildi" : "Bekliyor"}
                    </Badge>
                  </div>

                  {submissions.map((s) => (
                    <div
                      key={s.id}
                      className="mt-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-2 text-xs dark:border-slate-800 dark:bg-slate-900"
                    >
                      <p className="text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
                        Teslim: {formatDateTime(s.submittedAt)}
                      </p>
                      {s.note ? <p className="mt-0.5 text-[var(--color-text-muted)] dark:text-slate-300">{s.note}</p> : null}
                      {s.fileData ? (
                        <a
                          href={`/api/v1/homework-submissions/${s.id}/file`}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-block text-cyan-600 hover:underline"
                        >
                          Dosyayı görüntüle
                        </a>
                      ) : null}
                      {s.teacherFeedback ? (
                        <p className="mt-1 rounded-md bg-emerald-50 p-1.5 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
                          Geri bildiriminiz: {s.teacherFeedback}
                        </p>
                      ) : (
                        <HomeworkReviewForm submissionId={s.id} />
                      )}
                    </div>
                  ))}
                </Card>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

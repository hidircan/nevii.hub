import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { readData } from "@/lib/store";
import { requireSessionContext } from "@/lib/auth/session";
import { listHomeworkForStudentTool, listHomeworkSubmissionsTool } from "@/lib/services";
import { Badge, Card, EmptyState } from "@/components/ui";
import { HomeworkSubmitForm } from "@/components/homework-submit-form";
import { formatDate, formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * EPIC 6B (IMPLEMENTATION_PLAN.md) — öğrencinin kendi ödevleri ve teslim
 * formu. Yalnızca `session.studentId`'ye ait ödevler görünür (tool
 * katmanında `canAccessStudent` ile kapsamlanır).
 */
export default async function StudentHomeworkPage() {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/ogrenci/odevlerim");
  }
  if (session.role === "TEACHER") redirect("/ogretmen");

  const data = await readData();
  const studentId = session.studentId || "s1";
  const student = data.students.find((s) => s.id === studentId) ?? data.students[0];
  if (!student) redirect("/login");

  const homeworkResult = await listHomeworkForStudentTool(session, { studentId: student.id });
  const homework = homeworkResult.ok ? homeworkResult.data.homework : [];

  const withSubmissions = await Promise.all(
    homework.map(async (hw) => {
      const result = await listHomeworkSubmissionsTool(session, { homeworkId: hw.id });
      return { homework: hw, submissions: result.ok ? result.data.submissions : [] };
    })
  );

  const now = new Date();

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-slate-50">
      <header className="border-b border-emerald-100 bg-[var(--color-surface)]/90 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-4">
          <Link href="/ogrenci" className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
            <ArrowLeft className="h-4 w-4" /> Geri
          </Link>
          <p className="text-sm font-semibold text-[var(--color-text)] dark:text-slate-50">Ödevlerim</p>
          <span className="w-10" />
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-3 px-4 py-6 pb-24">
        {withSubmissions.length === 0 ? (
          <EmptyState title="Henüz ödev yok" description="Öğretmeniniz ödev verdiğinde burada görünecek." />
        ) : (
          withSubmissions.map(({ homework: hw, submissions }) => {
            const overdue = !submissions.length && new Date(hw.dueDate) < now;
            return (
              <Card key={hw.id}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-[var(--color-text)] dark:text-slate-50">{hw.title}</p>
                    <p className="mt-1 text-sm text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">{hw.description}</p>
                    <p className="mt-1 text-xs text-[var(--color-text-muted)]">Son teslim: {formatDate(hw.dueDate)}</p>
                    {hw.fileData ? (
                      <a
                        href={`/api/v1/homework/${hw.id}/file`}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-block text-xs font-medium text-cyan-700 hover:underline"
                      >
                        Öğretmenin dosyasını görüntüle
                      </a>
                    ) : null}
                  </div>
                  <Badge status={submissions.length > 0 ? "completed" : overdue ? "overdue" : "pending"}>
                    {submissions.length > 0 ? "Teslim edildi" : overdue ? "Süresi geçti" : "Bekliyor"}
                  </Badge>
                </div>

                {submissions.map((s) => (
                  <div key={s.id} className="mt-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-2 text-xs dark:border-slate-800 dark:bg-slate-900">
                    <p className="text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">Teslim: {formatDateTime(s.submittedAt)}</p>
                    {s.note ? <p className="mt-0.5 text-[var(--color-text-muted)] dark:text-slate-300">{s.note}</p> : null}
                    {s.fileData ? (
                      <a
                        href={`/api/v1/homework-submissions/${s.id}/file`}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-block text-emerald-600 hover:underline"
                      >
                        Dosyayı görüntüle
                      </a>
                    ) : null}
                    {s.teacherFeedback ? (
                      <p className="mt-1 rounded-md bg-emerald-50 p-1.5 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
                        Öğretmen geri bildirimi: {s.teacherFeedback}
                      </p>
                    ) : null}
                  </div>
                ))}

                <div className="mt-2">
                  <HomeworkSubmitForm homeworkId={hw.id} />
                </div>
              </Card>
            );
          })
        )}
      </main>
    </div>
  );
}

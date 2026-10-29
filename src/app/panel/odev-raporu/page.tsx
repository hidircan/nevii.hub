import { redirect } from "next/navigation";
import Link from "@/components/link";
import { requireSessionContext } from "@/lib/auth/session";
import { readReferenceData } from "@/lib/store";
import { listAllHomework, listAllHomeworkSubmissions } from "@/lib/homework";
import { Card, PageHeader, StatCard } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Paket 7 — yönetici ödev raporu: atama/teslim/eksik oranları, öğrenci ve
 * öğretmen bazında dağılım. Homework/HomeworkSubmission AppData dışında
 * standalone modül olduğu için (bkz. src/lib/homework.ts), export API
 * rotasıyla AYNI desenle doğrudan `listAllHomework`/`listAllHomeworkSubmissions`
 * çağrılır — tenant kapsamı `ctx.tenantId` üzerinden zaten sağlanır.
 */
export default async function HomeworkReportPage() {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/odev-raporu");
  }
  if (session.role !== "SCHOOL_ADMIN" && session.role !== "SUPER_ADMIN") {
    redirect("/panel");
  }

  const [homework, submissions, data] = await Promise.all([
    listAllHomework(session.tenantId),
    listAllHomeworkSubmissions(session.tenantId),
    readReferenceData(),
  ]);

  const now = new Date();
  const submittedHomeworkIds = new Set(submissions.map((s) => s.homeworkId));
  const overdueCount = homework.filter((h) => !submittedHomeworkIds.has(h.id) && new Date(h.dueDate) < now).length;
  const submittedCount = homework.filter((h) => submittedHomeworkIds.has(h.id)).length;
  const pendingCount = homework.length - submittedCount - overdueCount;
  const reviewedCount = submissions.filter((s) => s.teacherFeedback).length;

  const byTeacher = new Map<string, { assigned: number; submitted: number }>();
  for (const h of homework) {
    const teacher = data.teachers.find((t) => t.id === h.teacherId);
    const key = teacher?.name ?? h.teacherId;
    const entry = byTeacher.get(key) ?? { assigned: 0, submitted: 0 };
    entry.assigned += 1;
    if (submittedHomeworkIds.has(h.id)) entry.submitted += 1;
    byTeacher.set(key, entry);
  }

  return (
    <div>
      <PageHeader title="Ödev Raporu" />
      <p className="-mt-4 mb-6">
        <Link href="/panel/odev-raporu/detay" className="text-sm font-medium text-cyan-700 hover:underline">
          Satır bazlı detaylı görünüm →
        </Link>
      </p>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Toplam ödev" value={homework.length} accent="primary" />
        <StatCard label="Teslim edildi" value={submittedCount} accent="success" />
        <StatCard label="Bekliyor" value={pendingCount} accent="info" />
        <StatCard label="Eksik (süresi geçti)" value={overdueCount} accent="danger" />
      </div>

      <Card className="mb-6">
        <p className="text-sm text-[var(--color-text-muted)]">
          {submissions.length} teslimden {reviewedCount} tanesi öğretmen tarafından değerlendirildi.
        </p>
      </Card>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
            <tr>
              <th className="px-4 py-3">Öğretmen</th>
              <th className="px-4 py-3">Verilen ödev</th>
              <th className="px-4 py-3">Teslim edilen</th>
              <th className="px-4 py-3">Teslim oranı</th>
            </tr>
          </thead>
          <tbody>
            {Array.from(byTeacher.entries()).map(([teacherName, entry]) => (
              <tr key={teacherName} className="border-b border-[var(--color-border)]">
                <td className="px-4 py-2.5 font-medium text-[var(--color-text)]">{teacherName}</td>
                <td className="px-4 py-2.5 text-[var(--color-text-muted)]">{entry.assigned}</td>
                <td className="px-4 py-2.5 text-[var(--color-text-muted)]">{entry.submitted}</td>
                <td className="px-4 py-2.5 text-[var(--color-text-muted)]">
                  {entry.assigned > 0 ? `%${Math.round((entry.submitted / entry.assigned) * 100)}` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

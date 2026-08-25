import { redirect } from "next/navigation";
import Link from "next/link";
import { requireSessionContext } from "@/lib/auth/session";
import { readData } from "@/lib/store";
import { listAllHomework, listAllHomeworkSubmissions } from "@/lib/homework";
import { Badge, Card, Input, Label, PageHeader, Select } from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/utils";
import type { HomeworkSubmission } from "@/lib/types";

export const dynamic = "force-dynamic";

type RowStatus = "submitted" | "pending" | "overdue";

/**
 * Faz 3D — satır bazlı ödev takip ekranı. `/panel/odev-raporu`'nun
 * (öğretmen-rollup özeti) YANINA eklendi, onu değiştirmez. Ayrı bir audit
 * tablosu YERİNE (Faz 3 planındaki bilinçli karar) mevcut
 * `Homework.createdAt` / `HomeworkSubmission.submittedAt`/`reviewedAt`
 * zaman damgalarından türetilen bir "geçmiş" görünümü kullanılır — bu da
 * `AuditLog`'un aksine 3 store modunda da (json/memory/db) aynı şekilde
 * çalışır.
 */
export default async function HomeworkDetailReportPage({
  searchParams,
}: {
  searchParams: Promise<{
    teacherId?: string;
    studentId?: string;
    branchId?: string;
    status?: string;
    from?: string;
    to?: string;
  }>;
}) {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/odev-raporu/detay");
  }
  if (session.role !== "SCHOOL_ADMIN" && session.role !== "SUPER_ADMIN") {
    redirect("/panel");
  }

  const sp = await searchParams;
  const [homework, submissions, data] = await Promise.all([
    listAllHomework(session.tenantId),
    listAllHomeworkSubmissions(session.tenantId),
    readData(),
  ]);

  const latestSubmissionByHomeworkId = new Map<string, HomeworkSubmission>();
  for (const s of submissions) {
    if (!latestSubmissionByHomeworkId.has(s.homeworkId)) latestSubmissionByHomeworkId.set(s.homeworkId, s);
  }

  const now = new Date();
  const rows = homework.map((h) => {
    const student = data.students.find((s) => s.id === h.studentId);
    const teacher = data.teachers.find((t) => t.id === h.teacherId);
    const lesson = h.lessonId ? data.lessons.find((l) => l.id === h.lessonId) : undefined;
    const submission = latestSubmissionByHomeworkId.get(h.id);
    const status: RowStatus = submission ? "submitted" : new Date(h.dueDate) < now ? "overdue" : "pending";
    const daysDiff = submission
      ? Math.round((new Date(h.dueDate).getTime() - new Date(submission.submittedAt).getTime()) / 86_400_000)
      : null;
    return {
      homework: h,
      student,
      teacher,
      lesson,
      submission,
      status,
      daysDiff,
    };
  });

  const filtered = rows.filter((r) => {
    if (sp.teacherId && r.homework.teacherId !== sp.teacherId) return false;
    if (sp.studentId && r.homework.studentId !== sp.studentId) return false;
    if (sp.branchId && r.student?.branchId !== sp.branchId) return false;
    if (sp.status && r.status !== sp.status) return false;
    if (sp.from && r.homework.dueDate < sp.from) return false;
    if (sp.to && r.homework.dueDate > `${sp.to}T23:59:59.999Z`) return false;
    return true;
  });

  const totalsByStudent = new Map<string, { name: string; submitted: number; pending: number; overdue: number }>();
  for (const r of filtered) {
    const key = r.homework.studentId;
    const entry = totalsByStudent.get(key) ?? { name: r.student?.name ?? key, submitted: 0, pending: 0, overdue: 0 };
    entry[r.status === "submitted" ? "submitted" : r.status] += 1;
    totalsByStudent.set(key, entry);
  }

  const teachers = [...data.teachers].sort((a, b) => a.name.localeCompare(b.name, "tr"));
  const students = [...data.students].sort((a, b) => a.name.localeCompare(b.name, "tr"));

  return (
    <div>
      <PageHeader title="Ödev Raporu — Detaylı Görünüm" />
      <p className="mb-4">
        <Link href="/panel/odev-raporu" className="text-sm font-medium text-cyan-700 hover:underline">
          ← Özet görünüme dön
        </Link>
      </p>

      <Card className="mb-6">
        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div>
            <Label>Öğretmen</Label>
            <Select name="teacherId" defaultValue={sp.teacherId ?? ""}>
              <option value="">Tümü</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Öğrenci</Label>
            <Select name="studentId" defaultValue={sp.studentId ?? ""}>
              <option value="">Tümü</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Şube</Label>
            <Select name="branchId" defaultValue={sp.branchId ?? ""}>
              <option value="">Tümü</option>
              {data.settings.branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.shortName}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Durum</Label>
            <Select name="status" defaultValue={sp.status ?? ""}>
              <option value="">Tümü</option>
              <option value="submitted">Teslim edildi</option>
              <option value="pending">Bekliyor</option>
              <option value="overdue">Gecikmiş</option>
            </Select>
          </div>
          <div>
            <Label>Son teslim — başlangıç</Label>
            <Input type="date" name="from" defaultValue={sp.from ?? ""} />
          </div>
          <div>
            <Label>Son teslim — bitiş</Label>
            <Input type="date" name="to" defaultValue={sp.to ?? ""} />
          </div>
          <div className="col-span-full flex items-center gap-2">
            <button
              type="submit"
              className="rounded-xl bg-[var(--color-primary)] px-3.5 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)]"
            >
              Filtrele
            </button>
            <a
              href="/panel/odev-raporu/detay"
              className="rounded-xl border border-[var(--color-border)] px-3.5 py-2 text-sm font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
            >
              Temizle
            </a>
          </div>
        </form>
      </Card>

      {totalsByStudent.size > 0 ? (
        <Card className="mb-6 overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
              <tr>
                <th className="px-4 py-3">Öğrenci</th>
                <th className="px-4 py-3">Tamamlanan</th>
                <th className="px-4 py-3">Bekleyen</th>
                <th className="px-4 py-3">Gecikmiş</th>
              </tr>
            </thead>
            <tbody>
              {Array.from(totalsByStudent.values()).map((t) => (
                <tr key={t.name} className="border-b border-[var(--color-border)]">
                  <td className="px-4 py-2.5 font-medium text-[var(--color-text)]">{t.name}</td>
                  <td className="px-4 py-2.5 text-emerald-700">{t.submitted}</td>
                  <td className="px-4 py-2.5 text-[var(--color-text-muted)]">{t.pending}</td>
                  <td className="px-4 py-2.5 text-rose-700">{t.overdue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
            <tr>
              <th className="px-4 py-3">Öğretmen</th>
              <th className="px-4 py-3">Öğrenci</th>
              <th className="px-4 py-3">Ders</th>
              <th className="px-4 py-3">İçerik</th>
              <th className="px-4 py-3">Verilme tarihi</th>
              <th className="px-4 py-3">Son teslim</th>
              <th className="px-4 py-3">Durum</th>
              <th className="px-4 py-3">Teslim tarihi</th>
              <th className="px-4 py-3">Gün farkı</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">
                  Bu filtrelerle eşleşen ödev yok.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.homework.id} className="border-b border-[var(--color-border)] align-top">
                  <td className="px-4 py-2.5 font-medium text-[var(--color-text)]">{r.teacher?.name ?? "—"}</td>
                  <td className="px-4 py-2.5 text-[var(--color-text)]">{r.student?.name ?? "—"}</td>
                  <td className="px-4 py-2.5 text-[var(--color-text-muted)]">
                    {r.lesson ? `${formatDate(r.lesson.startAt)} · ${r.lesson.instrument}` : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-[var(--color-text-muted)]">{r.homework.title}</td>
                  <td className="px-4 py-2.5 text-[var(--color-text-muted)]">{formatDate(r.homework.createdAt)}</td>
                  <td className="px-4 py-2.5 text-[var(--color-text-muted)]">{formatDate(r.homework.dueDate)}</td>
                  <td className="px-4 py-2.5">
                    <Badge status={r.status === "submitted" ? "completed" : r.status === "overdue" ? "cancelled" : "pending"}>
                      {r.status === "submitted" ? "Teslim edildi" : r.status === "overdue" ? "Gecikmiş" : "Bekliyor"}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-[var(--color-text-muted)]">
                    {r.submission ? formatDateTime(r.submission.submittedAt) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-[var(--color-text-muted)]">
                    {r.daysDiff === null
                      ? "—"
                      : r.daysDiff > 0
                        ? `${r.daysDiff} gün erken`
                        : r.daysDiff < 0
                          ? `${Math.abs(r.daysDiff)} gün geç`
                          : "zamanında"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

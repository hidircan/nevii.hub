import Link from "@/components/link";
import { redirect, notFound } from "next/navigation";
import { Card } from "@/components/ui";
import { formatDate, formatTime } from "@/lib/utils";
import { withReturnTo } from "@/lib/safe-return-to";
import { loadTeacherPageContext } from "../_context";

export const dynamic = "force-dynamic";

/**
 * 11. tur iş #5 — öğretmen detayında Yoklama sekmesi.
 *
 * Son 30 günün derslerinde öğretmenin KENDİ katılımı (geldi/gelmedi/
 * mazeretli/girilmedi) + girilmemiş geçmiş ders uyarısı. Salt okunur özet;
 * işaretleme program ekranında yapılır (tek yazma yolu korunur).
 * Erişim: yönetici + öğretmenin kendisi (performans sekmesiyle aynı kural).
 */
const STATUS_BADGE: Record<string, string> = {
  geldi:
    "rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  gelmedi:
    "rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-800 dark:bg-rose-950 dark:text-rose-300",
  mazeretli:
    "rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300",
};

const STATUS_LABEL: Record<string, string> = {
  geldi: "Geldi",
  gelmedi: "Gelmedi",
  mazeretli: "Mazeretli",
};

export default async function TeacherAttendanceTab({ params }: { params: Promise<{ teacherId: string }> }) {
  const { teacherId } = await params;
  const { session, data, teacher } = await loadTeacherPageContext(teacherId);
  if (session.role !== "SCHOOL_ADMIN" && session.role !== "SUPER_ADMIN" && session.role !== "TEACHER") {
    redirect("/panel");
  }
  if (session.role === "TEACHER" && session.teacherId !== teacherId) {
    redirect("/panel");
  }
  if (!teacher) notFound();

  const isAdmin = session.role === "SCHOOL_ADMIN" || session.role === "SUPER_ADMIN";
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - 30);

  const lessons = data.lessons
    .filter((l) => l.teacherId === teacher.id && l.status !== "cancelled")
    .filter((l) => {
      const t = new Date(l.startAt).getTime();
      return t >= cutoff.getTime() && t <= now.getTime();
    })
    .sort((a, b) => b.startAt.localeCompare(a.startAt));
  const shown = lessons.slice(0, 50);

  const counts = {
    geldi: lessons.filter((l) => l.teacherAttendanceStatus === "geldi").length,
    gelmedi: lessons.filter((l) => l.teacherAttendanceStatus === "gelmedi").length,
    mazeretli: lessons.filter((l) => l.teacherAttendanceStatus === "mazeretli").length,
    girilmedi: lessons.filter((l) => !l.teacherAttendanceStatus).length,
  };

  const currentHref = `/panel/ogretmenler/${teacher.id}/yoklama`;
  const studentById = new Map(data.students.map((s) => [s.id, s]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-[var(--color-text)]">Yoklama — son 30 gün</h2>
          <p className="text-xs text-[var(--color-text-muted)]">
            {lessons.length} ders · öğretmenin kendi katılımı. İşaretleme program ekranında yapılır.
          </p>
        </div>
        {isAdmin ? (
          <Link
            href={`/panel/yoklama-raporu?gorunum=ogretmen&teacherId=${teacher.id}`}
            className="shrink-0 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]"
          >
            Yoklama raporunda aç →
          </Link>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="!p-3">
          <p className="text-xs text-[var(--color-text-muted)]">Geldi</p>
          <p className="text-xl font-bold text-emerald-700 dark:text-emerald-300">{counts.geldi}</p>
        </Card>
        <Card className="!p-3">
          <p className="text-xs text-[var(--color-text-muted)]">Gelmedi</p>
          <p className="text-xl font-bold text-rose-700 dark:text-rose-300">{counts.gelmedi}</p>
        </Card>
        <Card className="!p-3">
          <p className="text-xs text-[var(--color-text-muted)]">Mazeretli</p>
          <p className="text-xl font-bold text-amber-700 dark:text-amber-300">{counts.mazeretli}</p>
        </Card>
        <Card className="!p-3">
          <p className="text-xs text-[var(--color-text-muted)]">Girilmedi</p>
          <p className="text-xl font-bold text-[var(--color-text-muted)]">{counts.girilmedi}</p>
        </Card>
      </div>

      {counts.girilmedi > 0 ? (
        <Card className="border-amber-200 bg-amber-50/40">
          <p className="text-sm text-[var(--color-text)]" role="alert">
            <strong>{counts.girilmedi} dersin</strong> katılımı girilmedi. Katılım program ekranındaki ders
            detayından tek tıkla işaretlenir.
          </p>
        </Card>
      ) : null}

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] text-xs text-[var(--color-text-muted)]">
            <tr>
              <th className="px-3 py-2">Tarih/Saat</th>
              <th className="px-3 py-2">Öğrenci</th>
              <th className="px-3 py-2">Enstrüman</th>
              <th className="px-3 py-2">Katılım</th>
              {isAdmin ? <th className="px-3 py-2" /> : null}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr>
                <td colSpan={isAdmin ? 5 : 4} className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">
                  Son 30 günde ders yok.
                </td>
              </tr>
            ) : (
              shown.map((l) => (
                <tr key={l.id} className="border-b border-[var(--color-border)]">
                  <td className="whitespace-nowrap px-3 py-2 text-[var(--color-text-muted)]">
                    {formatDate(l.startAt)} · {formatTime(l.startAt)}–{formatTime(l.endAt)}
                  </td>
                  <td className="px-3 py-2">{studentById.get(l.studentId)?.name ?? "—"}</td>
                  <td className="px-3 py-2 text-[var(--color-text-muted)]">{l.instrument}</td>
                  <td className="px-3 py-2">
                    {l.teacherAttendanceStatus ? (
                      <span className={STATUS_BADGE[l.teacherAttendanceStatus] ?? ""}>
                        {STATUS_LABEL[l.teacherAttendanceStatus] ?? l.teacherAttendanceStatus}
                      </span>
                    ) : (
                      <span className="text-xs text-[var(--color-text-muted)]">Girilmedi</span>
                    )}
                  </td>
                  {isAdmin ? (
                    <td className="whitespace-nowrap px-3 py-2">
                      <Link
                        href={withReturnTo(`/panel/program?week=${l.startAt.slice(0, 10)}`, currentHref)}
                        className="text-xs font-medium text-[var(--color-primary)] hover:underline"
                      >
                        Programda aç →
                      </Link>
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
      {lessons.length > shown.length ? (
        <p className="text-xs text-[var(--color-text-muted)]">
          Son {shown.length} ders gösteriliyor; tamamı için Yoklama Raporu&apos;nu kullanın.
        </p>
      ) : null}
    </div>
  );
}

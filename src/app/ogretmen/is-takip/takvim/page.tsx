import Link from "next/link";
import { redirect } from "next/navigation";
import { BackButton } from "@/components/back-button";
import { requireSessionContext } from "@/lib/auth/session";
import { Badge, Card } from "@/components/ui";
import { listTasksTool } from "@/lib/services";
import { groupTasksForCalendarMonth, isTaskOverdue } from "@/lib/task-calendar";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Öğretmen takvim görünümü — mobil öncelikli, ay ızgarası yerine gün-gün
 * liste (küçük ekranda daha kullanılabilir). Aynı `groupTasksForCalendarMonth`
 * yardımcısını (admin görünümüyle PAYLAŞILAN, kopyalanmayan mantık) kullanır.
 */
export default async function OgretmenIsTakipTakvimPage() {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/ogretmen/is-takip/takvim");
  }
  if (session.role !== "TEACHER") redirect("/panel");

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const listRes = await listTasksTool(session, {});
  const tasks = listRes.ok ? listRes.data.tasks.filter((t) => t.status !== "ARCHIVED") : [];
  const { days, undated } = groupTasksForCalendarMonth(tasks, year, month);
  const todayYmd = now.toISOString().slice(0, 10);
  const daysWithTasks = days.filter((d) => d.tasks.length > 0);

  return (
    <div className="min-h-screen bg-gradient-to-b from-cyan-50 to-slate-50">
      <header className="border-b border-cyan-100 bg-[var(--color-surface)]/90 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-4">
          <BackButton fallbackHref="/ogretmen/is-takip" label="İş Takip" />
          <p className="text-sm font-semibold text-[var(--color-text)] dark:text-slate-50">Takvim</p>
          <span className="w-10" />
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-4 px-4 py-6 pb-24">
        {daysWithTasks.length === 0 ? (
          <Card>
            <p className="text-sm text-[var(--color-text-muted)]">Bu ay için son tarihli görev yok.</p>
          </Card>
        ) : (
          daysWithTasks.map((day) => (
            <div key={day.date}>
              <p className="mb-1.5 px-1 text-xs font-semibold text-[var(--color-text-muted)]">{formatDate(day.date)}</p>
              <div className="space-y-1.5">
                {day.tasks.map((t) => (
                  <Link key={t.id} href={`/ogretmen/is-takip/${t.id}`}>
                    <Card className="!p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-[var(--color-text)] dark:text-slate-50">{t.title}</p>
                        {isTaskOverdue(t, todayYmd) ? <Badge status="overdue">Gecikmiş</Badge> : null}
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          ))
        )}

        <div>
          <p className="mb-1.5 px-1 text-xs font-semibold text-[var(--color-text-muted)]">Tarihsiz ({undated.length})</p>
          {undated.length === 0 ? (
            <p className="px-1 text-xs text-[var(--color-text-muted)]">Tarihsiz görev yok.</p>
          ) : (
            <div className="space-y-1.5">
              {undated.map((t) => (
                <Link key={t.id} href={`/ogretmen/is-takip/${t.id}`}>
                  <Card className="!p-3">
                    <p className="text-sm font-medium text-[var(--color-text)] dark:text-slate-50">{t.title}</p>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { BackButton } from "@/components/back-button";
import { requireSessionContext } from "@/lib/auth/session";
import { Badge, Card, EmptyState } from "@/components/ui";
import { getTaskKpiSummaryTool, listTasksTool } from "@/lib/services";
import { formatDate } from "@/lib/utils";
import type { TaskStatus } from "@/lib/types";
import { TaskReminderPreferencesModal } from "@/components/task-reminder-preferences-modal";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<TaskStatus, string> = {
  TODO: "Yapılacak",
  IN_PROGRESS: "Devam Ediyor",
  BLOCKED: "Engellendi",
  COMPLETED: "Tamamlandı",
  CANCELLED: "İptal Edildi",
  ARCHIVED: "Arşivlendi",
};

/**
 * Öğretmen İş Takip görünümü — `/panel/is-takip`'in KISITLI karşılığı.
 * `/panel` layout'u TEACHER'ı zaten buraya (`/ogretmen`) yönlendirdiği için
 * ayrı bir portal sayfası gerekiyor; alttaki `getTaskKpiSummaryTool`/
 * `listTasksTool` çağrıları AYNI tool'lardır — RBAC (yalnızca kendine
 * atanan/takipçi olduğu görevler) tool katmanında zaten uygulanır.
 */
export default async function OgretmenIsTakipPage() {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/ogretmen/is-takip");
  }
  if (session.role !== "TEACHER") redirect("/panel");

  const kpiRes = await getTaskKpiSummaryTool(session);
  const kpi = kpiRes.ok
    ? kpiRes.data
    : { openCount: 0, assignedToMeCount: 0, dueTodayCount: 0, overdueCount: 0, completedThisWeekCount: 0 };
  const listRes = await listTasksTool(session, {});
  const tasks = listRes.ok ? listRes.data.tasks : [];
  const todayYmd = new Date().toISOString().slice(0, 10);

  return (
    <div className="min-h-screen bg-gradient-to-b from-cyan-50 to-slate-50">
      <header className="border-b border-cyan-100 bg-[var(--color-surface)]/90 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-4">
          <BackButton fallbackHref="/ogretmen" />
          <p className="text-sm font-semibold text-[var(--color-text)] dark:text-slate-50">İş Takip</p>
          <span className="w-10" />
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-4 px-4 py-6 pb-24">
        <div className="flex items-center gap-3 text-sm">
          <Link href="/ogretmen/is-takip/kanban" className="font-medium text-cyan-700 hover:text-cyan-800">
            Kanban görünümü →
          </Link>
          <Link href="/ogretmen/is-takip/takvim" className="font-medium text-cyan-700 hover:text-cyan-800">
            Takvim görünümü →
          </Link>
          <TaskReminderPreferencesModal triggerClassName="font-medium text-cyan-700 hover:text-cyan-800" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Card className="!p-3">
            <p className="text-xs text-[var(--color-text-muted)]">Açık görevlerim</p>
            <p className="text-2xl font-semibold text-[var(--color-text)] dark:text-slate-50">{kpi.openCount}</p>
          </Card>
          <Card className="!p-3">
            <p className="text-xs text-[var(--color-text-muted)]">Gecikenler</p>
            <p className="text-2xl font-semibold text-rose-600">{kpi.overdueCount}</p>
          </Card>
        </div>

        {tasks.length === 0 ? (
          <Card>
            <EmptyState title="Size atanan görev yok" description="Yöneticiniz size görev atadığında burada görünecek." />
          </Card>
        ) : (
          <div className="space-y-2">
            {tasks.map((t) => {
              const overdue =
                t.dueDate && t.dueDate.slice(0, 10) < todayYmd && t.status !== "COMPLETED" && t.status !== "CANCELLED" && t.status !== "ARCHIVED";
              return (
                <Link key={t.id} href={`/ogretmen/is-takip/${t.id}`}>
                  <Card className="!p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-[var(--color-text)] dark:text-slate-50">{t.title}</p>
                      {overdue ? <Badge status="overdue">Gecikmiş</Badge> : <Badge status="pending">{STATUS_LABEL[t.status]}</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                      {t.category} · {t.dueDate ? `Son tarih: ${formatDate(t.dueDate)}` : "Son tarih yok"}
                    </p>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

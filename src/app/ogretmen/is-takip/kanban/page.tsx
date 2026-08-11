import { redirect } from "next/navigation";
import { BackButton } from "@/components/back-button";
import { requireSessionContext } from "@/lib/auth/session";
import { listTasksTool } from "@/lib/services";
import { TaskKanbanBoard } from "@/components/task-kanban-board";

export const dynamic = "force-dynamic";

/**
 * Öğretmen Kanban görünümü — yalnızca kendine atanan/takipçi olduğu
 * görevler (RBAC `listTasksTool` içinde zaten uygulanır). Kart durumu
 * menüsünden CANCELLED'a taşımaya çalışırsa sunucu reddeder (aynı RBAC).
 */
export default async function OgretmenIsTakipKanbanPage() {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/ogretmen/is-takip/kanban");
  }
  if (session.role !== "TEACHER") redirect("/panel");

  const listRes = await listTasksTool(session, {});
  const tasks = listRes.ok ? listRes.data.tasks.filter((t) => t.status !== "ARCHIVED") : [];

  return (
    <div className="min-h-screen bg-gradient-to-b from-cyan-50 to-slate-50">
      <header className="border-b border-cyan-100 bg-[var(--color-surface)]/90 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <BackButton fallbackHref="/ogretmen/is-takip" label="İş Takip" />
          <p className="text-sm font-semibold text-[var(--color-text)] dark:text-slate-50">Kanban</p>
          <span className="w-10" />
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-6 pb-24">
        <TaskKanbanBoard tasks={tasks} isAdmin={false} assigneeLabels={{}} />
      </main>
    </div>
  );
}

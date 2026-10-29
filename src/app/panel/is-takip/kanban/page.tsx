import { canRunCriticalActions } from "@/lib/critical-action-password";
import { redirect } from "next/navigation";
import Link from "@/components/link";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext, readScopedReferenceData } from "@/lib/institution/context";
import { KurumScopeNote } from "@/components/kurum-scope-note";
import { AssistantPageContext } from "@/components/ai/assistant-page-context";
import { PageHeader } from "@/components/ui";
import { listTasksTool } from "@/lib/services";
import { TaskKanbanBoard } from "@/components/task-kanban-board";
import { listAssignableStaff } from "@/lib/staff-directory";

export const dynamic = "force-dynamic";

/**
 * İş Takip Kanban görünümü (admin) — Faz 2 madde 1. Aynı `listTasksTool`/
 * `changeTaskStatusTool`'u kullanır, ayrı bir veri yolu YOK.
 */
export default async function IsTakipKanbanPage() {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/is-takip/kanban");
  }
  if (session.role !== "SCHOOL_ADMIN" && session.role !== "SUPER_ADMIN") {
    redirect("/panel");
  }

  const kurum = await getInstitutionContext(session);
  const data = await readScopedReferenceData(kurum.scope);
  const listRes = await listTasksTool(session, {});
  // Arşiv Kanban tahtasında gösterilmez — ayrı bir görünüm/filtredir.
  const tasks = listRes.ok ? listRes.data.tasks.filter((t) => t.status !== "ARCHIVED") : [];
  const staff = await listAssignableStaff(session.tenantId, data.teachers);
  const assigneeLabels = Object.fromEntries(staff.map((s) => [s.id, s.label]));

  return (
    <div>
      <KurumScopeNote scope={kurum.scope} />
      <AssistantPageContext entity={{ kind: "page", label: "İş Takip Kanban" }} />
      <PageHeader
        title="İş Takip — Kanban"
        description="Görevleri durumlarına göre sürükleyip bırakmak yerine, her kartın altındaki menüden durumunu değiştirin."
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/panel/is-takip/liste#yeni-gorev"
              className="rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-[var(--color-text-inverted)] hover:opacity-90"
            >
              + Yeni Görev
            </Link>
            <Link href="/panel/is-takip/liste" className="text-sm font-medium text-[var(--color-primary)] hover:underline">
              Liste görünümü
            </Link>
            <Link href="/panel/is-takip/takvim" className="text-sm font-medium text-[var(--color-primary)] hover:underline">
              Takvim görünümü
            </Link>
            <Link href="/panel/is-takip/raporlar" className="text-sm font-medium text-[var(--color-primary)] hover:underline">
              Raporlar
            </Link>
            {canRunCriticalActions(session.role) ? (
              <Link href="/panel/is-takip/silinenler" className="text-sm font-medium text-[var(--color-text-muted)] hover:underline">
                Silinen işler
              </Link>
            ) : null}
          </div>
        }
      />
      <TaskKanbanBoard tasks={tasks} isAdmin assigneeLabels={assigneeLabels} />
    </div>
  );
}

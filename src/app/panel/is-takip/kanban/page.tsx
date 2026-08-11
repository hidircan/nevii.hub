import { redirect } from "next/navigation";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext, readScopedData } from "@/lib/institution/context";
import { KurumScopeNote } from "@/components/kurum-scope-note";
import { PageHeader } from "@/components/ui";
import { BackButton } from "@/components/back-button";
import { listTasksTool } from "@/lib/services";
import { TaskKanbanBoard } from "@/components/task-kanban-board";
import { listAssignableStaff } from "@/lib/staff-directory";
import { IsTakipViewLink } from "@/components/is-takip-view-preference";

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
  const data = await readScopedData(kurum.scope);
  const listRes = await listTasksTool(session, {});
  // Arşiv Kanban tahtasında gösterilmez — ayrı bir görünüm/filtredir.
  const tasks = listRes.ok ? listRes.data.tasks.filter((t) => t.status !== "ARCHIVED") : [];
  const staff = await listAssignableStaff(session.tenantId, data.teachers);
  const assigneeLabels = Object.fromEntries(staff.map((s) => [s.id, s.label]));

  return (
    <div>
      <KurumScopeNote scope={kurum.scope} />
      <BackButton fallbackHref="/panel/is-takip" label="İş Takip'e dön" className="mb-3" />
      <PageHeader
        title="İş Takip — Kanban"
        description="Görevleri durumlarına göre sürükleyip bırakmak yerine, her kartın altındaki menüden durumunu değiştirin."
        actions={
          <IsTakipViewLink href="/panel/is-takip" view="liste" className="text-sm font-medium text-[var(--color-primary)] hover:underline">
            ← Liste görünümü
          </IsTakipViewLink>
        }
      />
      <TaskKanbanBoard tasks={tasks} isAdmin assigneeLabels={assigneeLabels} />
    </div>
  );
}

import { redirect } from "next/navigation";
import { BackButton } from "@/components/back-button";
import { requireSessionContext } from "@/lib/auth/session";
import { Card, EmptyState } from "@/components/ui";
import { getTaskDetailTool, resolveTaskRelatedEntityTool } from "@/lib/services";
import { TaskDetailPanel } from "@/components/task-detail-panel";

export const dynamic = "force-dynamic";

export default async function OgretmenIsTakipDetailPage({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  const { taskId } = await params;
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect(`/login?next=/ogretmen/is-takip/${taskId}`);
  }
  if (session.role !== "TEACHER") redirect("/panel");

  const detailRes = await getTaskDetailTool(session, { taskId });

  let relatedEntityContext: { exists: boolean; href?: string } | null = null;
  if (detailRes.ok && detailRes.data.task.relatedEntityType && detailRes.data.task.relatedEntityId) {
    const relRes = await resolveTaskRelatedEntityTool(session, {
      relatedEntityType: detailRes.data.task.relatedEntityType,
      relatedEntityId: detailRes.data.task.relatedEntityId,
    });
    relatedEntityContext = relRes.ok ? relRes.data : { exists: false };
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-cyan-50 to-slate-50">
      <header className="border-b border-cyan-100 bg-[var(--color-surface)]/90 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-4">
          <BackButton fallbackHref="/ogretmen/is-takip" label="İş Takip" />
          <p className="text-sm font-semibold text-[var(--color-text)] dark:text-slate-50">Görev Detayı</p>
          <span className="w-10" />
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-4 px-4 py-6 pb-24">
        {!detailRes.ok ? (
          <Card>
            <EmptyState
              title="Görev bulunamadı"
              description="Bu görev size atanmamış/takipçisi değilsiniz ya da kaldırılmış olabilir."
            />
          </Card>
        ) : (
          <Card>
            <TaskDetailPanel
              task={detailRes.data.task}
              checklist={detailRes.data.checklist}
              comments={detailRes.data.comments}
              activity={detailRes.data.activity}
              attachments={detailRes.data.attachments}
              isAdmin={false}
              currentActorIds={[session.userId, session.teacherId].filter((v): v is string => !!v)}
              relatedEntityContext={relatedEntityContext}
            />
          </Card>
        )}
      </main>
    </div>
  );
}

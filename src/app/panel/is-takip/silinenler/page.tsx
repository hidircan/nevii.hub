import { redirect } from "next/navigation";
import { requireSessionContext } from "@/lib/auth/session";
import { canRunCriticalActions } from "@/lib/critical-action-password";
import { listDeletedTasksTool } from "@/lib/services";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { BackButton } from "@/components/back-button";
import { TaskRestoreButton } from "@/components/task-restore-button";
import { formatDateTime } from "@/lib/utils";
import { resolveActorLabels } from "@/lib/contract-payment-plan-view";
import { readData } from "@/lib/store";

export const dynamic = "force-dynamic";

/** 9. tur — geri alınabilir silinmiş işler; yalnız kurum sahibi/yöneticisi. */
export default async function DeletedTasksPage() {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/is-takip/silinenler");
  }
  if (!canRunCriticalActions(session.role)) redirect("/panel/is-takip/kanban");
  const result = await listDeletedTasksTool(session);
  const tasks = result.ok ? result.data.tasks : [];
  const data = await readData();
  const actorNames = await resolveActorLabels({
    tenantId: session.tenantId,
    userIds: tasks.map((t) => t.deletedByUserId),
    teachers: data.teachers,
  });

  return (
    <div>
      <BackButton fallbackHref="/panel/is-takip/kanban" label="İş Takip'e dön" className="mb-3" />
      <PageHeader
        title="Silinen işler"
        description="Silinen işler listelerde, raporlarda ve hatırlatmalarda görünmez; yorum, kontrol listesi ve ekleri korunur. Geri alınan iş eski durumuyla döner."
      />
      {tasks.length === 0 ? (
        <EmptyState title="Silinen iş yok" description="Silinen bir iş olduğunda burada geri alınabilir." />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] text-xs text-[var(--color-text-muted)]">
              <tr>
                <th className="px-4 py-2.5">İş</th>
                <th className="px-4 py-2.5">Silinme</th>
                <th className="px-4 py-2.5">Gerekçe</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.id} className="border-b border-[var(--color-border)] align-top">
                  <td className="px-4 py-2.5 font-medium text-[var(--color-text)]">{t.title}</td>
                  <td className="px-4 py-2.5 text-[var(--color-text-muted)]">
                    {t.deletedAt ? formatDateTime(t.deletedAt) : "—"}
                    <span className="block text-xs">
                      {(t.deletedByUserId && actorNames.get(t.deletedByUserId)) ?? "Kullanıcı bilinmiyor"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-[var(--color-text-muted)]">{t.deletionReason ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    <TaskRestoreButton taskId={t.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

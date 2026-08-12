import { redirect } from "next/navigation";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext, readScopedData } from "@/lib/institution/context";
import { KurumScopeNote } from "@/components/kurum-scope-note";
import { EmptyState, PageHeader } from "@/components/ui";
import { BackButton } from "@/components/back-button";
import { getTaskDetailTool, getDocumentInstanceTool, resolveTaskRelatedEntityTool } from "@/lib/services";
import { TaskDetailPanel } from "@/components/task-detail-panel";
import { listAssignableStaff, resolveStaffLabel } from "@/lib/staff-directory";

export const dynamic = "force-dynamic";

export default async function IsTakipDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ taskId: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { taskId } = await params;
  const sp = await searchParams;
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect(`/login?next=/panel/is-takip/${taskId}`);
  }
  if (session.role !== "SCHOOL_ADMIN" && session.role !== "SUPER_ADMIN") {
    redirect("/panel");
  }

  const kurum = await getInstitutionContext(session);
  const data = await readScopedData(kurum.scope);
  const staff = await listAssignableStaff(session.tenantId, data.teachers);

  const detailRes = await getTaskDetailTool(session, { taskId });

  // İş Takip Faz 3B-1A — evrak bağlantısı, kırık link üretmemek için burada
  // sunucu tarafında ÖNCEDEN doğrulanır (silinmiş/başka kuruma aitse `null`).
  let documentContext: { id: string; reference: string } | null = null;
  if (detailRes.ok && detailRes.data.task.documentId) {
    const docRes = await getDocumentInstanceTool(session, { documentId: detailRes.data.task.documentId });
    documentContext = docRes.ok ? { id: docRes.data.document.id, reference: docRes.data.document.reference } : null;
  }

  // İş Takip Merkezi — genel ilişkili kayıt bağlantısı (relatedEntityType/Id).
  // Tenant-scope doğrulaması sunucu tarafında (resolveTaskRelatedEntityTool)
  // yapılır; kayıt silinmiş/erişilemezse `exists:false` döner ve UI kırık
  // link yerine güvenli bir mesaj gösterir.
  let relatedEntityContext: { exists: boolean; href?: string } | null = null;
  if (detailRes.ok && detailRes.data.task.relatedEntityType && detailRes.data.task.relatedEntityId) {
    const relRes = await resolveTaskRelatedEntityTool(session, {
      relatedEntityType: detailRes.data.task.relatedEntityType,
      relatedEntityId: detailRes.data.task.relatedEntityId,
    });
    relatedEntityContext = relRes.ok ? relRes.data : { exists: false };
  }

  return (
    <div>
      <KurumScopeNote scope={kurum.scope} />
      {sp.created ? (
        <p className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
          Görev oluşturuldu.
        </p>
      ) : null}
      <BackButton fallbackHref="/panel/is-takip/kanban" label="İş Takip'e dön" className="mb-3" />
      {!detailRes.ok ? (
        <>
          <PageHeader title="Görev bulunamadı" />
          <EmptyState
            title="Görev bulunamadı"
            description="Bu görev kurumunuzda kayıtlı değil veya kaldırılmış olabilir."
          />
        </>
      ) : (
        <TaskDetailPanel
          task={detailRes.data.task}
          checklist={detailRes.data.checklist}
          comments={detailRes.data.comments}
          activity={detailRes.data.activity}
          attachments={detailRes.data.attachments}
          isAdmin
          assigneeLabel={resolveStaffLabel(staff, detailRes.data.task.assigneeId)}
          currentActorIds={[session.userId, session.teacherId].filter((v): v is string => !!v)}
          documentContext={documentContext}
          relatedEntityContext={relatedEntityContext}
        />
      )}
    </div>
  );
}

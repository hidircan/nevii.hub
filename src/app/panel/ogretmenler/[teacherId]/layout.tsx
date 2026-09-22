import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { BackButton } from "@/components/back-button";
import { KurumScopeNote } from "@/components/kurum-scope-note";
import { TeacherArchiveAction } from "@/components/teacher-archive-action";
import { TeacherDetailTabs } from "@/components/teacher-detail-tabs";
import { QuickTaskLink } from "@/components/quick-task-link";
import { AssistantPageContext } from "@/components/ai/assistant-page-context";
import { formatDate } from "@/lib/utils";
import { resolveActorLabel } from "@/lib/contract-payment-plan-view";
import { loadTeacherPageContext } from "./_context";

export const dynamic = "force-dynamic";

/**
 * Öğretmen detayı — tüm sekmelerin paylaştığı kimlik başlığı ve navigasyon.
 * Sekme içeriği `children`; her sekme kendi verisini `_context` üzerinden okur.
 */
export default async function TeacherDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ teacherId: string }>;
}) {
  const { teacherId } = await params;
  let ctx;
  try {
    ctx = await loadTeacherPageContext(teacherId);
  } catch {
    redirect(`/login?next=/panel/ogretmenler/${teacherId}`);
  }
  const { kurum, data, teacher, canManage, session } = ctx;

  if (!teacher) {
    return (
      <div>
        <PageHeader title="Öğretmen bulunamadı" />
        <EmptyState
          title="Öğretmen bulunamadı"
          description="Bu kayıt mevcut kurum/şube kapsamınızda değil veya kaldırılmış olabilir."
        />
        <Link
          href="/panel/ogretmenler"
          className="mt-4 inline-block text-sm font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]"
        >
          ← Öğretmenlere dön
        </Link>
      </div>
    );
  }

  const branch = data.settings.branches.find((b) => b.id === teacher.branchId);
  const createdBy = teacher.createdByUserId
    ? await resolveActorLabel({ tenantId: session.tenantId, userId: teacher.createdByUserId, teachers: data.teachers })
    : null;
  const now = new Date();
  const contractDaysLeft = teacher.contractEndDate
    ? Math.ceil((new Date(teacher.contractEndDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <div>
      <KurumScopeNote scope={kurum.scope} />
      <AssistantPageContext entity={{ kind: "teacher", id: teacher.id, label: teacher.name }} />
      <BackButton fallbackHref="/panel/ogretmenler" label="Öğretmenlere dön" className="mb-3" />
      <PageHeader
        title={teacher.name}
        description={`${teacher.displayId ? `${teacher.displayId} · ` : ""}${branch?.shortName ?? "—"} · ${
          teacher.instruments.join(", ") || "—"
        }`}
        actions={
          canManage ? (
            <div className="flex flex-wrap items-center gap-2">
              <QuickTaskLink
                relatedEntityType="teacher"
                relatedEntityId={teacher.id}
                relatedEntityLabel={teacher.name}
                title={`Öğretmen takibi — ${teacher.name}`}
                label="Bu öğretmen için görev oluştur"
                returnTo={`/panel/ogretmenler/${teacher.id}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm font-medium text-[var(--color-primary)] hover:bg-[var(--color-bg)]"
              />
              <TeacherArchiveAction teacherId={teacher.id} teacherName={teacher.name} archived={!teacher.active} />
            </div>
          ) : undefined
        }
      />

      <Card className="mb-4 !p-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge status={teacher.active ? "confirmed" : "cancelled"}>{teacher.active ? "Aktif" : "Pasif"}</Badge>
          {teacher.instruments.map((i) => (
            <Badge key={i}>{i}</Badge>
          ))}
          <span className="text-[var(--color-text-muted)]">
            {teacher.email || "—"} · {teacher.phone || "—"}
            {teacher.hireDate ? ` · İşe giriş: ${formatDate(teacher.hireDate)}` : ""}
            {createdBy ? ` · Kaydı oluşturan: ${createdBy}` : ""}
          </span>
          {contractDaysLeft !== null && contractDaysLeft <= 30 && contractDaysLeft >= 0 ? (
            <Badge status="pending">Sözleşme {contractDaysLeft} gün içinde bitiyor</Badge>
          ) : null}
        </div>
      </Card>

      <TeacherDetailTabs teacherId={teacher.id} />

      {children}
    </div>
  );
}

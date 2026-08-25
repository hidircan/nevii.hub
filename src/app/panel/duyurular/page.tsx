import { redirect } from "next/navigation";
import { requireSessionContext } from "@/lib/auth/session";
import { listAllAnnouncementsTool, listAnnouncementRecipientsTool } from "@/lib/services";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { AnnouncementForm } from "@/components/announcement-form";
import { AnnouncementStatusButton } from "@/components/announcement-status-button";
import { AnnouncementAttachments } from "@/components/announcement-attachments";
import { formatDateTime } from "@/lib/utils";
import { Pin } from "lucide-react";

export const dynamic = "force-dynamic";

const AUDIENCE_LABELS: Record<string, string> = {
  all: "Herkes",
  branch: "Şube",
  teachers: "Öğretmenler",
  parents: "Veliler",
  students: "Öğrenciler",
  studentType: "Öğrenci türü",
  instrument: "Enstrüman",
  selected: "Seçili kullanıcılar",
};

export default async function DuyurularPage() {
  let ctx;
  try {
    ctx = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/duyurular");
  }
  if (ctx.role !== "SCHOOL_ADMIN" && ctx.role !== "SUPER_ADMIN") {
    redirect("/panel");
  }

  const [result, recipientsResult] = await Promise.all([
    listAllAnnouncementsTool(ctx),
    listAnnouncementRecipientsTool(ctx),
  ]);
  const announcements = result.ok ? result.data.announcements : [];
  const recipients = recipientsResult.ok ? recipientsResult.data.recipients : [];

  return (
    <div>
      <PageHeader
        title="Duyuru Merkezi"
        description="Hedef kitle eşleştirmesi sunucu tarafında yapılır — hedef dışı kullanıcı asla duyuruyu görmez."
      />

      <Card className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)] dark:text-slate-200">Yeni duyuru</h2>
        <AnnouncementForm recipients={recipients} />
      </Card>

      <h2 className="mb-3 text-lg font-semibold text-[var(--color-text)] dark:text-slate-50">Duyurular</h2>
      {announcements.length === 0 ? (
        <EmptyState
          title="Henüz duyuru yok"
          description="Yukarıdaki formdan ilk duyurunuzu oluşturun."
        />
      ) : (
        <div className="space-y-3">
          {announcements.map((a) => (
            <Card key={a.id} className={a.pinned ? "border-amber-200" : undefined}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    {a.pinned ? <Pin className="h-3.5 w-3.5 text-amber-600" /> : null}
                    <h3 className="text-base font-semibold text-[var(--color-text)] dark:text-slate-50">{a.title}</h3>
                    <Badge status={a.status} />
                    <span className="rounded-full bg-[var(--color-surface-muted)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-text-muted)] dark:bg-slate-800 dark:text-slate-300">
                      {AUDIENCE_LABELS[a.audienceType] ?? a.audienceType}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">{a.body}</p>
                  <AnnouncementAttachments announcementId={a.id} attachments={a.attachments} />
                  <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                    Oluşturulma: {formatDateTime(a.createdAt)}
                    {typeof a.recipientCount === "number" ? ` · ${a.recipientCount} alıcıya bildirim gönderildi` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  {a.status !== "published" ? (
                    <AnnouncementStatusButton
                      announcementId={a.id}
                      targetStatus="published"
                      label="Yayınla"
                    />
                  ) : null}
                  {a.status !== "archived" ? (
                    <AnnouncementStatusButton
                      announcementId={a.id}
                      targetStatus="archived"
                      label="Arşivle"
                    />
                  ) : null}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

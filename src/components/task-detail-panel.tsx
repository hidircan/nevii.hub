"use client";

/**
 * İş Takip görev detay paneli — hem `/panel/is-takip/[taskId]` (admin, tam
 * düzenleme) hem `/ogretmen/is-takip/[taskId]` (öğretmen, kısıtlı) tarafından
 * kullanılır. RBAC her aksiyonda zaten sunucu tarafında (tools.ts) kesin
 * olarak uygulanır — `isAdmin` prop'u yalnızca HANGİ kontrollerin
 * gösterileceğini belirler (ikinci, UI katmanı savunması).
 */

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  actionChangeTaskStatus,
  actionAddTaskChecklistItem,
  actionSetTaskChecklistItemCompleted,
  actionArchiveTaskChecklistItem,
  actionAddTaskComment,
  actionUpdateTaskComment,
  actionDeleteTaskComment,
  actionUpdateTask,
  actionAddTaskFileAttachment,
  actionAddTaskLinkAttachment,
  actionDeleteTaskAttachment,
  actionDeleteTask,
  actionGetTaskDeletionImpact,
} from "@/lib/actions";
import { CriticalDeleteDialog } from "@/components/critical-delete-dialog";
import { Badge, Button, Input, Label } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";
import { TASK_PRIORITY_LABEL, type Task, type TaskChecklistItem, type TaskComment, type TaskActivity, type TaskAttachment, type TaskStatus } from "@/lib/types";

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(new Error("Dosya okunamadı"));
    reader.readAsDataURL(file);
  });
}

function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const RELATED_ENTITY_TYPE_LABEL: Record<string, string> = {
  student: "Öğrenci",
  teacher: "Öğretmen",
  payment: "Ödeme",
  document: "Evrak",
  makeup: "Telafi",
  lessonCorrection: "Ders Düzeltme",
  branch: "Şube",
};

const STATUS_LABEL: Record<TaskStatus, string> = {
  TODO: "Yapılacak",
  IN_PROGRESS: "Devam Ediyor",
  BLOCKED: "Engellendi",
  COMPLETED: "Tamamlandı",
  CANCELLED: "İptal Edildi",
  ARCHIVED: "Arşivlendi",
};

const ACTIVITY_LABEL: Record<string, string> = {
  created: "Oluşturuldu",
  field_updated: "Alan güncellendi",
  status_changed: "Durum değişti",
  priority_changed: "Öncelik değişti",
  category_changed: "Kategori değişti",
  assignee_changed: "Sorumlu değişti",
  follower_added: "Takipçi eklendi",
  follower_removed: "Takipçi çıkarıldı",
  date_changed: "Tarih değişti",
  checklist_added: "Checklist eklendi",
  checklist_updated: "Checklist güncellendi",
  checklist_removed: "Checklist kaldırıldı",
  comment_added: "Yorum eklendi",
  comment_updated: "Yorum düzenlendi",
  attachment_added: "Ek eklendi",
  attachment_removed: "Ek kaldırıldı",
  completed: "Tamamlandı",
  cancelled: "İptal edildi",
  archived: "Arşivlendi",
  reopened: "Yeniden açıldı",
};

export function TaskDetailPanel({
  task,
  checklist,
  comments,
  activity,
  attachments = [],
  isAdmin,
  assigneeLabel,
  currentActorIds = [],
  documentContext,
  relatedEntityContext,
}: {
  task: Task;
  checklist: TaskChecklistItem[];
  comments: TaskComment[];
  activity: TaskActivity[];
  attachments?: TaskAttachment[];
  /** Admin: durum/öncelik/kategori/sorumlu/tarih tam düzenleme + iptal/arşiv/yeniden-aç. TEACHER: yalnızca izinli statü + checklist + yorum. */
  isAdmin: boolean;
  assigneeLabel?: string;
  /** Oturum sahibinin olası kimlikleri (userId + teacherId) — "bu benim yorumum mu" kontrolü için. */
  currentActorIds?: string[];
  /**
   * İş Takip Faz 3B-1A — `task.documentId` varsa çözülmüş evrak bağlamı.
   * Sunucu tarafında (sayfa katmanında) `getDocumentInstanceTool` ile
   * ÖNCEDEN doğrulanır: belge silinmiş/başka kuruma aitse `undefined`
   * geçilir ve kırık link YERİNE hiçbir bağlantı gösterilmez. Yalnızca
   * `isAdmin` true iken render edilir (evrak ekranı zaten admin-only) —
   * TEACHER görünümüne bu prop hiç geçirilmez.
   */
  documentContext?: { id: string; reference: string } | null;
  /**
   * İş Takip Merkezi — `task.relatedEntityType/Id` varsa sunucu tarafında
   * ÖNCEDEN tenant-scope doğrulanmış sonuç (`resolveTaskRelatedEntityTool`).
   * `exists:false` → kayıt silinmiş/arşivlenmiş/başka kuruma ait; kırık link
   * YERİNE güvenli bir mesaj gösterilir.
   */
  relatedEntityContext?: { exists: boolean; href?: string } | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [newChecklistTitle, setNewChecklistTitle] = useState("");
  const [newComment, setNewComment] = useState("");
  const [confirmAction, setConfirmAction] = useState<"cancel" | "archive" | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentBody, setEditingCommentBody] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachmentTitle, setAttachmentTitle] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [confirmDeleteAttachmentId, setConfirmDeleteAttachmentId] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        setError(result.message ?? "İşlem başarısız.");
        return;
      }
      router.refresh();
    });
  }

  const canSetStatus = (status: TaskStatus) => isAdmin || (status !== "CANCELLED" && status !== "ARCHIVED");
  const activeChecklist = checklist.filter((c) => !c.archivedAt);
  const completedCount = activeChecklist.filter((c) => c.isCompleted).length;
  const activeAttachments = attachments.filter((a) => !a.deletedAt);

  async function onSelectAttachmentFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const fileData = await readFileAsBase64(file);
      const res = await actionAddTaskFileAttachment({
        taskId: task.id,
        title: attachmentTitle.trim() || file.name,
        fileName: file.name,
        fileMimeType: file.type || "application/octet-stream",
        fileData,
      });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setAttachmentTitle("");
      router.refresh();
    } catch {
      setError("Dosya okunamadı.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text)]">{task.title}</h1>
          {task.description ? (
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">{task.description}</p>
          ) : null}
        </div>
        <Badge status={task.status === "COMPLETED" ? "paid" : task.status === "CANCELLED" || task.status === "ARCHIVED" ? "cancelled" : "pending"}>
          {STATUS_LABEL[task.status]}
        </Badge>
      </div>

      {error ? (
        <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-xs font-medium text-[var(--color-danger)]" role="alert">
          {error}
        </p>
      ) : null}

      <div className="grid gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm sm:grid-cols-2">
        <div>
          <span className="text-[var(--color-text-muted)]">Öncelik:</span> {TASK_PRIORITY_LABEL[task.priority]}
        </div>
        <div>
          <span className="text-[var(--color-text-muted)]">Kategori:</span> {task.category}
        </div>
        <div>
          <span className="text-[var(--color-text-muted)]">Sorumlu:</span> {assigneeLabel ?? task.assigneeId ?? "Atanmadı"}
        </div>
        <div>
          <span className="text-[var(--color-text-muted)]">İlerleme:</span> {task.progressPercent}%
        </div>
        <div>
          <span className="text-[var(--color-text-muted)]">Başlangıç:</span>{" "}
          {task.startDate ? formatDateTime(task.startDate) : "—"}
        </div>
        <div>
          <span className="text-[var(--color-text-muted)]">Son tarih:</span>{" "}
          {task.dueDate ? formatDateTime(task.dueDate) : "—"}
        </div>
      </div>

      {/*
        Erişilebilir gecikme/hatırlatma durumu — RENK TEK BAŞINA anlam
        taşımaz, her zaman metin+ikon birlikte (bkz. madde 5 gereksinimi).
        Kullanıcı bildirim ALMIYORSA nedenini de burada görür (yanlış
        yönlendirme yok): son tarih yok / tamamlanmış / iptal-arşiv.
      */}
      <p className="text-xs text-[var(--color-text-muted)]" role="status">
        {(() => {
          if (task.status === "COMPLETED") return "✓ Tamamlandı — hatırlatma üretilmez.";
          if (task.status === "CANCELLED" || task.status === "ARCHIVED")
            return "— İptal/arşiv — hatırlatma üretilmez.";
          if (!task.dueDate) return "— Son tarih girilmemiş — hatırlatma üretilmez.";
          const todayYmd = new Date().toISOString().slice(0, 10);
          const dueYmd = task.dueDate.slice(0, 10);
          if (dueYmd < todayYmd) return "⚠ Gecikmiş — son tarih geçti.";
          if (dueYmd === todayYmd) return "⏰ Bugün teslim.";
          return "Son tarihe göre hatırlatma planlı (yaklaşınca/gününde bildirim alırsınız).";
        })()}
      </p>

      {task.studentId || task.teacherId || task.branchId || task.lessonId || task.paymentId || task.documentId ? (
        <div className="flex flex-wrap gap-2">
          {task.studentId ? (
            <a
              href={`/panel/ogrenciler/${task.studentId}`}
              className="rounded-md border border-[var(--color-border)] px-2.5 py-1 text-xs font-medium text-[var(--color-primary)] hover:underline"
            >
              Öğrenciye git →
            </a>
          ) : null}
          {task.teacherId ? (
            <a
              href={`/panel/ogretmenler/${task.teacherId}`}
              className="rounded-md border border-[var(--color-border)] px-2.5 py-1 text-xs font-medium text-[var(--color-primary)] hover:underline"
            >
              Öğretmene git →
            </a>
          ) : null}
          {task.paymentId ? (
            <a
              href={task.studentId ? `/panel/odemeler/${task.studentId}` : "/panel/odemeler"}
              className="rounded-md border border-[var(--color-border)] px-2.5 py-1 text-xs font-medium text-[var(--color-primary)] hover:underline"
            >
              Ödemeye git →
            </a>
          ) : null}
          {task.lessonId ? (
            <a
              href="/panel/program"
              className="rounded-md border border-[var(--color-border)] px-2.5 py-1 text-xs font-medium text-[var(--color-primary)] hover:underline"
            >
              Programa git →
            </a>
          ) : null}
          {task.documentId && isAdmin && documentContext ? (
            <a
              href={`/panel/evraklar/${documentContext.id}`}
              className="rounded-md border border-[var(--color-border)] px-2.5 py-1 text-xs font-medium text-[var(--color-primary)] hover:underline"
            >
              Evrağa git ({documentContext.reference}) →
            </a>
          ) : task.documentId && isAdmin ? (
            <span className="rounded-md border border-[var(--color-border)] px-2.5 py-1 text-xs font-medium text-[var(--color-text-muted)]">
              Bağlı evrak artık erişilemiyor.
            </span>
          ) : null}
        </div>
      ) : null}

      {task.relatedEntityType && task.relatedEntityId ? (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-[var(--color-text)]">İlişkili kayıt</h2>
          {relatedEntityContext?.exists && relatedEntityContext.href ? (
            <a
              href={relatedEntityContext.href}
              className="inline-block rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-sm font-medium text-[var(--color-primary)] hover:underline"
            >
              {RELATED_ENTITY_TYPE_LABEL[task.relatedEntityType] ?? task.relatedEntityType}
              {task.relatedEntityLabel ? `: ${task.relatedEntityLabel}` : ""} →
            </a>
          ) : (
            <p className="rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-sm text-[var(--color-text-muted)]">
              {task.relatedEntityLabel ? `${task.relatedEntityLabel} — ` : ""}Bu kayda artık erişilemiyor.
            </p>
          )}
        </section>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {task.status !== "COMPLETED" && canSetStatus("COMPLETED") ? (
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => run(() => actionChangeTaskStatus({ taskId: task.id, action: "complete" }))}
          >
            Tamamla
          </Button>
        ) : null}
        {task.status !== "IN_PROGRESS" && task.status !== "COMPLETED" ? (
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() =>
              run(() => actionChangeTaskStatus({ taskId: task.id, action: "set_status", status: "IN_PROGRESS" }))
            }
          >
            Devam ediyor olarak işaretle
          </Button>
        ) : null}
        {task.status !== "BLOCKED" && task.status !== "COMPLETED" ? (
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() =>
              run(() => actionChangeTaskStatus({ taskId: task.id, action: "set_status", status: "BLOCKED" }))
            }
          >
            Engellendi olarak işaretle
          </Button>
        ) : null}
        {(task.status === "COMPLETED" || task.status === "CANCELLED" || task.status === "ARCHIVED") ? (
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => run(() => actionChangeTaskStatus({ taskId: task.id, action: "reopen" }))}
          >
            Yeniden Aç
          </Button>
        ) : null}
        {isAdmin && task.status !== "CANCELLED" ? (
          <Button type="button" variant="danger" disabled={pending} onClick={() => setConfirmAction("cancel")}>
            İptal Et
          </Button>
        ) : null}
        {isAdmin && task.status !== "ARCHIVED" ? (
          <Button type="button" variant="secondary" disabled={pending} onClick={() => setConfirmAction("archive")}>
            Arşivle
          </Button>
        ) : null}
        {isAdmin ? (
          <CriticalDeleteDialog
            triggerLabel="İşi sil"
            title={`${task.title} — işi sil`}
            meaning="İş tüm listelerden, raporlardan ve hatırlatmalardan kaldırılır. Yorumlar, kontrol listesi, ekler ve geçmiş SİLİNMEZ; bağlı öğrenci/ödeme/evrak kayıtları değişmez. Kurum yöneticisi “Silinen işler” ekranından geri alabilir."
            confirmationName="SİL"
            confirmationLabel="Onay için kutuya yazın"
            submitLabel="İşi sil"
            loadImpact={async () => {
              const res = await actionGetTaskDeletionImpact(task.id);
              if (!res.ok) return res;
              const d = res.data;
              return {
                ok: true,
                data: {
                  allowed: true,
                  criticalPasswordConfigured: d.criticalPasswordConfigured,
                  lines: [
                    ["Durum", STATUS_LABEL[d.status as TaskStatus] ?? d.status],
                    ["Kontrol listesi", d.checklistCount],
                    ["Yorum", d.commentCount],
                    ["Ek", d.attachmentCount],
                    ["Bağlı kayıt", d.relatedLabel ?? "—"],
                  ],
                },
              };
            }}
            onSubmit={async ({ criticalPassword, reason, confirmation }) => {
              const res = await actionDeleteTask({ taskId: task.id, criticalPassword, reason, confirmation });
              if (!res.ok) return res;
              router.push("/panel/is-takip");
              router.refresh();
              return { ok: true };
            }}
          />
        ) : null}
      </div>

      {confirmAction ? (
        <div role="alertdialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-xl">
            <h3 className="text-base font-semibold text-[var(--color-text)]">
              Görev {confirmAction === "cancel" ? "iptal edilsin" : "arşivlensin"} mi?
            </h3>
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">
              Görev silinmez, istediğiniz zaman &quot;Yeniden Aç&quot; ile geri getirebilirsiniz.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setConfirmAction(null)} disabled={pending}>
                Vazgeç
              </Button>
              <Button
                type="button"
                variant="danger"
                disabled={pending}
                onClick={() => {
                  const action = confirmAction;
                  setConfirmAction(null);
                  run(() => actionChangeTaskStatus({ taskId: task.id, action }));
                }}
              >
                Onayla
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {isAdmin ? (
        <details className="rounded-lg border border-[var(--color-border)] p-3">
          <summary className="cursor-pointer text-sm font-semibold text-[var(--color-text)]">İlerleme yüzdesini elle güncelle</summary>
          <form
            className="mt-2 flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const value = Number((form.elements.namedItem("progressPercent") as HTMLInputElement).value);
              run(() => actionUpdateTask({ taskId: task.id, progressPercent: value }));
            }}
          >
            <Input name="progressPercent" type="number" min={0} max={100} defaultValue={task.progressPercent} className="!w-24" />
            <Button type="submit" variant="secondary" disabled={pending}>
              Kaydet
            </Button>
          </form>
        </details>
      ) : null}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-[var(--color-text)]">
          Checklist {activeChecklist.length > 0 ? `(${completedCount}/${activeChecklist.length})` : ""}
        </h2>
        <div className="space-y-1.5">
          {activeChecklist.map((item) => (
            <div key={item.id} className="flex items-center gap-2 rounded-md border border-[var(--color-border)] px-2.5 py-1.5">
              <input
                type="checkbox"
                checked={item.isCompleted}
                disabled={pending}
                onChange={(e) =>
                  run(() =>
                    actionSetTaskChecklistItemCompleted({
                      taskId: task.id,
                      itemId: item.id,
                      isCompleted: e.target.checked,
                    })
                  )
                }
              />
              <span className={item.isCompleted ? "flex-1 text-sm text-[var(--color-text-muted)] line-through" : "flex-1 text-sm text-[var(--color-text)]"}>
                {item.title}
              </span>
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => actionArchiveTaskChecklistItem({ taskId: task.id, itemId: item.id }))}
                className="text-xs text-[var(--color-text-muted)] hover:text-rose-600"
              >
                Kaldır
              </button>
            </div>
          ))}
        </div>
        <form
          className="mt-2 flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newChecklistTitle.trim()) return;
            run(async () => {
              const res = await actionAddTaskChecklistItem({ taskId: task.id, title: newChecklistTitle.trim() });
              if (res.ok) setNewChecklistTitle("");
              return res;
            });
          }}
        >
          <Input
            value={newChecklistTitle}
            onChange={(e) => setNewChecklistTitle(e.target.value)}
            placeholder="Yeni checklist maddesi…"
            className="flex-1"
          />
          <Button type="submit" variant="secondary" disabled={pending || !newChecklistTitle.trim()}>
            Ekle
          </Button>
        </form>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-[var(--color-text)]">Yorumlar</h2>
        <div className="space-y-2">
          {comments.length === 0 ? (
            <p className="text-xs text-[var(--color-text-muted)]">Henüz yorum yok.</p>
          ) : (
            comments.map((c) => {
              const canModify = isAdmin || currentActorIds.includes(c.authorId);
              const wasEdited = c.updatedAt !== c.createdAt;
              if (editingCommentId === c.id) {
                return (
                  <form
                    key={c.id}
                    className="flex items-center gap-2 rounded-md bg-[var(--color-bg)] p-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!editingCommentBody.trim()) return;
                      run(async () => {
                        const res = await actionUpdateTaskComment({
                          taskId: task.id,
                          commentId: c.id,
                          body: editingCommentBody.trim(),
                        });
                        if (res.ok) setEditingCommentId(null);
                        return res;
                      });
                    }}
                  >
                    <Input
                      value={editingCommentBody}
                      onChange={(e) => setEditingCommentBody(e.target.value)}
                      className="flex-1"
                      autoFocus
                    />
                    <Button type="submit" variant="secondary" disabled={pending || !editingCommentBody.trim()}>
                      Kaydet
                    </Button>
                    <button
                      type="button"
                      onClick={() => setEditingCommentId(null)}
                      className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                    >
                      Vazgeç
                    </button>
                  </form>
                );
              }
              return (
                <div key={c.id} className="rounded-md bg-[var(--color-bg)] p-2 text-sm">
                  <p className="text-[var(--color-text)]">{c.body}</p>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <p className="text-[11px] text-[var(--color-text-muted)]">
                      {formatDateTime(c.createdAt)}
                      {wasEdited ? " (düzenlendi)" : ""}
                    </p>
                    {canModify ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => {
                            setEditingCommentId(c.id);
                            setEditingCommentBody(c.body);
                          }}
                          className="text-[11px] font-medium text-[var(--color-primary)] hover:underline"
                        >
                          Düzenle
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => run(() => actionDeleteTaskComment({ taskId: task.id, commentId: c.id }))}
                          className="text-[11px] font-medium text-rose-600 hover:underline"
                        >
                          Kaldır
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>
        <form
          className="mt-2 flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newComment.trim()) return;
            run(async () => {
              const res = await actionAddTaskComment({ taskId: task.id, body: newComment.trim() });
              if (res.ok) setNewComment("");
              return res;
            });
          }}
        >
          <Input value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Yorum yaz…" className="flex-1" />
          <Button type="submit" variant="secondary" disabled={pending || !newComment.trim()}>
            Gönder
          </Button>
        </form>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-[var(--color-text)]">Ekler</h2>
        <div className="space-y-1.5">
          {activeAttachments.length === 0 ? (
            <p className="text-xs text-[var(--color-text-muted)]">Henüz ek yok.</p>
          ) : (
            activeAttachments.map((a) => {
              const canModify = isAdmin || currentActorIds.includes(a.createdById);
              return (
                <div
                  key={a.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-[var(--color-bg)] p-2 text-sm"
                >
                  <div className="min-w-0">
                    {a.type === "FILE" ? (
                      <a
                        href={`/api/v1/task-attachments/${a.id}/file`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-[var(--color-primary)] hover:underline"
                      >
                        📎 {a.title}
                      </a>
                    ) : (
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="font-medium text-[var(--color-primary)] hover:underline"
                      >
                        🔗 {a.title}
                      </a>
                    )}
                    <p className="text-[11px] text-[var(--color-text-muted)]">
                      {formatDateTime(a.createdAt)}
                      {a.type === "FILE" && a.fileSize ? ` · ${formatFileSize(a.fileSize)}` : ""}
                      {a.type === "LINK" ? ` · ${a.url}` : ""}
                    </p>
                  </div>
                  {canModify ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => setConfirmDeleteAttachmentId(a.id)}
                      className="shrink-0 text-[11px] font-medium text-rose-600 hover:underline"
                    >
                      Kaldır
                    </button>
                  ) : null}
                </div>
              );
            })
          )}
        </div>

        {confirmDeleteAttachmentId ? (
          <div
            role="alertdialog"
            aria-modal="true"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          >
            <div className="w-full max-w-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-xl">
              <h3 className="text-base font-semibold text-[var(--color-text)]">Ek kaldırılsın mı?</h3>
              <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                Bu işlem geri alınamaz; ek görev geçmişinde &quot;kaldırıldı&quot; olarak kalır.
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setConfirmDeleteAttachmentId(null)}
                  disabled={pending}
                >
                  Vazgeç
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  disabled={pending}
                  onClick={() => {
                    const attachmentId = confirmDeleteAttachmentId;
                    setConfirmDeleteAttachmentId(null);
                    run(() => actionDeleteTaskAttachment({ taskId: task.id, attachmentId }));
                  }}
                >
                  Kaldır
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-3 space-y-3 rounded-lg border border-dashed border-[var(--color-border)] p-3">
          <div>
            <Label>Ek başlığı (opsiyonel)</Label>
            <Input
              id="task-attachment-title"
              value={attachmentTitle}
              onChange={(e) => setAttachmentTitle(e.target.value)}
              placeholder="Örn. Veli onay formu"
            />
          </div>
          <div>
            <Label>Dosya ekle (PDF, görsel, ses/video, doküman — maks. 2MB)</Label>
            <input
              id="task-attachment-file"
              ref={fileInputRef}
              type="file"
              disabled={uploading || pending}
              onChange={(e) => void onSelectAttachmentFile(e)}
              className="block w-full text-sm text-[var(--color-text)]"
            />
            {uploading ? <p className="mt-1 text-xs text-[var(--color-text-muted)]">Yükleniyor…</p> : null}
          </div>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!linkUrl.trim()) return;
              run(async () => {
                const res = await actionAddTaskLinkAttachment({
                  taskId: task.id,
                  title: linkTitle.trim() || linkUrl.trim(),
                  url: linkUrl.trim(),
                });
                if (res.ok) {
                  setLinkTitle("");
                  setLinkUrl("");
                }
                return res;
              });
            }}
          >
            <div className="flex-1">
              <Label>Bağlantı başlığı (opsiyonel)</Label>
              <Input
                value={linkTitle}
                onChange={(e) => setLinkTitle(e.target.value)}
                placeholder="Örn. Drive klasörü"
              />
            </div>
            <div className="flex-1">
              <Label>Bağlantı ekle (https://…)</Label>
              <Input
                id="task-attachment-link-url"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://…"
                type="url"
              />
            </div>
            <Button type="submit" variant="secondary" disabled={pending || !linkUrl.trim()}>
              Bağlantı Ekle
            </Button>
          </form>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-[var(--color-text)]">Aktivite Geçmişi</h2>
        <div className="space-y-1.5">
          {activity.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-2 text-xs text-[var(--color-text-muted)]">
              <span>
                <strong className="text-[var(--color-text)]">{ACTIVITY_LABEL[a.action] ?? a.action}</strong> — {a.summary}
              </span>
              <span>{formatDateTime(a.createdAt)}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

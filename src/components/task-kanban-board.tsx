"use client";

/**
 * İş Takip Kanban görünümü — 5 sütun (Yapılacak/Devam Ediyor/Beklemede/
 * Tamamlandı/İptal Edildi; Arşiv kanbanda gösterilmez, ayrı bir filtredir).
 *
 * Faz 3B-2B — native tarayıcı Drag-and-Drop API'si (yeni ağır paket YOK)
 * eklendi; mevcut erişilebilir "Durumu değiştir" seçici KORUNDU — klavye/
 * ekran okuyucu/mobil dokunmatik kullanıcılar için birincil yol hâlâ o.
 * Her iki yol da AYNI `moveTask` fonksiyonuna, dolayısıyla AYNI
 * `actionChangeTaskStatus` server action'ına (AYNI RBAC/audit/aktivite
 * kaydı zincirine) çıkar — Kanban için paralel bir yetki/duruma-geçiş
 * mantığı YOK. Sürükleme İYİMSER: kart hemen hedef sütuna taşınır; sunucu
 * bir geçişi reddederse (ör. TEACHER CANCELLED'a taşımaya çalışırsa) kart
 * eski sütununa geri alınır ve Türkçe hata mesajı gösterilir.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "@/components/link";
import { actionChangeTaskStatus } from "@/lib/actions";
import { Badge, Card } from "@/components/ui";
import { formatDate, cn } from "@/lib/utils";
import { TASK_PRIORITY_LABEL, type Task, type TaskStatus } from "@/lib/types";

type Column = { status: TaskStatus; label: string };

const COLUMNS: Column[] = [
  { status: "TODO", label: "Yapılacak" },
  { status: "IN_PROGRESS", label: "Devam Ediyor" },
  { status: "BLOCKED", label: "Beklemede" },
  { status: "COMPLETED", label: "Tamamlandı" },
  { status: "CANCELLED", label: "İptal Edildi" },
];

/** Kanban'da hedef sütuna göre hangi changeTaskStatusTool aksiyonunun çağrılacağı — tek kaynak burada, tools.ts'teki semantiğin AYNISI. */
function actionForTarget(target: TaskStatus): { action: "complete" | "cancel" | "set_status"; status?: TaskStatus } {
  if (target === "COMPLETED") return { action: "complete" };
  if (target === "CANCELLED") return { action: "cancel" };
  return { action: "set_status", status: target };
}

const DETAIL_HREF_PREFIX_ADMIN = "/panel/is-takip/";
const DETAIL_HREF_PREFIX_TEACHER = "/ogretmen/is-takip/";

export function TaskKanbanBoard({
  tasks,
  isAdmin,
  assigneeLabels,
}: {
  tasks: Task[];
  isAdmin: boolean;
  /** taskId -> sorumlu görünen adı (ham ID göstermemek için, bkz. personel dizini). */
  assigneeLabels: Record<string, string>;
}) {
  const router = useRouter();
  const [localTasks, setLocalTasks] = useState<Task[]>(tasks);
  // Sunucudan yeni `tasks` gelince (router.refresh() sonrası veya filtre
  // değişince) yerel iyimser state'i gerçek kaynakla eşitle — React'in
  // önerdiği "render sırasında state ayarlama" deseniyle (useEffect YOK,
  // cascading render riski yok): bkz. https://react.dev/learn/you-might-not-need-an-effect
  const [prevTasksProp, setPrevTasksProp] = useState<Task[]>(tasks);
  if (tasks !== prevTasksProp) {
    setPrevTasksProp(tasks);
    setLocalTasks(tasks);
  }
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<string>("");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null);
  const [, startTransition] = useTransition();
  const detailPrefix = isAdmin ? DETAIL_HREF_PREFIX_ADMIN : DETAIL_HREF_PREFIX_TEACHER;
  const todayYmd = new Date().toISOString().slice(0, 10);

  function moveTask(taskId: string, target: TaskStatus) {
    const current = localTasks.find((t) => t.id === taskId);
    if (!current || current.status === target) return;
    const previousTasks = localTasks;
    const colLabel = COLUMNS.find((c) => c.status === target)?.label ?? target;

    setError(null);
    setPendingId(taskId);
    // İyimser taşıma — kart hemen hedef sütunda görünür.
    setLocalTasks((ts) => ts.map((t) => (t.id === taskId ? { ...t, status: target } : t)));
    setAnnouncement(`"${current.title}" görevi ${colLabel} sütununa taşınıyor…`);

    const { action, status } = actionForTarget(target);
    startTransition(async () => {
      const result = await actionChangeTaskStatus({ taskId, action, status });
      setPendingId(null);
      if (!result.ok) {
        // Sunucu reddetti — kartı eski sütununa geri al.
        setLocalTasks(previousTasks);
        setError(result.message);
        setAnnouncement(`"${current.title}" görevi taşınamadı: ${result.message}`);
        return;
      }
      setAnnouncement(`"${current.title}" görevi ${colLabel} sütununa taşındı.`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {error ? (
        <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-xs font-medium text-[var(--color-danger)]" role="alert">
          {error}
        </p>
      ) : null}
      {/* Ekran okuyucu için sessiz duyuru kanalı — sürükleme sonucu görsel olmayan kullanıcılara da iletilir. */}
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
      <p className="text-xs text-[var(--color-text-muted)]">
        Kartları sütunlar arası sürükleyebilir veya her kartın altındaki menüden durumu değiştirebilirsiniz.
      </p>
      <div className="grid grid-cols-1 gap-3 overflow-x-auto sm:grid-cols-2 lg:grid-cols-5">
        {COLUMNS.map((col) => {
          const colTasks = localTasks.filter((t) => t.status === col.status);
          const isDropTarget = dragOverColumn === col.status;
          return (
            <div
              key={col.status}
              role="list"
              aria-label={`${col.label} sütunu`}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (dragOverColumn !== col.status) setDragOverColumn(col.status);
              }}
              onDragLeave={() => setDragOverColumn((c) => (c === col.status ? null : c))}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverColumn(null);
                const taskId = e.dataTransfer.getData("text/plain");
                if (taskId) moveTask(taskId, col.status);
              }}
              className={cn(
                "min-w-0 rounded-lg p-1 transition-colors",
                isDropTarget ? "bg-[var(--color-primary)]/10 outline-dashed outline-2 outline-[var(--color-primary)]" : ""
              )}
            >
              <h2 className="mb-2 flex items-center justify-between text-sm font-semibold text-[var(--color-text)]">
                {col.label}
                <span className="rounded-full bg-[var(--color-bg)] px-2 py-0.5 text-xs text-[var(--color-text-muted)]">
                  {colTasks.length}
                </span>
              </h2>
              <div className="space-y-2">
                {colTasks.length === 0 ? (
                  <p className="rounded-md border border-dashed border-[var(--color-border)] p-3 text-center text-xs text-[var(--color-text-muted)]">
                    Görev yok
                  </p>
                ) : (
                  colTasks.map((t) => {
                    const overdue =
                      t.dueDate &&
                      t.dueDate.slice(0, 10) < todayYmd &&
                      t.status !== "COMPLETED" &&
                      t.status !== "CANCELLED";
                    return (
                      <div
                        key={t.id}
                        role="listitem"
                        draggable
                        aria-grabbed={draggingId === t.id}
                        aria-label={`${t.title} — sürükleyerek veya aşağıdaki menüden durumunu değiştirin`}
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", t.id);
                          e.dataTransfer.effectAllowed = "move";
                          setDraggingId(t.id);
                        }}
                        onDragEnd={() => {
                          setDraggingId(null);
                          setDragOverColumn(null);
                        }}
                        className={cn("cursor-grab active:cursor-grabbing", draggingId === t.id ? "opacity-50" : "")}
                      >
                        <Card className="!p-3">
                          <Link href={`${detailPrefix}${t.id}`} className="block">
                            <p className="text-sm font-medium text-[var(--color-text)] hover:underline">{t.title}</p>
                          </Link>
                          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                            {t.category} · {assigneeLabels[t.assigneeId ?? ""] ?? "Atanmadı"}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <Badge status={t.priority === "URGENT" || t.priority === "HIGH" ? "overdue" : "pending"}>
                              {TASK_PRIORITY_LABEL[t.priority]}
                            </Badge>
                            {overdue ? <Badge status="overdue">Gecikmiş</Badge> : null}
                            {t.dueDate ? (
                              <span className="text-[11px] text-[var(--color-text-muted)]">{formatDate(t.dueDate)}</span>
                            ) : null}
                          </div>
                          <label className="mt-2 block">
                            <span className="sr-only">{t.title} — durumu değiştir</span>
                            <select
                              value={t.status}
                              disabled={pendingId === t.id}
                              onChange={(e) => moveTask(t.id, e.target.value as TaskStatus)}
                              className="w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 py-1 text-xs"
                              aria-label={`${t.title} durumu`}
                            >
                              {COLUMNS.map((c) => (
                                <option key={c.status} value={c.status}>
                                  {c.label}
                                </option>
                              ))}
                            </select>
                          </label>
                        </Card>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

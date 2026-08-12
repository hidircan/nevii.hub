import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext, readScopedData } from "@/lib/institution/context";
import { KurumScopeNote } from "@/components/kurum-scope-note";
import { AssistantPageContext } from "@/components/ai/assistant-page-context";
import { BackButton } from "@/components/back-button";
import { Badge, Button, Card, EmptyState, Input, Label, PageHeader, Select } from "@/components/ui";
import { StatCard } from "@/components/ui";
import { getTaskKpiSummaryTool, listTasksTool, getDocumentInstanceTool } from "@/lib/services";
import { TASK_CATEGORIES, TASK_PRIORITIES, TASK_PRIORITY_LABEL, TASK_STATUSES, type TaskStatus } from "@/lib/types";
import { actionCreateTaskForm } from "@/lib/actions";
import { cn, formatDate } from "@/lib/utils";
import { listAssignableStaff, resolveStaffLabel } from "@/lib/staff-directory";
import { TaskReminderPreferencesModal } from "@/components/task-reminder-preferences-modal";
import { documentKindLabel } from "@/lib/documents";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<TaskStatus, string> = {
  TODO: "Yapılacak",
  IN_PROGRESS: "Devam Ediyor",
  BLOCKED: "Engellendi",
  COMPLETED: "Tamamlandı",
  CANCELLED: "İptal Edildi",
  ARCHIVED: "Arşivlendi",
};

const STATUS_BADGE: Record<TaskStatus, string> = {
  TODO: "pending",
  IN_PROGRESS: "confirmed",
  BLOCKED: "overdue",
  COMPLETED: "paid",
  CANCELLED: "cancelled",
  ARCHIVED: "cancelled",
};

const QUICK_FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "Tümü" },
  { value: "mine", label: "Bana Atananlar" },
  { value: "today", label: "Bugün" },
  { value: "week", label: "Bu Hafta" },
  { value: "overdue", label: "Gecikenler" },
  { value: "completed", label: "Tamamlananlar" },
  { value: "archived", label: "Arşiv" },
];

/**
 * İş Takip liste görünümü (`/panel/is-takip/liste`) — insan-odaklı operasyon
 * görev takibi. `/panel/workflows` (AI otomasyonu) ile İLGİSİZ, ayrı bir
 * modül. Yalnızca SUPER_ADMIN/SCHOOL_ADMIN erişir. Bu sprint (İş 2) öncesi
 * bu içerik `/panel/is-takip` kök rotasındaydı — kök artık daima
 * `/panel/is-takip/kanban`'a yönlendiriyor (server-side, flicker'sız); liste
 * hâlâ Kanban'ın "Liste görünümü" bağlantısından erişilebilir.
 */
export default async function IsTakipListePage({
  searchParams,
}: {
  searchParams: Promise<{
    quick?: string;
    search?: string;
    status?: string;
    priority?: string;
    category?: string;
    assigneeId?: string;
    branchId?: string;
    newTaskStudentId?: string;
    newTaskTeacherId?: string;
    newTaskLessonId?: string;
    newTaskPaymentId?: string;
    newTaskDocumentId?: string;
    newTaskBranchId?: string;
    newTaskRelatedType?: string;
    newTaskRelatedId?: string;
    newTaskRelatedLabel?: string;
    newTaskTitle?: string;
    returnTo?: string;
  }>;
}) {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/is-takip/liste");
  }
  if (session.role !== "SCHOOL_ADMIN" && session.role !== "SUPER_ADMIN") {
    redirect("/panel");
  }

  const sp = await searchParams;
  const kurum = await getInstitutionContext(session);
  const data = await readScopedData(kurum.scope);
  const staff = await listAssignableStaff(session.tenantId, data.teachers);

  const kpiRes = await getTaskKpiSummaryTool(session);
  const kpi = kpiRes.ok
    ? kpiRes.data
    : { openCount: 0, assignedToMeCount: 0, dueTodayCount: 0, overdueCount: 0, completedThisWeekCount: 0 };

  const quick = sp.quick && QUICK_FILTERS.some((f) => f.value === sp.quick) ? sp.quick : "all";
  const listRes = await listTasksTool(session, {
    quickFilter: quick,
    search: sp.search || undefined,
    status: sp.status ? [sp.status] : undefined,
    priority: sp.priority || undefined,
    category: sp.category || undefined,
    assigneeId: sp.assigneeId || undefined,
    branchId: sp.branchId || undefined,
  });
  const tasks = listRes.ok ? listRes.data.tasks : [];

  const canCreate = kurum.scope.mode === "single";
  const prefillStudentId = sp.newTaskStudentId || "";
  const prefillTeacherId = sp.newTaskTeacherId || "";
  const prefillLessonId = sp.newTaskLessonId || "";
  const prefillPaymentId = sp.newTaskPaymentId || "";
  const prefillDocumentId = sp.newTaskDocumentId || "";
  const prefillBranchId = sp.newTaskBranchId || "";
  const prefillRelatedType = sp.newTaskRelatedType || "";
  const prefillRelatedId = sp.newTaskRelatedId || "";
  const prefillRelatedLabel = sp.newTaskRelatedLabel || "";
  const hasContext = Boolean(
    prefillStudentId ||
      prefillTeacherId ||
      prefillLessonId ||
      prefillPaymentId ||
      prefillDocumentId ||
      prefillBranchId ||
      (prefillRelatedType && prefillRelatedId)
  );

  // İş Takip Merkezi — bağlamsal ekranlardan (İlişkili kayıt linki üzerinden)
  // gelen düzenlenebilir başlık önerisi: çağıran ekran `newTaskTitle` ile
  // hazır bir taslak geçirir (örn. "Ödeme takibi — Ada Yılmaz"). Evrak
  // bağlamı (Faz 3B-1A) geriye dönük uyumluluk için ayrıca burada üretilir —
  // belge erişilemez/başka kuruma aitse (silinmiş, cross-tenant deneme vb.)
  // sessizce boş kalır; sunucu tarafı validateTaskLinks zaten formu AYRICA
  // reddedecektir, burada yalnızca öneri metni etkilenir.
  let prefillTitle = sp.newTaskTitle || "";
  if (!prefillTitle && prefillDocumentId && canCreate) {
    const docRes = await getDocumentInstanceTool(session, { documentId: prefillDocumentId });
    if (docRes.ok) {
      prefillTitle = `${documentKindLabel(docRes.data.document.kind)} — ${docRes.data.document.reference}`;
    }
  }

  const todayYmd = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <KurumScopeNote scope={kurum.scope} />
      <AssistantPageContext entity={{ kind: "page", label: "İş Takip" }} />
      <BackButton fallbackHref="/panel/is-takip/kanban" label="İş Takip'e dön" className="mb-3" />
      <PageHeader
        title="İş Takip — Liste"
        actions={
          <div className="flex items-center gap-3">
            <Link href="/panel/is-takip/kanban" className="text-sm font-medium text-[var(--color-primary)] hover:underline">
              Kanban görünümü
            </Link>
            <Link href="/panel/is-takip/takvim" className="text-sm font-medium text-[var(--color-primary)] hover:underline">
              Takvim görünümü
            </Link>
            <Link href="/panel/is-takip/raporlar" className="text-sm font-medium text-[var(--color-primary)] hover:underline">
              Raporlar
            </Link>
            <TaskReminderPreferencesModal />
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Açık Görevler" value={kpi.openCount} accent="primary" />
        <StatCard label="Bana Atananlar" value={kpi.assignedToMeCount} accent="info" />
        <StatCard label="Bugün Teslim" value={kpi.dueTodayCount} accent="warning" />
        <StatCard label="Gecikenler" value={kpi.overdueCount} accent="danger" />
        <StatCard label="Bu Hafta Tamamlananlar" value={kpi.completedThisWeekCount} accent="success" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-1 rounded-md border border-[var(--color-border)] p-0.5">
        {QUICK_FILTERS.map((f) => (
          <Link
            key={f.value}
            href={`/panel/is-takip/liste?quick=${f.value}`}
            className={cn(
              "rounded px-3 py-1.5 text-xs font-semibold transition",
              quick === f.value
                ? "bg-[var(--color-primary)] text-white"
                : "text-[var(--color-text-muted)] hover:bg-[var(--color-bg)]"
            )}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <Card className="mb-6 !p-4">
        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input type="hidden" name="quick" value={quick} />
          <div>
            <Label>Ara</Label>
            <Input name="search" defaultValue={sp.search ?? ""} placeholder="Başlık/açıklama…" />
          </div>
          <div>
            <Label>Durum</Label>
            <Select name="status" defaultValue={sp.status ?? ""}>
              <option value="">Tümü</option>
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Öncelik</Label>
            <Select name="priority" defaultValue={sp.priority ?? ""}>
              <option value="">Tümü</option>
              {TASK_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {TASK_PRIORITY_LABEL[p]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Kategori</Label>
            <Select name="category" defaultValue={sp.category ?? ""}>
              <option value="">Tümü</option>
              {TASK_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Sorumlu</Label>
            <Select name="assigneeId" defaultValue={sp.assigneeId ?? ""}>
              <option value="">Tümü</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Şube</Label>
            <Select name="branchId" defaultValue={sp.branchId ?? ""}>
              <option value="">Tümü</option>
              {data.settings.branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex items-end">
            <Button type="submit" className="w-full">
              Filtrele
            </Button>
          </div>
        </form>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {tasks.length === 0 ? (
            <Card>
              <EmptyState
                title={
                  quick === "mine"
                    ? "Size atanan görev yok"
                    : quick === "overdue"
                      ? "Gecikmiş görev yok"
                      : quick === "completed"
                        ? "Tamamlanan görev yok"
                        : quick === "archived"
                          ? "Arşivlenmiş görev yok"
                          : sp.search || sp.status || sp.priority || sp.category || sp.assigneeId || sp.branchId
                            ? "Filtre sonucunda görev bulunamadı"
                            : "Henüz hiç görev yok"
                }
                description="Sağdaki formdan yeni bir görev oluşturabilirsiniz."
              />
            </Card>
          ) : (
            tasks.map((t) => {
              const overdue = t.dueDate && t.dueDate.slice(0, 10) < todayYmd && t.status !== "COMPLETED" && t.status !== "CANCELLED" && t.status !== "ARCHIVED";
              const dueToday = t.dueDate && t.dueDate.slice(0, 10) === todayYmd;
              const assigneeName = resolveStaffLabel(staff, t.assigneeId);
              return (
                <Link key={t.id} href={`/panel/is-takip/${t.id}`}>
                  <Card className="!p-4 transition hover:border-[var(--color-primary)]">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-[var(--color-text)]">{t.title}</p>
                        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                          {t.category} · Öncelik: {TASK_PRIORITY_LABEL[t.priority]}
                          {assigneeName ? ` · Sorumlu: ${assigneeName}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {overdue ? <Badge status="overdue">Gecikmiş</Badge> : null}
                        {dueToday ? <Badge status="pending">Bugün</Badge> : null}
                        <Badge status={STATUS_BADGE[t.status]}>{STATUS_LABEL[t.status]}</Badge>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[var(--color-text-muted)]">
                      <span>İlerleme: {t.progressPercent}%</span>
                      {t.dueDate ? <span>Son tarih: {formatDate(t.dueDate)}</span> : null}
                      <span>Güncelleme: {formatDate(t.updatedAt)}</span>
                      {t.studentId ? <span>Öğrenci bağlı</span> : null}
                      {t.teacherId ? <span>Öğretmen bağlı</span> : null}
                      {t.paymentId ? <span>Ödeme bağlı</span> : null}
                      {t.lessonId ? <span>Ders bağlı</span> : null}
                    </div>
                  </Card>
                </Link>
              );
            })
          )}
        </div>

        <Card>
          <h2 id="yeni-gorev" className="mb-4 scroll-mt-20 font-semibold text-[var(--color-text)]">
            Yeni Görev
          </h2>
          {!canCreate ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs font-medium text-amber-800">
              &quot;Tüm kurumlar&quot; görünümündesiniz — yeni görev eklemek için üstteki kurum seçiciden tek bir kurum seçin.
            </p>
          ) : (
            <form action={actionCreateTaskForm} className="space-y-3">
              {hasContext ? (
                <p className="rounded-md bg-[var(--color-bg)] px-3 py-2 text-xs text-[var(--color-text-muted)]">
                  Bu görev otomatik olarak bağlı kayda bağlanacak.
                </p>
              ) : null}
              <input type="hidden" name="studentId" value={prefillStudentId} />
              <input type="hidden" name="teacherId" value={prefillTeacherId} />
              <input type="hidden" name="lessonId" value={prefillLessonId} />
              <input type="hidden" name="paymentId" value={prefillPaymentId} />
              <input type="hidden" name="documentId" value={prefillDocumentId} />
              <input type="hidden" name="relatedEntityType" value={prefillRelatedType} />
              <input type="hidden" name="relatedEntityId" value={prefillRelatedId} />
              <input type="hidden" name="relatedEntityLabel" value={prefillRelatedLabel} />
              <div>
                <Label>Başlık</Label>
                <Input
                  name="title"
                  required
                  defaultValue={prefillTitle}
                  placeholder="Örn. Kayıt formunu güncelle"
                />
              </div>
              <div>
                <Label>Açıklama (opsiyonel)</Label>
                <Input name="description" placeholder="Kısa açıklama" />
              </div>
              <div>
                <Label>Kategori</Label>
                <Select name="category" defaultValue="Kayıt">
                  {TASK_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Öncelik</Label>
                <Select name="priority" defaultValue="MEDIUM">
                  {TASK_PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {TASK_PRIORITY_LABEL[p]}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Sorumlu (opsiyonel)</Label>
                <Select name="assigneeId" defaultValue="">
                  <option value="">Atanmadı</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label} {s.role !== "TEACHER" ? "(yönetici)" : ""}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Şube (opsiyonel)</Label>
                <Select name="branchId" defaultValue={prefillBranchId}>
                  <option value="">Seçilmedi</option>
                  {data.settings.branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Başlangıç (opsiyonel)</Label>
                  <Input name="startDate" type="date" />
                </div>
                <div>
                  <Label>Son tarih (opsiyonel)</Label>
                  <Input name="dueDate" type="date" />
                </div>
              </div>
              <div>
                <Label>Etiketler (virgülle ayır, opsiyonel)</Label>
                <Input name="tags" placeholder="ör. acil, form" />
              </div>
              <Button type="submit" className="w-full">
                Görev oluştur
              </Button>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}

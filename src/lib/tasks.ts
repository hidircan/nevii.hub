/**
 * İş Takip modülü (insan-odaklı operasyon görev takibi) — kalıcılık katmanı.
 * `/panel/is-takip`, `/ogretmen/is-takip` bu modülü kullanır. `/panel/workflows`
 * (AI otomasyonu) ile İLGİSİZ, ayrı bir modül.
 *
 * STORE_MODE=db  → Prisma Task/TaskChecklistItem/TaskComment/TaskActivity
 * STORE_MODE=json/memory → tek bir dosya tabanlı store (demo) — aynı desen:
 * src/lib/teacher-availability.ts, src/lib/announcements/index.ts.
 *
 * Bu modül AppData'nın (src/lib/store.ts) DIŞINDADIR — additive, mevcut
 * store şemasına dokunmaz. Tenant izolasyonu HER fonksiyonda `tenantId`
 * parametresiyle zorunludur (çağıran taraf — tools.ts — bunu ctx.tenantId'den
 * geçirir, asla istemciden gelen bir değerden değil).
 */

import path from "path";
import { isDbMode, resolveDataDir } from "./config";
import { uid } from "./utils";
import type {
  Task,
  TaskStatus,
  TaskPriority,
  TaskCategory,
  TaskChecklistItem,
  TaskComment,
  TaskActivity,
  TaskActivityAction,
  TaskAttachment,
  TaskAttachmentType,
} from "./types";

const FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "tasks.json");

/** Test cleanup için dışa açık — bu modülün yazdığı dosyayla aynı yol. */
export const TASKS_FILE = FILE;

type StoredTask = Task & { tenantId: string };
type StoredChecklistItem = TaskChecklistItem & { tenantId: string };
type StoredComment = TaskComment & { tenantId: string };
type StoredActivity = TaskActivity & { tenantId: string };
/** `fileData` yalnızca burada (dahili, ham) tutulur — `toPublicAttachment` ASLA dışarı sızdırmaz. */
type StoredAttachment = TaskAttachment & { tenantId: string; fileData?: string };

type StoreShape = {
  tasks: StoredTask[];
  checklist: StoredChecklistItem[];
  comments: StoredComment[];
  activity: StoredActivity[];
  attachments: StoredAttachment[];
};

const EMPTY: StoreShape = { tasks: [], checklist: [], comments: [], activity: [], attachments: [] };

async function loadAll(): Promise<StoreShape> {
  try {
    const fs = await import("fs/promises");
    const raw = await fs.readFile(FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<StoreShape>;
    return {
      tasks: parsed.tasks ?? [],
      checklist: parsed.checklist ?? [],
      comments: parsed.comments ?? [],
      activity: parsed.activity ?? [],
      attachments: parsed.attachments ?? [],
    };
  } catch {
    return { ...EMPTY };
  }
}

async function saveAll(shape: StoreShape): Promise<void> {
  const fs = await import("fs/promises");
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(shape, null, 2));
}

function toPublicTask(t: StoredTask): Task {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { tenantId, ...rest } = t;
  return rest;
}
function toPublicChecklist(c: StoredChecklistItem): TaskChecklistItem {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { tenantId, ...rest } = c;
  return rest;
}
function toPublicComment(c: StoredComment): TaskComment {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { tenantId, ...rest } = c;
  return rest;
}
function toPublicActivity(a: StoredActivity): TaskActivity {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { tenantId, ...rest } = a;
  return rest;
}
/** `fileData` bilinçli olarak DIŞARIDA bırakılır — liste/detay yanıtları ham dosya baytı taşımaz. */
function toPublicAttachment(a: StoredAttachment): TaskAttachment {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { tenantId, fileData, ...rest } = a;
  return rest;
}

// ─── Task ──────────────────────────────────────────────────────────────

export type CreateTaskInput = {
  tenantId: string;
  title: string;
  description?: string;
  priority: TaskPriority;
  category: TaskCategory;
  assigneeId?: string;
  followerIds?: string[];
  createdById: string;
  startDate?: string;
  dueDate?: string;
  tags?: string[];
  studentId?: string;
  teacherId?: string;
  branchId?: string;
  lessonId?: string;
  paymentId?: string;
  documentId?: string;
  relatedEntityType?: Task["relatedEntityType"];
  relatedEntityId?: string;
  relatedEntityLabel?: string;
};

async function dbTask() {
  const { prisma } = await import("./db");
  return prisma;
}

function mapDbTask(r: {
  id: string;
  tenantId: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  category: string;
  assigneeId: string | null;
  followerIds: unknown;
  createdById: string;
  startDate: Date | null;
  dueDate: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  archivedAt: Date | null;
  deletedAt?: Date | null;
  deletedByUserId?: string | null;
  deletionReason?: string | null;
  progressPercent: number;
  tags: unknown;
  studentId: string | null;
  teacherId: string | null;
  branchId: string | null;
  lessonId: string | null;
  paymentId: string | null;
  documentId: string | null;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  relatedEntityLabel: string | null;
  createdAt: Date;
  updatedAt: Date;
}): StoredTask {
  return {
    id: r.id,
    tenantId: r.tenantId,
    title: r.title,
    description: r.description ?? undefined,
    status: r.status as TaskStatus,
    priority: r.priority as TaskPriority,
    category: r.category as TaskCategory,
    assigneeId: r.assigneeId ?? undefined,
    followerIds: (r.followerIds as string[] | null) ?? [],
    createdById: r.createdById,
    startDate: r.startDate?.toISOString(),
    dueDate: r.dueDate?.toISOString(),
    completedAt: r.completedAt?.toISOString(),
    cancelledAt: r.cancelledAt?.toISOString(),
    archivedAt: r.archivedAt?.toISOString(),
    deletedAt: r.deletedAt?.toISOString(),
    deletedByUserId: r.deletedByUserId ?? undefined,
    deletionReason: r.deletionReason ?? undefined,
    progressPercent: r.progressPercent,
    tags: (r.tags as string[] | null) ?? [],
    studentId: r.studentId ?? undefined,
    teacherId: r.teacherId ?? undefined,
    branchId: (r.branchId as StoredTask["branchId"]) ?? undefined,
    lessonId: r.lessonId ?? undefined,
    paymentId: r.paymentId ?? undefined,
    documentId: r.documentId ?? undefined,
    relatedEntityType: (r.relatedEntityType as StoredTask["relatedEntityType"]) ?? undefined,
    relatedEntityId: r.relatedEntityId ?? undefined,
    relatedEntityLabel: r.relatedEntityLabel ?? undefined,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export async function createTask(input: CreateTaskInput): Promise<Task> {
  const now = new Date().toISOString();
  const record: StoredTask = {
    id: uid("task"),
    tenantId: input.tenantId,
    title: input.title,
    description: input.description,
    status: "TODO",
    priority: input.priority,
    category: input.category,
    assigneeId: input.assigneeId,
    followerIds: input.followerIds ?? [],
    createdById: input.createdById,
    startDate: input.startDate,
    dueDate: input.dueDate,
    progressPercent: 0,
    tags: input.tags ?? [],
    studentId: input.studentId,
    teacherId: input.teacherId,
    branchId: input.branchId as StoredTask["branchId"],
    lessonId: input.lessonId,
    paymentId: input.paymentId,
    documentId: input.documentId,
    relatedEntityType: input.relatedEntityType,
    relatedEntityId: input.relatedEntityId,
    relatedEntityLabel: input.relatedEntityLabel,
    createdAt: now,
    updatedAt: now,
  };
  if (isDbMode) {
    const prisma = await dbTask();
    const row = await prisma.task.create({
      data: {
        id: record.id,
        tenantId: record.tenantId,
        title: record.title,
        description: record.description ?? null,
        status: record.status,
        priority: record.priority,
        category: record.category,
        assigneeId: record.assigneeId ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        followerIds: record.followerIds as any,
        createdById: record.createdById,
        startDate: record.startDate ? new Date(record.startDate) : null,
        dueDate: record.dueDate ? new Date(record.dueDate) : null,
        progressPercent: 0,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tags: record.tags as any,
        studentId: record.studentId ?? null,
        teacherId: record.teacherId ?? null,
        branchId: record.branchId ?? null,
        lessonId: record.lessonId ?? null,
        paymentId: record.paymentId ?? null,
        documentId: record.documentId ?? null,
        relatedEntityType: record.relatedEntityType ?? null,
        relatedEntityId: record.relatedEntityId ?? null,
        relatedEntityLabel: record.relatedEntityLabel ?? null,
      },
    });
    return toPublicTask(mapDbTask(row));
  }
  const all = await loadAll();
  await saveAll({ ...all, tasks: [...all.tasks, record] });
  return toPublicTask(record);
}

/**
 * 9. tur — silinmiş (soft delete) görev varsayılan olarak YOK sayılır: detay, yorum,
 * checklist, ek ve durum değişikliği NOT_FOUND alır. Yalnız geri alma/silinenler listesi
 * `includeDeleted` ister.
 */
export async function getTask(tenantId: string, id: string, opts?: { includeDeleted?: boolean }): Promise<Task | null> {
  let found: StoredTask | undefined;
  if (isDbMode) {
    const prisma = await dbTask();
    const row = await prisma.task.findFirst({ where: { id, tenantId } });
    found = row ? mapDbTask(row) : undefined;
  } else {
    const all = await loadAll();
    found = all.tasks.find((t) => t.id === id && t.tenantId === tenantId);
  }
  if (!found || (found.deletedAt && !opts?.includeDeleted)) return null;
  return toPublicTask(found);
}

export type TaskFilter = {
  status?: TaskStatus[];
  priority?: TaskPriority;
  category?: TaskCategory;
  assigneeId?: string;
  followerId?: string;
  branchId?: string;
  createdById?: string;
  tag?: string;
  search?: string;
  dueBefore?: string;
  dueAfter?: string;
  /** Yalnızca bu kullanıcının sorumlu OLDUĞU veya takipçi olduğu görevler (RBAC daraltması — tool katmanı geçirir). */
  ownedByAny?: string[];
};

function matchesFilter(t: StoredTask, filter?: TaskFilter): boolean {
  if (!filter) return true;
  if (filter.status && filter.status.length > 0 && !filter.status.includes(t.status)) return false;
  if (filter.priority && t.priority !== filter.priority) return false;
  if (filter.category && t.category !== filter.category) return false;
  if (filter.assigneeId && t.assigneeId !== filter.assigneeId) return false;
  if (filter.followerId && !t.followerIds.includes(filter.followerId)) return false;
  if (filter.branchId && t.branchId !== filter.branchId) return false;
  if (filter.createdById && t.createdById !== filter.createdById) return false;
  if (filter.tag && !t.tags.includes(filter.tag)) return false;
  if (filter.dueBefore && (!t.dueDate || t.dueDate > filter.dueBefore)) return false;
  if (filter.dueAfter && (!t.dueDate || t.dueDate < filter.dueAfter)) return false;
  if (filter.search) {
    const q = filter.search.toLocaleLowerCase("tr");
    const hay = `${t.title} ${t.description ?? ""}`.toLocaleLowerCase("tr");
    if (!hay.includes(q)) return false;
  }
  if (filter.ownedByAny && filter.ownedByAny.length > 0) {
    // Yalnızca sorumlu VEYA takipçi — "createdById" KASITLI OLARAK dahil
    // değil: Faz 1'de yalnızca admin görev oluşturabilir (TEACHER asla
    // createdById olamaz), bu yüzden görünürlük tam olarak spesifikasyondaki
    // "sadece kendine atanan/takipçi olduğu görevler" ile eşleşir.
    const owned =
      (t.assigneeId && filter.ownedByAny.includes(t.assigneeId)) ||
      t.followerIds.some((f) => filter.ownedByAny!.includes(f));
    if (!owned) return false;
  }
  return true;
}

async function listStoredTasks(tenantId: string): Promise<StoredTask[]> {
  if (isDbMode) {
    const prisma = await dbTask();
    const rows = await prisma.task.findMany({ where: { tenantId }, orderBy: { updatedAt: "desc" } });
    return rows.map(mapDbTask);
  }
  const all = await loadAll();
  return all.tasks.filter((t) => t.tenantId === tenantId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Silinmiş görevler HER listede, KPI'da, raporda ve hatırlatmada hariç (tek kapı). */
export async function listTasks(tenantId: string, filter?: TaskFilter): Promise<Task[]> {
  return (await listStoredTasks(tenantId)).filter((t) => !t.deletedAt && matchesFilter(t, filter)).map(toPublicTask);
}

/** 9. tur — "Silinen işler" (geri alma ekranı). */
export async function listDeletedTasks(tenantId: string): Promise<Task[]> {
  return (await listStoredTasks(tenantId))
    .filter((t) => t.deletedAt)
    .sort((a, b) => (b.deletedAt ?? "").localeCompare(a.deletedAt ?? ""))
    .map(toPublicTask);
}

/** 9. tur — geri alınabilir silme / geri alma. `state=null` geri alır. Yorum/checklist/ek/aktivite korunur. */
export async function setTaskDeletion(
  tenantId: string,
  id: string,
  state: { deletedAt: string; deletedByUserId: string; deletionReason: string } | null
): Promise<Task | null> {
  if (isDbMode) {
    const prisma = await dbTask();
    const res = await prisma.task.updateMany({
      where: { id, tenantId },
      data: state
        ? { deletedAt: new Date(state.deletedAt), deletedByUserId: state.deletedByUserId, deletionReason: state.deletionReason }
        : { deletedAt: null, deletedByUserId: null, deletionReason: null },
    });
    if (res.count === 0) return null;
    return getTask(tenantId, id, { includeDeleted: true });
  }
  const all = await loadAll();
  const idx = all.tasks.findIndex((t) => t.id === id && t.tenantId === tenantId);
  if (idx === -1) return null;
  const updated: StoredTask = state
    ? { ...all.tasks[idx], ...state }
    : { ...all.tasks[idx], deletedAt: undefined, deletedByUserId: undefined, deletionReason: undefined };
  const nextTasks = [...all.tasks];
  nextTasks[idx] = updated;
  await saveAll({ ...all, tasks: nextTasks });
  return toPublicTask(updated);
}

export type UpdateTaskInput = Partial<
  Pick<
    Task,
    | "title"
    | "description"
    | "status"
    | "priority"
    | "category"
    | "assigneeId"
    | "followerIds"
    | "startDate"
    | "dueDate"
    | "completedAt"
    | "cancelledAt"
    | "archivedAt"
    | "progressPercent"
    | "tags"
    | "studentId"
    | "teacherId"
    | "branchId"
    | "lessonId"
    | "paymentId"
    | "documentId"
    | "relatedEntityType"
    | "relatedEntityId"
    | "relatedEntityLabel"
  >
>;

export async function updateTask(
  tenantId: string,
  id: string,
  patch: UpdateTaskInput
): Promise<Task | null> {
  const now = new Date().toISOString();
  if (isDbMode) {
    const prisma = await dbTask();
    const existing = await prisma.task.findFirst({ where: { id, tenantId } });
    if (!existing) return null;
    const row = await prisma.task.update({
      where: { id },
      data: {
        ...("title" in patch ? { title: patch.title } : {}),
        ...("description" in patch ? { description: patch.description ?? null } : {}),
        ...("status" in patch ? { status: patch.status } : {}),
        ...("priority" in patch ? { priority: patch.priority } : {}),
        ...("category" in patch ? { category: patch.category } : {}),
        ...("assigneeId" in patch ? { assigneeId: patch.assigneeId ?? null } : {}),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...("followerIds" in patch ? { followerIds: patch.followerIds as any } : {}),
        ...("startDate" in patch ? { startDate: patch.startDate ? new Date(patch.startDate) : null } : {}),
        ...("dueDate" in patch ? { dueDate: patch.dueDate ? new Date(patch.dueDate) : null } : {}),
        ...("completedAt" in patch ? { completedAt: patch.completedAt ? new Date(patch.completedAt) : null } : {}),
        ...("cancelledAt" in patch ? { cancelledAt: patch.cancelledAt ? new Date(patch.cancelledAt) : null } : {}),
        ...("archivedAt" in patch ? { archivedAt: patch.archivedAt ? new Date(patch.archivedAt) : null } : {}),
        ...("progressPercent" in patch ? { progressPercent: patch.progressPercent } : {}),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...("tags" in patch ? { tags: patch.tags as any } : {}),
        ...("studentId" in patch ? { studentId: patch.studentId ?? null } : {}),
        ...("teacherId" in patch ? { teacherId: patch.teacherId ?? null } : {}),
        ...("branchId" in patch ? { branchId: patch.branchId ?? null } : {}),
        ...("lessonId" in patch ? { lessonId: patch.lessonId ?? null } : {}),
        ...("paymentId" in patch ? { paymentId: patch.paymentId ?? null } : {}),
        ...("documentId" in patch ? { documentId: patch.documentId ?? null } : {}),
        ...("relatedEntityType" in patch ? { relatedEntityType: patch.relatedEntityType ?? null } : {}),
        ...("relatedEntityId" in patch ? { relatedEntityId: patch.relatedEntityId ?? null } : {}),
        ...("relatedEntityLabel" in patch ? { relatedEntityLabel: patch.relatedEntityLabel ?? null } : {}),
      },
    });
    return toPublicTask(mapDbTask(row));
  }
  const all = await loadAll();
  const idx = all.tasks.findIndex((t) => t.id === id && t.tenantId === tenantId);
  if (idx === -1) return null;
  const updated: StoredTask = { ...all.tasks[idx], ...patch, updatedAt: now };
  const nextTasks = [...all.tasks];
  nextTasks[idx] = updated;
  await saveAll({ ...all, tasks: nextTasks });
  return toPublicTask(updated);
}

async function clearTasksDb(tenantId: string): Promise<void> {
  const prisma = await dbTask();
  await prisma.task.deleteMany({ where: { tenantId } });
}

/** Demo/kurulum sıfırlaması için — tenant'ın TÜM görev verisini (checklist/yorum/aktivite/ek dahil) siler. */
export async function clearTasks(tenantId: string): Promise<void> {
  if (isDbMode) return clearTasksDb(tenantId);
  const all = await loadAll();
  await saveAll({
    tasks: all.tasks.filter((t) => t.tenantId !== tenantId),
    checklist: all.checklist.filter((c) => c.tenantId !== tenantId),
    comments: all.comments.filter((c) => c.tenantId !== tenantId),
    activity: all.activity.filter((a) => a.tenantId !== tenantId),
    attachments: all.attachments.filter((a) => a.tenantId !== tenantId),
  });
}

/** Kurum dışa aktarımı (yedek) için — silinmişler DAHİL tüm görevler (`deletedAt` sütunuyla). */
export async function listAllTasks(tenantId: string): Promise<Task[]> {
  return (await listStoredTasks(tenantId)).map(toPublicTask);
}

// ─── Checklist ─────────────────────────────────────────────────────────

function mapDbChecklist(r: {
  id: string;
  taskId: string;
  tenantId: string;
  title: string;
  isCompleted: boolean;
  sortOrder: number;
  completedAt: Date | null;
  completedById: string | null;
  archivedAt: Date | null;
}): StoredChecklistItem {
  return {
    id: r.id,
    taskId: r.taskId,
    tenantId: r.tenantId,
    title: r.title,
    isCompleted: r.isCompleted,
    sortOrder: r.sortOrder,
    completedAt: r.completedAt?.toISOString(),
    completedById: r.completedById ?? undefined,
    archivedAt: r.archivedAt?.toISOString(),
  };
}

export async function addChecklistItem(
  tenantId: string,
  taskId: string,
  title: string,
  sortOrder: number
): Promise<TaskChecklistItem> {
  if (isDbMode) {
    const prisma = await dbTask();
    const row = await prisma.taskChecklistItem.create({
      data: { id: uid("chk"), taskId, tenantId, title, isCompleted: false, sortOrder },
    });
    return toPublicChecklist(mapDbChecklist(row));
  }
  const all = await loadAll();
  const record: StoredChecklistItem = {
    id: uid("chk"),
    taskId,
    tenantId,
    title,
    isCompleted: false,
    sortOrder,
  };
  await saveAll({ ...all, checklist: [...all.checklist, record] });
  return toPublicChecklist(record);
}

export async function listChecklistItems(tenantId: string, taskId: string): Promise<TaskChecklistItem[]> {
  if (isDbMode) {
    const prisma = await dbTask();
    const rows = await prisma.taskChecklistItem.findMany({
      where: { tenantId, taskId, archivedAt: null },
      orderBy: { sortOrder: "asc" },
    });
    return rows.map((r) => toPublicChecklist(mapDbChecklist(r)));
  }
  const all = await loadAll();
  return all.checklist
    .filter((c) => c.tenantId === tenantId && c.taskId === taskId && !c.archivedAt)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(toPublicChecklist);
}

export async function setChecklistItemCompleted(
  tenantId: string,
  itemId: string,
  isCompleted: boolean,
  completedById: string
): Promise<TaskChecklistItem | null> {
  const now = new Date().toISOString();
  if (isDbMode) {
    const prisma = await dbTask();
    const existing = await prisma.taskChecklistItem.findFirst({ where: { id: itemId, tenantId } });
    if (!existing) return null;
    const row = await prisma.taskChecklistItem.update({
      where: { id: itemId },
      data: {
        isCompleted,
        completedAt: isCompleted ? new Date() : null,
        completedById: isCompleted ? completedById : null,
      },
    });
    return toPublicChecklist(mapDbChecklist(row));
  }
  const all = await loadAll();
  const idx = all.checklist.findIndex((c) => c.id === itemId && c.tenantId === tenantId);
  if (idx === -1) return null;
  const updated: StoredChecklistItem = {
    ...all.checklist[idx],
    isCompleted,
    completedAt: isCompleted ? now : undefined,
    completedById: isCompleted ? completedById : undefined,
  };
  const next = [...all.checklist];
  next[idx] = updated;
  await saveAll({ ...all, checklist: next });
  return toPublicChecklist(updated);
}

/** Soft-archive — hard delete yok (madde C gereksinimi). */
export async function archiveChecklistItem(tenantId: string, itemId: string): Promise<boolean> {
  const now = new Date().toISOString();
  if (isDbMode) {
    const prisma = await dbTask();
    const result = await prisma.taskChecklistItem.updateMany({
      where: { id: itemId, tenantId },
      data: { archivedAt: new Date() },
    });
    return result.count > 0;
  }
  const all = await loadAll();
  const idx = all.checklist.findIndex((c) => c.id === itemId && c.tenantId === tenantId);
  if (idx === -1) return false;
  const next = [...all.checklist];
  next[idx] = { ...next[idx], archivedAt: now };
  await saveAll({ ...all, checklist: next });
  return true;
}

// ─── Comments ──────────────────────────────────────────────────────────

function mapDbComment(r: {
  id: string;
  taskId: string;
  tenantId: string;
  authorId: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}): StoredComment {
  return {
    id: r.id,
    taskId: r.taskId,
    tenantId: r.tenantId,
    authorId: r.authorId,
    body: r.body,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    deletedAt: r.deletedAt?.toISOString(),
  };
}

export async function addComment(
  tenantId: string,
  taskId: string,
  authorId: string,
  body: string
): Promise<TaskComment> {
  const now = new Date().toISOString();
  if (isDbMode) {
    const prisma = await dbTask();
    const row = await prisma.taskComment.create({
      data: { id: uid("cmt"), taskId, tenantId, authorId, body },
    });
    return toPublicComment(mapDbComment(row));
  }
  const all = await loadAll();
  const record: StoredComment = { id: uid("cmt"), taskId, tenantId, authorId, body, createdAt: now, updatedAt: now };
  await saveAll({ ...all, comments: [...all.comments, record] });
  return toPublicComment(record);
}

/** Yalnızca yazar/admin çağırabilir (yetki kontrolü tools.ts'te) — burada sadece tenant-scoped kayıt bulunur/güncellenir. */
export async function updateComment(
  tenantId: string,
  commentId: string,
  body: string
): Promise<TaskComment | null> {
  const now = new Date().toISOString();
  if (isDbMode) {
    const prisma = await dbTask();
    const existing = await prisma.taskComment.findFirst({ where: { id: commentId, tenantId, deletedAt: null } });
    if (!existing) return null;
    const row = await prisma.taskComment.update({ where: { id: commentId }, data: { body } });
    return toPublicComment(mapDbComment(row));
  }
  const all = await loadAll();
  const idx = all.comments.findIndex((c) => c.id === commentId && c.tenantId === tenantId && !c.deletedAt);
  if (idx === -1) return null;
  const updated: StoredComment = { ...all.comments[idx], body, updatedAt: now };
  const next = [...all.comments];
  next[idx] = updated;
  await saveAll({ ...all, comments: next });
  return toPublicComment(updated);
}

/** Soft delete — hard delete yok (modül gereksinimi, yorumlar da dahil). */
export async function softDeleteComment(tenantId: string, commentId: string): Promise<boolean> {
  const now = new Date().toISOString();
  if (isDbMode) {
    const prisma = await dbTask();
    const result = await prisma.taskComment.updateMany({
      where: { id: commentId, tenantId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return result.count > 0;
  }
  const all = await loadAll();
  const idx = all.comments.findIndex((c) => c.id === commentId && c.tenantId === tenantId && !c.deletedAt);
  if (idx === -1) return false;
  const next = [...all.comments];
  next[idx] = { ...next[idx], deletedAt: now };
  await saveAll({ ...all, comments: next });
  return true;
}

/** Yorum sahipliği kontrolü için — tools.ts RBAC'inde kullanılır. Silinmiş yorum da bulunabilir (yetki hatası mesajı için). */
export async function getCommentById(tenantId: string, commentId: string): Promise<TaskComment | null> {
  if (isDbMode) {
    const prisma = await dbTask();
    const row = await prisma.taskComment.findFirst({ where: { id: commentId, tenantId } });
    return row ? toPublicComment(mapDbComment(row)) : null;
  }
  const all = await loadAll();
  const found = all.comments.find((c) => c.id === commentId && c.tenantId === tenantId);
  return found ? toPublicComment(found) : null;
}

export async function listComments(tenantId: string, taskId: string): Promise<TaskComment[]> {
  if (isDbMode) {
    const prisma = await dbTask();
    const rows = await prisma.taskComment.findMany({
      where: { tenantId, taskId, deletedAt: null },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((r) => toPublicComment(mapDbComment(r)));
  }
  const all = await loadAll();
  return all.comments
    .filter((c) => c.tenantId === tenantId && c.taskId === taskId && !c.deletedAt)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map(toPublicComment);
}

// ─── Activity (görev geçmişi/audit izi) ────────────────────────────────

export async function addActivity(
  tenantId: string,
  taskId: string,
  actorId: string,
  action: TaskActivityAction,
  summary: string
): Promise<void> {
  const now = new Date().toISOString();
  if (isDbMode) {
    const prisma = await dbTask();
    await prisma.taskActivity.create({
      data: { id: uid("act"), taskId, tenantId, actorId, action, summary },
    });
    return;
  }
  const all = await loadAll();
  const record: StoredActivity = { id: uid("act"), taskId, tenantId, actorId, action, summary, createdAt: now };
  await saveAll({ ...all, activity: [...all.activity, record] });
}

export async function listActivity(tenantId: string, taskId: string): Promise<TaskActivity[]> {
  if (isDbMode) {
    const prisma = await dbTask();
    const rows = await prisma.taskActivity.findMany({
      where: { tenantId, taskId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) =>
      toPublicActivity({
        id: r.id,
        taskId: r.taskId,
        tenantId: r.tenantId,
        actorId: r.actorId,
        action: r.action as TaskActivityAction,
        summary: r.summary,
        createdAt: r.createdAt.toISOString(),
      })
    );
  }
  const all = await loadAll();
  return all.activity
    .filter((a) => a.tenantId === tenantId && a.taskId === taskId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(toPublicActivity);
}

// ─── Attachments (İş Takip Faz 3B-2A — dosya/link eki) ─────────────────

function mapDbAttachment(r: {
  id: string;
  taskId: string;
  tenantId: string;
  type: string;
  title: string;
  url: string | null;
  fileName: string | null;
  fileMimeType: string | null;
  fileSize: number | null;
  fileData: string | null;
  createdById: string;
  createdAt: Date;
  deletedAt: Date | null;
}): StoredAttachment {
  return {
    id: r.id,
    taskId: r.taskId,
    tenantId: r.tenantId,
    type: r.type as TaskAttachmentType,
    title: r.title,
    url: r.url ?? undefined,
    fileName: r.fileName ?? undefined,
    fileMimeType: r.fileMimeType ?? undefined,
    fileSize: r.fileSize ?? undefined,
    fileData: r.fileData ?? undefined,
    createdById: r.createdById,
    createdAt: r.createdAt.toISOString(),
    deletedAt: r.deletedAt?.toISOString(),
  };
}

export type AddFileAttachmentInput = {
  tenantId: string;
  taskId: string;
  createdById: string;
  title: string;
  fileName: string;
  fileMimeType: string;
  fileData: string;
  fileSize: number;
};

export async function addFileAttachment(input: AddFileAttachmentInput): Promise<TaskAttachment> {
  const now = new Date().toISOString();
  if (isDbMode) {
    const prisma = await dbTask();
    const row = await prisma.taskAttachment.create({
      data: {
        id: uid("att"),
        taskId: input.taskId,
        tenantId: input.tenantId,
        type: "FILE",
        title: input.title,
        fileName: input.fileName,
        fileMimeType: input.fileMimeType,
        fileSize: input.fileSize,
        fileData: input.fileData,
        createdById: input.createdById,
      },
    });
    return toPublicAttachment(mapDbAttachment(row));
  }
  const all = await loadAll();
  const record: StoredAttachment = {
    id: uid("att"),
    taskId: input.taskId,
    tenantId: input.tenantId,
    type: "FILE",
    title: input.title,
    fileName: input.fileName,
    fileMimeType: input.fileMimeType,
    fileSize: input.fileSize,
    fileData: input.fileData,
    createdById: input.createdById,
    createdAt: now,
  };
  await saveAll({ ...all, attachments: [...all.attachments, record] });
  return toPublicAttachment(record);
}

export type AddLinkAttachmentInput = {
  tenantId: string;
  taskId: string;
  createdById: string;
  title: string;
  url: string;
};

export async function addLinkAttachment(input: AddLinkAttachmentInput): Promise<TaskAttachment> {
  const now = new Date().toISOString();
  if (isDbMode) {
    const prisma = await dbTask();
    const row = await prisma.taskAttachment.create({
      data: {
        id: uid("att"),
        taskId: input.taskId,
        tenantId: input.tenantId,
        type: "LINK",
        title: input.title,
        url: input.url,
        createdById: input.createdById,
      },
    });
    return toPublicAttachment(mapDbAttachment(row));
  }
  const all = await loadAll();
  const record: StoredAttachment = {
    id: uid("att"),
    taskId: input.taskId,
    tenantId: input.tenantId,
    type: "LINK",
    title: input.title,
    url: input.url,
    createdById: input.createdById,
    createdAt: now,
  };
  await saveAll({ ...all, attachments: [...all.attachments, record] });
  return toPublicAttachment(record);
}

/** Liste/detay için — `fileData` HİÇBİR ZAMAN döndürülmez (bkz. toPublicAttachment). */
export async function listAttachments(tenantId: string, taskId: string): Promise<TaskAttachment[]> {
  if (isDbMode) {
    const prisma = await dbTask();
    const rows = await prisma.taskAttachment.findMany({
      where: { tenantId, taskId, deletedAt: null },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((r) => toPublicAttachment(mapDbAttachment(r)));
  }
  const all = await loadAll();
  return all.attachments
    .filter((a) => a.tenantId === tenantId && a.taskId === taskId && !a.deletedAt)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map(toPublicAttachment);
}

/**
 * Sahiplik/silme kontrolü + dosya indirme için — `fileData` DAHİL tam kaydı
 * döndürür. Çağıran taraf (tools.ts) tenant + görev erişimini zaten
 * doğrulamış olmalı; bu fonksiyon yalnızca tenant-scoped okuma yapar.
 */
export async function getAttachmentById(tenantId: string, attachmentId: string): Promise<StoredAttachment | null> {
  if (isDbMode) {
    const prisma = await dbTask();
    const row = await prisma.taskAttachment.findFirst({ where: { id: attachmentId, tenantId } });
    return row ? mapDbAttachment(row) : null;
  }
  const all = await loadAll();
  return all.attachments.find((a) => a.id === attachmentId && a.tenantId === tenantId) ?? null;
}

/** Soft delete — hard delete yok (yorum deseniyle aynı). */
export async function softDeleteAttachment(tenantId: string, attachmentId: string): Promise<boolean> {
  const now = new Date().toISOString();
  if (isDbMode) {
    const prisma = await dbTask();
    const result = await prisma.taskAttachment.updateMany({
      where: { id: attachmentId, tenantId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return result.count > 0;
  }
  const all = await loadAll();
  const idx = all.attachments.findIndex((a) => a.id === attachmentId && a.tenantId === tenantId && !a.deletedAt);
  if (idx === -1) return false;
  const next = [...all.attachments];
  next[idx] = { ...next[idx], deletedAt: now };
  await saveAll({ ...all, attachments: next });
  return true;
}

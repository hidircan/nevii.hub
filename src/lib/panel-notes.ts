/**
 * 2026-10-05 — Günlük Özet "Notlar": personelin sonraki vardiyaya / ertesi gün gelecek yöneticiye
 * bıraktığı serbest not; kim ve ne zaman yazdı kalıcıdır.
 * 2026-10-06 — düzenleme (son düzenleyen + zaman görünür) ve silme. Silme = gizleme (kayıt kalır), owner
 * kuralı gereği kritik işlem şifresi + gerekçe ile (`guardCriticalDelete`).
 * STORE_MODE=db → Prisma `PanelNote`; json/memory → dosya (announcements/index.ts ile aynı desen).
 */
import path from "path";
import { z } from "zod";
import { isDbMode, resolveDataDir } from "./config";
import { uid } from "./utils";
import { fail, ok, type ServiceResult } from "./services/result";
import { requireRole, type ServiceContext } from "./services/context";

export type PanelNote = {
  id: string;
  body: string;
  createdByUserId: string;
  createdByName: string;
  createdAt: string;
  updatedAt?: string;
  updatedByName?: string;
};

export const PANEL_NOTES_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "panel-notes.json");
/**
 * Kurum yöneticileri; SUPER_ADMIN requireRole'da zaten geçer. Şube müdürü YOK: notlar kurum genelidir,
 * şube müdürü yalnız atandığı şubenin verisini görür (fail-closed).
 */
const NOTE_ROLES = ["SCHOOL_ADMIN"] as ServiceContext["role"][];
export const PANEL_NOTE_MAX_LENGTH = 2000;

type Stored = PanelNote & { tenantId: string; updatedByUserId?: string; deletedAt?: string; deletedByUserId?: string; deletionReason?: string };

async function loadAll(): Promise<Stored[]> {
  try {
    const fs = await import("fs/promises");
    return JSON.parse(await fs.readFile(PANEL_NOTES_FILE, "utf8")) as Stored[];
  } catch {
    return [];
  }
}

async function saveAll(rows: Stored[]): Promise<void> {
  const fs = await import("fs/promises");
  await fs.mkdir(path.dirname(PANEL_NOTES_FILE), { recursive: true });
  await fs.writeFile(PANEL_NOTES_FILE, JSON.stringify(rows, null, 2));
}

const toNote = (n: Pick<Stored, keyof PanelNote>): PanelNote => ({
  id: n.id,
  body: n.body,
  createdByUserId: n.createdByUserId,
  createdByName: n.createdByName,
  createdAt: n.createdAt,
  ...(n.updatedAt ? { updatedAt: n.updatedAt, updatedByName: n.updatedByName } : {}),
});

async function readNotes(tenantId: string, limit: number): Promise<PanelNote[]> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    const rows = await prisma.panelNote.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, body: true, createdByUserId: true, createdByName: true, createdAt: true, updatedAt: true, updatedByName: true },
    });
    return rows.map((r) =>
      toNote({ ...r, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt?.toISOString(), updatedByName: r.updatedByName ?? undefined })
    );
  }
  return (await loadAll())
    .filter((n) => n.tenantId === tenantId && !n.deletedAt)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit)
    .map(toNote);
}

async function findNote(tenantId: string, id: string): Promise<PanelNote | null> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    const r = await prisma.panelNote.findFirst({ where: { id, tenantId, deletedAt: null } });
    return r ? toNote({ ...r, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt?.toISOString(), updatedByName: r.updatedByName ?? undefined }) : null;
  }
  const n = (await loadAll()).find((x) => x.id === id && x.tenantId === tenantId && !x.deletedAt);
  return n ? toNote(n) : null;
}

/** Tek yazım yolu (düzenleme/silme): yalnız bu kurumun silinmemiş notu. */
async function patchNote(tenantId: string, id: string, patch: Partial<Omit<Stored, "id" | "tenantId">>): Promise<void> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    await prisma.panelNote.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: {
        ...(patch.body !== undefined ? { body: patch.body } : {}),
        ...(patch.updatedAt ? { updatedAt: new Date(patch.updatedAt), updatedByUserId: patch.updatedByUserId, updatedByName: patch.updatedByName } : {}),
        ...(patch.deletedAt ? { deletedAt: new Date(patch.deletedAt), deletedByUserId: patch.deletedByUserId, deletionReason: patch.deletionReason } : {}),
      },
    });
    return;
  }
  const all = await loadAll();
  const i = all.findIndex((x) => x.id === id && x.tenantId === tenantId && !x.deletedAt);
  if (i < 0) return;
  all[i] = { ...all[i]!, ...patch };
  await saveAll(all);
}

function validateBody(raw: unknown): { ok: true; body: string } | { ok: false; message: string } {
  const body = typeof raw === "string" ? raw.trim() : "";
  if (!body) return { ok: false, message: "Not boş olamaz. Kaydetmeden önce notunuzu yazın." };
  if (body.length > PANEL_NOTE_MAX_LENGTH) {
    return { ok: false, message: `Not en fazla ${PANEL_NOTE_MAX_LENGTH} karakter olabilir (şu an ${body.length}). Kısaltıp tekrar kaydedin.` };
  }
  return { ok: true, body };
}

async function actorName(ctx: ServiceContext): Promise<string> {
  const { resolveActorLabel } = await import("./contract-payment-plan-view");
  return resolveActorLabel({ tenantId: ctx.tenantId, userId: ctx.userId, teachers: [] });
}

export async function listPanelNotesTool(ctx: ServiceContext, input: { limit?: number } = {}): Promise<ServiceResult<PanelNote[]>> {
  const auth = requireRole(ctx, NOTE_ROLES);
  if (!auth.ok) return fail("FORBIDDEN", "Notları yalnız kurum yöneticileri görebilir.");
  return ok(await readNotes(ctx.tenantId, Math.min(Math.max(input.limit ?? 200, 1), 500)));
}

export async function addPanelNoteTool(ctx: ServiceContext, input: unknown): Promise<ServiceResult<PanelNote>> {
  const auth = requireRole(ctx, NOTE_ROLES);
  if (!auth.ok) return fail("FORBIDDEN", "Not eklemeyi yalnız kurum yöneticileri yapabilir.");
  const v = validateBody((input as { body?: unknown } | null)?.body);
  if (!v.ok) return fail("VALIDATION_ERROR", v.message);
  const note: PanelNote = {
    id: uid("note"),
    body: v.body,
    createdByUserId: ctx.userId,
    createdByName: await actorName(ctx),
    createdAt: new Date().toISOString(),
  };
  if (isDbMode) {
    const { prisma } = await import("./db");
    await prisma.panelNote.create({ data: { ...note, tenantId: ctx.tenantId, createdAt: new Date(note.createdAt) } });
  } else {
    await saveAll([...(await loadAll()), { ...note, tenantId: ctx.tenantId }]);
  }
  return ok(note);
}

const updateSchema = z.object({ id: z.string().min(1), body: z.unknown() });

/** Düzenleme yetkisi: notu yazan veya kurum sahibi (SUPER_ADMIN). UI da aynı kuralla "Düzenle" gösterir. */
export function canEditPanelNote(ctx: Pick<ServiceContext, "role" | "userId">, note: Pick<PanelNote, "createdByUserId">): boolean {
  return ctx.role === "SUPER_ADMIN" || note.createdByUserId === ctx.userId;
}

/** Notu revize eder; ilk yazan değişmez, son düzenleyen + zaman notta görünür. */
export async function updatePanelNoteTool(ctx: ServiceContext, input: unknown): Promise<ServiceResult<PanelNote>> {
  const auth = requireRole(ctx, NOTE_ROLES);
  if (!auth.ok) return fail("FORBIDDEN", "Notu düzenlemeyi yalnız kurum yöneticileri yapabilir.");
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Düzenlenecek not bulunamadı. Sayfayı yenileyip tekrar deneyin.");
  const v = validateBody(parsed.data.body);
  if (!v.ok) return fail("VALIDATION_ERROR", v.message);
  const current = await findNote(ctx.tenantId, parsed.data.id);
  if (!current) return fail("NOT_FOUND", "Not bulunamadı; silinmiş olabilir. Sayfayı yenileyin.");
  // Not, yazanın adıyla görünür: metni yalnız yazan (veya kurum sahibi) değiştirir — başkasının ağzından not yazılamaz.
  if (!canEditPanelNote(ctx, current)) {
    return fail("FORBIDDEN", `Bu notu ${current.createdByName} yazdı; yalnız notu yazan kişi veya kurum sahibi düzenleyebilir. Düzeltme için yeni bir not ekleyin.`);
  }
  if (current.body === v.body) return ok(current);
  const updatedAt = new Date().toISOString();
  const updatedByName = await actorName(ctx);
  await patchNote(ctx.tenantId, current.id, { body: v.body, updatedAt, updatedByUserId: ctx.userId, updatedByName });
  const { recordAuditLog } = await import("./audit/log");
  void recordAuditLog({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    action: "panel_note.update",
    entityType: "PanelNote",
    entityId: current.id,
    outcome: "success",
    meta: { beforeLength: current.body.length, afterLength: v.body.length },
  });
  return ok({ ...current, body: v.body, updatedAt, updatedByName });
}

/** Notu siler (gizler; kayıt + gerekçe kalır). Owner kuralı: rol + kritik işlem şifresi + gerekçe. */
export async function deletePanelNoteTool(ctx: ServiceContext, input: unknown): Promise<ServiceResult<{ id: string }>> {
  const auth = requireRole(ctx, NOTE_ROLES);
  if (!auth.ok) return fail("FORBIDDEN", "Notu silmeyi yalnız kurum yöneticileri yapabilir.");
  const { criticalDeleteFields, guardCriticalDelete } = await import("./services/tools");
  const parsed = z.object({ id: z.string().min(1), ...criticalDeleteFields }).safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Silme bilgilerini kontrol edin.");
  const current = await findNote(ctx.tenantId, parsed.data.id);
  if (!current) return fail("NOT_FOUND", "Not bulunamadı; zaten silinmiş olabilir. Sayfayı yenileyin.");
  const denied = await guardCriticalDelete(
    ctx,
    { action: "panel_note.delete", entityType: "PanelNote", entityId: current.id },
    parsed.data.criticalPassword
  );
  if (denied) return denied;
  await patchNote(ctx.tenantId, current.id, { deletedAt: new Date().toISOString(), deletedByUserId: ctx.userId, deletionReason: parsed.data.reason });
  const { recordAuditLog } = await import("./audit/log");
  void recordAuditLog({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    action: "panel_note.delete",
    entityType: "PanelNote",
    entityId: current.id,
    outcome: "success",
    meta: { reasonLength: parsed.data.reason.length },
  });
  return ok({ id: current.id });
}

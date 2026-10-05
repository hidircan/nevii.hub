/**
 * 2026-10-05 — Günlük Özet "Notlar": personelin sonraki vardiyaya / ertesi gün gelecek yöneticiye
 * bıraktığı serbest not. Yalnız eklenir (düzenleme/silme yok); kim ve ne zaman kalıcıdır.
 * STORE_MODE=db → Prisma `PanelNote`; json/memory → dosya (announcements/index.ts ile aynı desen).
 */
import path from "path";
import { z } from "zod";
import { isDbMode, resolveDataDir } from "./config";
import { uid } from "./utils";
import { fail, ok, type ServiceResult } from "./services/result";
import { requireRole, type ServiceContext } from "./services/context";

export type PanelNote = { id: string; body: string; createdByUserId: string; createdByName: string; createdAt: string };

export const PANEL_NOTES_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "panel-notes.json");
/** Panel personeli (öğretmen portalı/öğrenci hariç); SUPER_ADMIN requireRole'da zaten geçer. */
const NOTE_ROLES = ["SCHOOL_ADMIN", "BRANCH_MANAGER"] as ServiceContext["role"][];
export const PANEL_NOTE_MAX_LENGTH = 2000;

type Stored = PanelNote & { tenantId: string };

async function loadAll(): Promise<Stored[]> {
  try {
    const fs = await import("fs/promises");
    return JSON.parse(await fs.readFile(PANEL_NOTES_FILE, "utf8")) as Stored[];
  } catch {
    return [];
  }
}

async function readNotes(tenantId: string, limit: number): Promise<PanelNote[]> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    const rows = await prisma.panelNote.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: limit,
      omit: { tenantId: true },
    });
    return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
  }
  return (await loadAll())
    .filter((n) => n.tenantId === tenantId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit)
    .map((n) => ({ id: n.id, body: n.body, createdByUserId: n.createdByUserId, createdByName: n.createdByName, createdAt: n.createdAt }));
}

export async function listPanelNotesTool(ctx: ServiceContext, input: { limit?: number } = {}): Promise<ServiceResult<PanelNote[]>> {
  const auth = requireRole(ctx, NOTE_ROLES);
  if (!auth.ok) return fail("FORBIDDEN", "Notları yalnız kurum yöneticileri görebilir.");
  return ok(await readNotes(ctx.tenantId, Math.min(Math.max(input.limit ?? 200, 1), 500)));
}

const addSchema = z.object({ body: z.string() });

export async function addPanelNoteTool(ctx: ServiceContext, input: unknown): Promise<ServiceResult<PanelNote>> {
  const auth = requireRole(ctx, NOTE_ROLES);
  if (!auth.ok) return fail("FORBIDDEN", "Not eklemeyi yalnız kurum yöneticileri yapabilir.");
  const parsed = addSchema.safeParse(input);
  const body = parsed.success ? parsed.data.body.trim() : "";
  if (!body) return fail("VALIDATION_ERROR", "Not boş olamaz. Kaydetmeden önce notunuzu yazın.");
  if (body.length > PANEL_NOTE_MAX_LENGTH) {
    return fail("VALIDATION_ERROR", `Not en fazla ${PANEL_NOTE_MAX_LENGTH} karakter olabilir (şu an ${body.length}). Kısaltıp tekrar kaydedin.`);
  }
  const { resolveActorLabel } = await import("./contract-payment-plan-view");
  const note: PanelNote = {
    id: uid("note"),
    body,
    createdByUserId: ctx.userId,
    createdByName: await resolveActorLabel({ tenantId: ctx.tenantId, userId: ctx.userId, teachers: [] }),
    createdAt: new Date().toISOString(),
  };
  if (isDbMode) {
    const { prisma } = await import("./db");
    await prisma.panelNote.create({ data: { ...note, tenantId: ctx.tenantId, createdAt: new Date(note.createdAt) } });
  } else {
    const fs = await import("fs/promises");
    const all = await loadAll();
    await fs.mkdir(path.dirname(PANEL_NOTES_FILE), { recursive: true });
    await fs.writeFile(PANEL_NOTES_FILE, JSON.stringify([...all, { ...note, tenantId: ctx.tenantId }], null, 2));
  }
  return ok(note);
}

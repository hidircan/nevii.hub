/**
 * PRODUCT_BACKLOG §4.2 + ÖNCELİK 4 — kurum çapında (öğrenciye özel değil)
 * kapalı gün / açık gün istisnaları. `ClosedDay` şeması daha önce eklenmişti
 * (migration 20260805190000_product_backlog_core) ama hiçbir store/tool/UI
 * katmanı hiç yazılmamıştı — bu modül onu ilk kez gerçek bir CRUD'a bağlar.
 *
 * Tarih başına TEK kayıt (upsert) — aynı tarihi tekrar set etmek yeni satır
 * değil, mevcut kaydı GÜNCELLER.
 */

import path from "path";
import { isDbMode, resolveDataDir } from "./config";
import { uid } from "./utils";
import type { AppData, ClosedDay, ClosedDayKind } from "./types";

const FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "closed-days.json");
export const CLOSED_DAYS_FILE = FILE;

type Stored = ClosedDay & { tenantId: string };

async function loadAll(): Promise<Stored[]> {
  try {
    const fs = await import("fs/promises");
    return JSON.parse(await fs.readFile(FILE, "utf8")) as Stored[];
  } catch {
    return [];
  }
}

async function saveAll(rows: Stored[]) {
  const fs = await import("fs/promises");
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(rows, null, 2));
}

function toPublic(r: Stored): ClosedDay {
  const { tenantId: _t, ...pub } = r;
  void _t;
  return pub;
}

export type SetClosedDayInput = {
  tenantId: string;
  date: string; // yyyy-MM-dd
  name: string;
  kind: ClosedDayKind;
  isOpen: boolean;
  createdBy: string;
};

/** Tarih başına upsert — mevcut kayıt varsa günceller, yoksa oluşturur. */
export async function setClosedDay(input: SetClosedDayInput): Promise<ClosedDay> {
  const now = new Date().toISOString();

  if (isDbMode) {
    const { prisma } = await import("./db");
    const existing = await prisma.closedDay.findFirst({
      where: { tenantId: input.tenantId, date: input.date },
    });
    if (existing) {
      const updated = await prisma.closedDay.update({
        where: { id: existing.id },
        data: { name: input.name, kind: input.kind, isOpen: input.isOpen },
      });
      return {
        id: updated.id,
        date: updated.date,
        name: updated.name,
        kind: updated.kind as ClosedDayKind,
        isOpen: updated.isOpen,
        createdBy: updated.createdBy,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      };
    }
    const created = await prisma.closedDay.create({
      data: {
        id: uid("cld"),
        tenantId: input.tenantId,
        date: input.date,
        name: input.name,
        kind: input.kind,
        isOpen: input.isOpen,
        createdBy: input.createdBy,
      },
    });
    return {
      id: created.id,
      date: created.date,
      name: created.name,
      kind: created.kind as ClosedDayKind,
      isOpen: created.isOpen,
      createdBy: created.createdBy,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    };
  }

  const all = await loadAll();
  const idx = all.findIndex((r) => r.tenantId === input.tenantId && r.date === input.date);
  if (idx >= 0) {
    const updated: Stored = {
      ...all[idx]!,
      name: input.name,
      kind: input.kind,
      isOpen: input.isOpen,
      updatedAt: now,
    };
    const next = [...all];
    next[idx] = updated;
    await saveAll(next);
    return toPublic(updated);
  }
  const row: Stored = {
    id: uid("cld"),
    tenantId: input.tenantId,
    date: input.date,
    name: input.name,
    kind: input.kind,
    isOpen: input.isOpen,
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
  };
  await saveAll([...all, row]);
  return toPublic(row);
}

/** İstisnayı kaldırır — gün, alttaki dönem/resmi tatil kuralına döner. */
export async function removeClosedDay(tenantId: string, date: string): Promise<boolean> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    const result = await prisma.closedDay.deleteMany({ where: { tenantId, date } });
    return result.count > 0;
  }
  const all = await loadAll();
  const next = all.filter((r) => !(r.tenantId === tenantId && r.date === date));
  if (next.length === all.length) return false;
  await saveAll(next);
  return true;
}

export async function listClosedDays(
  tenantId: string,
  range?: { from: string; to: string }
): Promise<ClosedDay[]> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    const rows = await prisma.closedDay.findMany({
      where: {
        tenantId,
        ...(range ? { date: { gte: range.from, lte: range.to } } : {}),
      },
      orderBy: { date: "asc" },
    });
    return rows.map((r) => ({
      id: r.id,
      date: r.date,
      name: r.name,
      kind: r.kind as ClosedDayKind,
      isOpen: r.isOpen,
      createdBy: r.createdBy,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }
  const all = await loadAll();
  return all
    .filter((r) => r.tenantId === tenantId && (!range || (r.date >= range.from && r.date <= range.to)))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(toPublic);
}

/** Demo reset için. */
export async function clearClosedDays(tenantId: string): Promise<void> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    await prisma.closedDay.deleteMany({ where: { tenantId } });
    return;
  }
  const all = await loadAll();
  const remaining = all.filter((r) => r.tenantId !== tenantId);
  if (remaining.length !== all.length) await saveAll(remaining);
}

/**
 * 2026-09-30 KÖK NEDEN — store içi doğrulama (addLesson, seri, taşıma, telafi onayı) store'un KENDİ
 * `readData`'sını kullanır; istisnalar yalnız `store.ts` sarmalayıcısında eklendiği için "zorla açık"
 * gün kayıt anında yine kapalı sayılıyordu. Her store modu okumada bunu çağırır; yazarken ayıklanır.
 */
export async function withClosedDayOverrides(data: AppData, tenantId: string): Promise<AppData> {
  const closedDayOverrides = await listClosedDays(tenantId).catch(() => []);
  return { ...data, closedDayOverrides };
}

/** İstisnalar ayrı tabloda/dosyada tutulur — store'a kopyası yazılmaz. */
export function withoutClosedDayOverrides(data: AppData): AppData {
  if (!("closedDayOverrides" in data)) return data;
  const { closedDayOverrides: _omit, ...rest } = data;
  void _omit;
  return rest;
}

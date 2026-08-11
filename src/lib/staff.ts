/**
 * Personel Modülü — öğretmen dışı personel kayıtları. Aynı desen
 * `instrument-catalog.ts`/`closed-day-overrides.ts` ile: isDbMode ?
 * prisma : atomic JSON dosyası (STORE_MODE=memory de bu dosya tabanlı
 * yolu kullanır — AppData store triad'ının parçası değil, bağımsız bir
 * modül). Yazımlar `atomic-json-file.ts` (temp dosya → doğrula → rename +
 * process-içi kilit) üzerinden yapılır — bkz. o dosyanın kök neden notu
 * (data/store.json ve instrument-catalog.json'da yaşanan bozulma/kayıp
 * güncelleme sınıfı).
 */

import path from "path";
import { isDbMode, resolveDataDir } from "./config";
import { uid } from "./utils";
import { withFileLock, writeJsonFileAtomic } from "./atomic-json-file";
import type { StaffMember, StaffMemberStatus } from "./types";

const FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "staff.json");
export const STAFF_FILE = FILE;

type Stored = StaffMember & { tenantId: string };

async function loadAll(): Promise<Stored[]> {
  try {
    const fs = await import("fs/promises");
    return JSON.parse(await fs.readFile(FILE, "utf8")) as Stored[];
  } catch {
    return [];
  }
}

async function saveAll(rows: Stored[]) {
  await writeJsonFileAtomic(FILE, rows);
}

function toPublic(r: Stored): StaffMember {
  const { tenantId: _t, ...pub } = r;
  void _t;
  return pub;
}

export async function listStaff(tenantId: string): Promise<StaffMember[]> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    const rows = await prisma.staffMember.findMany({ where: { tenantId }, orderBy: { createdAt: "asc" } });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      position: r.position,
      phone: r.phone ?? undefined,
      email: r.email ?? undefined,
      branchId: r.branchId ?? undefined,
      status: r.status as StaffMemberStatus,
      notes: r.notes ?? undefined,
      createdBy: r.createdBy,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }
  const all = await loadAll();
  return all
    .filter((r) => r.tenantId === tenantId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map(toPublic);
}

export type CreateStaffResult = { ok: true; entry: StaffMember } | { ok: false; message: string };

export async function createStaffMember(input: {
  tenantId: string;
  name: string;
  position: string;
  phone?: string;
  email?: string;
  branchId?: string;
  notes?: string;
  createdBy: string;
}): Promise<CreateStaffResult> {
  const name = input.name.trim();
  const position = input.position.trim();
  if (!name) return { ok: false, message: "Ad soyad boş olamaz." };
  if (!position) return { ok: false, message: "Rol/görev boş olamaz." };
  const now = new Date().toISOString();

  if (isDbMode) {
    const { prisma } = await import("./db");
    const created = await prisma.staffMember.create({
      data: {
        id: uid("staff"),
        tenantId: input.tenantId,
        name,
        position,
        phone: input.phone || undefined,
        email: input.email || undefined,
        branchId: input.branchId || undefined,
        status: "active",
        notes: input.notes || undefined,
        createdBy: input.createdBy,
      },
    });
    return {
      ok: true,
      entry: {
        id: created.id,
        name: created.name,
        position: created.position,
        phone: created.phone ?? undefined,
        email: created.email ?? undefined,
        branchId: created.branchId ?? undefined,
        status: created.status as StaffMemberStatus,
        notes: created.notes ?? undefined,
        createdBy: created.createdBy,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      },
    };
  }

  return withFileLock(FILE, async () => {
    const all = await loadAll();
    const row: Stored = {
      id: uid("staff"),
      tenantId: input.tenantId,
      name,
      position,
      phone: input.phone || undefined,
      email: input.email || undefined,
      branchId: input.branchId || undefined,
      status: "active",
      notes: input.notes || undefined,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    await saveAll([...all, row]);
    return { ok: true, entry: toPublic(row) };
  });
}

export type UpdateStaffResult = { ok: true; entry: StaffMember } | { ok: false; message: string };

export async function updateStaffMember(
  tenantId: string,
  staffId: string,
  patch: {
    name?: string;
    position?: string;
    phone?: string;
    email?: string;
    branchId?: string;
    status?: StaffMemberStatus;
    notes?: string;
  }
): Promise<UpdateStaffResult> {
  const trimmedName = patch.name?.trim();
  const trimmedPosition = patch.position?.trim();
  if (trimmedName !== undefined && !trimmedName) return { ok: false, message: "Ad soyad boş olamaz." };
  if (trimmedPosition !== undefined && !trimmedPosition) return { ok: false, message: "Rol/görev boş olamaz." };
  const now = new Date().toISOString();

  if (isDbMode) {
    const { prisma } = await import("./db");
    const existing = await prisma.staffMember.findFirst({ where: { id: staffId, tenantId } });
    if (!existing) return { ok: false, message: "Personel kaydı bulunamadı." };
    const updated = await prisma.staffMember.update({
      where: { id: staffId },
      data: {
        name: trimmedName,
        position: trimmedPosition,
        phone: patch.phone,
        email: patch.email,
        branchId: patch.branchId,
        status: patch.status,
        notes: patch.notes,
      },
    });
    return {
      ok: true,
      entry: {
        id: updated.id,
        name: updated.name,
        position: updated.position,
        phone: updated.phone ?? undefined,
        email: updated.email ?? undefined,
        branchId: updated.branchId ?? undefined,
        status: updated.status as StaffMemberStatus,
        notes: updated.notes ?? undefined,
        createdBy: updated.createdBy,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    };
  }

  return withFileLock(FILE, async () => {
    const all = await loadAll();
    const idx = all.findIndex((r) => r.id === staffId && r.tenantId === tenantId);
    if (idx === -1) return { ok: false, message: "Personel kaydı bulunamadı." };
    const updated: Stored = {
      ...all[idx]!,
      name: trimmedName ?? all[idx]!.name,
      position: trimmedPosition ?? all[idx]!.position,
      phone: patch.phone !== undefined ? patch.phone || undefined : all[idx]!.phone,
      email: patch.email !== undefined ? patch.email || undefined : all[idx]!.email,
      branchId: patch.branchId !== undefined ? patch.branchId || undefined : all[idx]!.branchId,
      status: patch.status ?? all[idx]!.status,
      notes: patch.notes !== undefined ? patch.notes || undefined : all[idx]!.notes,
      updatedAt: now,
    };
    const next = [...all];
    next[idx] = updated;
    await saveAll(next);
    return { ok: true, entry: toPublic(updated) };
  });
}

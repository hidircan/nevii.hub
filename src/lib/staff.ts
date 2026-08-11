/**
 * Personel Modülü — öğretmen dışı personel kayıtları (özlük + maaş yapısı
 * alanları dahil, bkz. src/lib/types.ts StaffMember). Aynı desen
 * `instrument-catalog.ts`/`closed-day-overrides.ts` ile: isDbMode ?
 * prisma : atomic JSON dosyası (STORE_MODE=memory de bu dosya tabanlı
 * yolu kullanır — AppData store triad'ının parçası değil, bağımsız bir
 * modül). Yazımlar `atomic-json-file.ts` (temp dosya → doğrula → rename +
 * process-içi kilit) üzerinden yapılır — bkz. o dosyanın kök neden notu
 * (data/store.json ve instrument-catalog.json'da yaşanan bozulma/kayıp
 * güncelleme sınıfı).
 *
 * T.C. kimlik no AYNI şifreleme mekanizmasıyla saklanır (encryptNationalId,
 * bkz. src/lib/pii/tc-identity.ts) — ham değer hiçbir yerde tutulmaz.
 */

import path from "path";
import { isDbMode, resolveDataDir } from "./config";
import { uid } from "./utils";
import { withFileLock, writeJsonFileAtomic } from "./atomic-json-file";
import { encryptNationalId, isValidTurkishNationalId } from "./pii/tc-identity";
import type { StaffMember, StaffMemberStatus, StaffEmploymentType } from "./types";

const FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "staff.json");
export const STAFF_FILE = FILE;

type Stored = StaffMember & { tenantId: string };

/** Create/update sırasında kabul edilen alanlar — sistem alanları (id/createdBy/createdAt/updatedAt) hariç TÜMÜ. */
export type StaffMemberFields = Partial<
  Pick<
    StaffMember,
    | "name"
    | "position"
    | "phone"
    | "email"
    | "address"
    | "birthDate"
    | "photoUrl"
    | "employeeNumber"
    | "hireDate"
    | "terminationDate"
    | "department"
    | "reportsToStaffId"
    | "employmentType"
    | "branchId"
    | "status"
    | "annualLeaveAllowanceDays"
    | "personnelNotes"
    | "notes"
    | "monthlySalary"
    | "hourlyRate"
    | "defaultBonus"
    | "defaultAllowances"
    | "defaultDeductions"
  >
> & {
  /** Ham T.C. kimlik — şifrelenmeden ASLA saklanmaz; burada yalnızca girdi olarak kabul edilir. */
  nationalId?: string;
};

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

function dbRowToPublic(r: Record<string, unknown>): StaffMember {
  return {
    id: r.id as string,
    name: r.name as string,
    position: r.position as string,
    phone: (r.phone as string) ?? undefined,
    email: (r.email as string) ?? undefined,
    address: (r.address as string) ?? undefined,
    birthDate: (r.birthDate as Date | null)?.toISOString().slice(0, 10) ?? undefined,
    photoUrl: (r.photoUrl as string) ?? undefined,
    nationalIdCipher: (r.nationalIdCipher as string) ?? undefined,
    nationalIdLast2: (r.nationalIdLast2 as string) ?? undefined,
    employeeNumber: (r.employeeNumber as string) ?? undefined,
    hireDate: (r.hireDate as Date | null)?.toISOString().slice(0, 10) ?? undefined,
    terminationDate: (r.terminationDate as Date | null)?.toISOString().slice(0, 10) ?? undefined,
    department: (r.department as string) ?? undefined,
    reportsToStaffId: (r.reportsToStaffId as string) ?? undefined,
    employmentType: (r.employmentType as StaffEmploymentType) ?? undefined,
    branchId: (r.branchId as string) ?? undefined,
    status: r.status as StaffMemberStatus,
    annualLeaveAllowanceDays: (r.annualLeaveAllowanceDays as number) ?? undefined,
    personnelNotes: (r.personnelNotes as string) ?? undefined,
    notes: (r.notes as string) ?? undefined,
    monthlySalary: (r.monthlySalary as number) ?? undefined,
    hourlyRate: (r.hourlyRate as number) ?? undefined,
    defaultBonus: (r.defaultBonus as number) ?? undefined,
    defaultAllowances: (r.defaultAllowances as number) ?? undefined,
    defaultDeductions: (r.defaultDeductions as number) ?? undefined,
    createdBy: r.createdBy as string,
    createdAt: (r.createdAt as Date).toISOString(),
    updatedAt: (r.updatedAt as Date).toISOString(),
  };
}

/**
 * `fields` içindeki `nationalId` (ham T.C.) varsa şifreleyip cipher/last2
 * çiftine çevirir; boşsa dokunmaz. Geçersiz bir T.C. verilirse hata döner
 * — kaynak veri kalitesi sorunu tahmin edilip düzeltilmez (bkz.
 * ogrenciler3.csv seed'indeki aynı ilke).
 */
function encryptNationalIdField(fields: StaffMemberFields): { cipher?: string; last2?: string } | { error: string } | null {
  if (!fields.nationalId) return null;
  if (!isValidTurkishNationalId(fields.nationalId)) return { error: "Geçersiz T.C. kimlik numarası." };
  const enc = encryptNationalId(fields.nationalId);
  return { cipher: enc.cipher, last2: enc.last2 };
}

export async function listStaff(tenantId: string): Promise<StaffMember[]> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    const rows = await prisma.staffMember.findMany({ where: { tenantId }, orderBy: { createdAt: "asc" } });
    return rows.map((r) => dbRowToPublic(r as unknown as Record<string, unknown>));
  }
  const all = await loadAll();
  return all
    .filter((r) => r.tenantId === tenantId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map(toPublic);
}

export async function getStaffMember(tenantId: string, staffId: string): Promise<StaffMember | null> {
  const all = await listStaff(tenantId);
  return all.find((s) => s.id === staffId) ?? null;
}

export type CreateStaffResult = { ok: true; entry: StaffMember } | { ok: false; message: string };

export async function createStaffMember(
  input: StaffMemberFields & { tenantId: string; createdBy: string }
): Promise<CreateStaffResult> {
  const name = input.name?.trim();
  const position = input.position?.trim();
  if (!name) return { ok: false, message: "Ad soyad boş olamaz." };
  if (!position) return { ok: false, message: "Rol/görev boş olamaz." };
  const nationalId = encryptNationalIdField(input);
  if (nationalId && "error" in nationalId) return { ok: false, message: nationalId.error };
  const now = new Date().toISOString();

  const dbFields = {
    name,
    position,
    phone: input.phone || undefined,
    email: input.email || undefined,
    address: input.address || undefined,
    birthDate: input.birthDate ? new Date(input.birthDate) : undefined,
    photoUrl: input.photoUrl || undefined,
    nationalIdCipher: nationalId?.cipher,
    nationalIdLast2: nationalId?.last2,
    employeeNumber: input.employeeNumber || undefined,
    hireDate: input.hireDate ? new Date(input.hireDate) : undefined,
    terminationDate: input.terminationDate ? new Date(input.terminationDate) : undefined,
    department: input.department || undefined,
    reportsToStaffId: input.reportsToStaffId || undefined,
    employmentType: input.employmentType || undefined,
    branchId: input.branchId || undefined,
    status: input.status ?? "active",
    annualLeaveAllowanceDays: input.annualLeaveAllowanceDays,
    personnelNotes: input.personnelNotes || undefined,
    notes: input.notes || undefined,
    monthlySalary: input.monthlySalary,
    hourlyRate: input.hourlyRate,
    defaultBonus: input.defaultBonus,
    defaultAllowances: input.defaultAllowances,
    defaultDeductions: input.defaultDeductions,
  };

  if (isDbMode) {
    const { prisma } = await import("./db");
    const created = await prisma.staffMember.create({
      data: { id: uid("staff"), tenantId: input.tenantId, createdBy: input.createdBy, ...dbFields },
    });
    return { ok: true, entry: dbRowToPublic(created as unknown as Record<string, unknown>) };
  }

  return withFileLock(FILE, async () => {
    const all = await loadAll();
    const row: Stored = {
      id: uid("staff"),
      tenantId: input.tenantId,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
      name,
      position,
      status: input.status ?? "active",
      phone: input.phone || undefined,
      email: input.email || undefined,
      address: input.address || undefined,
      birthDate: input.birthDate || undefined,
      photoUrl: input.photoUrl || undefined,
      nationalIdCipher: nationalId?.cipher,
      nationalIdLast2: nationalId?.last2,
      employeeNumber: input.employeeNumber || undefined,
      hireDate: input.hireDate || undefined,
      terminationDate: input.terminationDate || undefined,
      department: input.department || undefined,
      reportsToStaffId: input.reportsToStaffId || undefined,
      employmentType: input.employmentType,
      branchId: input.branchId || undefined,
      annualLeaveAllowanceDays: input.annualLeaveAllowanceDays,
      personnelNotes: input.personnelNotes || undefined,
      notes: input.notes || undefined,
      monthlySalary: input.monthlySalary,
      hourlyRate: input.hourlyRate,
      defaultBonus: input.defaultBonus,
      defaultAllowances: input.defaultAllowances,
      defaultDeductions: input.defaultDeductions,
    };
    await saveAll([...all, row]);
    return { ok: true, entry: toPublic(row) };
  });
}

export type UpdateStaffResult = { ok: true; entry: StaffMember } | { ok: false; message: string };

export async function updateStaffMember(
  tenantId: string,
  staffId: string,
  patch: StaffMemberFields
): Promise<UpdateStaffResult> {
  const trimmedName = patch.name?.trim();
  const trimmedPosition = patch.position?.trim();
  if (trimmedName !== undefined && !trimmedName) return { ok: false, message: "Ad soyad boş olamaz." };
  if (trimmedPosition !== undefined && !trimmedPosition) return { ok: false, message: "Rol/görev boş olamaz." };
  const nationalId = encryptNationalIdField(patch);
  if (nationalId && "error" in nationalId) return { ok: false, message: nationalId.error };
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
        address: patch.address,
        birthDate: patch.birthDate ? new Date(patch.birthDate) : undefined,
        photoUrl: patch.photoUrl,
        nationalIdCipher: nationalId?.cipher,
        nationalIdLast2: nationalId?.last2,
        employeeNumber: patch.employeeNumber,
        hireDate: patch.hireDate ? new Date(patch.hireDate) : undefined,
        terminationDate: patch.terminationDate ? new Date(patch.terminationDate) : undefined,
        department: patch.department,
        reportsToStaffId: patch.reportsToStaffId,
        employmentType: patch.employmentType,
        branchId: patch.branchId,
        status: patch.status,
        annualLeaveAllowanceDays: patch.annualLeaveAllowanceDays,
        personnelNotes: patch.personnelNotes,
        notes: patch.notes,
        monthlySalary: patch.monthlySalary,
        hourlyRate: patch.hourlyRate,
        defaultBonus: patch.defaultBonus,
        defaultAllowances: patch.defaultAllowances,
        defaultDeductions: patch.defaultDeductions,
      },
    });
    return { ok: true, entry: dbRowToPublic(updated as unknown as Record<string, unknown>) };
  }

  return withFileLock(FILE, async () => {
    const all = await loadAll();
    const idx = all.findIndex((r) => r.id === staffId && r.tenantId === tenantId);
    if (idx === -1) return { ok: false, message: "Personel kaydı bulunamadı." };
    const current = all[idx]!;
    const updated: Stored = {
      ...current,
      name: trimmedName ?? current.name,
      position: trimmedPosition ?? current.position,
      phone: patch.phone !== undefined ? patch.phone || undefined : current.phone,
      email: patch.email !== undefined ? patch.email || undefined : current.email,
      address: patch.address !== undefined ? patch.address || undefined : current.address,
      birthDate: patch.birthDate !== undefined ? patch.birthDate || undefined : current.birthDate,
      photoUrl: patch.photoUrl !== undefined ? patch.photoUrl || undefined : current.photoUrl,
      nationalIdCipher: nationalId?.cipher ?? current.nationalIdCipher,
      nationalIdLast2: nationalId?.last2 ?? current.nationalIdLast2,
      employeeNumber: patch.employeeNumber !== undefined ? patch.employeeNumber || undefined : current.employeeNumber,
      hireDate: patch.hireDate !== undefined ? patch.hireDate || undefined : current.hireDate,
      terminationDate: patch.terminationDate !== undefined ? patch.terminationDate || undefined : current.terminationDate,
      department: patch.department !== undefined ? patch.department || undefined : current.department,
      reportsToStaffId: patch.reportsToStaffId !== undefined ? patch.reportsToStaffId || undefined : current.reportsToStaffId,
      employmentType: patch.employmentType ?? current.employmentType,
      branchId: patch.branchId !== undefined ? patch.branchId || undefined : current.branchId,
      status: patch.status ?? current.status,
      annualLeaveAllowanceDays: patch.annualLeaveAllowanceDays ?? current.annualLeaveAllowanceDays,
      personnelNotes: patch.personnelNotes !== undefined ? patch.personnelNotes || undefined : current.personnelNotes,
      notes: patch.notes !== undefined ? patch.notes || undefined : current.notes,
      monthlySalary: patch.monthlySalary ?? current.monthlySalary,
      hourlyRate: patch.hourlyRate ?? current.hourlyRate,
      defaultBonus: patch.defaultBonus ?? current.defaultBonus,
      defaultAllowances: patch.defaultAllowances ?? current.defaultAllowances,
      defaultDeductions: patch.defaultDeductions ?? current.defaultDeductions,
      updatedAt: now,
    };
    const next = [...all];
    next[idx] = updated;
    await saveAll(next);
    return { ok: true, entry: toPublic(updated) };
  });
}

/**
 * ÖNCELİK 4 (devam) — Yönetilebilir Enstrüman Kataloğu. Aynı desen
 * `closed-day-overrides.ts`/`social-media-consent.ts` ile: isDbMode ?
 * prisma : JSON dosyası (STORE_MODE=memory de bu dosya tabanlı yolu
 * kullanır — AppData store triad'ının parçası değil, bağımsız bir modül).
 *
 * Sabit `INSTRUMENTS` (src/lib/types.ts) ile İLİŞKİSİ: bu katalog o sabit
 * kümenin YERİNE geçmez — ÜSTÜNE eklenir. Server-side doğrulama
 * (`resolveActiveInstrumentNames`) her zaman ikisinin birleşimini (sabit
 * küme + bu tenant'ın aktif katalog kayıtları) döner; hiçbir zaman yalnızca
 * istemci tarafı enum'a güvenilmez.
 */

import path from "path";
import { isDbMode, resolveDataDir } from "./config";
import { uid } from "./utils";
import { INSTRUMENTS } from "./types";
import type { InstrumentCatalogEntry, InstrumentCatalogStatus } from "./types";
import { normalizeMatchKey } from "./normalize";
import { withFileLock, writeJsonFileAtomic } from "./atomic-json-file";

const FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "instrument-catalog.json");
export const INSTRUMENT_CATALOG_FILE = FILE;

type Stored = InstrumentCatalogEntry & { tenantId: string };

async function loadAll(): Promise<Stored[]> {
  try {
    const fs = await import("fs/promises");
    return JSON.parse(await fs.readFile(FILE, "utf8")) as Stored[];
  } catch {
    return [];
  }
}

/**
 * Kök neden (enstrüman kataloğunda Piyano/Gitar/Keman/Bateri/Şan/Yan Flüt
 * gibi varsayılanların kaybolması) — bu dosya önceden kilitsiz, düz
 * `fs.writeFile` ile yazılıyordu; `ensureDefaultCatalogSeeded` de ilk
 * doldurmayı TEK bir toplu yazım yerine 10 ayrı `loadAll → saveAll`
 * round-trip'iyle yapıyordu. İki eşzamanlı process (ör. bu depoda aynı
 * `data/` dizinini paylaşan paralel çalışan birden fazla `npm test`/dev
 * sunucusu) bu döngüler arasına girdiğinde, BİRİNİN yazdığı daha KÜÇÜK
 * bir liste diğerinin henüz eklediği satırları SESSİZCE eziyordu (lost
 * update) — data/store.json'daki bozulmayla aynı kök sınıf, farklı
 * belirti. `writeJsonFileAtomic` + `withFileLock` (bkz. atomic-json-file.ts)
 * bunu hem bozulmaya hem kayıp güncellemeye karşı kapatır.
 */
async function saveAll(rows: Stored[]) {
  await writeJsonFileAtomic(FILE, rows);
}

function toPublic(r: Stored): InstrumentCatalogEntry {
  const { tenantId: _t, ...pub } = r;
  void _t;
  return pub;
}

function normalizedName(name: string): string {
  return normalizeMatchKey(name);
}

export type CreateInstrumentCatalogEntryResult =
  | { ok: true; entry: InstrumentCatalogEntry }
  | { ok: false; message: string };

/** Aynı tenant içinde harf büyüklüğünden bağımsız yinelenen isim engellenir. */
export async function createInstrumentCatalogEntry(input: {
  tenantId: string;
  name: string;
  createdBy: string;
}): Promise<CreateInstrumentCatalogEntryResult> {
  const trimmed = input.name.trim();
  if (!trimmed) return { ok: false, message: "Enstrüman adı boş olamaz." };

  const now = new Date().toISOString();

  if (isDbMode) {
    const { prisma } = await import("./db");
    const all = await prisma.instrumentCatalogEntry.findMany({ where: { tenantId: input.tenantId } });
    if (all.some((r) => normalizedName(r.name) === normalizedName(trimmed))) {
      return { ok: false, message: `"${trimmed}" bu kurumda zaten kayıtlı.` };
    }
    const created = await prisma.instrumentCatalogEntry.create({
      data: { id: uid("instr"), tenantId: input.tenantId, name: trimmed, status: "active", createdBy: input.createdBy },
    });
    return {
      ok: true,
      entry: {
        id: created.id,
        name: created.name,
        status: created.status as InstrumentCatalogStatus,
        createdBy: created.createdBy,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      },
    };
  }

  return withFileLock(FILE, async () => {
    const all = await loadAll();
    const tenantRows = all.filter((r) => r.tenantId === input.tenantId);
    if (tenantRows.some((r) => normalizedName(r.name) === normalizedName(trimmed))) {
      return { ok: false, message: `"${trimmed}" bu kurumda zaten kayıtlı.` };
    }
    const row: Stored = {
      id: uid("instr"),
      tenantId: input.tenantId,
      name: trimmed,
      status: "active",
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    await saveAll([...all, row]);
    return { ok: true, entry: toPublic(row) };
  });
}

export type UpdateInstrumentCatalogEntryResult =
  | { ok: true; entry: InstrumentCatalogEntry }
  | { ok: false; message: string };

export async function updateInstrumentCatalogEntry(
  tenantId: string,
  entryId: string,
  patch: { name?: string; status?: InstrumentCatalogStatus }
): Promise<UpdateInstrumentCatalogEntryResult> {
  const now = new Date().toISOString();
  const trimmedName = patch.name?.trim();

  if (isDbMode) {
    const { prisma } = await import("./db");
    const existing = await prisma.instrumentCatalogEntry.findFirst({ where: { id: entryId, tenantId } });
    if (!existing) return { ok: false, message: "Enstrüman bulunamadı." };
    if (trimmedName) {
      const all = await prisma.instrumentCatalogEntry.findMany({ where: { tenantId, NOT: { id: entryId } } });
      if (all.some((r) => normalizedName(r.name) === normalizedName(trimmedName))) {
        return { ok: false, message: `"${trimmedName}" bu kurumda zaten kayıtlı.` };
      }
    }
    const updated = await prisma.instrumentCatalogEntry.update({
      where: { id: entryId },
      data: { name: trimmedName, status: patch.status },
    });
    return {
      ok: true,
      entry: {
        id: updated.id,
        name: updated.name,
        status: updated.status as InstrumentCatalogStatus,
        createdBy: updated.createdBy,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    };
  }

  return withFileLock(FILE, async () => {
    const all = await loadAll();
    const idx = all.findIndex((r) => r.id === entryId && r.tenantId === tenantId);
    if (idx === -1) return { ok: false, message: "Enstrüman bulunamadı." };
    if (trimmedName) {
      const dup = all.some(
        (r, i) => i !== idx && r.tenantId === tenantId && normalizedName(r.name) === normalizedName(trimmedName)
      );
      if (dup) return { ok: false, message: `"${trimmedName}" bu kurumda zaten kayıtlı.` };
    }
    const updated: Stored = {
      ...all[idx]!,
      name: trimmedName ?? all[idx]!.name,
      status: patch.status ?? all[idx]!.status,
      updatedAt: now,
    };
    const next = [...all];
    next[idx] = updated;
    await saveAll(next);
    return { ok: true, entry: toPublic(updated) };
  });
}

/**
 * Bir tenant'ın kataloğu hiç dokunulmamışsa (0 kayıt) hem eski sabit
 * `INSTRUMENTS` kümesi (Piyano, Yan Flüt, Gitar, Bateri, Keman, Şan) hem de
 * Bas Gitar/Ukulele buraya, düzenlenebilir/pasife alınabilir gerçek katalog
 * satırları olarak, otomatik "seed" edilir — artık "sabit ve asla
 * değiştirilemez" ayrı bir liste YOK, hepsi aynı yönetilebilir kataloğun
 * parçası. Tek seferlik, idempotent bir varsayılan doldurma (ikinci
 * çağrıda satırlar zaten var, tekrar eklenmez).
 */
async function listInstrumentCatalogRaw(tenantId: string): Promise<InstrumentCatalogEntry[]> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    const rows = await prisma.instrumentCatalogEntry.findMany({ where: { tenantId }, orderBy: { createdAt: "asc" } });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status as InstrumentCatalogStatus,
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

/**
 * Tek seferlik toplu seed — yalnızca tenant'ın kataloğu TAMAMEN boşsa
 * çalışır. Bilinçli olarak isim-bazlı "eksikse tamamla" YAPILMAZ: bir
 * yönetici "Piyano"yu "Klasik Piyano" olarak yeniden adlandırdıysa, bir
 * sonraki listelemede eski "Piyano" adı sahte biçimde yeniden EKLENMEMELİ
 * (isim eşleşmesi artık yok diye tekrar seed edilirse rename etkisiz
 * kalırdı) — tek seferlik ilk doldurma, kalıcı bir "varsayılana dön"
 * mekanizması değildir.
 */
async function ensureDefaultCatalogSeeded(tenantId: string): Promise<void> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    const count = await prisma.instrumentCatalogEntry.count({ where: { tenantId } });
    if (count > 0) return;
    const now = new Date();
    await prisma.instrumentCatalogEntry.createMany({
      data: [...INSTRUMENTS, "Bas Gitar", "Ukulele"].map((name) => ({
        id: uid("instr"),
        tenantId,
        name,
        status: "active" as const,
        createdBy: "seed",
        createdAt: now,
        updatedAt: now,
      })),
      skipDuplicates: true,
    });
    return;
  }

  // Kök neden düzeltmesi — bu ilk toplu doldurma önceden N (10) ayrı
  // `createInstrumentCatalogEntry` çağrısıyla, her biri kendi
  // loadAll→saveAll round-trip'iyle yapılıyordu; aralarına giren eşzamanlı
  // bir process'in yazımı bazı satırları sessizce ezebiliyordu. Artık TEK
  // bir kilit altında tek okuma + tek yazımla yapılır — ya HİÇ satır
  // eklenmez ya da TÜMÜ birden, ara bir yarım durum asla dosyaya yazılmaz.
  await withFileLock(FILE, async () => {
    const all = await loadAll();
    if (all.some((r) => r.tenantId === tenantId)) return;
    const now = new Date().toISOString();
    const rows: Stored[] = [...INSTRUMENTS, "Bas Gitar", "Ukulele"].map((name) => ({
      id: uid("instr"),
      tenantId,
      name,
      status: "active",
      createdBy: "seed",
      createdAt: now,
      updatedAt: now,
    }));
    await saveAll([...all, ...rows]);
  });
}

/** Dış çağıranlar (tool/UI) bunu kullanmalı — tenant'ın kataloğu boşsa Bas Gitar/Ukulele ile otomatik doldurur. */
export async function listInstrumentCatalog(tenantId: string): Promise<InstrumentCatalogEntry[]> {
  await ensureDefaultCatalogSeeded(tenantId);
  return listInstrumentCatalogRaw(tenantId);
}

/**
 * Server-side doğrulama için TEK kaynak: bu tenant'ın AKTİF katalog
 * kayıtlarının adları. CSV import, ders planlama, öğrenci/öğretmen form
 * doğrulaması BUNU kullanmalı — asla yalnızca istemci enum'una
 * güvenilmemeli. Eskiden sabit `INSTRUMENTS` kümesi burada KOŞULSUZ eklenip
 * bir yönetici bu enstrümanlardan birini pasife alsa bile listeden hiç
 * çıkmıyordu — artık `INSTRUMENTS` yalnızca ilk katalog seed'inin
 * kaynağıdır (ensureDefaultCatalogSeeded), tek gerçek kaynak katalogdur.
 */
export async function resolveActiveInstrumentNames(tenantId: string): Promise<string[]> {
  const catalog = await listInstrumentCatalog(tenantId);
  return catalog.filter((c) => c.status === "active").map((c) => c.name);
}

/** Demo reset için. */
export async function clearInstrumentCatalog(tenantId: string): Promise<void> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    await prisma.instrumentCatalogEntry.deleteMany({ where: { tenantId } });
    return;
  }
  await withFileLock(FILE, async () => {
    const all = await loadAll();
    const remaining = all.filter((r) => r.tenantId !== tenantId);
    if (remaining.length !== all.length) await saveAll(remaining);
  });
}

/**
 * Faz 12 — insan-okunur, tenant-kapsamlı, çarpışmasız kurum numaraları
 * (S00001/T00001/P00001). Üç ayrı tahsis yolu vardır, hepsi AYNI numara
 * biçimini üretir (`formatDisplayId`):
 *
 *  - `allocateSequenceValue` — saf fonksiyon; `AppData.entitySequences`
 *    (json/memory modda öğrenci/öğretmen — mevcut readData/writeData
 *    döngüsünün İÇİNDE çağrılır, o döngünün zaten sağladığı aynı-process
 *    serileştirmeden yararlanır, disk erişimi ARTIRMAZ — memory modun
 *    "diskini kullanma" sözleşmesini bozmaz).
 *  - `allocateSequenceValueDb` — DB modu; TEK bir `INSERT ... ON CONFLICT
 *    ... DO UPDATE ... RETURNING` ifadesiyle atomik (Postgres garantisi —
 *    okuma-artırma-yazma arasına başka bir transaction giremez).
 *  - `allocateSequenceValueFile` — yalnızca `staff.ts` için: o modül
 *    Student/Teacher'ın aksine `AppData`'nın dışında, kendi ayrı
 *    dosya-kilitli deposunu kullanıyor (bkz. staff.ts modül yorumu); aynı
 *    desenle (withFileLock) kendi küçük sayaç dosyasını kullanır.
 */
import { prisma } from "./db";
import { withFileLock, writeJsonFileAtomic } from "./atomic-json-file";
import { resolveDataDir } from "./config";
import path from "path";
import { promises as fs } from "fs";
import type { EntityTypeForSequence, EntitySequenceRecord } from "./types";

export type { EntityTypeForSequence, EntitySequenceRecord };

const DISPLAY_ID_PREFIX: Record<EntityTypeForSequence, string> = {
  student: "S",
  teacher: "T",
  staff: "P",
};

/** "S" + 5 haneli sıfır-dolgulu numara (ör. S00001). 99999'u aşarsa doğal olarak genişler (S100000). */
export function formatDisplayId(entityType: EntityTypeForSequence, value: number): string {
  return `${DISPLAY_ID_PREFIX[entityType]}${String(value).padStart(5, "0")}`;
}

/**
 * Saf fonksiyon — json/memory modda `AppData.entitySequences`'i günceller.
 * Çağıran, DÖNEN `records`'ı aynı `writeData`/`save` çağrısıyla kalıcı
 * kılmalı (bu fonksiyon I/O yapmaz).
 */
export function allocateSequenceValue(
  records: EntitySequenceRecord[],
  tenantId: string,
  entityType: EntityTypeForSequence
): { assigned: number; records: EntitySequenceRecord[] } {
  const idx = records.findIndex((r) => r.tenantId === tenantId && r.entityType === entityType);
  if (idx === -1) {
    return { assigned: 1, records: [...records, { tenantId, entityType, nextValue: 2 }] };
  }
  const current = records[idx]!;
  const next = [...records];
  next[idx] = { ...current, nextValue: current.nextValue + 1 };
  return { assigned: current.nextValue, records: next };
}

/** DB modu — atomik upsert-ve-artır, tek SQL ifadesi. */
export async function allocateSequenceValueDb(tenantId: string, entityType: EntityTypeForSequence): Promise<number> {
  const rows = await prisma.$queryRaw<{ assigned: number }[]>`
    INSERT INTO "EntitySequence" ("tenantId", "entityType", "nextValue")
    VALUES (${tenantId}, ${entityType}, 2)
    ON CONFLICT ("tenantId", "entityType")
    DO UPDATE SET "nextValue" = "EntitySequence"."nextValue" + 1
    RETURNING ("EntitySequence"."nextValue" - 1) AS assigned
  `;
  return Number(rows[0]!.assigned);
}

const STAFF_SEQ_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "staff-entity-sequences.json");

async function loadFileSequences(): Promise<Record<string, number>> {
  try {
    return JSON.parse(await fs.readFile(STAFF_SEQ_FILE, "utf8")) as Record<string, number>;
  } catch {
    return {};
  }
}

/**
 * `staff.ts`'in json/memory modda kullandığı, `AppData`'nın DIŞINDAKİ ayrı
 * dosya deposu için — kendi küçük sayaç dosyası, `withFileLock` ile
 * `staff.json`'dan BAĞIMSIZ ama aynı desende kilitli (iki farklı dosya,
 * çakışma riski yok).
 */
export async function allocateSequenceValueFile(
  tenantId: string,
  entityType: EntityTypeForSequence
): Promise<number> {
  return withFileLock(STAFF_SEQ_FILE, async () => {
    const all = await loadFileSequences();
    const key = `${tenantId}:${entityType}`;
    const assigned = (all[key] ?? 0) + 1;
    all[key] = assigned;
    await writeJsonFileAtomic(STAFF_SEQ_FILE, all);
    return assigned;
  });
}

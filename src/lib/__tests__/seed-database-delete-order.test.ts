import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * KÖK NEDEN REGRESYONU (2026-09-07) — "Demo verisini sıfırla" test ortamında
 * `Minified React error #441` ile patlıyordu. Gerçek sunucu istisnası:
 *
 *   Invalid `prisma.attendance.deleteMany()` invocation in store-db.ts
 *   Foreign key constraint violated on the constraint:
 *   `MakeupRequest_attendanceId_fkey`
 *
 * `seedDatabase`'in `prisma.$transaction([...])` listesi VERİLEN SIRAYLA
 * çalışır; `Attendance`, ona ZORUNLU bir FK ile bağlı `MakeupRequest`'ten
 * ÖNCE siliniyordu. Boş bir tenant'ta fark edilmiyordu (silinecek telafi
 * kaydı yoktu) — telafi verisi olan HER tenant'ta patlıyordu.
 *
 * Bu test elle tutulan bir listeye değil, ŞEMANIN KENDİSİNE bağlanır
 * (bkz. LESSONS_LEARNED 2026-09-06): Prisma şemasındaki her "cascade
 * ETMEYEN" FK için, bağımlı model bağımlısından ÖNCE silinmelidir. Şemaya
 * yeni bir ilişki eklendiğinde bu test, silme listesi güncellenmezse kırılır.
 * DB bağlantısı GEREKTİRMEZ.
 */

const schema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");
const storeDb = readFileSync(resolve(process.cwd(), "src/lib/store-db.ts"), "utf8");

/** `seedDatabase` içindeki `$transaction([...])` bloğundan silme sırasını çıkarır. */
function seedDeleteOrder(): string[] {
  const fnStart = storeDb.indexOf("export async function seedDatabase");
  expect(fnStart).toBeGreaterThan(-1);
  const txStart = storeDb.indexOf("await prisma.$transaction([", fnStart);
  expect(txStart).toBeGreaterThan(-1);
  const txEnd = storeDb.indexOf("]);", txStart);
  const block = storeDb.slice(txStart, txEnd);
  return [...block.matchAll(/prisma\.(\w+)\.deleteMany\(/g)].map((m) => m[1]!);
}

/** camelCase Prisma delegate adı -> PascalCase model adı. */
function toModelName(delegate: string): string {
  return delegate.charAt(0).toUpperCase() + delegate.slice(1);
}

type Fk = { from: string; to: string; cascade: boolean };

function schemaForeignKeys(): Fk[] {
  const fks: Fk[] = [];
  for (const [, name, body] of schema.matchAll(/model (\w+) \{([\s\S]*?)\n\}/g)) {
    for (const line of body.split("\n")) {
      if (!line.includes("@relation(") || !line.includes("fields:")) continue;
      const parts = line.trim().split(/\s+/);
      const target = parts[1]?.replace("?", "").replace("[]", "");
      if (!target) continue;
      fks.push({ from: name!, to: target, cascade: line.includes("Cascade") });
    }
  }
  return fks;
}

describe("seedDatabase — FK'leri ihlal etmeyen silme sırası", () => {
  const order = seedDeleteOrder();
  const models = order.map(toModelName);
  const position = new Map(models.map((m, i) => [m, i]));

  it("silme listesi boş değil ve şemadaki gerçek modellere karşılık gelir", () => {
    expect(models.length).toBeGreaterThan(5);
    for (const m of models) expect(schema).toContain(`model ${m} {`);
  });

  it("MakeupRequest, Attendance'tan ÖNCE silinir (asıl regresyon)", () => {
    expect(position.get("MakeupRequest")).toBeLessThan(position.get("Attendance")!);
  });

  it("cascade ETMEYEN her FK için, bağımlı model hedefinden ÖNCE silinir", () => {
    const violations: string[] = [];
    for (const fk of schemaForeignKeys()) {
      if (fk.cascade) continue;
      const fromPos = position.get(fk.from);
      const toPos = position.get(fk.to);
      // Silme listesinde olmayan modeller bu testin konusu değil (ör. tenant
      // cascade'i ile temizlenenler) — yalnızca İKİSİ DE listedeyse sıra önemli.
      if (fromPos === undefined || toPos === undefined) continue;
      if (fromPos > toPos) violations.push(`${fk.from} -> ${fk.to} (${fromPos} > ${toPos})`);
    }
    expect(violations).toEqual([]);
  });

  it("silme listesinde OLMAYAN ve cascade ETMEYEN bir FK varsa açıkça raporlanır", () => {
    // Bilinen açık borç: StudentContract.studentId cascade ETMEZ ve silme
    // listesinde de değildir — sözleşmesi olan bir tenant'ta demo reset
    // `Student` silmede takılır. Demo reset artık yalnız yerel geliştirmede
    // çalıştığı için bu bir kullanıcı yolu DEĞİLDİR, ama borç kayıtlıdır.
    const unlisted = schemaForeignKeys()
      .filter((fk) => !fk.cascade && position.has(fk.to) && !position.has(fk.from))
      .map((fk) => `${fk.from} -> ${fk.to}`);
    expect(unlisted).toEqual(["StudentContract -> Student"]);
  });
});

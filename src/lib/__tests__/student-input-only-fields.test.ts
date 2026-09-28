/**
 * `createStudentTool` → `addStudent` → Prisma `student.create` yolunda,
 * `Student` KOLONU OLMAYAN her girdi alanı süzülmek ZORUNDA.
 *
 * NEDEN: `store-db.addStudent`, aldığı nesneyi `prisma.student.create`'e
 * `...student` ile spread ediyor. `studentSchema`'ya kolon karşılığı olmayan
 * bir alan eklenir ve `tools.ts`'teki süzgece yazılmazsa, Prisma "Unknown
 * argument" hatası verir ve öğrenci oluşturma STORE_MODE=db altında TAMAMEN
 * kırılır. json/memory modda aynı alan sessizce yutulduğu için testlerde
 * görünmez — bu yüzden hata üç kez ayrı ayrı üretildi (`instrument`,
 * `firstPaymentAdjustmentReason`, `lessonDays`).
 *
 * Bu test veritabanına BAĞLANMAZ: `prisma/schema.prisma`'daki kolon listesini
 * `studentSchema`'nın alan listesiyle karşılaştırır.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { studentSchema } from "../validation";

/** `Student` modelinin skalar kolon adları (ilişki alanları dahil — hepsi geçerli argüman). */
function prismaStudentFields(): Set<string> {
  const schema = fs.readFileSync(
    path.join(process.cwd(), "prisma", "schema.prisma"),
    "utf8"
  );
  const model = /model Student \{([\s\S]*?)\n\}/.exec(schema);
  if (!model) throw new Error("prisma/schema.prisma içinde `model Student` bulunamadı");
  return new Set(
    model[1]
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("//") && !line.startsWith("@@"))
      .map((line) => line.split(/\s+/)[0])
  );
}

/** zod şeması `.refine()` ile sarılmış olabilir — ham `shape`'e kadar aç. */
function schemaKeys(schema: unknown): string[] {
  let node = schema as { shape?: object; _def?: { schema?: unknown; innerType?: unknown } };
  for (let i = 0; i < 10; i += 1) {
    if (node?.shape) return Object.keys(node.shape);
    const inner = node?._def?.schema ?? node?._def?.innerType;
    if (!inner) break;
    node = inner as typeof node;
  }
  throw new Error("studentSchema shape'i çözülemedi");
}

/**
 * `Student` kolonu olmayan, bilerek yalnız GİRDİ olan alanlar. Her biri
 * `tools.ts` `createStudentTool` içindeki destructuring süzgecinde
 * `_ignored...` olarak ayrılır. Buraya yeni bir alan eklerken süzgeci de
 * güncelleyin — aksi halde db-modu kırılır.
 */
const EXPECTED_INPUT_ONLY = [
  // Paket & Kampanya Motoru — ham seçim süzülür, çözümü `appliedCampaignIds` (kolon) yazılır.
  "campaignIds",
  "createPortalAccess",
  // Payment.firstCollectionIncludesNextMonth olarak saklanır; Student kolonu yok.
  "firstCollectionIncludesNextMonth",
  "firstPaymentAdjustmentReason",
  "firstPaymentCollected",
  "firstPaymentExceptionReason",
  "instrument",
  "lessonDays",
  "monthlyFeeOverrideAmount",
  "portalAccessType",
].sort();

describe("studentSchema ↔ Prisma Student kolonları", () => {
  it("kolon karşılığı olmayan girdi alanları TAM OLARAK bilinen listeyle aynı", () => {
    const columns = prismaStudentFields();
    const inputOnly = schemaKeys(studentSchema)
      .filter((key) => !columns.has(key))
      .sort();

    expect(inputOnly).toEqual(EXPECTED_INPUT_ONLY);
  });

  it("bilinen girdi-only alanların HEPSİ createStudentTool'da süzülüyor", () => {
    const tools = fs.readFileSync(
      path.join(process.cwd(), "src", "lib", "services", "tools.ts"),
      "utf8"
    );
    // `createStudentTool` içindeki `...studentInput` destructuring bloğu.
    const block = /const \{([\s\S]*?)\.\.\.studentInput\s*\n\s*\} = v\.data;/.exec(tools);
    expect(block, "…studentInput süzgeç bloğu bulunamadı").not.toBeNull();

    for (const field of EXPECTED_INPUT_ONLY) {
      expect(block![1], `${field} süzülmüyor — db-modunda "Unknown argument" verir`).toContain(
        `${field}:`
      );
    }
  });
});

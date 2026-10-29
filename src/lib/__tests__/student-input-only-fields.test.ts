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
 * `registerStudentCore` (tools.ts) açık alan listesinin DIŞINDA
 * kalır (kayda yazılmaz). Buraya yeni bir alan eklerken o listeyi de
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

  it("bilinen girdi-only alanların HİÇBİRİ kaydedilen öğrenci satırına sızmaz (createStudentTool)", async () => {
    // Çoklu branş v2 (9500a0c): kayıt artık `registerStudentCore` içinde öğrenci satırını AÇIK alan listesiyle kurar
    // (eski `...studentInput` süzgeç bloğu yok). Korunan davranış aynı: girdi-only alan kayda yazılırsa db modunda
    // Prisma "Unknown argument" verir. json store satırı olduğu gibi sakladığı için sızıntı burada görünür.
    const { promises: fsp } = await import("node:fs");
    const { resolveDataDir } = await import("../config");
    const { createPackageTool, createStudentTool } = await import("../services/tools");
    const { readData } = await import("../store");
    const { DEFAULT_TENANT_ID } = await import("../auth/config");
    await fsp.rm(path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json"), { force: true });
    const ctx = { role: "SUPER_ADMIN" as const, userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web" as const };
    const pkg = await createPackageTool(ctx, { title: "Girdi Paket", price30Min: 2000, price40Min: 2500, price50Min: 3000 });
    expect(pkg.ok).toBe(true);
    if (!pkg.ok) return;
    const res = await createStudentTool(ctx, {
      name: "Girdi Alan Öğrenci",
      email: "",
      phone: "5551112244",
      parentName: "Veli",
      parentPhone: "5559998866",
      branchId: "erzene",
      instrument: "Piyano",
      teacherId: "t1",
      packageId: pkg.data.packageId,
      packageName: "Bireysel Aylık — 4 ders",
      weeklyLessonCount: 1,
      monthlyFee: 1,
      notes: "",
      enrollmentStartDate: "2026-09-01",
      lessonDurationMinutes: 40,
      lessonDays: [2],
      createPortalAccess: false,
      firstPaymentCollected: { method: "cash", amount: 2000, collectedAt: "2026-09-01" },
      firstPaymentAdjustmentReason: "Test",
    });
    expect(res.ok, res.ok ? "" : JSON.stringify(res.error)).toBe(true);
    if (!res.ok) return;
    const stored = (await readData()).students.find((st) => st.id === res.data.studentId) as Record<string, unknown> | undefined;
    expect(stored).toBeDefined();
    for (const field of EXPECTED_INPUT_ONLY) {
      expect(Object.prototype.hasOwnProperty.call(stored, field), `${field} öğrenci satırına yazıldı — db modunda "Unknown argument" verir`).toBe(false);
    }
  });
});

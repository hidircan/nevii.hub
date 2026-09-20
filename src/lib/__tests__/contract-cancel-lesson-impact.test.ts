/**
 * Sözleşme iptali — ders etkisi ve onay akışı (2026-09-20 owner kararı).
 *
 * Kural: sözleşmeden üretilmiş dersler **sessizce silinmez**. İptal ekranı
 * önce kaç gelecek ders olduğunu ve kaçının kural gereği korunacağını
 * gösterir; kullanıcı açıkça seçer. Varsayılan güvenli seçenek "dersler
 * kalsın"dır (`cancelFutureLessons` varsayılanı `false`).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { lessonCancelBlockReason } from "../lesson-cancel-rules";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const tools = readFileSync(path.join(ROOT, "src/lib/services/tools.ts"), "utf-8");
const dialog = readFileSync(path.join(ROOT, "src/components/contract-cancel-dialog.tsx"), "utf-8");

describe("varsayılan güvenlidir — sessiz silme yok", () => {
  it("cancelFutureLessons varsayılanı false", () => {
    expect(tools).toContain("cancelFutureLessons: z.boolean().default(false)");
  });

  it("iptal diyaloğu varsayılan olarak 'dersler kalsın' seçili açılır", () => {
    expect(dialog).toContain("setAlsoCancelLessons(false)");
    expect(dialog).toContain("Dersler kalsın");
    expect(dialog).toContain("önerilen");
  });

  it("diyalog sözleşmenin SİLİNMEDİĞİNİ açıkça söyler", () => {
    expect(dialog).toContain("silinmez");
    expect(dialog).toMatch(/arşivde kalır/);
  });
});

describe("korunan dersler — kural tek kaynaktan gelir", () => {
  it("iptal, ders başına lesson-cancel-rules'ı uygular (kendi kuralını yazmaz)", () => {
    expect(tools).toContain('await import("../lesson-cancel-rules")');
    expect(tools).toContain("lessonCancelBlockReason(lesson)");
  });

  it("işlendi / telafi işaretli dersler hiçbir koşulda iptal edilemez", () => {
    expect(
      lessonCancelBlockReason({ type: "regular", status: "scheduled", lessonProcessed: true, opsMakeupFlag: false })
    ).toMatch(/hakediş/i);
    expect(
      lessonCancelBlockReason({ type: "regular", status: "scheduled", lessonProcessed: false, opsMakeupFlag: true })
    ).toMatch(/telafi/i);
    // Sıradan planlı ders iptal edilebilir.
    expect(
      lessonCancelBlockReason({ type: "regular", status: "scheduled", lessonProcessed: false, opsMakeupFlag: false })
    ).toBeNull();
  });

  it("sayım ve iptal AYNI 'gelecek ders' tanımını kullanır", () => {
    // Tek yardımcı: collectContractFutureLessons — iki ayrı tanım bırakılmaz.
    const uses = tools.split("\n").filter((l) => l.includes("collectContractFutureLessons("));
    expect(uses.length).toBeGreaterThanOrEqual(3); // tanım + sayım + iptal
  });
});

describe("iptal sırası veri tutarlılığını korur", () => {
  it("önce dersler, sonra sözleşme iptal edilir", () => {
    const fnStart = tools.indexOf("export async function cancelStudentContractTool");
    const body = tools.slice(fnStart, fnStart + 4000);
    const lessonsAt = body.indexOf("cancelLesson(lesson.id)");
    const contractAt = body.indexOf("await cancelContract(");
    expect(lessonsAt).toBeGreaterThan(-1);
    expect(contractAt).toBeGreaterThan(lessonsAt);
  });

  it("iptal edilemeyen dersler sessizce yutulmaz, gerekçesiyle döner", () => {
    expect(tools).toContain("keptLessons");
    expect(dialog).toMatch(/korundu/);
  });
});

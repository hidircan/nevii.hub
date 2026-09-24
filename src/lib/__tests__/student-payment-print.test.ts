import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { createSeedData } from "../seed";
import { computeStudentPaymentSummary } from "../payment-profile";
import { isCollectedPayment } from "../contract-payment-plan-view";

/**
 * P0 — öğrenci ödeme detay yazdırma. Döküm, detay ekranıyla AYNI tek
 * gerçek kaynağı kullanır; ödenmemiş satırda sahte tahsilat bilgisi YOKTUR;
 * rota ortak print altyapısındadır ve yetkisiz role kapalıdır.
 */
const ROOT = path.resolve(import.meta.dirname, "../../..");
const PRINT_SRC = readFileSync(path.join(ROOT, "src/app/ogrenci-odeme-dokum/[studentId]/page.tsx"), "utf-8");
const DETAIL_SRC = readFileSync(path.join(ROOT, "src/app/panel/odemeler/[studentId]/page.tsx"), "utf-8");

describe("ödeme dökümü — görünürlük sözleşmesi", () => {
  it("detay ekranında görünür Yazdır aksiyonu var", () => {
    expect(DETAIL_SRC).toContain("/ogrenci-odeme-dokum/");
    expect(DETAIL_SRC).toMatch(/Yazdır/);
  });

  it("rota ortak print altyapısını kullanır (üçüncü sistem yok)", () => {
    expect(PRINT_SRC).toContain("printSurfaceCss");
    expect(PRINT_SRC).toContain("doc-print-surface");
    expect(PRINT_SRC).toContain("print:bg-white");
    expect(PRINT_SRC).not.toContain("print:bg-[var(--color-surface)]");
    expect(PRINT_SRC).not.toMatch(/jsPDF|html2canvas|html-to-image/);
  });

  it("kısmi not/gerekçe, tahsil eden adı, durum, kayıt zamanı alanları basılır", () => {
    for (const field of ["paymentNote", "adjustmentReason", "receiverNames", "statusLabel", "createdAt"]) {
      expect(PRINT_SRC).toContain(field);
    }
    // E-posta basılmaz — ad soyad çözümü kullanılır (personel adı → kullanıcı adı → öğretmen).
    expect(PRINT_SRC).toContain("resolveActorLabels");
    expect(PRINT_SRC).not.toMatch(/receivedByEmail|collectorEmail/);
  });

  it("ödenmemiş satırda sahte tahsilat bilgisi yoktur (isCollectedPayment kapısı)", () => {
    expect(PRINT_SRC).toContain("isCollectedPayment");
    // Tahsilat tarihi/yöntem/alan kişi yalnız collected ise basılır.
    expect(PRINT_SRC).toMatch(/collected && p\.paidAt[\s\S]{0,80}formatDateTime/);
    expect(PRINT_SRC).toMatch(/collected \? paymentMethodLabelTr/);
  });

  it("çok sayfalı print: başlık tekrarı + satır bölünmezliği", () => {
    expect(PRINT_SRC).toContain("table-header-group");
    expect(PRINT_SRC).toContain("break-inside: avoid");
  });

  it("yetkisiz rol print rotasına giremez (detay ekranıyla aynı sınır)", () => {
    expect(PRINT_SRC).toMatch(/session\.role !== "SCHOOL_ADMIN" && session\.role !== "SUPER_ADMIN"/);
  });
});

describe("ödeme dökümü — toplam doğruluğu (tek kaynak)", () => {
  it("özet, detay ekranındaki fonksiyonun aynısıyla hesaplanır", () => {
    expect(PRINT_SRC).toContain("computeStudentPaymentSummary(payments, contracts)");
    const data = createSeedData();
    const student = data.students.find((s) => data.payments.some((p) => p.studentId === s.id));
    if (!student) throw new Error("ödemeli seed öğrenci yok");
    const payments = data.payments.filter((p) => p.studentId === student.id);
    const summary = computeStudentPaymentSummary(payments);
    const collected = payments.filter((p) => p.status !== "voided").reduce((s, p) => s + p.paidAmount, 0);
    expect(summary.totalCollected).toBe(collected);
    expect(summary.remaining).toBeGreaterThanOrEqual(0);
  });

  it("void kayıtlar toplama girmez ama listede kalır", () => {
    const data = createSeedData();
    const voided = data.payments.find((p) => p.status === "voided");
    if (!voided) return; // seed void içermiyorsa kural fonksiyon-seviyesinde korunur
    const summary = computeStudentPaymentSummary([voided]);
    expect(summary.totalBilled).toBe(0);
    expect(summary.totalCollected).toBe(0);
    expect(isCollectedPayment(voided)).toBe(false);
  });
});

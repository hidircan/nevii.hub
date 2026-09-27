/**
 * E / F — Tek kanonik sözleşme görüntüleyici + evrak statü semantiği.
 *
 * E kök nedeni: aynı sözleşme iki ayrı ekranda iki farklı görünümle
 * açılıyordu — öğrenci ekranı `/sozlesme-yazdir/[contractId]` (güncel),
 * Evraklar `/evrak-yazdir/[documentId]` (üretim anındaki jenerik evrak
 * şablonu). Kullanıcı bunu "eski UI geliyor" diye bildirdi.
 *
 * F kök nedeni: `createDocumentInstance` varsayılan statüsü "draft" idi;
 * gerçekten oluşmuş bir sözleşme Evraklar'da "Taslak" görünüyordu.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  documentStatusLabel,
  documentStatusHint,
  isActiveDocumentStatus,
} from "../documents";
import { statusLabel } from "../utils";

const ROOT = path.resolve(import.meta.dirname, "../../..");

describe("F — evrak statü semantiği", () => {
  it("üretilmiş belge 'Düzenlendi'dir, 'Taslak' DEĞİL", () => {
    expect(documentStatusLabel("issued")).toBe("Düzenlendi");
    // Legacy satırlar da aynı anlamı gösterir (migration öncesi kayıtlar).
    expect(documentStatusLabel("draft")).toBe("Düzenlendi");
  });

  it("genel statusLabel'ın 'draft' anlamı DEĞİŞMEDİ (tahsilat mesajı vb. için doğru)", () => {
    expect(statusLabel("draft")).toBe("Taslak");
  });

  it("her statü için güven veren bir açıklama cümlesi vardır", () => {
    for (const s of ["issued", "printed", "sent_for_signature", "signed", "uploaded", "cancelled", "expired"]) {
      expect(documentStatusHint(s).length).toBeGreaterThan(10);
    }
    // İptal/süresi dolmuş belgeler bile SAKLANIR — kullanıcıya açıkça söylenir.
    expect(documentStatusHint("cancelled")).toMatch(/saklan/i);
    expect(documentStatusHint("expired")).toMatch(/saklan/i);
  });

  it("yalnız cancelled/expired yürürlükten düşmüş sayılır", () => {
    expect(isActiveDocumentStatus("issued")).toBe(true);
    expect(isActiveDocumentStatus("signed")).toBe(true);
    expect(isActiveDocumentStatus("cancelled")).toBe(false);
    expect(isActiveDocumentStatus("expired")).toBe(false);
  });

  it("createDocumentInstance varsayılanı artık 'issued'", () => {
    const code = readFileSync(path.join(ROOT, "src/lib/documents/index.ts"), "utf-8");
    expect(code).toContain('status: input.status ?? "issued"');
    expect(code).not.toContain('status: input.status ?? "draft"');
  });

  it("mevcut 'draft' satırlarını taşıyan migration repo'da mevcut", () => {
    const sql = readFileSync(
      path.join(ROOT, "prisma/migrations/20260920120000_document_instance_issued_status/migration.sql"),
      "utf-8"
    );
    expect(sql).toMatch(/UPDATE "DocumentInstance" SET "status" = 'issued' WHERE "status" = 'draft'/);
    // Veri kaybı olmadığının kanıtı: hiçbir DELETE/DROP yok.
    expect(sql).not.toMatch(/\bDELETE\b|\bDROP TABLE\b|\bDROP COLUMN\b/i);
  });
});

describe("E — tek kanonik sözleşme görüntüleyici", () => {
  it("Evraklar tablosu sözleşme satırını /sozlesme-yazdir'a yönlendirir", () => {
    const code = readFileSync(path.join(ROOT, "src/components/documents-table.tsx"), "utf-8");
    expect(code).toContain("d.contractId ? `/sozlesme-yazdir/${d.contractId}`");
    expect(code).toContain("Sözleşmeyi görüntüle");
  });

  it("Evrak detayında 'Yazdırma görünümü' sözleşmeler için kanonik yola gider", () => {
    const code = readFileSync(path.join(ROOT, "src/app/panel/evraklar/[documentId]/page.tsx"), "utf-8");
    // 9. tur: aynı kanonik yol, açıldığı evrak detayına geri dönüş bağlamıyla (returnTo).
    expect(code).toContain("contractId ? `/sozlesme-yazdir/${contractId}` : `/evrak-yazdir/${doc.id}`");
    expect(code).toContain("`/panel/evraklar/${doc.id}`");
  });

  it("öğrenci Evraklar sekmesi de aynı kanonik yolu kullanır", () => {
    const code = readFileSync(
      path.join(ROOT, "src/app/panel/ogrenciler/[studentId]/evraklar/page.tsx"),
      "utf-8"
    );
    expect(code).toContain("`/sozlesme-yazdir/${contractId}`");
  });

  it("dondurulmuş arşiv nüshası KALDIRILMADI — yalnız ne olduğu yazıldı", () => {
    const code = readFileSync(path.join(ROOT, "src/app/panel/evraklar/[documentId]/page.tsx"), "utf-8");
    expect(code).toContain("Arşiv nüshası");
    expect(code).toContain("doc.renderedHtml");
  });
});

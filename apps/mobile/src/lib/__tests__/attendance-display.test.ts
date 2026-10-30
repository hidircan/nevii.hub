import { describe, expect, it } from "vitest";
import { ledgerStatusBadge, parseLedgerStatusParam } from "../attendance-display";

/**
 * Ledger görüntü sözleşmesi — web yönetici paneli paritesi (İş 2):
 * - attended=Geldi (yeşil), processed=İşlendi (KIRMIZI), makeup=Telafi (sarı),
 *   cancelled=İptal, upcoming=Planlandı (nötr).
 * - "Mazeretli" yoklama statüsü YOKTUR (2026-10-30 owner): legacy `excused`
 *   satırı sunucu anahtarıyla gelir ama istemcide "statüsüz" gibi nötr
 *   "Henüz sonuçlanmadı" görünür.
 * - `absent` sunucunun gerçek no_show/gelmedi bayrağıdır; web etiketiyle
 *   ("Gelmedi") nötr gösterilir — statü sözlüğüne girmez.
 */
describe("ledger statü eşlemesi — web paritesi", () => {
  it("web 6 statüsü ile birebir aynı etiket/ton", () => {
    expect(ledgerStatusBadge("attended")).toEqual({ label: "Geldi", tone: "success" });
    expect(ledgerStatusBadge("processed")).toEqual({ label: "İşlendi", tone: "danger" });
    expect(ledgerStatusBadge("makeup")).toEqual({ label: "Telafi", tone: "warning" });
    expect(ledgerStatusBadge("cancelled")).toEqual({ label: "İptal", tone: "neutral" });
    expect(ledgerStatusBadge("upcoming")).toEqual({ label: "Planlandı", tone: "neutral" });
  });

  it("ledger'e özgü anahtarlar: in_progress/pending ve legacy absent", () => {
    expect(ledgerStatusBadge("in_progress")).toEqual({ label: "Devam ediyor", tone: "info" });
    expect(ledgerStatusBadge("pending")).toEqual({ label: "Henüz sonuçlanmadı", tone: "neutral" });
    expect(ledgerStatusBadge("absent")).toEqual({ label: "Gelmedi", tone: "neutral" });
  });

  it("legacy 'Mazeretli' (excused) ROZETİ ÜRETİLMEZ — statüsüz ders gibi nötr görünür", () => {
    const badge = ledgerStatusBadge("excused");
    expect(badge.label).toBe("Henüz sonuçlanmadı");
    expect(badge.tone).toBe("neutral");
  });

  it("hiçbir etikette operasyon jargonu veya Mazeretli yok", () => {
    for (const key of ["attended", "processed", "makeup", "absent", "excused", "cancelled", "in_progress", "pending", "upcoming"] as const) {
      const { label } = ledgerStatusBadge(key);
      expect(label, key).not.toMatch(/yoklama/i);
      expect(label, key).not.toMatch(/Mazeretli|İzinli/i);
    }
  });
});

describe("parseLedgerStatusParam", () => {
  it("virgüllü listeyi doğrular, bilinmeyeni eler", () => {
    expect(parseLedgerStatusParam("attended,processed")).toEqual(["attended", "processed"]);
    expect(parseLedgerStatusParam("attended,bogus")).toEqual(["attended"]);
    expect(parseLedgerStatusParam("bogus")).toBeNull();
    expect(parseLedgerStatusParam(undefined)).toBeNull();
  });

  it("tekrarı düşürür; sunucu anahtarları (absent/excused dahil) geçerli kalır", () => {
    expect(parseLedgerStatusParam("absent,absent")).toEqual(["absent"]);
    expect(parseLedgerStatusParam("excused")).toEqual(["excused"]);
  });
});

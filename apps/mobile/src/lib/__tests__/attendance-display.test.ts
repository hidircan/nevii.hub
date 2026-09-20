import { describe, expect, it } from "vitest";
import { ledgerStatusBadge, LEDGER_STATUS_LABEL, parseLedgerStatusParam } from "../attendance-display";

describe("ledger statü etiketleri", () => {
  it("gerçek business state'lerle eşleşir", () => {
    expect(LEDGER_STATUS_LABEL).toEqual({
      attended: "Geldi",
      processed: "İşlendi",
      makeup: "Telafi",
      absent: "Gelmedi",
      excused: "İzinli",
      cancelled: "İptal edildi",
      in_progress: "Devam ediyor",
      pending: "Henüz sonuçlanmadı",
      upcoming: "Planlandı",
    });
  });

  it("hiçbir etikette operasyon jargonu yok", () => {
    for (const label of Object.values(LEDGER_STATUS_LABEL)) {
      expect(label).not.toMatch(/yoklama/i);
    }
  });

  it("rozet tonu döner", () => {
    expect(ledgerStatusBadge("absent")).toEqual({ label: "Gelmedi", tone: "danger" });
    expect(ledgerStatusBadge("pending")).toEqual({ label: "Henüz sonuçlanmadı", tone: "neutral" });
  });
});

describe("parseLedgerStatusParam", () => {
  it("virgüllü listeyi doğrular, bilinmeyeni eler", () => {
    expect(parseLedgerStatusParam("attended,processed")).toEqual(["attended", "processed"]);
    expect(parseLedgerStatusParam("attended,bogus")).toEqual(["attended"]);
    expect(parseLedgerStatusParam("bogus")).toBeNull();
    expect(parseLedgerStatusParam(undefined)).toBeNull();
  });

  it("tekrarı düşürür", () => {
    expect(parseLedgerStatusParam("absent,absent")).toEqual(["absent"]);
  });
});

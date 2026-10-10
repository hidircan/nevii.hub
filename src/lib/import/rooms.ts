import type { AppData, Instrument } from "../types";
import { resolveCanonicalValue } from "../normalize";
import type { CsvRecord } from "./csv";
import type { ImportPreview, ImportRowError, ImportReadRow } from "./types";
import { IMPORT_READ_ROWS_PREVIEW_LIMIT } from "./types";
import { resolveBranchId } from "./branch-lookup";

export type RoomImportRow = {
  name: string;
  branchId: string;
  capacity: number;
  instruments: Instrument[];
};

export const ROOM_CSV_COLUMNS = ["ad", "sube", "kapasite", "enstrumanlar"] as const;

export const ROOM_CSV_SAMPLE = `ad,sube,kapasite,enstrumanlar
Stüdyo 4 — Yaylı,Erzene,2,"Keman;Yan Flüt"
`;

/** `activeInstrumentNames`: kurumun aktif enstrüman kataloğu (resolveActiveInstrumentNames) — sabit liste DEĞİL. */
export function validateRoomRows(
  data: AppData,
  records: CsvRecord[],
  activeInstrumentNames: readonly string[]
): ImportPreview<RoomImportRow> {
  const errors: ImportRowError[] = [];
  const valid: RoomImportRow[] = [];
  const readRows: ImportReadRow[] = [];
  const seenNamePerBranch = new Set<string>();

  records.forEach((rec, idx) => {
    const row = idx + 2;
    const name = rec["ad"] ?? "";
    const branchValue = rec["sube"] ?? "";
    const capacityRaw = rec["kapasite"] ?? "";
    const instrumentsRaw = rec["enstrumanlar"] ?? "";

    if (readRows.length < IMPORT_READ_ROWS_PREVIEW_LIMIT) {
      readRows.push({
        row,
        summary: `${name || "(ad boş)"} — ${branchValue || "(şube boş)"} — ${instrumentsRaw || "(enstrüman boş)"}`,
      });
    }

    if (!name) errors.push({ row, field: "ad", message: "Ad boş olamaz." });

    let branchId: string | null = null;
    if (!branchValue) {
      errors.push({ row, field: "sube", message: "Şube boş olamaz." });
    } else {
      const resolved = resolveBranchId(data, branchValue);
      if (!resolved.ok) {
        errors.push({ row, field: "sube", message: resolved.message });
      } else {
        branchId = resolved.branchId;
      }
    }

    let capacity: number | null = null;
    if (!capacityRaw) {
      errors.push({ row, field: "kapasite", message: "Kapasite boş olamaz." });
    } else {
      const n = Number(capacityRaw);
      if (!Number.isInteger(n) || n < 1) {
        errors.push({ row, field: "kapasite", message: `Kapasite geçerli bir tam sayı olmalı: "${capacityRaw}".` });
      } else {
        capacity = n;
      }
    }

    let instruments: Instrument[] | null = null;
    if (!instrumentsRaw) {
      errors.push({ row, field: "enstrumanlar", message: "En az bir enstrüman gerekli." });
    } else {
      const parts = instrumentsRaw
        .split(";")
        .map((p) => p.trim())
        .filter((p) => p.length > 0);
      const canonical = parts.map((p) => resolveCanonicalValue(p, activeInstrumentNames));
      const invalid = parts.filter((_, i) => !canonical[i]);
      if (parts.length === 0) {
        errors.push({ row, field: "enstrumanlar", message: "En az bir enstrüman gerekli." });
      } else if (invalid.length > 0) {
        errors.push({
          row,
          field: "enstrumanlar",
          message: `Kurumun aktif enstrüman listesinde olmayan enstrüman(lar): ${invalid.join(", ")}. Geçerli değerler: ${activeInstrumentNames.join(", ")}. Eksikse Kurulum Merkezi › Enstrümanlar ekranından ekleyin veya aktifleştirin.`,
        });
      } else {
        instruments = canonical as Instrument[];
      }
    }

    if (branchId && name) {
      const key = `${branchId}|${name.trim().toLowerCase()}`;
      if (seenNamePerBranch.has(key)) {
        errors.push({
          row,
          field: "ad",
          message: `Bu dosyada aynı şubede "${name}" adı birden fazla kez kullanılmış.`,
        });
      }
      seenNamePerBranch.add(key);
    }

    if (name && branchId && capacity !== null && instruments) {
      valid.push({ name, branchId, capacity, instruments });
    }
  });

  return {
    totalRows: records.length,
    validCount: valid.length,
    errorCount: errors.length,
    errors,
    valid,
    readRows,
  };
}

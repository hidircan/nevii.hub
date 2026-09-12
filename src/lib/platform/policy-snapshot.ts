import { createHash } from "node:crypto";
import { stableStringify } from "./policies";
import type { JsonValue } from "./types";

export type PolicySnapshot = {
  key: string;
  value: JsonValue;
  /** İçerik parmak izi — kayıt anındaki politika sürümünü kimliklendirir. */
  version: string;
  capturedAt: string;
};

/**
 * Kayıt/sözleşme oluşturulurken politika buradan kopyalanır ve kayda gömülür.
 * Değer derin kopyadır: sonradan politika değişse de snapshot değişmez.
 */
export function snapshotPolicy(key: string, value: JsonValue, now = new Date()): PolicySnapshot {
  const serialized = stableStringify(value);
  return {
    key,
    value: JSON.parse(serialized) as JsonValue,
    version: createHash("sha256").update(serialized).digest("hex").slice(0, 16),
    capturedAt: now.toISOString(),
  };
}

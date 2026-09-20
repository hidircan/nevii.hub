import type { MakeupLedgerItem } from "../../types/api";

const CLOSED = new Set(["completed", "expired", "cancelled"]);

/**
 * Telafi kayıtları view-model'i — saf, test edilebilir.
 *
 * Kapsam SUNUCUDADIR (`makeup-ledger` yalnız seçili öğrencinin kayıtlarını
 * döner); burada istemci-ID filtresi YOK. Yalnız sıralama + null-güvenliği:
 * açık kayıtlar önce, sonra en yeni. Kayıt/statü uydurulmaz.
 */
export function toMakeupLedgerItems(list: MakeupLedgerItem[] | null | undefined): MakeupLedgerItem[] {
  if (!Array.isArray(list)) return [];
  return [...list].sort(
    (a, b) => Number(CLOSED.has(a.status)) - Number(CLOSED.has(b.status)) || b.createdAt.localeCompare(a.createdAt)
  );
}

export function isOpenMakeup(status: string): boolean {
  return !CLOSED.has(status);
}

/** Ekran okuyucu için tek kayıt özeti (sunucudan gelen alanlarla). */
export function makeupLedgerA11yLabel(item: MakeupLedgerItem, statusLabel: string): string {
  const parts = ["Telafi kaydı", item.teacherName ?? "", item.instrument ?? "", statusLabel].filter(Boolean);
  return parts.join(", ");
}

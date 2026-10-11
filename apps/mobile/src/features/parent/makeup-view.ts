import type { MakeupRequest } from "../../types/api";
import { getActiveLocale } from "../../i18n/locale-store";

const CLOSED = new Set(["completed", "expired", "cancelled"]);

/**
 * Guardian telafi listesi view-model'i — saf, test edilebilir.
 *
 * Kapsam SUNUCUDADIR (`GET /api/v1/makeup` yalnız bağlı öğrencilerin
 * kayıtlarını döner); burada istemci-ID filtresi YOK (ID tahmini yasak).
 * Yalnız sıralama + null-güvenliği: açık kayıtlar önce, sonra en yeni.
 * Kayıt uydurulmaz, statü uydurulmaz.
 */
export function toGuardianMakeupItems(list: MakeupRequest[] | null | undefined): MakeupRequest[] {
  if (!Array.isArray(list)) return [];
  return [...list].sort(
    (a, b) => Number(CLOSED.has(a.status)) - Number(CLOSED.has(b.status)) || b.createdAt.localeCompare(a.createdAt)
  );
}

/** Ekran okuyucu için tek kayıt özeti (sunucudan gelen alanlarla). */
export function guardianMakeupA11yLabel(item: MakeupRequest, statusLabel: string): string {
  const record = getActiveLocale() === "en" ? "Makeup record" : "Telafi kaydı";
  const parts = [record, item.studentName ?? "", item.instrument ?? "", statusLabel].filter(Boolean);
  return parts.join(", ");
}

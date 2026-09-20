import type { BadgeTone } from "../components/ui/status-badge";
import type { LedgerDisplayKey } from "../types/api";

/**
 * Ledger görüntü statüsü → Türkçe etiket + rozet tonu. TEK KAYNAK — rapor
 * satırları, Gelişim sayaçları, yoklama özeti ve ödeme kalemlerindeki ders
 * rozetleri buradan beslenir.
 *
 * Eşleşme (backend `lessonDisplayKey` önceliğiyle birebir):
 * attended=Geldi, processed=İşlendi, makeup=Telafi, absent=Gelmedi,
 * excused=İzinli, cancelled=İptal edildi, in_progress=Devam ediyor,
 * pending=Henüz sonuçlanmadı (nötr), upcoming=Planlandı.
 * "Mazeretli" backend'de ayrı bir state DEĞİL (excused=İzinli) — uydurulmaz.
 */
export const LEDGER_STATUS_LABEL: Record<LedgerDisplayKey, string> = {
  attended: "Geldi",
  processed: "İşlendi",
  makeup: "Telafi",
  absent: "Gelmedi",
  excused: "İzinli",
  cancelled: "İptal edildi",
  in_progress: "Devam ediyor",
  pending: "Henüz sonuçlanmadı",
  upcoming: "Planlandı",
};

const LEDGER_STATUS_TONE: Record<LedgerDisplayKey, BadgeTone> = {
  attended: "success",
  processed: "success",
  makeup: "warning",
  absent: "danger",
  excused: "info",
  cancelled: "neutral",
  in_progress: "info",
  pending: "neutral",
  upcoming: "primary",
};

export function ledgerStatusBadge(key: LedgerDisplayKey): { label: string; tone: BadgeTone } {
  return { label: LEDGER_STATUS_LABEL[key], tone: LEDGER_STATUS_TONE[key] };
}

const VALID_KEYS = new Set<string>(Object.keys(LEDGER_STATUS_LABEL));

/** Deep-link/query'den gelen statü değerini doğrular — bilinmeyen değer yoksayılır. */
export function parseLedgerStatusParam(value: string | string[] | undefined): LedgerDisplayKey[] | null {
  if (!value) return null;
  const list = Array.isArray(value) ? value : value.split(",");
  const keys = list.map((s) => s.trim()).filter((s): s is LedgerDisplayKey => VALID_KEYS.has(s));
  return keys.length > 0 ? [...new Set(keys)] : null;
}

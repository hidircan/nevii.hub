import type { BadgeTone } from "../components/ui/status-badge";
import type { Locale } from "../i18n/locales";
import { lookup } from "../i18n/locales";
import { getActiveLocale } from "../i18n/locale-store";
import type { LedgerDisplayKey } from "../types/api";
import { attendanceStatusStyle } from "../features/attendance/status-style";

/**
 * Ledger görüntü statüsü → etiket + rozet tonu. TEK KAYNAK — rapor
 * satırları, Gelişim sayaçları, yoklama özeti ve ödeme kalemlerindeki ders
 * rozetleri buradan beslenir.
 *
 * Etiketler i18n sözlüğünden (`attStatus.*`) çözülür; sunucu önceliği
 * (`lessonDisplayKey`, student-ledgers.ts) zaten sunucu tarafında. Web
 * yöneticiyle parite (İş 2, 2026-10-30; 2026-10-30 revizyon):
 * - `attended=Geldi`, `processed=İşlendi (KIRMIZI/danger — artık success
 *   DEĞİL; webde İşlendi kırmızıdır), `makeup=Telafi`,
 * - `absent=Gelmedi` — sunucunun gerçek `no_show`/mazeretsiz gelmedi
 *   bayrağı (web FLAG_LABEL sözü; YOKLAMA STATÜSÜ DEĞİLDİR, legend'da yok),
 * - `excused` — "Mazeretli" diye bir yoklama statüsü YOKTUR (owner). Legacy
 *   bayrak, statüsü olmayan ders gibi nötr "Henüz sonuçlanmadı" görünür;
 *   web takvimi/rozetleri de legacy bayrağı görünür statü YAPMAZ,
 * - `cancelled=İptal`, `pending=Henüz sonuçlanmadı (nötr)`,
 *   `upcoming=Planlandı`, `in_progress=Devam ediyor`.
 * Ops bayrağı olmayan satırlar sunucu anahtarıyla gelir (`pending`/
 * `upcoming`); bunlar statü kodu DEĞİLDİR, ledger'e özgü görüntü
 * anahtarlarıdır ve yalnız burada etiketlenir.
 */
const LEDGER_LABEL_KEY: Record<LedgerDisplayKey, string> = {
  attended: "attStatus.present",
  processed: "attStatus.processed",
  makeup: "attStatus.makeup",
  absent: "attStatus.absent",
  // Legacy "Mazeretli" bayrağı görünür yoklama statüsü DEĞİL — nötr
  // "Henüz sonuçlanmadı" olarak gösterilir (web `planned` indirgemesi).
  excused: "attStatus.pending",
  cancelled: "attStatus.cancelled",
  in_progress: "attStatus.inProgress",
  pending: "attStatus.pending",
  upcoming: "attStatus.planned",
};

const LEDGER_STATUS_TONE: Record<LedgerDisplayKey, BadgeTone> = {
  attended: attendanceStatusStyle("attended").tone,
  processed: attendanceStatusStyle("processed").tone,
  makeup: attendanceStatusStyle("makeup").tone,
  absent: attendanceStatusStyle("absent").tone,
  // Legacy "Mazeretli" — statüsüz ders gibi nötr.
  excused: "neutral",
  cancelled: attendanceStatusStyle("cancelled").tone,
  in_progress: "info",
  pending: "neutral",
  upcoming: "neutral", // web "Planlandı" nötr yüzeydir — "primary" DEĞİL
};

export function ledgerStatusLabel(key: LedgerDisplayKey, locale: Locale = getActiveLocale()): string {
  return lookup(locale, LEDGER_LABEL_KEY[key]);
}

export function ledgerStatusBadge(
  key: LedgerDisplayKey,
  locale: Locale = getActiveLocale(),
): { label: string; tone: BadgeTone } {
  return { label: ledgerStatusLabel(key, locale), tone: LEDGER_STATUS_TONE[key] };
}

const VALID_KEYS = new Set<string>(Object.keys(LEDGER_LABEL_KEY));

/** Deep-link/query'den gelen statü değerini doğrular — bilinmeyen değer yoksayılır. */
export function parseLedgerStatusParam(value: string | string[] | undefined): LedgerDisplayKey[] | null {
  if (!value) return null;
  const list = Array.isArray(value) ? value : value.split(",");
  const keys = list.map((s) => s.trim()).filter((s): s is LedgerDisplayKey => VALID_KEYS.has(s));
  return keys.length > 0 ? [...new Set(keys)] : null;
}

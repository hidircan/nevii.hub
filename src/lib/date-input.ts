/**
 * Faz 5B (ENROLLMENT_PAYMENT_RENEWAL_VALIDATION_FIX) — merkezi, GÜVENLİ tarih
 * ayrıştırma/serileştirme. `new Date(value).toISOString()` boş/geçersiz bir
 * string için `RangeError: Invalid time value` fırlatır ve bu, kullanıcının
 * "Tamamla" tıklamasından sonra gördüğü tek şey bir konsol/arka plan hatası
 * olur (bkz. contract-panel.tsx eski satır 195 hatası). Bu modül asla
 * fırlatmaz — her zaman `null` döner ve çağıran taraf görünür bir form
 * hatası gösterir.
 *
 * `<input type="date">`'in `.value`'su HER ZAMAN "YYYY-MM-DD" biçimindedir
 * (tarayıcı yereli ne olursa olsun) — bu yüzden UTC gün-ortası (T12:00:00Z)
 * ile ayrıştırılır: saat dilimi kayması (bir önceki/sonraki güne düşme)
 * imkansız hale gelir (bkz. "no timezone-caused date shift" gereksinimi).
 */

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** "YYYY-MM-DD" → geçerli `Date` (UTC öğlen) veya `null` — ASLA fırlatmaz. */
export function parseDateOnlyInput(value: string | null | undefined): Date | null {
  if (!value || !DATE_ONLY_PATTERN.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  // Date.UTC ay/gün taşmasını SESSİZCE bir sonraki aya kaydırır (ör. 2026-02-30
  // → 2026-03-02) — bu "impossible date" durumunu görünür şekilde reddetmek
  // için geri okunan yıl/ay/gün orijinalle karşılaştırılır.
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}

/** "YYYY-MM-DD" → ISO string veya `null` — ASLA fırlatmaz, `.toISOString()` çağrısını güvenli hale getirir. */
export function toIsoDateOrNull(value: string | null | undefined): string | null {
  const dt = parseDateOnlyInput(value);
  return dt ? dt.toISOString() : null;
}

/** Girdi gerçekten geçerli bir "YYYY-MM-DD" tarihi mi (takvimde var mı)? */
export function isValidDateOnlyInput(value: string | null | undefined): boolean {
  return parseDateOnlyInput(value) !== null;
}

/** ISO/`Date`'den ayın gününü (1-31) GÜVENLİ okur — UTC gün kullanır, saat dilimi kaymaz. */
export function dayOfMonthUtc(value: string | null | undefined): number | null {
  const dt = value ? new Date(value) : null;
  if (!dt || Number.isNaN(dt.getTime())) return null;
  return dt.getUTCDate();
}

/** "HH:mm" 24 saat biçiminde geçerli mi (00:00–23:59)? */
export function isValidTimeOnlyInput(value: string | null | undefined): boolean {
  if (!value) return false;
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  return m !== null;
}

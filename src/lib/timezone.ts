/**
 * Tek, merkezi saat dilimi kaynağı — İş Takip hatırlatma motoru (ve
 * ihtiyaç duyan başka her modül) buradan okur, hiçbir yerde dağınık
 * `new Date()`/yerel makine saatiyle gün/saat karşılaştırması YAPILMAZ.
 *
 * Bu uygulamada henüz kurum bazlı bir `SchoolSettings.timezone` alanı YOK
 * (kontrol edildi — yok); testler ve dokümantasyon boyunca "Europe/Istanbul"
 * zaten tutarlı örtük varsayılan olarak kullanılıyor (bkz. `process.env.TZ =
 * "Europe/Istanbul"` birçok test dosyasında). Bu yüzden şimdilik TEK bir
 * uygulama-çapında sabit kullanılır; ileride `SchoolSettings`e gerçek bir
 * `timezone` alanı eklenirse `resolveAppTimezone` onu önceliklendirecek
 * şekilde tasarlandı (backward-compatible genişleme noktası).
 */

export const DEFAULT_APP_TIMEZONE = "Europe/Istanbul";

/** `settings.timezone` ileride eklenirse otomatik önceliklenir; bugün her zaman DEFAULT_APP_TIMEZONE döner. */
export function resolveAppTimezone(settings?: { timezone?: string } | null): string {
  return settings?.timezone?.trim() || DEFAULT_APP_TIMEZONE;
}

/**
 * Bir Date'in verilen IANA saat diliminde takvim günü (yyyy-MM-dd).
 * `Intl.DateTimeFormat` kullanır — DST geçişlerinde bile doğru gün/saat
 * üretir (elle ms offset hesaplama YOK, bu tür hesaplar DST sınırlarında
 * kolayca 1 saat/1 gün kayar).
 */
export function toZonedYmd(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}

/** Verilen saat diliminde 0-23 arası saat — "sabah eşiği" gibi gün-içi kontroller için. */
export function zonedHour(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    hour12: false,
  }).formatToParts(date);
  const raw = parts.find((p) => p.type === "hour")?.value ?? "0";
  return Number(raw) % 24;
}

/**
 * Bir "yyyy-MM-dd" takvim günü dizesini, UTC öğlen saatine sabitlenmiş bir
 * Date'e çevirir — iki takvim günü arasındaki gün farkını DST kaymasından
 * etkilenmeden (öğlen saati DST geçişinde asla gün değiştirmez) güvenle
 * hesaplamak için kullanılır (bkz. `calendarDaysBetween`).
 */
export function ymdToUtcNoon(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12, 0, 0));
}

/** İki "yyyy-MM-dd" takvim günü arasındaki tam gün farkı (b - a). */
export function calendarDaysBetween(aYmd: string, bYmd: string): number {
  const ms = ymdToUtcNoon(bYmd).getTime() - ymdToUtcNoon(aYmd).getTime();
  return Math.round(ms / 86_400_000);
}

/**
 * P0 (2026-08-31, hydration hotfix) — kullanıcıya görünen TÜM Türkçe
 * tarihler (sözleşme, kayıt, taksit, ödev vb.) için TEK kanonik formatlayıcı.
 *
 * KÖK NEDEN (Sözleşme Merkezi hydration hatası): `new Date(iso).toLocaleDateString("tr-TR")`
 * — hiçbir açık `options` nesnesi olmadan — gün/ay basamak doldurma (zero-pad)
 * davranışını çalıştığı JS motorunun ICU/Intl uygulamasına bırakır. Bu davranış
 * ECMAScript/Intl spesifikasyonunda GARANTİ EDİLMEMİŞTİR — Node.js sunucu
 * süreci (SSR) ve tarayıcı (hydration) FARKLI ICU veri setleri kullanabilir,
 * bu da "02.03.2027" (sunucu) / "2.03.2027" (istemci) gibi bire-bir aynı
 * girdiden farklı METİN üretmesine yol açar → React hydration mismatch.
 *
 * Bu fonksiyon `toLocaleDateString`u TAMAMEN devre dışı bırakır:
 * - `toZonedYmd` üzerinden `Intl.DateTimeFormat` ÇAĞRILIR ama `year`/`month`/
 *   `day` için AÇIKÇA `"2-digit"`/`"numeric"` seçenekleri verilir — ECMA-402
 *   spesifikasyonuna göre `2-digit` HER ZAMAN sıfırla doldurur (bu davranış
 *   garantilidir, `toLocaleDateString()`'in seçeneksiz varsayılanı DEĞİLDİR);
 * - açık `timeZone` (varsayılan Europe/Istanbul) verilir — sunucu/tarayıcı
 *   yerel saat dilimi FARKI takvim gününü KAYDIRAMAZ;
 * - `"en-CA"` ara-locale'i yalnızca `yyyy-MM-dd` parçalarını STABİL sırada
 *   almak için kullanılır, sonuç elle `dd.mm.yyyy`'ye çevrilir — nihai metin
 *   hiçbir locale'in "varsayılan tarih biçimi" kararına bağlı DEĞİLDİR.
 *
 * Geçersiz/eksik girdi ASLA "Invalid Date" render ETMEZ — boş string döner
 * (çağıran taraf bunu "—" gibi güvenli bir yer tutucuyla gösterebilir).
 */
export function formatDateTr(value: string | Date, timeZone: string = DEFAULT_APP_TIMEZONE): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const ymd = toZonedYmd(date, timeZone);
  const [y, m, d] = ymd.split("-");
  return `${d}.${m}.${y}`;
}

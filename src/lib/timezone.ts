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
 * Kök neden düzeltmesi (2026-09-01, program-studio.tsx zaman etiketleri) —
 * ders kartlarında/aria-label'larda saat `date-fns`in `format(parseISO(iso),
 * "HH:mm")` kalıbıyla üretiliyordu; bu, `Date.getHours()`/`getMinutes()` gibi
 * ÇALIŞAN MAKİNENİN yerel saat dilimini kullanır, ISO string'in kendi
 * (+03:00) ofsetini DEĞİL. Gerçek kullanıcıların tarayıcısı Türkiye saatine
 * ayarlı olduğu için bu genelde görünmez kalır — ama sunucu/CI gibi UTC
 * saat dilimli ortamlarda (bu deponun test paketi dahil) dersler 3 saat
 * KAYMIŞ görünür. `toZonedYmd` ile AYNI desen: `Intl.DateTimeFormat`
 * üzerinden AÇIKÇA `Europe/Istanbul` istenir — hangi makinede çalışırsa
 * çalışsın her zaman doğru saat.
 */
export function zonedHm(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const h = parts.find((p) => p.type === "hour")?.value ?? "00";
  const m = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${h}:${m}`;
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

/**
 * 2026-09-17 — KRİTİK saat kayması kök neden düzeltmesi (15:50 → 18:50).
 * Yöneticinin seçtiği "yyyy-MM-dd" + "HH:mm" kurum saat diliminde bir DUVAR
 * SAATİDİR. Önceden sunucu `new Date("2026-09-20T15:50")` / `setHours(15, 50)`
 * ile ÇALIŞAN MAKİNENİN saat dilimini kullanıyordu; Vercel UTC olduğu için
 * ders İstanbul'da 3 saat ileride (18:50) oluşuyordu. Bu fonksiyon makineden
 * bağımsızdır: ofset `Intl` ile hedef dilimden okunur (DST dahil).
 */
export function zonedWallTimeToUtc(ymd: string, hm: string, timeZone: string = DEFAULT_APP_TIMEZONE): Date {
  const [y, mo, d] = ymd.split("-").map(Number);
  const [h, mi] = hm.split(":").map(Number);
  const asUtc = Date.UTC(y ?? 1970, (mo ?? 1) - 1, d ?? 1, h ?? 0, mi ?? 0);
  // İlk tahmin: aynı duvar saati UTC'deymiş gibi → hedef dilimdeki karşılığının farkı kadar düzelt (2 tur DST sınırı için yeterli).
  let guess = asUtc;
  for (let i = 0; i < 2; i++) {
    const shown = new Date(guess);
    const [sy, smo, sd] = toZonedYmd(shown, timeZone).split("-").map(Number);
    const [sh, smi] = zonedHm(shown, timeZone).split(":").map(Number);
    guess += asUtc - Date.UTC(sy!, smo! - 1, sd!, sh!, smi!);
  }
  return new Date(guess);
}

/**
 * Formdan gelen tarih-saat değeri → UTC ISO. `datetime-local` biçimi
 * ("yyyy-MM-ddTHH:mm", ofsetsiz) kurum saat dilimindeki duvar saati sayılır;
 * açık ofset/Z taşıyan tam ISO değerler olduğu gibi korunur. Geçersizse null.
 */
export function wallDateTimeInputToIso(value: string, timeZone: string = DEFAULT_APP_TIMEZONE): string | null {
  const naive = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(value.trim());
  const date = naive ? zonedWallTimeToUtc(naive[1]!, naive[2]!, timeZone) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** UTC ISO → `datetime-local` input değeri, kurum saat diliminde ("yyyy-MM-ddTHH:mm"). */
export function isoToWallDateTimeInput(iso: string, timeZone: string = DEFAULT_APP_TIMEZONE): string {
  const date = new Date(iso);
  return `${toZonedYmd(date, timeZone)}T${zonedHm(date, timeZone)}`;
}

/** Kurum saat diliminde haftanın günü (0=Pazar..6=Cumartesi). */
export function zonedWeekday(date: Date, timeZone: string = DEFAULT_APP_TIMEZONE): number {
  return ymdToUtcNoon(toZonedYmd(date, timeZone)).getUTCDay();
}

/** "yyyy-MM-dd" + n gün (takvim aritmetiği, saat diliminden bağımsız). */
export function addDaysYmd(ymd: string, days: number): string {
  return new Date(ymdToUtcNoon(ymd).getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * UTC ISO → kurum saat dilimindeki duvar saatini taşıyan YEREL Date. Yalnız
 * `date-fns` `format` ile metne çevirmek içindir (format yerel alanları okur);
 * böylece sunucu UTC'de de "15:50" dersi "15:50" yazılır. Hesaplamada kullanmayın.
 */
export function toWallClockDate(value: string | Date, timeZone: string = DEFAULT_APP_TIMEZONE): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return date;
  const [y, mo, d] = toZonedYmd(date, timeZone).split("-").map(Number);
  const [h, mi] = zonedHm(date, timeZone).split(":").map(Number);
  return new Date(y!, mo! - 1, d!, h!, mi!, date.getSeconds());
}

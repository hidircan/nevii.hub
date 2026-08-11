import type { AppData, Instrument, InstrumentLevel, TeacherInstrumentSkill } from "../types";
import { INSTRUMENTS } from "../types";
import type { CsvRecord } from "./csv";
import type { ImportPreview, ImportRowError, ImportReadRow } from "./types";
import { IMPORT_READ_ROWS_PREVIEW_LIMIT } from "./types";
import { resolveBranchId } from "./branch-lookup";
import { resolveCanonicalValue } from "../normalize";

export type TeacherImportRow = {
  name: string;
  email: string;
  phone: string;
  branchId: string;
  /** Legacy tek-enstrüman alanı — `instrumentLevels` verilmemişse kullanılır. */
  instrument: Instrument;
  /** ÖNCELİK 4 (devam) — çoklu enstrüman+seviye. Verilmezse legacy davranış korunur. */
  instrumentLevels?: TeacherInstrumentSkill[];
  highSchool?: string;
  university?: string;
  graduationYear?: number;
  contractStartDate?: string;
  contractEndDate?: string;
};

/**
 * ÖNCELİK 4 (devam) — Öğretmen CSV çoklu enstrüman revizyonu.
 *
 * `enstrumanlar`/`enstruman_seviyeleri` ÇOKLU DEĞER kolonlarıdır — ayraç
 * `|` (dikey çizgi). Sıra ve eleman sayısı birebir eşleşmelidir: N'inci
 * enstrümanın seviyesi N'inci seviye değeridir. Aynı enstrüman aynı
 * satırda tekrar edemez. Geçerli seviyeler: Başlangıç, Orta, İleri.
 *
 * GERİYE UYUMLULUK: eski tek-enstrüman biçimi (`enstruman` kolonu, çoklu
 * değer YOK) hâlâ desteklenir — `enstrumanlar` boşsa `enstruman` okunur.
 * İkisi birden verilirse `enstrumanlar` önceliklidir.
 */
export const TEACHER_CSV_COLUMNS = [
  "ad_soyad",
  "email",
  "telefon",
  "sube",
  "enstrumanlar",
  "enstruman_seviyeleri",
  "lise",
  "universite",
  "mezuniyet",
  "sozlesme_baslangic",
  "sozlesme_bitis",
] as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const INSTRUMENT_LEVELS: InstrumentLevel[] = ["Başlangıç", "Orta", "İleri"];

export const TEACHER_CSV_SAMPLE = `ad_soyad,email,telefon,sube,enstrumanlar,enstruman_seviyeleri,lise,universite,mezuniyet,sozlesme_baslangic,sozlesme_bitis
Selin Kara,selin@okul.com,0555 111 1111,Erzene,Piyano,İleri,İzmir Fen Lisesi,İTÜ Müzik,2015,2026-09-01,
Can Yılmaz,can@okul.com,0555 111 2222,Erzene,Keman|Piyano,Orta|Başlangıç,Bornova Anadolu Lisesi,Ege Üniversitesi Devlet Konservatuvarı,2018,2026-09-01,2027-08-31
Ada Demir,ada@okul.com,0555 111 3333,Evka 3,Gitar|Bas Gitar|Ukulele,İleri|Orta|Başlangıç,Karşıyaka Lisesi,,2020,2026-09-01,
Mert Öz,mert@okul.com,0555 111 4444,Erzene,Bateri|Şan,Orta|Orta,,Dokuz Eylül Üniversitesi,2019,2026-09-01,
`;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isInstrumentLevel(value: string): value is InstrumentLevel {
  return (INSTRUMENT_LEVELS as string[]).includes(value);
}

/**
 * `enstrumanlar`/`enstruman_seviyeleri` çiftini ayrıştırır. Hata durumunda
 * `{ ok: false, message }`; ikisi de boşsa (legacy tek-enstrüman satırı)
 * `{ ok: true, rows: [] }` döner — çağıran taraf bu durumda `enstruman`
 * kolonuna düşer.
 *
 * `activeInstrumentNames` — ÖNCELİK 4 (devam) — İSTEMCİ ENUM'UNA DEĞİL,
 * çağıranın verdiği (server-side, tenant-scoped) aktif enstrüman listesine
 * karşı doğrulanır; bu liste sabit `INSTRUMENTS` + tenant'ın Enstrümanlar
 * kataloğundaki aktif ek enstrümanların (ör. Bas Gitar, Ukulele) birleşimi
 * olmalıdır (bkz. resolveActiveInstrumentNames, instrument-catalog.ts).
 */
function parseInstrumentLevels(
  instrumentsRaw: string,
  levelsRaw: string,
  activeInstrumentNames: string[]
): { ok: true; rows: TeacherInstrumentSkill[] } | { ok: false; message: string } {
  if (!instrumentsRaw.trim() && !levelsRaw.trim()) return { ok: true, rows: [] };
  if (!instrumentsRaw.trim()) {
    return { ok: false, message: "enstruman_seviyeleri doluysa enstrumanlar da doldurulmalı." };
  }

  const instrumentNames = instrumentsRaw.split("|").map((s) => s.trim()).filter(Boolean);
  const levelNames = levelsRaw.split("|").map((s) => s.trim()).filter(Boolean);

  if (levelNames.length === 0) {
    return { ok: false, message: "enstrumanlar doluysa enstruman_seviyeleri de doldurulmalı." };
  }
  if (instrumentNames.length !== levelNames.length) {
    return {
      ok: false,
      message: `Enstrüman sayısı (${instrumentNames.length}) ile seviye sayısı (${levelNames.length}) eşleşmiyor.`,
    };
  }

  const seen = new Set<string>();
  const rows: TeacherInstrumentSkill[] = [];
  for (let i = 0; i < instrumentNames.length; i++) {
    const instrument = instrumentNames[i]!;
    const level = levelNames[i]!;
    // Kök neden — bkz. src/lib/import/students.ts `resolveInstrument`
    // yorumu: kayda HAM CSV yazımı değil, kataloğun kanonik yazımı yazılır
    // ki öğrencinin bu öğretmene atanması sırasındaki TAM eşleşme kontrolü
    // ("öğretmen bu enstrümanı öğretmiyor") yazım farkı yüzünden yanlışlıkla
    // başarısız olmasın.
    const canonical = resolveCanonicalValue(instrument, activeInstrumentNames);
    if (!canonical) {
      return {
        ok: false,
        message: `Geçersiz veya pasif enstrüman: "${instrument}". Geçerli değerler: ${activeInstrumentNames.join(", ")}.`,
      };
    }
    if (!isInstrumentLevel(level)) {
      return {
        ok: false,
        message: `Geçersiz seviye: "${level}". Geçerli değerler: ${INSTRUMENT_LEVELS.join(", ")}.`,
      };
    }
    const key = canonical.toLocaleLowerCase("tr");
    if (seen.has(key)) {
      return { ok: false, message: `Aynı enstrüman ("${instrument}") satırda birden fazla kez geçemez.` };
    }
    seen.add(key);
    // Dinamik (katalog) enstrüman adları statik `Instrument` union'ının
    // dışında olabilir (ör. "Bas Gitar") — runtime doğrulama yukarıda
    // (activeInstrumentNames) yapıldı; bu bilinçli bir tip genişletmesidir.
    rows.push({ instrument: canonical as Instrument, level });
  }
  return { ok: true, rows };
}

/**
 * Öğretmen CSV'sinde e-posta zorunludur — hem içe aktarımın kendi
 * tekrar-önleme anahtarı hem de öğrenci satırlarının öğretmen eşleme
 * anahtarı budur (genel web formunda e-posta opsiyoneldir; toplu içe
 * aktarımda bilinçli olarak zorunlu tutulur).
 *
 * `activeInstrumentNames` opsiyoneldir; verilmezse sabit `INSTRUMENTS`
 * kullanılır (geriye dönük uyumluluk / doğrudan birim testleri için).
 * Gerçek çağıran (tools.ts) her zaman tenant-scoped
 * `resolveActiveInstrumentNames(ctx.tenantId)` sonucunu vermelidir —
 * yalnızca istemci enum'una güvenilmez.
 */
export function validateTeacherRows(
  data: AppData,
  records: CsvRecord[],
  activeInstrumentNames: string[] = [...INSTRUMENTS]
): ImportPreview<TeacherImportRow> {
  const errors: ImportRowError[] = [];
  const valid: TeacherImportRow[] = [];
  const readRows: ImportReadRow[] = [];
  const seenEmails = new Set<string>();

  records.forEach((rec, idx) => {
    const row = idx + 2;
    const name = rec["ad_soyad"] ?? rec["ad"] ?? "";
    const email = rec["email"] ?? rec["eposta"] ?? "";
    const phone = rec["telefon"] ?? "";
    const branchValue = rec["sube"] ?? "";
    const legacyInstrumentValue = rec["enstruman"] ?? "";
    const instrumentsRaw = rec["enstrumanlar"] ?? "";
    const levelsRaw = rec["enstruman_seviyeleri"] ?? "";
    const highSchool = rec["lise"] ?? "";
    const university = rec["universite"] ?? "";
    const graduationYearRaw = rec["mezuniyet"] ?? "";
    const contractStartRaw = rec["sozlesme_baslangic"] ?? "";
    const contractEndRaw = rec["sozlesme_bitis"] ?? "";

    if (readRows.length < IMPORT_READ_ROWS_PREVIEW_LIMIT) {
      readRows.push({
        row,
        summary: `${name || "(ad boş)"} — ${branchValue || "(şube boş)"} — ${instrumentsRaw || legacyInstrumentValue || "(enstrüman boş)"}`,
      });
    }

    if (!name) errors.push({ row, field: "ad_soyad", message: "Ad soyad boş olamaz." });
    if (!email) {
      errors.push({ row, field: "email", message: "E-posta boş olamaz." });
    } else if (!EMAIL_RE.test(email)) {
      errors.push({ row, field: "email", message: "E-posta biçimi geçersiz." });
    } else {
      const key = email.trim().toLowerCase();
      if (seenEmails.has(key)) {
        errors.push({ row, field: "email", message: `Bu dosyada "${email}" birden fazla kez kullanılmış.` });
      }
      seenEmails.add(key);
    }
    if (!phone) errors.push({ row, field: "telefon", message: "Telefon boş olamaz." });

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

    // Çoklu enstrüman/seviye — verilmemişse legacy tek-enstrüman kolonuna düşer.
    let instrumentLevels: TeacherInstrumentSkill[] = [];
    let legacyInstrumentOk = false;
    let canonicalLegacyInstrument: string | null = null;
    const multiParsed = parseInstrumentLevels(instrumentsRaw, levelsRaw, activeInstrumentNames);
    if (!multiParsed.ok) {
      errors.push({ row, field: "enstrumanlar", message: multiParsed.message });
    } else if (multiParsed.rows.length > 0) {
      instrumentLevels = multiParsed.rows;
    } else {
      // Legacy: `enstrumanlar` boş — `enstruman` kolonuna bak.
      if (!legacyInstrumentValue) {
        errors.push({ row, field: "enstrumanlar", message: "Enstrüman boş olamaz (enstrumanlar veya enstruman kolonu doldurulmalı)." });
      } else {
        canonicalLegacyInstrument = resolveCanonicalValue(legacyInstrumentValue, activeInstrumentNames);
        if (!canonicalLegacyInstrument) {
          errors.push({
            row,
            field: "enstruman",
            message: `Geçersiz veya pasif enstrüman: "${legacyInstrumentValue}". Geçerli değerler: ${activeInstrumentNames.join(", ")}.`,
          });
        } else {
          legacyInstrumentOk = true;
        }
      }
    }

    let graduationYear: number | undefined;
    if (graduationYearRaw.trim()) {
      const n = Number(graduationYearRaw);
      if (!Number.isInteger(n) || n < 1950 || n > 2100) {
        errors.push({ row, field: "mezuniyet", message: `Geçerli bir yıl olmalı: "${graduationYearRaw}".` });
      } else {
        graduationYear = n;
      }
    }

    if (contractStartRaw.trim() && !DATE_RE.test(contractStartRaw.trim())) {
      errors.push({ row, field: "sozlesme_baslangic", message: 'Tarih "yyyy-aa-gg" biçiminde olmalı (ör. 2026-09-01).' });
    }
    if (contractEndRaw.trim() && !DATE_RE.test(contractEndRaw.trim())) {
      errors.push({ row, field: "sozlesme_bitis", message: 'Tarih "yyyy-aa-gg" biçiminde olmalı (ör. 2027-08-31).' });
    }

    const instrumentsValid = instrumentLevels.length > 0 || legacyInstrumentOk;

    if (
      name &&
      email &&
      EMAIL_RE.test(email) &&
      phone &&
      branchId &&
      instrumentsValid &&
      (!graduationYearRaw.trim() || graduationYear !== undefined) &&
      (!contractStartRaw.trim() || DATE_RE.test(contractStartRaw.trim())) &&
      (!contractEndRaw.trim() || DATE_RE.test(contractEndRaw.trim()))
    ) {
      valid.push({
        name,
        email,
        phone,
        branchId,
        instrument: instrumentLevels.length > 0 ? instrumentLevels[0]!.instrument : (canonicalLegacyInstrument as Instrument),
        instrumentLevels: instrumentLevels.length > 0 ? instrumentLevels : undefined,
        highSchool: highSchool || undefined,
        university: university || undefined,
        graduationYear,
        contractStartDate: contractStartRaw.trim() || undefined,
        contractEndDate: contractEndRaw.trim() || undefined,
      });
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

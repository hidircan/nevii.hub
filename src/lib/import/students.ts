import type { AppData, Instrument, SocialMediaConsentStatus, StudentTermType } from "../types";
import { INSTRUMENTS } from "../types";
import type { CsvRecord } from "./csv";
import type { ImportPreview, ImportRowError, ImportReadRow } from "./types";
import { IMPORT_READ_ROWS_PREVIEW_LIMIT } from "./types";
import { resolveBranchId, resolveTeacherIdByName } from "./branch-lookup";
import { encryptNationalId, isValidTurkishNationalId } from "../pii/tc-identity";
import { resolveCanonicalValue } from "../normalize";

export type StudentImportRow = {
  name: string;
  email: string;
  phone: string;
  parentName: string;
  parentPhone: string;
  branchId: string;
  instrument: Instrument;
  teacherId: string;
  packageName: string;
  weeklyLessonCount: number;
  monthlyFee: number;
  notes: string;
  /** ÖNCELİK 4 (devam) — CSV şablon revizyonu: yeni alanlar. Hepsi opsiyonel. */
  lessonDurationMinutes?: 30 | 40 | 50;
  birthDate?: string;
  birthPlace?: string;
  schoolOrOccupation?: string;
  address?: string;
  /** Şifrelenmiş — ham T.C. kimlik hiçbir yerde (bu satır dahil) tutulmaz. */
  nationalIdCipher?: string;
  nationalIdLast2?: string;
  enrollmentStartDate?: string;
  /** Student modelinde yok — commit sonrası ayrıca setSocialMediaConsent ile yazılır. */
  socialMediaConsentStatus?: SocialMediaConsentStatus;
  /** Bu turda kayıt akışına eklenmedi (yalnızca gelecekte termType ile ilişkilendirilebilir); şimdilik yok sayılır. */
  termType?: StudentTermType;
};

/**
 * ÖNCELİK 4 (devam) — öğrenci CSV şablonu revizyonu. Kaldırılanlar: öğrenci
 * e-postası (`eposta`), öğretmen e-postası (`ogretmen_eposta` → `ogretmen`,
 * artık AD ile eşleşir). Eklenenler: tc_kimlik_no, dogum_tarihi, dogum_yeri,
 * okul_meslek, ev_adresi, sosyal_medya_izni, kayit_tarihi, ders_suresi.
 * `enstruman`/`haftalik_ders_sayisi`/`aylik_ucret`/`notlar` mevcut zorunlu
 * alanlar olduğu için (Student modeli bunlarsız oluşturulamaz) korunur —
 * görev tanımındaki "önerilen kolonlar" listesi yalnızca DEĞİŞEN alanları
 * gösterir, tüm şemayı değiştirmez.
 *
 * GERİYE UYUMLULUK: eski `eposta`/`ogretmen_eposta` kolonları artık
 * OKUNMAZ — dosyada bulunsalar bile yok sayılır (hata üretmez, ama
 * `ogretmen_eposta` varsa ve yeni `ogretmen` kolonu YOKSA satır "öğretmen
 * bulunamadı" hatası alır; bu, kullanıcıya import ekranında görünen açık
 * bir hata mesajıyla bildirilir).
 */
export const STUDENT_CSV_COLUMNS = [
  "ad_soyad",
  "veli_ad_soyad",
  "veli_telefon",
  "ogrenci_telefon",
  "sube",
  "enstruman",
  "ogretmen",
  "paket",
  "ders_suresi",
  "haftalik_ders_sayisi",
  "aylik_ucret",
  "tc_kimlik_no",
  "dogum_tarihi",
  "dogum_yeri",
  "okul_meslek",
  "ev_adresi",
  "sosyal_medya_izni",
  "kayit_tarihi",
  "notlar",
] as const;

/**
 * dogum_tarihi/kayit_tarihi kabul edilen TEK format: yyyy-MM-dd (ör.
 * 2015-03-22). Başka biçim (gg.aa.yyyy, aa/gg/yyyy vb.) satır hatası
 * üretir — sessizce tahmin edilmez.
 */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const STUDENT_CSV_SAMPLE = `ad_soyad,veli_ad_soyad,veli_telefon,ogrenci_telefon,sube,enstruman,ogretmen,paket,ders_suresi,haftalik_ders_sayisi,aylik_ucret,tc_kimlik_no,dogum_tarihi,dogum_yeri,okul_meslek,ev_adresi,sosyal_medya_izni,kayit_tarihi,notlar
Deniz Ak,Ayşe Ak,0555 222 2222,0555 222 2223,Erzene,Piyano,Turgay Hoşbaş,Bireysel Aylık — 4 ders,30,1,3000,,2015-03-22,İzmir,Erzene İlkokulu 4-A,Bornova Mah. No:12,Evet,2026-09-01,
Ece Yılmaz,Merve Yılmaz,0555 333 3333,0555 333 3334,Evka 3,Keman,Ebru Şirince,Bireysel Aylık — 8 ders,40,2,5800,,2013-11-08,Ankara,Konak Ortaokulu 6-B,Konak Mah. No:45,Hayır,2026-09-01,Grup dersine de katılıyor
Kerem Doğan,Fatma Doğan,0555 444 4444,0555 444 4445,Erzene,Gitar,Olcay Özdemir,Bireysel Aylık — 4 ders,50,1,4200,,2010-05-14,İstanbul,Lise 11. sınıf,Evka 3 Mah. No:7,Evet,2026-09-01,
`;

const PHONE_RE = /^[0-9()+\-\s]{7,}$/;
const LESSON_DURATIONS = [30, 40, 50] as const;

/**
 * Kanonik enstrüman adını döner (ör. "yan flut" / "Yanflüt" girilse bile
 * kataloğun kendi yazımı olan "Yan Flüt" döner) — bulunamazsa `null`.
 * Kök neden notu: önceden burada yalnızca büyük/küçük harften bağımsız bir
 * `boolean` doğrulaması yapılıyor, ama kayda HAM CSV değeri yazılıyordu;
 * bu da öğretmenin `instruments` dizisiyle (kataloğun kanonik yazımıyla
 * dolu) sonraki TAM eşleşme kontrollerinin (aşağıda, MT-003) sessizce
 * başarısız olmasına yol açıyordu — "öğretmen bu enstrümanı öğretmiyor"
 * hatası, aslında aynı enstrümanın farklı yazımı yüzünden çıkıyordu.
 */
function resolveInstrument(value: string, activeInstrumentNames: string[]): string | null {
  return resolveCanonicalValue(value, activeInstrumentNames);
}

function parseSocialMediaConsent(value: string): SocialMediaConsentStatus | undefined | "invalid" {
  const v = value.trim().toLocaleLowerCase("tr");
  if (!v) return undefined; // opsiyonel — verilmezse hiç kayıt oluşturulmaz
  if (v === "evet") return "granted";
  if (v === "hayır" || v === "hayir") return "denied";
  return "invalid";
}

/**
 * `activeInstrumentNames` opsiyoneldir; verilmezse sabit `INSTRUMENTS`
 * kullanılır. Gerçek çağıran (tools.ts) tenant-scoped
 * `resolveActiveInstrumentNames(ctx.tenantId)` vermelidir — ÖNCELİK 4
 * (devam) enstrüman kataloğuyla tutarlı, yalnızca istemci enum'una
 * güvenilmez.
 */
export function validateStudentRows(
  data: AppData,
  records: CsvRecord[],
  activeInstrumentNames: string[] = [...INSTRUMENTS]
): ImportPreview<StudentImportRow> {
  const errors: ImportRowError[] = [];
  const valid: StudentImportRow[] = [];
  const readRows: ImportReadRow[] = [];
  const seenPhones = new Set<string>();

  records.forEach((rec, idx) => {
    const row = idx + 2;
    const name = rec["ad_soyad"] ?? rec["ad"] ?? ""; // "ad" = eski kolon adı, geriye uyumlu okunur
    const phone = rec["ogrenci_telefon"] ?? rec["telefon"] ?? "";
    const parentName = rec["veli_ad_soyad"] ?? rec["veli_adi"] ?? "";
    const parentPhone = rec["veli_telefon"] ?? "";
    const branchValue = rec["sube"] ?? "";
    const instrumentValue = rec["enstruman"] ?? "";
    const teacherValue = rec["ogretmen"] ?? "";
    const packageName = rec["paket"] ?? rec["paket_adi"] ?? "";
    const durationRaw = rec["ders_suresi"] ?? "";
    const weeklyRaw = rec["haftalik_ders_sayisi"] ?? "";
    const feeRaw = rec["aylik_ucret"] ?? "";
    const nationalIdRaw = rec["tc_kimlik_no"] ?? "";
    const birthDateRaw = rec["dogum_tarihi"] ?? "";
    const birthPlace = rec["dogum_yeri"] ?? "";
    const schoolOrOccupation = rec["okul_meslek"] ?? "";
    const address = rec["ev_adresi"] ?? "";
    const socialMediaRaw = rec["sosyal_medya_izni"] ?? "";
    const enrollmentRaw = rec["kayit_tarihi"] ?? "";
    const notes = rec["notlar"] ?? "";

    // Geriye uyumluluk sinyali: eski öğretmen e-postası kolonu hâlâ
    // doldurulmuş ama yeni `ogretmen` kolonu boşsa, kullanıcıya BUNUN artık
    // okunmadığını açıkça söylüyoruz (sessizce yok saymak yerine).
    if (!teacherValue && rec["ogretmen_eposta"]) {
      errors.push({
        row,
        field: "ogretmen",
        message:
          'Eski "ogretmen_eposta" kolonu artık desteklenmiyor — öğretmeni "ogretmen" kolonunda AD ile belirtin.',
      });
    }
    // Eski "eposta" kolonu dosyada olsa bile artık okunmaz — sessizce yok
    // sayılır (öğrenci e-postası artık zorunlu/kullanılan bir alan değil).

    if (readRows.length < IMPORT_READ_ROWS_PREVIEW_LIMIT) {
      readRows.push({
        row,
        summary: `${name || "(ad boş)"} — ${branchValue || "(şube boş)"} — ${instrumentValue || "(enstrüman boş)"}`,
      });
    }

    if (!name) errors.push({ row, field: "ad_soyad", message: "Ad soyad boş olamaz." });
    if (!phone) {
      errors.push({ row, field: "ogrenci_telefon", message: "Öğrenci telefonu boş olamaz." });
    } else if (!PHONE_RE.test(phone)) {
      errors.push({ row, field: "ogrenci_telefon", message: `Geçersiz telefon biçimi: "${phone}".` });
    } else {
      const key = phone.trim();
      if (seenPhones.has(key)) {
        errors.push({ row, field: "ogrenci_telefon", message: `Bu dosyada "${phone}" telefonu birden fazla kez kullanılmış.` });
      }
      seenPhones.add(key);
    }
    if (!parentName) errors.push({ row, field: "veli_ad_soyad", message: "Veli adı soyadı boş olamaz." });
    if (!parentPhone) errors.push({ row, field: "veli_telefon", message: "Veli telefonu boş olamaz." });

    let branchId: string | null = null;
    if (!branchValue) {
      errors.push({ row, field: "sube", message: "Şube boş olamaz." });
    } else {
      const resolved = resolveBranchId(data, branchValue);
      if (!resolved.ok) errors.push({ row, field: "sube", message: resolved.message });
      else branchId = resolved.branchId;
    }

    let canonicalInstrument: string | null = null;
    if (!instrumentValue) {
      errors.push({ row, field: "enstruman", message: "Enstrüman boş olamaz." });
    } else {
      canonicalInstrument = resolveInstrument(instrumentValue, activeInstrumentNames);
      if (!canonicalInstrument) {
        errors.push({
          row,
          field: "enstruman",
          message: `Geçersiz enstrüman: "${instrumentValue}". Geçerli değerler: ${INSTRUMENTS.join(", ")} (kurumunuz Enstrümanlar ekranından ek enstrüman tanımlamış olabilir).`,
        });
      }
    }

    let teacherId: string | null = null;
    if (!teacherValue) {
      errors.push({ row, field: "ogretmen", message: "Öğretmen adı boş olamaz." });
    } else {
      const resolved = resolveTeacherIdByName(data, teacherValue);
      if (!resolved.ok) {
        errors.push({ row, field: "ogretmen", message: resolved.message });
      } else if (canonicalInstrument) {
        // MT-003 — enstrüman + öğretmen kombinasyonu uyumsuzsa satır reddedilir
        // (öğretmenin BİRDEN FAZLA enstrümanı varsa eşleşen herhangi biri
        // yeterli). Kanonik enstrüman adı kullanılır — CSV'deki ham yazım
        // (büyük/küçük harf, fazla boşluk farkı) öğretmenin `instruments`
        // dizisiyle (kataloğun kendi kanonik yazımı) TAM eşleşmeyip yanlış
        // "öğretmiyor" hatası üretmesin diye.
        const teacher = data.teachers.find((t) => t.id === resolved.teacherId);
        if (!teacher || !teacher.instruments.includes(canonicalInstrument as Instrument)) {
          errors.push({
            row,
            field: "ogretmen",
            message: `"${teacherValue}" öğretmeni "${instrumentValue}" enstrümanını öğretmiyor.`,
          });
        } else {
          teacherId = resolved.teacherId;
        }
      } else {
        // Enstrüman kendi başına zaten geçersiz/boş — o alanda ayrı bir hata
        // zaten üretiliyor, burada tekrar aynı satırı ikinci bir hatayla
        // boğmayalım; yalnızca teacherId'yi geçerli SAYMA (valid'e girmesin).
        teacherId = null;
      }
    }

    if (!packageName) errors.push({ row, field: "paket", message: "Paket boş olamaz." });

    let lessonDurationMinutes: (typeof LESSON_DURATIONS)[number] | null = null;
    if (!durationRaw) {
      errors.push({ row, field: "ders_suresi", message: "Ders süresi boş olamaz." });
    } else {
      const n = Number(durationRaw);
      if (!(LESSON_DURATIONS as readonly number[]).includes(n)) {
        errors.push({ row, field: "ders_suresi", message: `Ders süresi yalnızca 30, 40 veya 50 olabilir: "${durationRaw}".` });
      } else {
        lessonDurationMinutes = n as (typeof LESSON_DURATIONS)[number];
      }
    }

    let weeklyLessonCount: number | null = null;
    if (!weeklyRaw) {
      errors.push({ row, field: "haftalik_ders_sayisi", message: "Haftalık ders sayısı boş olamaz." });
    } else {
      const n = Number(weeklyRaw);
      if (!Number.isInteger(n) || n < 1) {
        errors.push({ row, field: "haftalik_ders_sayisi", message: `Geçerli bir tam sayı olmalı: "${weeklyRaw}".` });
      } else {
        weeklyLessonCount = n;
      }
    }

    let monthlyFee: number | null = null;
    if (!feeRaw) {
      errors.push({ row, field: "aylik_ucret", message: "Aylık ücret boş olamaz." });
    } else {
      const n = Number(feeRaw);
      if (!Number.isInteger(n) || n < 0) {
        errors.push({ row, field: "aylik_ucret", message: `Geçerli bir tam sayı olmalı: "${feeRaw}".` });
      } else {
        monthlyFee = n;
      }
    }

    // T.C. kimlik — OPSİYONEL. Verilmişse algoritmik doğrulamadan geçer ve
    // şifrelenir; ham değer HİÇBİR YERDE (hata mesajı dahil) görünmez.
    let nationalIdCipher: string | undefined;
    let nationalIdLast2: string | undefined;
    if (nationalIdRaw.trim()) {
      if (!isValidTurkishNationalId(nationalIdRaw)) {
        errors.push({ row, field: "tc_kimlik_no", message: "Geçersiz T.C. kimlik numarası." });
      } else {
        const enc = encryptNationalId(nationalIdRaw);
        nationalIdCipher = enc.cipher;
        nationalIdLast2 = enc.last2;
      }
    }

    if (birthDateRaw.trim() && !DATE_RE.test(birthDateRaw.trim())) {
      errors.push({ row, field: "dogum_tarihi", message: 'Doğum tarihi "yyyy-aa-gg" biçiminde olmalı (ör. 2015-03-22).' });
    }
    if (enrollmentRaw.trim() && !DATE_RE.test(enrollmentRaw.trim())) {
      errors.push({ row, field: "kayit_tarihi", message: 'Kayıt tarihi "yyyy-aa-gg" biçiminde olmalı (ör. 2026-09-01).' });
    }

    const socialMediaParsed = parseSocialMediaConsent(socialMediaRaw);
    if (socialMediaParsed === "invalid") {
      errors.push({
        row,
        field: "sosyal_medya_izni",
        message: `Sosyal medya izni yalnızca "Evet" veya "Hayır" olabilir: "${socialMediaRaw}".`,
      });
    }

    if (
      name &&
      phone &&
      PHONE_RE.test(phone) &&
      parentName &&
      parentPhone &&
      branchId &&
      canonicalInstrument &&
      teacherId &&
      packageName &&
      lessonDurationMinutes !== null &&
      weeklyLessonCount !== null &&
      monthlyFee !== null &&
      (!nationalIdRaw.trim() || nationalIdCipher) &&
      (!birthDateRaw.trim() || DATE_RE.test(birthDateRaw.trim())) &&
      (!enrollmentRaw.trim() || DATE_RE.test(enrollmentRaw.trim())) &&
      socialMediaParsed !== "invalid"
    ) {
      valid.push({
        name,
        email: "",
        phone,
        parentName,
        parentPhone,
        branchId,
        instrument: canonicalInstrument as Instrument,
        teacherId,
        packageName,
        weeklyLessonCount,
        monthlyFee,
        notes,
        lessonDurationMinutes,
        birthDate: birthDateRaw.trim() || undefined,
        birthPlace: birthPlace || undefined,
        schoolOrOccupation: schoolOrOccupation || undefined,
        address: address || undefined,
        nationalIdCipher,
        nationalIdLast2,
        enrollmentStartDate: enrollmentRaw.trim() || undefined,
        socialMediaConsentStatus: socialMediaParsed,
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

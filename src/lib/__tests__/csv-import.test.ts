import { describe, it, expect } from "vitest";
import { parseCsv, rowsToRecords } from "../import/csv";
import { validateBranchRows, BRANCH_CSV_SAMPLE } from "../import/branches";
import { validateTeacherRows, TEACHER_CSV_SAMPLE } from "../import/teachers";
import { validateRoomRows, ROOM_CSV_SAMPLE } from "../import/rooms";
import { validateStudentRows, STUDENT_CSV_SAMPLE } from "../import/students";
import { createSeedData } from "../seed";
import { INSTRUMENTS } from "../types";

describe("parseCsv", () => {
  it("düz virgüllü satırları ayrıştırır", () => {
    const rows = parseCsv("a,b,c\n1,2,3\n");
    expect(rows).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("tırnaklı alan içindeki virgülü korur", () => {
    const rows = parseCsv('ad,adres\nDeniz,"İzmir, Bornova"\n');
    expect(rows[1]).toEqual(["Deniz", "İzmir, Bornova"]);
  });

  it("kaçışlı tırnağı (\"\") tek tırnağa çevirir", () => {
    const rows = parseCsv('ad\n"Ali ""Rock"" Koç"\n');
    expect(rows[1]).toEqual(['Ali "Rock" Koç']);
  });

  it("Türkçe karakterleri bozmadan korur", () => {
    const rows = parseCsv("ad\nŞükrü Öztürk\n");
    expect(rows[1]).toEqual(["Şükrü Öztürk"]);
  });

  it("UTF-8 BOM'u temizler", () => {
    const bom = String.fromCharCode(0xfeff);
    const rows = parseCsv(`${bom}ad,sube\nDeniz,Erzene\n`);
    expect(rows[0]).toEqual(["ad", "sube"]);
  });

  it("son satırda yeni satır olmasa da son satırı kaybetmez", () => {
    const rows = parseCsv("a,b\n1,2");
    expect(rows).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("CRLF (\\r\\n) satır sonlarını doğru ayırır, boş satır üretmez", () => {
    const rows = parseCsv("a,b\r\n1,2\r\n3,4\r\n");
    expect(rows).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("tek başına \\r (klasik Mac satır sonu) satırları birleştirmez — kök neden regresyonu", () => {
    // Bu, gerçek üretim hatasının kök nedeniydi: yalnızca \r kullanan bir
    // dosya tüm satırları TEK bir satıra birleştirip totalRows'u yanlış
    // (1 yerine 4 olması gerekirken) hesaplatıyordu.
    const rows = parseCsv("a,b\r1,2\r3,4\r");
    expect(rows).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("karışık satır sonlarını (CRLF + LF) doğru ayırır", () => {
    const rows = parseCsv("a,b\r\n1,2\n3,4\r\n");
    expect(rows).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("noktalı virgül ayraçlı (Excel/Numbers Türkçe yerel ayar) CSV'yi otomatik algılar", () => {
    const rows = parseCsv("ad;sube;enstruman\nDeniz;Erzene;Piyano\n");
    expect(rows).toEqual([
      ["ad", "sube", "enstruman"],
      ["Deniz", "Erzene", "Piyano"],
    ]);
  });

  it("noktalı virgül + CRLF + BOM birlikte doğru ayrıştırılır", () => {
    const bom = String.fromCharCode(0xfeff);
    const rows = parseCsv(`${bom}ad;sube\r\nDeniz;Erzene\r\n`);
    expect(rows).toEqual([
      ["ad", "sube"],
      ["Deniz", "Erzene"],
    ]);
  });

  it("telefon alanındaki boşlukları olduğu gibi korur (ayraç sanılmaz)", () => {
    const rows = parseCsv("ad,telefon\nDeniz,0533 618 5006\n");
    expect(rows[1]).toEqual(["Deniz", "0533 618 5006"]);
  });

  it("gerçek hata senaryosu: 4 satırlı öğretmen CSV'si tüm satır sonu biçimlerinde totalRows=4 üretir", () => {
    const header = "ad,eposta,telefon,sube,enstruman";
    const dataLines = [
      "Selin Kara,selin@okul.com,05551111111,Erzene,Piyano",
      "Hıdırcan Yağız,hidircanyagiz@gmail.com,05336185006,Bostanlı,Bağlama",
      "Ezgi Güçlü,ezguclu@gmail.com,05521800268,Bostanlı,Piyano",
      "Can Nevii,cannevii@gmail.com,05336185007,Bostanlı,Bağlama",
    ];
    for (const eol of ["\n", "\r\n", "\r"]) {
      const csv = [header, ...dataLines].join(eol) + eol;
      const { records } = rowsToRecords(parseCsv(csv));
      expect(records, `satır sonu ${JSON.stringify(eol)} için başarısız`).toHaveLength(4);
    }
  });
});

describe("validateBranchRows", () => {
  it("geçerli örnek CSV doğru sayıları verir", () => {
    const { records } = rowsToRecords(parseCsv(BRANCH_CSV_SAMPLE));
    const result = validateBranchRows(records);
    expect(result.totalRows).toBe(1);
    expect(result.validCount).toBe(1);
    expect(result.errorCount).toBe(0);
  });

  it("eksik alanı satır numarasıyla reddeder", () => {
    const { records } = rowsToRecords(parseCsv("ad,kisa_ad,sehir,telefon,adres\n,Bostanlı,İzmir,0555,Adres\n"));
    const result = validateBranchRows(records);
    expect(result.errorCount).toBe(1);
    expect(result.errors[0]).toMatchObject({ row: 2, field: "ad" });
    expect(result.validCount).toBe(0);
  });

  it("aynı dosyada tekrar eden kısa adı hata olarak işaretler", () => {
    const csv = "ad,kisa_ad,sehir,telefon,adres\nA,X,İzmir,0555,Adr\nB,X,İzmir,0555,Adr\n";
    const { records } = rowsToRecords(parseCsv(csv));
    const result = validateBranchRows(records);
    expect(result.errors.some((e) => e.field === "kisa_ad")).toBe(true);
  });
});

describe("validateTeacherRows", () => {
  const data = createSeedData();

  it("geçerli örnek CSV (tek + çoklu enstrümanlı en az 4 satır) hiçbir hata vermez — Bas Gitar/Ukulele dinamik katalogla doğrulanır", () => {
    const { records } = rowsToRecords(parseCsv(TEACHER_CSV_SAMPLE));
    // Şablonda Bas Gitar/Ukulele kullanıldığı için katalog listesiyle doğrulanır (aynı desen tools.ts'teki gibi).
    const activeInstrumentNames = [...INSTRUMENTS, "Bas Gitar", "Ukulele"];
    const result = validateTeacherRows(data, records, activeInstrumentNames);
    expect(result.totalRows).toBeGreaterThanOrEqual(4);
    expect(result.errorCount).toBe(0);
    expect(result.validCount).toBe(result.totalRows);
    expect(result.valid[0].branchId).toBe("erzene");
    // 1) tek enstrüman (yeni çoklu-kolon biçiminde tek değer olarak da geçerli)
    expect(result.valid[0].instrumentLevels).toEqual([{ instrument: "Piyano", level: "İleri" }]);
    expect(result.valid[0].instrument).toBe("Piyano");
    // 2) iki enstrüman
    const twoInstrumentRow = result.valid.find((r) => r.instrumentLevels?.length === 2);
    expect(twoInstrumentRow).toBeDefined();
    // 3) üç enstrüman (Bas Gitar/Ukulele dahil)
    const threeInstrumentRow = result.valid.find((r) => r.instrumentLevels?.length === 3);
    expect(threeInstrumentRow).toBeDefined();
    expect(threeInstrumentRow?.instrumentLevels?.map((s) => s.instrument)).toEqual(["Gitar", "Bas Gitar", "Ukulele"]);
  });

  it("geçersiz enstrümanı satır numarasıyla reddeder", () => {
    const csv = "ad,eposta,telefon,sube,enstruman\nAli,ali@x.com,0555,Erzene,Ukulele\n";
    const { records } = rowsToRecords(parseCsv(csv));
    const result = validateTeacherRows(data, records);
    expect(result.errorCount).toBe(1);
    expect(result.errors[0]).toMatchObject({ row: 2, field: "enstruman" });
  });

  it("legacy tek-enstrüman biçimi (yalnızca 'enstruman' kolonu) hâlâ çalışır", () => {
    const csv = "ad,eposta,telefon,sube,enstruman\nAli,ali@x.com,05551112233,Erzene,Piyano\n";
    const { records } = rowsToRecords(parseCsv(csv));
    const result = validateTeacherRows(data, records);
    expect(result.errorCount).toBe(0);
    expect(result.valid[0].instrument).toBe("Piyano");
    expect(result.valid[0].instrumentLevels).toBeUndefined();
  });

  it("çoklu enstrüman/seviye sayısı uyuşmazsa satır hatası verir", () => {
    const csv =
      "ad,eposta,telefon,sube,enstrumanlar,enstruman_seviyeleri\n" +
      "Ali,ali@x.com,05551112233,Erzene,Piyano|Gitar,İleri\n";
    const { records } = rowsToRecords(parseCsv(csv));
    const result = validateTeacherRows(data, records);
    expect(result.errorCount).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.field === "enstrumanlar" && e.message.includes("sayısı"))).toBe(true);
  });

  it("çoklu enstrümanda geçersiz seviye satır hatası verir", () => {
    const csv =
      "ad,eposta,telefon,sube,enstrumanlar,enstruman_seviyeleri\n" +
      "Ali,ali@x.com,05551112233,Erzene,Piyano,Uzman\n";
    const { records } = rowsToRecords(parseCsv(csv));
    const result = validateTeacherRows(data, records);
    expect(result.errorCount).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.field === "enstrumanlar" && e.message.includes("seviye"))).toBe(true);
  });

  it("aynı enstrüman satırda iki kez geçemez", () => {
    const csv =
      "ad,eposta,telefon,sube,enstrumanlar,enstruman_seviyeleri\n" +
      "Ali,ali@x.com,05551112233,Erzene,Piyano|Piyano,İleri|Orta\n";
    const { records } = rowsToRecords(parseCsv(csv));
    const result = validateTeacherRows(data, records);
    expect(result.errorCount).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.message.includes("birden fazla"))).toBe(true);
  });

  it("pasif/bilinmeyen (kataloğa eklenmemiş) enstrüman reddedilir — yalnızca istemci enum'una güvenilmez", () => {
    const csv =
      "ad,eposta,telefon,sube,enstrumanlar,enstruman_seviyeleri\n" +
      "Ali,ali@x.com,05551112233,Erzene,Bas Gitar,İleri\n";
    const { records } = rowsToRecords(parseCsv(csv));
    // activeInstrumentNames verilmez — varsayılan yalnızca sabit INSTRUMENTS; "Bas Gitar" o listede yok.
    const result = validateTeacherRows(data, records);
    expect(result.errorCount).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.field === "enstrumanlar")).toBe(true);
  });

  it("bulunamayan şubeyi reddeder", () => {
    const csv = "ad,eposta,telefon,sube,enstruman\nAli,ali@x.com,0555,Olmayan Şube,Piyano\n";
    const { records } = rowsToRecords(parseCsv(csv));
    const result = validateTeacherRows(data, records);
    expect(result.errorCount).toBe(1);
    expect(result.errors[0].field).toBe("sube");
  });

  it("geçersiz e-posta biçimini reddeder (eski 'eposta' kolonu geriye dönük okunur)", () => {
    const csv = "ad,eposta,telefon,sube,enstruman\nAli,gecersiz-eposta,0555,Erzene,Piyano\n";
    const { records } = rowsToRecords(parseCsv(csv));
    const result = validateTeacherRows(data, records);
    expect(result.errorCount).toBe(1);
    expect(result.errors[0].field).toBe("email");
  });

  it("şube adı NFD (ayrıştırılmış Unicode) yazılmış olsa bile NFC şube kaydıyla eşleşir", () => {
    // "Bostanlı" -> "ı" harfi NFD biçiminde "i" + combining dot above olarak
    // kodlanmış olabilir (bazı editör/işletim sistemi kombinasyonlarında).
    const branchDataNfc = {
      ...data,
      settings: {
        ...data.settings,
        branches: [
          ...data.settings.branches,
          { id: "bostanli", name: "Bostanlı Şubesi", shortName: "Bostanlı".normalize("NFC"), address: "", phone: "", city: "" },
        ],
      },
    };
    const nfdShortName = "Bostanlı".normalize("NFD");
    const csv = `ad,eposta,telefon,sube,enstruman\nAli,ali@x.com,0555,${nfdShortName},Piyano\n`;
    const { records } = rowsToRecords(parseCsv(csv));
    const result = validateTeacherRows(branchDataNfc, records);
    expect(result.errorCount).toBe(0);
    expect(result.valid[0]?.branchId).toBe("bostanli");
  });

  it("okunan kayıtlar (readRows) her satır için Ad — Şube — Enstrüman özeti üretir, en fazla 10", () => {
    const csv =
      "ad,eposta,telefon,sube,enstruman\n" +
      "Selin Kara,selin@okul.com,0555,Erzene,Piyano\n" +
      "Ali Veli,ali@x.com,0556,Erzene,Gitar\n";
    const { records } = rowsToRecords(parseCsv(csv));
    const result = validateTeacherRows(data, records);
    expect(result.readRows).toEqual([
      { row: 2, summary: "Selin Kara — Erzene — Piyano" },
      { row: 3, summary: "Ali Veli — Erzene — Gitar" },
    ]);
  });
});

describe("validateRoomRows", () => {
  const data = createSeedData();

  it("geçerli örnek CSV doğru sayıları verir ve çoklu enstrümanı ayrıştırır", () => {
    const { records } = rowsToRecords(parseCsv(ROOM_CSV_SAMPLE));
    const result = validateRoomRows(data, records);
    expect(result.validCount).toBe(1);
    expect(result.errorCount).toBe(0);
    expect(result.valid[0].instruments).toEqual(["Keman", "Yan Flüt"]);
  });

  it("geçersiz kapasiteyi satır numarasıyla reddeder", () => {
    const csv = "ad,sube,kapasite,enstrumanlar\nOda,Erzene,abc,Piyano\n";
    const { records } = rowsToRecords(parseCsv(csv));
    const result = validateRoomRows(data, records);
    expect(result.errorCount).toBe(1);
    expect(result.errors[0]).toMatchObject({ row: 2, field: "kapasite" });
  });
});

describe("validateStudentRows (ÖNCELİK 4 devam — CSV şablon revizyonu)", () => {
  const data = createSeedData();
  const t1Name = data.teachers.find((t) => t.id === "t1")!.name;

  const COLS = [
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
  const HEADER = COLS.join(",");
  /** Sütun sayısını elle saymak yerine bir nesneden güvenli biçimde satır kurar. */
  function buildRow(fields: Partial<Record<(typeof COLS)[number], string>>): string {
    return COLS.map((c) => fields[c] ?? "").join(",");
  }

  it("örnek CSV yapısında öğrenci/öğretmen e-postası kolonları YOK; yeni alanlar VAR", () => {
    const { header } = rowsToRecords(parseCsv(STUDENT_CSV_SAMPLE));
    expect(header).not.toContain("eposta");
    expect(header).not.toContain("ogretmen_eposta");
    expect(header).toContain("ogretmen");
    expect(header).toContain("tc_kimlik_no");
    expect(header).toContain("dogum_tarihi");
    expect(header).toContain("dogum_yeri");
    expect(header).toContain("okul_meslek");
    expect(header).toContain("ev_adresi");
    expect(header).toContain("sosyal_medya_izni");
    expect(header).toContain("kayit_tarihi");
    expect(header).toContain("ders_suresi");
  });

  it("örnek şablonun en az 3 satırı, hiçbir hata olmadan geçerlidir", () => {
    const { records } = rowsToRecords(parseCsv(STUDENT_CSV_SAMPLE));
    const result = validateStudentRows(data, records);
    expect(result.totalRows).toBeGreaterThanOrEqual(3);
    expect(result.errorCount).toBe(0);
    expect(result.validCount).toBe(result.totalRows);
  });

  const baseFields = {
    ad_soyad: "Deniz",
    veli_ad_soyad: "Veli",
    veli_telefon: "05551112233",
    ogrenci_telefon: "05551112244",
    sube: "Erzene",
    enstruman: "Piyano",
    ogretmen: t1Name,
    paket: "Paket",
    ders_suresi: "30",
    haftalik_ders_sayisi: "1",
    aylik_ucret: "3000",
  } as const;

  it("geçerli satır (öğretmen AD ile) doğru sayıları verir; e-posta artık gerekmez", () => {
    const csv =
      HEADER +
      "\n" +
      buildRow({
        ...baseFields,
        ad_soyad: "Deniz Ak",
        veli_ad_soyad: "Ayşe Ak",
        veli_telefon: "0555 222 2223",
        ogrenci_telefon: "0555 222 2222",
        paket: "Bireysel Aylık — 4 ders",
        dogum_tarihi: "2015-03-22",
        dogum_yeri: "İzmir",
        okul_meslek: "Erzene İlkokulu 4-A",
        ev_adresi: "Bornova Mah. No:12",
        sosyal_medya_izni: "Evet",
        kayit_tarihi: "2026-09-01",
      }) +
      "\n";
    const { records } = rowsToRecords(parseCsv(csv));
    const result = validateStudentRows(data, records);
    expect(result.totalRows).toBe(1);
    expect(result.errorCount).toBe(0);
    expect(result.validCount).toBe(1);
    expect(result.valid[0].teacherId).toBe("t1");
    expect(result.valid[0].lessonDurationMinutes).toBe(30);
    expect(result.valid[0].socialMediaConsentStatus).toBe("granted");
    expect(result.valid[0].birthDate).toBe("2015-03-22");
  });

  it("belirsiz/bulunamayan öğretmen AD eşleşmesini satır numarasıyla reddeder", () => {
    const csv = HEADER + "\n" + buildRow({ ...baseFields, ogretmen: "Olmayan Öğretmen" }) + "\n";
    const { records } = rowsToRecords(parseCsv(csv));
    const result = validateStudentRows(data, records);
    expect(result.errorCount).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.field === "ogretmen")).toBe(true);
  });

  it("eski ogretmen_eposta kolonu doldurulmuş ama yeni ogretmen kolonu boşsa açık bir hata verir (sessizce yok saymaz)", () => {
    const csv =
      "ad_soyad,veli_ad_soyad,veli_telefon,ogrenci_telefon,sube,enstruman,ogretmen,ogretmen_eposta,paket,ders_suresi,haftalik_ders_sayisi,aylik_ucret\n" +
      "Deniz,Veli,05551112233,05551112244,Erzene,Piyano,,selin@okul.com,Paket,30,1,3000\n";
    const { records } = rowsToRecords(parseCsv(csv));
    const result = validateStudentRows(data, records);
    expect(result.errors.some((e) => e.field === "ogretmen" && e.message.includes("ogretmen_eposta"))).toBe(true);
  });

  it("ders_suresi yalnızca 30/40/50 kabul eder", () => {
    const csv = HEADER + "\n" + buildRow({ ...baseFields, ders_suresi: "45" }) + "\n";
    const { records } = rowsToRecords(parseCsv(csv));
    const result = validateStudentRows(data, records);
    expect(result.errors.some((e) => e.field === "ders_suresi")).toBe(true);
  });

  it("dogum_tarihi/kayit_tarihi yanlış biçimde hata üretir", () => {
    const csv =
      HEADER + "\n" + buildRow({ ...baseFields, dogum_tarihi: "22.03.2015", kayit_tarihi: "01/09/2026" }) + "\n";
    const { records } = rowsToRecords(parseCsv(csv));
    const result = validateStudentRows(data, records);
    expect(result.errors.some((e) => e.field === "dogum_tarihi")).toBe(true);
    expect(result.errors.some((e) => e.field === "kayit_tarihi")).toBe(true);
  });

  it("sosyal_medya_izni yalnızca Evet/Hayır kabul eder", () => {
    const csv = HEADER + "\n" + buildRow({ ...baseFields, sosyal_medya_izni: "Belki" }) + "\n";
    const { records } = rowsToRecords(parseCsv(csv));
    const result = validateStudentRows(data, records);
    expect(result.errors.some((e) => e.field === "sosyal_medya_izni")).toBe(true);
  });

  it("geçersiz T.C. kimlik no reddedilir; hata mesajında ham değer görünmez", () => {
    const csv = HEADER + "\n" + buildRow({ ...baseFields, tc_kimlik_no: "12345" }) + "\n";
    const { records } = rowsToRecords(parseCsv(csv));
    const result = validateStudentRows(data, records);
    const err = result.errors.find((e) => e.field === "tc_kimlik_no");
    expect(err).toBeDefined();
    expect(err?.message).not.toContain("12345");
  });

  it("geçerli T.C. kimlik no şifrelenir; satırda ham değer/valid çıktıda düz metin yok", () => {
    // Algoritmik olarak geçerli bir örnek T.C. kimlik no (test amaçlı).
    const validTcNo = "10000000146";
    const csv = HEADER + "\n" + buildRow({ ...baseFields, tc_kimlik_no: validTcNo }) + "\n";
    const { records } = rowsToRecords(parseCsv(csv));
    const result = validateStudentRows(data, records);
    expect(result.errorCount).toBe(0);
    expect(result.valid[0].nationalIdCipher).toBeTruthy();
    expect(result.valid[0].nationalIdCipher).not.toContain(validTcNo);
    expect(result.valid[0].nationalIdLast2).toBe("46");
  });

  it("hatalı tek satır bile tüm dosyayı geçersiz kılar (validCount sıfır kalmaz ama commit katmanı hiçbirini yazmaz)", () => {
    const csv =
      HEADER +
      "\n" +
      buildRow(baseFields) +
      "\n" +
      buildRow({ ...baseFields, ad_soyad: "Ali", veli_telefon: "05551112255", ogrenci_telefon: "05551112266", enstruman: "Bateri-yanlis" }) +
      "\n";
    const { records } = rowsToRecords(parseCsv(csv));
    const result = validateStudentRows(data, records);
    expect(result.totalRows).toBe(2);
    expect(result.validCount).toBe(1);
    expect(result.errorCount).toBe(1);
    // Commit katmanı errorCount > 0 olduğu sürece HİÇBİR kaydı yazmamalı —
    // bu kural store/action seviyesinde ayrıca test edilir.
  });

  // MT-003 — enstrüman + öğretmen kombinasyonu. Seed'de t1 (Turgay Hoşbaş) =
  // Piyano/Gitar/Elektro Gitar/Şan/Yan Flüt öğretir — Keman öğretmez.
  it("MT-003: öğretmenin öğretmediği enstrüman satırı anlaşılır hata ile reddedilir", () => {
    const t1 = t1Name;
    const csv = HEADER + "\n" + buildRow({ ...baseFields, ogretmen: t1, enstruman: "Keman" }) + "\n";
    const { records } = rowsToRecords(parseCsv(csv));
    const result = validateStudentRows(data, records);
    expect(result.errorCount).toBeGreaterThan(0);
    const err = result.errors.find((e) => e.field === "ogretmen");
    expect(err).toBeDefined();
    expect(err?.message).toContain("Keman");
    expect(result.validCount).toBe(0);
  });

  it("MT-003: çoklu enstrümanlı öğretmenin ikinci enstrümanıyla satır geçerli sayılır", () => {
    const csv = HEADER + "\n" + buildRow({ ...baseFields, ogretmen: t1Name, enstruman: "Şan" }) + "\n";
    const { records } = rowsToRecords(parseCsv(csv));
    const result = validateStudentRows(data, records);
    expect(result.errorCount).toBe(0);
    expect(result.valid[0].teacherId).toBe("t1");
    expect(result.valid[0].instrument).toBe("Şan");
  });

  it("MT-003: doğru enstrümanı öğreten öğretmenle satır geçerli kalır (regresyon)", () => {
    const csv = HEADER + "\n" + buildRow({ ...baseFields, ogretmen: t1Name, enstruman: "Piyano" }) + "\n";
    const { records } = rowsToRecords(parseCsv(csv));
    const result = validateStudentRows(data, records);
    expect(result.errorCount).toBe(0);
    expect(result.validCount).toBe(1);
  });

  // Kök neden regresyonu — CSV'de enstrüman farklı yazımla (küçük harf,
  // fazla boşluk, aksansız) girildiğinde önceden isInstrument() gevşek
  // eşleşiyor ama kayda HAM CSV değeri yazılıyordu; bu ham değer öğretmenin
  // `instruments` dizisiyle (kataloğun kanonik yazımı) TAM eşleşmediği için
  // "öğretmen bu enstrümanı öğretmiyor" hatası YANLIŞLIKLA üretiliyordu.
  it("enstrüman farklı büyük/küçük harf ve fazla boşlukla yazılsa bile kanonik değere çözülür ve öğretmen eşleşmesi bozulmaz", () => {
    const csv = HEADER + "\n" + buildRow({ ...baseFields, ogretmen: t1Name, enstruman: "  piyano  " }) + "\n";
    const { records } = rowsToRecords(parseCsv(csv));
    const result = validateStudentRows(data, records);
    expect(result.errorCount).toBe(0);
    expect(result.validCount).toBe(1);
    expect(result.valid[0]!.instrument).toBe("Piyano");
    expect(result.valid[0]!.teacherId).toBe("t1");
  });

  it("öğretmen adı fazla boşluk/farklı harf büyüklüğüyle yazılsa bile eşleşir", () => {
    const csv = HEADER + "\n" + buildRow({ ...baseFields, ogretmen: t1Name.toUpperCase(), enstruman: "Piyano" }) + "\n";
    const { records } = rowsToRecords(parseCsv(csv));
    const result = validateStudentRows(data, records);
    expect(result.errorCount).toBe(0);
    expect(result.valid[0]!.teacherId).toBe("t1");
  });
});

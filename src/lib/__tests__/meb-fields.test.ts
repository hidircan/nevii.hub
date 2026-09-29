/**
 * MEB Paneli — saf iş-kuralı testleri (`src/lib/meb.ts`).
 *
 * Kapsam: MEB-ise-zorunlu kapısı, tarih sınırları + saat dilimi güvenliği,
 * sınav tri-state kuralları, tür listesi/legacy uyumu, güncelleme
 * birleştirmede "gerçek dokunma" tespiti, sınav durumu türetme.
 * Store/DB bağımlılığı YOK (UTC-öğlen kuralı `date-input.ts`'ten gelir).
 */
import { describe, it, expect } from "vitest";
import {
  isMebStudent,
  mergeMebForUpdate,
  resolveMebExamStatus,
  validateMebFields,
  MEB_EXAM_STATUS_LABELS,
} from "../meb";
import type { StudentType } from "../types";

function utcTodayPlus(days: number): string {
  const now = new Date();
  const dt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days, 12, 0, 0));
  return dt.toISOString().slice(0, 10);
}

describe("validateMebFields — MEB alan kapısı (opsiyonel, biçim korunur)", () => {
  it("MEB seçili değilse her zaman geçer (strip kararı çağırana aittir)", () => {
    expect(validateMebFields({ studentTypes: ["Hobi"] })).toEqual({ ok: true });
    expect(validateMebFields({ studentTypes: [] })).toEqual({ ok: true });
  });

  it("MEB bilgileri opsiyonel (2026-09-29): boş MEB kaydı geçer, çoklu türde de", () => {
    expect(validateMebFields({ studentTypes: ["MEB"] })).toEqual({ ok: true });
    expect(validateMebFields({ studentTypes: ["Hobi", "MEB"] as StudentType[], level: "", mebLevelStartDate: " " })).toEqual({ ok: true });
  });

  it("yalnız bir dönem tarihi girilebilir; girilen biçim yine doğrulanır", () => {
    expect(validateMebFields({ studentTypes: ["MEB"], mebLevelStartDate: "2026-09-01" }).ok).toBe(true);
    const bad = validateMebFields({ studentTypes: ["MEB"], mebLevelEndDate: "2026-02-30" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(Object.keys(bad.fieldErrors)).toEqual(["mebLevelEndDate"]);
  });

  it("MEB seviyesi 1–8 aralığında olmalı; serbest metin reddedilir", () => {
    const base = {
      studentTypes: ["MEB"] as StudentType[],
      mebLevelStartDate: "2026-09-01",
      mebLevelEndDate: "2027-06-30",
    };
    expect(validateMebFields({ ...base, level: "3" }).ok).toBe(true);
    const bad = validateMebFields({ ...base, level: "Orta" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.fieldErrors.level?.[0]).toContain("1–8");
  });

  it("bitiş başlangıçtan önce olamaz; aynı gün geçerlidir", () => {
    const types = ["MEB"] as StudentType[];
    const reversed = validateMebFields({
      studentTypes: types,
      level: "2",
      mebLevelStartDate: "2026-09-02",
      mebLevelEndDate: "2026-09-01",
    });
    expect(reversed.ok).toBe(false);
    if (!reversed.ok) expect(reversed.fieldErrors.mebLevelEndDate?.[0]).toContain("önce olamaz");

    const sameDay = validateMebFields({
      studentTypes: types,
      level: "2",
      mebLevelStartDate: "2026-09-01",
      mebLevelEndDate: "2026-09-01",
    });
    expect(sameDay.ok).toBe(true);
  });

  it("takvimde olmayan gün (2026-02-30) sessizce kaydırılmaz — reddedilir", () => {
    const res = validateMebFields({
      studentTypes: ["MEB"] as StudentType[],
      level: "1",
      mebLevelStartDate: "2026-02-30",
      mebLevelEndDate: "2026-06-30",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.fieldErrors.mebLevelStartDate).toBeTruthy();
  });

  it("saat dilimi kayması yok: 'YYYY-MM-DD' UTC-öğlen yorumlanır", () => {
    // Sınır günleri iki yönde de stabil — bitiş == başlangıç her zaman geçerli.
    const res = validateMebFields({
      studentTypes: ["MEB"] as StudentType[],
      level: "8",
      mebLevelStartDate: "2026-01-01",
      mebLevelEndDate: "2026-01-01",
    });
    expect(res.ok).toBe(true);
  });
});

describe("validateMebFields — sınav tri-state", () => {
  const base = {
    studentTypes: ["MEB"] as StudentType[],
    level: "4",
    mebLevelStartDate: "2026-09-01",
    mebLevelEndDate: "2027-06-30",
  };

  it("bilgi yok (tarih + katılım boş) geçerlidir — geçmişe varsayım yok", () => {
    expect(validateMebFields(base).ok).toBe(true);
  });

  it("'Girmedi' tarih olmadan da geçerlidir", () => {
    expect(validateMebFields({ ...base, mebExamAttended: false }).ok).toBe(true);
  });

  it("'Girdi' tarih ister", () => {
    const res = validateMebFields({ ...base, mebExamAttended: true });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.fieldErrors.mebExamDate?.[0]).toContain("zorunludur");
  });

  it("'Girdi' geçmiş tarihle geçerlidir", () => {
    expect(validateMebFields({ ...base, mebExamDate: "2020-05-10", mebExamAttended: true }).ok).toBe(true);
  });

  it("'Girdi' gelecek tarihle reddedilir", () => {
    const res = validateMebFields({ ...base, mebExamDate: utcTodayPlus(30), mebExamAttended: true });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.fieldErrors.mebExamAttended?.[0]).toContain("Gelecekteki");
  });

  it("geçersiz sınav tarihi reddedilir", () => {
    const res = validateMebFields({ ...base, mebExamDate: "not-a-date" });
    expect(res.ok).toBe(false);
  });
});

describe("isMebStudent — tür listesi esas, legacy fallback", () => {
  it("listede MEB varsa MEB'dir", () => {
    expect(isMebStudent({ studentTypes: ["Hobi", "MEB"] as StudentType[], studentType: "Hobi" })).toBe(true);
  });
  it("liste boşken legacy tekil alan kullanılır", () => {
    expect(isMebStudent({ studentTypes: [], studentType: "MEB" as StudentType })).toBe(true);
    expect(isMebStudent({ studentTypes: [], studentType: "Hobi" as StudentType })).toBe(false);
  });
  it("dolu liste legacy'yi ezer (liste MEB'sizse MEB değildir)", () => {
    expect(isMebStudent({ studentTypes: ["Hobi"] as StudentType[], studentType: "MEB" as StudentType })).toBe(false);
  });
});

describe("mergeMebForUpdate — gerçek dokunma tespiti", () => {
  const completeMeb = {
    studentTypes: ["MEB"] as StudentType[],
    studentType: "MEB" as StudentType,
    level: "3",
    mebLevelStartDate: "2026-09-01",
    mebLevelEndDate: "2027-06-30",
    mebExamDate: undefined,
    mebExamAttended: undefined,
  };

  it("aynı türlerin geri gönderilmesi dokunma sayılmaz (detay editörü deseni)", () => {
    const r = mergeMebForUpdate(completeMeb, { studentTypes: ["MEB"] as StudentType[], phone: undefined } as never);
    expect(r.touchesMebSurface).toBe(false);
    expect(r.resultingIsMeb).toBe(true);
  });

  it("tür eklenmesi/çıkarılması dokunmadır", () => {
    expect(mergeMebForUpdate(completeMeb, { studentTypes: ["MEB", "Hobi"] as StudentType[] }).touchesMebSurface).toBe(
      true
    );
    const removed = mergeMebForUpdate(completeMeb, { studentTypes: ["Hobi"] as StudentType[] });
    expect(removed.touchesMebSurface).toBe(true);
    expect(removed.resultingIsMeb).toBe(false);
  });

  it("değişmeyen MEB değerinin geri gönderilmesi dokunma sayılmaz", () => {
    const r = mergeMebForUpdate(completeMeb, {
      studentTypes: ["MEB"] as StudentType[],
      level: "3",
      mebLevelStartDate: "2026-09-01",
    });
    expect(r.touchesMebSurface).toBe(false);
  });

  it("değişen MEB değeri dokunmadır", () => {
    const r = mergeMebForUpdate(completeMeb, { level: "4" });
    expect(r.touchesMebSurface).toBe(true);
    expect(r.merged.level).toBe("4");
    expect(r.merged.mebLevelStartDate).toBe("2026-09-01");
  });

  it("boş string gönderilmemiş sayılır", () => {
    const r = mergeMebForUpdate(completeMeb, { mebExamDate: "" });
    expect(r.touchesMebSurface).toBe(false);
  });
});

describe("resolveMebExamStatus — Bilinmiyor / Girmedi / Girdi", () => {
  it("kayıtlı bilgi yoksa Bilinmiyor (geçmişe Girdi varsayımı yok)", () => {
    expect(resolveMebExamStatus({})).toBe("unknown");
    expect(resolveMebExamStatus({ mebExamDate: "2020-01-01" })).toBe("unknown");
  });
  it("false Girmedi, true Girdi", () => {
    expect(resolveMebExamStatus({ mebExamAttended: false })).toBe("not_attended");
    expect(resolveMebExamStatus({ mebExamAttended: true })).toBe("attended");
  });
  it("etiketler ürün dilindedir", () => {
    expect(MEB_EXAM_STATUS_LABELS.unknown).toBe("Bilinmiyor");
    expect(MEB_EXAM_STATUS_LABELS.not_attended).toBe("Girmedi");
    expect(MEB_EXAM_STATUS_LABELS.attended).toBe("Girdi");
  });
});

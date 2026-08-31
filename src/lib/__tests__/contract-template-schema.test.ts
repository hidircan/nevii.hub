import { describe, it, expect } from "vitest";
import {
  findMissingRequiredContractPlaceholders,
  findUnsupportedPlaceholders,
  NO_ELIGIBLE_ACTIVE_TEMPLATE_MESSAGE,
  requiredContractPlaceholders,
  selectActiveContractTemplate,
  selectEligibleActiveTemplateForContract,
  STUDENT_ENROLLMENT_CONTRACT_PLACEHOLDERS,
} from "../contract-template-schema";

describe("contract-template-schema — Faz 6 tek kaynak kaydı", () => {
  it("eksik zorunlu alanları doğru tespit eder (gerçek metadata-only şablon örneği)", () => {
    // data/document-templates.json içinde 2026-08-25 tarihli, GERÇEK stale şablonun aynısı.
    const metadataOnlyBody =
      "<h1>Öğrenci Kayıt Sözleşmesi</h1><p>Referans: {{reference}}</p><p>Öğrenci: {{studentName}} · Şube: {{branchName}} · Tarih: {{date}}</p>";
    const missing = findMissingRequiredContractPlaceholders(metadataOnlyBody);
    const missingKeys = missing.map((m) => m.key);
    expect(missingKeys).toContain("titleMain");
    expect(missingKeys).toContain("paymentDueRuleText");
    expect(missingKeys).toContain("totalContractAmountText");
    expect(missingKeys).toContain("signatoryFullName");
    expect(missingKeys).toContain("enrollmentStartDateText");
    expect(missingKeys).toContain("taksit1Tarih");
    expect(missingKeys).toContain("taksit1Tutar");
  });

  it("tüm zorunlu alanları içeren gövde için boş liste döner", () => {
    const complete = requiredContractPlaceholders()
      .map((p) => `{{${p.key}}}`)
      .join(" ");
    expect(findMissingRequiredContractPlaceholders(complete)).toHaveLength(0);
  });

  it("taksit2-12 opsiyoneldir — yalnızca taksit1 zorunludur", () => {
    const keys = requiredContractPlaceholders().map((p) => p.key);
    expect(keys).toContain("taksit1Tarih");
    expect(keys).not.toContain("taksit2Tarih");
    expect(keys).not.toContain("taksit12Tutar");
  });

  it("desteklenmeyen bir alan (renderer tarafından tanınmayan) tespit edilir", () => {
    const body = "<p>{{studentName}}</p><p>{{bilinmeyenAlan}}</p>";
    expect(findUnsupportedPlaceholders(body)).toEqual(["bilinmeyenAlan"]);
  });

  it("sistem alanları ({{reference}}, {{date}}) desteklenmeyen listede GÖRÜNMEZ", () => {
    const body = "<p>{{reference}}</p><p>{{date}}</p>";
    expect(findUnsupportedPlaceholders(body)).toHaveLength(0);
  });

  it("kayıttaki her placeholder benzersizdir (yinelenen anahtar yok)", () => {
    const keys = STUDENT_ENROLLMENT_CONTRACT_PLACEHOLDERS.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("selectActiveContractTemplate EN SON GÜNCELLENEN'i seçer — dizi sırası (ör. eski stale kayıt önce gelse bile) ÖNEMLİ DEĞİLDİR", () => {
    const templates = [
      { id: "old-stale", kind: "student_enrollment_contract", updatedAt: "2026-08-25T17:22:19.670Z", active: true },
      { id: "new-fixed", kind: "student_enrollment_contract", updatedAt: "2026-08-29T12:00:00.000Z", active: true },
    ];
    expect(selectActiveContractTemplate(templates)!.id).toBe("new-fixed");
  });

  it("selectActiveContractTemplate diğer türdeki şablonları YOK sayar", () => {
    const templates = [
      { id: "consent", kind: "parent_social_media_consent", updatedAt: "2026-08-29T12:00:00.000Z", active: true },
      { id: "contract", kind: "student_enrollment_contract", updatedAt: "2026-08-20T00:00:00.000Z", active: true },
    ];
    expect(selectActiveContractTemplate(templates)!.id).toBe("contract");
  });

  describe("P0 selection fix (2026-08-30) — active===true zorunlu filtre, çağırana güvenmez", () => {
    it("DAHA YENİ ama active:false (taslak) bir şablon, DAHA ESKİ ama active:true olan şablonun ÜZERİNE ASLA seçilmez", () => {
      const templates = [
        { id: "active-older", kind: "student_enrollment_contract", updatedAt: "2026-08-30T11:47:04.615Z", active: true },
        { id: "newer-draft", kind: "student_enrollment_contract", updatedAt: "2026-08-30T11:47:09.038Z", active: false },
      ];
      expect(selectActiveContractTemplate(templates)!.id).toBe("active-older");
    });

    it("arşivlenmiş (active:false) şablon ASLA seçilmez, hiç active:true yoksa undefined döner", () => {
      const templates = [
        { id: "archived-1", kind: "student_enrollment_contract", updatedAt: "2026-08-30T12:00:00.000Z", active: false },
        { id: "archived-2", kind: "student_enrollment_contract", updatedAt: "2026-08-29T12:00:00.000Z", active: false },
      ];
      expect(selectActiveContractTemplate(templates)).toBeUndefined();
    });

    it("başka bir tenant'ın/türün şablonu asla seçilmez (kind filtresi + active filtresi birlikte çalışır)", () => {
      const templates = [
        { id: "wrong-kind-active", kind: "kvkk", updatedAt: "2026-08-30T12:00:00.000Z", active: true },
        { id: "right-kind-active", kind: "student_enrollment_contract", updatedAt: "2026-08-01T00:00:00.000Z", active: true },
      ];
      expect(selectActiveContractTemplate(templates)!.id).toBe("right-kind-active");
    });
  });

  describe("selectEligibleActiveTemplateForContract — merkezi, tipli seçim + diagnostics", () => {
    const completeBody =
      "<h1>{{titleMain}}</h1><p>{{paymentDueRuleText}} {{totalContractAmountText}} {{signatoryFullName}} {{enrollmentStartDateText}} {{taksit1Tarih}} {{taksit1Tutar}}</p>";

    it("aktif + eksiksiz şablon varsa onu döner (ok:true)", () => {
      const templates = [
        { id: "active-complete", kind: "student_enrollment_contract", updatedAt: "2026-08-30T11:47:04.615Z", active: true, bodyHtml: completeBody },
        { id: "newer-draft", kind: "student_enrollment_contract", updatedAt: "2026-08-30T11:47:09.038Z", active: false, bodyHtml: completeBody },
      ];
      const res = selectEligibleActiveTemplateForContract(templates, "student_enrollment_contract");
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.template.id).toBe("active-complete");
    });

    it("hiç active:true yoksa (yalnızca taslak/arşiv) tipli, Türkçe 'no_active_template' hatası döner — asla en son taslağa düşmez", () => {
      const templates = [
        { id: "newer-draft", kind: "student_enrollment_contract", updatedAt: "2026-08-30T11:47:09.038Z", active: false, bodyHtml: completeBody },
        { id: "older-archived", kind: "student_enrollment_contract", updatedAt: "2026-08-30T06:03:54.578Z", active: false, bodyHtml: completeBody },
      ];
      const res = selectEligibleActiveTemplateForContract(templates, "student_enrollment_contract");
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.reason).toBe("no_active_template");
        expect(res.message).toBe(NO_ELIGIBLE_ACTIVE_TEMPLATE_MESSAGE);
      }
    });

    it("aktif şablon var ama zorunlu alan eksikse 'diagnostics_failed' + eksik alan listesiyle reddeder — o taslak üretimde KULLANILMAZ", () => {
      const incompleteBody = "<h1>Öğrenci Kayıt Sözleşmesi</h1><p>{{reference}}</p>";
      const templates = [
        { id: "active-incomplete", kind: "student_enrollment_contract", updatedAt: "2026-08-30T11:47:04.615Z", active: true, bodyHtml: incompleteBody },
      ];
      const res = selectEligibleActiveTemplateForContract(templates, "student_enrollment_contract");
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.reason).toBe("diagnostics_failed");
        expect(res.missingRequired?.map((m) => m.key)).toContain("titleMain");
      }
    });
  });

  it("2026-2027 kaynağı — yeni checkbox/alan placeholder'ları KAYITLIDIR ama OPSİYONELDİR (eski tenant şablonlarını geriye dönük 'eksik' hale GETİRMEZ)", () => {
    const keys = STUDENT_ENROLLMENT_CONTRACT_PLACEHOLDERS.map((p) => p.key);
    const required = requiredContractPlaceholders().map((p) => p.key);
    const newOptionalKeys = [
      "branchOptionsText",
      "studentNationalIdText",
      "studentBirthDateText",
      "studentPhoneText",
      "studentEmailText",
      "lessonDurationOptionText",
      "weeklyFrequencyOptionText",
      "commitmentDurationOptionText",
      "vatStatusText",
      "kvkkNoticeDeliveredCheckboxText",
      "photoVideoConsentFormCheckboxText",
    ];
    for (const key of newOptionalKeys) {
      expect(keys).toContain(key);
      expect(required).not.toContain(key);
    }
  });
});

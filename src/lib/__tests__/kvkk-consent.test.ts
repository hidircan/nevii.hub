import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import {
  createConsentTextVersionTool,
  listConsentTextVersionsTool,
  getCurrentConsentTextVersionTool,
  grantKvkkConsentTool,
  withdrawKvkkConsentTool,
  listKvkkConsentHistoryTool,
  getConsentStatusTool,
  updateConsentSettingsTool,
} from "../services/tools";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import { CONSENT_TEXT_VERSIONS_FILE, KVKK_CONSENTS_FILE, computeEffectiveConsentStatus, isFeatureRestrictedForSubject } from "../kvkk-consent";
import { STUDENT_PORTAL_ACCESS_FILE } from "../student-portal-access";
import { grantStudentAccess } from "./portal-access-test-helper";
import { DEFAULT_CONSENT_SETTINGS } from "../types";

function adminCtx(overrides?: Partial<ServiceContext>): ServiceContext {
  return { role: "SCHOOL_ADMIN", userId: "admin1", tenantId: DEFAULT_TENANT_ID, channel: "web", ...overrides };
}

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

beforeEach(async () => {
  await fs.rm(CONSENT_TEXT_VERSIONS_FILE, { force: true });
  await fs.rm(KVKK_CONSENTS_FILE, { force: true });
  await fs.rm(STUDENT_PORTAL_ACCESS_FILE, { force: true });
  // consentSettings AppData.settings üzerinde yaşar (School.consentSettings) —
  // updateConsentSettingsTool testleri arasında sızmaması için ana store da sıfırlanır.
  await fs.rm(DATA_FILE, { force: true });
});

describe("computeEffectiveConsentStatus (pure)", () => {
  it("hiç onay yoksa 'missing'", () => {
    expect(computeEffectiveConsentStatus(undefined, { id: "v1" })).toBe("missing");
  });
  it("geri çekilmişse 'withdrawn' (metin güncel olsa bile)", () => {
    expect(computeEffectiveConsentStatus({ withdrawnAt: "2026-01-01", textVersionId: "v1" }, { id: "v1" })).toBe("withdrawn");
  });
  it("onay eski bir versiyona aitse 'outdated'", () => {
    expect(computeEffectiveConsentStatus({ withdrawnAt: undefined, textVersionId: "v1" }, { id: "v2" })).toBe("outdated");
  });
  it("yürürlükte metin yoksa 'outdated' (belirsizlik geçerli sayılmaz)", () => {
    expect(computeEffectiveConsentStatus({ withdrawnAt: undefined, textVersionId: "v1" }, undefined)).toBe("outdated");
  });
  it("onay güncel versiyona aitse ve geri çekilmemişse 'valid'", () => {
    expect(computeEffectiveConsentStatus({ withdrawnAt: undefined, textVersionId: "v1" }, { id: "v1" })).toBe("valid");
  });
});

describe("Faz 8 — ConsentTextVersion (append-only versiyonlama)", () => {
  it("yalnızca admin yeni versiyon yayınlayabilir", async () => {
    const res = await createConsentTextVersionTool(adminCtx({ role: "TEACHER" }), {
      consentType: "kvkk_general",
      bodyText: "metin",
      effectiveFrom: new Date().toISOString(),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("FORBIDDEN");
  });

  it("art arda yayınlanan versiyonlar sırayla +1 numaralanır, geçmiş korunur", async () => {
    const now = new Date().toISOString();
    const v1 = await createConsentTextVersionTool(adminCtx(), { consentType: "kvkk_general", bodyText: "v1 metni", effectiveFrom: now });
    const v2 = await createConsentTextVersionTool(adminCtx(), { consentType: "kvkk_general", bodyText: "v2 metni", effectiveFrom: now });
    expect(v1.ok && v1.data.version).toBe(1);
    expect(v2.ok && v2.data.version).toBe(2);

    const list = await listConsentTextVersionsTool(adminCtx(), { consentType: "kvkk_general" });
    expect(list.ok).toBe(true);
    if (list.ok) expect(list.data.versions).toHaveLength(2);
  });

  it("getCurrentConsentTextVersionTool herhangi bir kimliği doğrulanmış rol tarafından okunabilir (metin hassas değil)", async () => {
    const now = new Date().toISOString();
    await createConsentTextVersionTool(adminCtx(), { consentType: "kvkk_general", bodyText: "metin", effectiveFrom: now });
    const res = await getCurrentConsentTextVersionTool(adminCtx({ role: "TEACHER" }), { consentType: "kvkk_general" });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.version?.bodyText).toBe("metin");
  });

  it("tanımlanmamış bir tür için getCurrentConsentTextVersionTool undefined döner (hata değil)", async () => {
    const res = await getCurrentConsentTextVersionTool(adminCtx(), { consentType: "hic-tanimlanmamis" });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.version).toBeUndefined();
  });
});

describe("Faz 8 — grant/withdraw + versiyon değişince yeniden-rıza tetiklenmesi", () => {
  it("yürürlükte metin yoksa rıza kaydedilemez (neye onay verildiği belirsiz bir kayıt oluşmaz)", async () => {
    const res = await grantKvkkConsentTool(adminCtx(), {
      subjectType: "user",
      subjectId: "admin1",
      consentType: "hic-tanimlanmamis",
      channel: "admin",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("NOT_FOUND");
  });

  it("rıza verildikten sonra durum 'valid' olur", async () => {
    const now = new Date().toISOString();
    await createConsentTextVersionTool(adminCtx(), { consentType: "kvkk_general", bodyText: "v1", effectiveFrom: now });
    await grantKvkkConsentTool(adminCtx(), { subjectType: "user", subjectId: "admin1", consentType: "kvkk_general", channel: "admin" });
    const status = await getConsentStatusTool(adminCtx(), { subjectType: "user", subjectId: "admin1", consentType: "kvkk_general" });
    expect(status.ok).toBe(true);
    if (status.ok) expect(status.data.status).toBe("valid");
  });

  it("metin YENİ bir versiyona yükseltilince eski onay otomatik 'outdated' olur — ayrı bir tetikleme mekanizması gerekmez", async () => {
    const now = new Date().toISOString();
    await createConsentTextVersionTool(adminCtx(), { consentType: "kvkk_general", bodyText: "v1", effectiveFrom: now });
    await grantKvkkConsentTool(adminCtx(), { subjectType: "user", subjectId: "admin1", consentType: "kvkk_general", channel: "admin" });

    let status = await getConsentStatusTool(adminCtx(), { subjectType: "user", subjectId: "admin1", consentType: "kvkk_general" });
    if (status.ok) expect(status.data.status).toBe("valid");

    await createConsentTextVersionTool(adminCtx(), { consentType: "kvkk_general", bodyText: "v2 — güncellenmiş metin", effectiveFrom: now });
    status = await getConsentStatusTool(adminCtx(), { subjectType: "user", subjectId: "admin1", consentType: "kvkk_general" });
    expect(status.ok).toBe(true);
    if (status.ok) expect(status.data.status).toBe("outdated");
  });

  it("geri çekilen rıza durumu 'withdrawn' olur, tekrar geri çekilemez", async () => {
    const now = new Date().toISOString();
    await createConsentTextVersionTool(adminCtx(), { consentType: "kvkk_general", bodyText: "v1", effectiveFrom: now });
    const granted = await grantKvkkConsentTool(adminCtx(), {
      subjectType: "user",
      subjectId: "admin1",
      consentType: "kvkk_general",
      channel: "admin",
    });
    if (!granted.ok) return;

    const withdrawn = await withdrawKvkkConsentTool(adminCtx(), { consentId: granted.data.consentId });
    expect(withdrawn.ok).toBe(true);

    const status = await getConsentStatusTool(adminCtx(), { subjectType: "user", subjectId: "admin1", consentType: "kvkk_general" });
    if (status.ok) expect(status.data.status).toBe("withdrawn");

    const second = await withdrawKvkkConsentTool(adminCtx(), { consentId: granted.data.consentId });
    expect(second.ok).toBe(false);
  });

  it("var olmayan bir rıza kaydı geri çekilemez (NOT_FOUND) — mutasyon MUTASYONDAN ÖNCE erişim kontrolünden geçer", async () => {
    const res = await withdrawKvkkConsentTool(adminCtx(), { consentId: "does-not-exist" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("NOT_FOUND");
  });
});

describe("Faz 8 — RBAC: kendi rızası vs başkasının rızası", () => {
  it("bir STUDENT (GUARDIAN) yalnızca kendi öğrencisi için rıza kaydedebilir, başka öğrenci için FORBIDDEN", async () => {
    const now = new Date().toISOString();
    await createConsentTextVersionTool(adminCtx(), { consentType: "kvkk_general", bodyText: "v1", effectiveFrom: now });
    await grantStudentAccess({ tenantId: DEFAULT_TENANT_ID, userId: "guardian-1" }, "s1", "GUARDIAN");
    const guardianCtx: ServiceContext = { role: "STUDENT", userId: "guardian-1", tenantId: DEFAULT_TENANT_ID, studentId: "s1", channel: "web" };

    const ownConsent = await grantKvkkConsentTool(guardianCtx, {
      subjectType: "parent",
      subjectId: "s1",
      consentType: "kvkk_general",
      channel: "portal",
    });
    expect(ownConsent.ok).toBe(true);

    const otherConsent = await grantKvkkConsentTool(guardianCtx, {
      subjectType: "parent",
      subjectId: "s2",
      consentType: "kvkk_general",
      channel: "portal",
    });
    expect(otherConsent.ok).toBe(false);
    if (!otherConsent.ok) expect(otherConsent.error.code).toBe("FORBIDDEN");
  });

  it("STUDENT (GUARDIAN) başka bir öğrencinin rızasını geri çekemez (mutasyondan önce erişim kontrolü)", async () => {
    const now = new Date().toISOString();
    await createConsentTextVersionTool(adminCtx(), { consentType: "kvkk_general", bodyText: "v1", effectiveFrom: now });
    await grantStudentAccess({ tenantId: DEFAULT_TENANT_ID, userId: "guardian-1" }, "s1", "GUARDIAN");
    const guardianCtx: ServiceContext = { role: "STUDENT", userId: "guardian-1", tenantId: DEFAULT_TENANT_ID, studentId: "s1", channel: "web" };

    const granted = await grantKvkkConsentTool(adminCtx(), {
      subjectType: "parent",
      subjectId: "s2",
      consentType: "kvkk_general",
      channel: "admin",
    });
    if (!granted.ok) return;

    const forbidden = await withdrawKvkkConsentTool(guardianCtx, { consentId: granted.data.consentId });
    expect(forbidden.ok).toBe(false);
    if (!forbidden.ok) expect(forbidden.error.code).toBe("FORBIDDEN");
  });

  it("listKvkkConsentHistoryTool — TEACHER başkasının rıza tarihçesini göremez", async () => {
    const res = await listKvkkConsentHistoryTool(adminCtx({ role: "TEACHER", teacherId: "t1" }), {
      subjectType: "student",
      subjectId: "s1",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("FORBIDDEN");
  });
});

describe("Faz 8 — feature-restriction (Student.communicationOptOut'un genellemesi)", () => {
  it("feature restrictedFeatures listesinde DEĞİLSE hiçbir zaman kısıtlanmaz (rıza olmasa bile)", async () => {
    const restricted = await isFeatureRestrictedForSubject(
      DEFAULT_TENANT_ID,
      { restrictedFeatures: [], recordDeviceInfo: false },
      "student",
      "s1",
      "whatsapp_messaging"
    );
    expect(restricted).toBe(false);
  });

  it("feature listede VE geçerli rıza yoksa kısıtlanır", async () => {
    const restricted = await isFeatureRestrictedForSubject(
      DEFAULT_TENANT_ID,
      { restrictedFeatures: ["whatsapp_messaging"], recordDeviceInfo: false },
      "student",
      "s1",
      "whatsapp_messaging"
    );
    expect(restricted).toBe(true);
  });

  it("feature listede VE geçerli rıza VARSA kısıtlanmaz", async () => {
    const now = new Date().toISOString();
    await createConsentTextVersionTool(adminCtx(), { consentType: "whatsapp_messaging", bodyText: "izin metni", effectiveFrom: now });
    await grantKvkkConsentTool(adminCtx(), {
      subjectType: "student",
      subjectId: "s1",
      consentType: "whatsapp_messaging",
      channel: "admin",
    });
    const restricted = await isFeatureRestrictedForSubject(
      DEFAULT_TENANT_ID,
      { restrictedFeatures: ["whatsapp_messaging"], recordDeviceInfo: false },
      "student",
      "s1",
      "whatsapp_messaging"
    );
    expect(restricted).toBe(false);
  });
});

describe("Faz 8 — updateConsentSettingsTool (tenant ayarları)", () => {
  it("yalnızca admin günceller; TEACHER FORBIDDEN alır", async () => {
    const res = await updateConsentSettingsTool(adminCtx({ role: "TEACHER" }), DEFAULT_CONSENT_SETTINGS);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("FORBIDDEN");
  });

  it("admin restrictedFeatures/recordDeviceInfo günceller", async () => {
    const res = await updateConsentSettingsTool(adminCtx(), {
      restrictedFeatures: ["whatsapp_messaging", "photo_sharing"],
      recordDeviceInfo: true,
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.consentSettings.restrictedFeatures).toEqual(["whatsapp_messaging", "photo_sharing"]);
      expect(res.data.consentSettings.recordDeviceInfo).toBe(true);
    }
  });
});

describe("Faz 8 — veri minimizasyonu (deviceInfo yalnızca açıkça etkinleştirildiyse kalıcılaşır)", () => {
  it("recordDeviceInfo=false iken deviceInfo gönderilse bile KALICILAŞMAZ", async () => {
    const now = new Date().toISOString();
    await createConsentTextVersionTool(adminCtx(), { consentType: "kvkk_general", bodyText: "v1", effectiveFrom: now });
    // consentSettings hiç ayarlanmadı — varsayılan recordDeviceInfo=false.
    const granted = await grantKvkkConsentTool(adminCtx(), {
      subjectType: "user",
      subjectId: "admin1",
      consentType: "kvkk_general",
      channel: "admin",
      deviceInfo: { ip: "1.2.3.4", userAgent: "test-agent" },
    });
    expect(granted.ok).toBe(true);
    if (!granted.ok) return;
    const history = await listKvkkConsentHistoryTool(adminCtx(), { subjectType: "user", subjectId: "admin1" });
    expect(history.ok).toBe(true);
    if (!history.ok) return;
    const entry = history.data.history.find((h) => h.id === granted.data.consentId);
    expect(entry?.deviceInfo).toBeUndefined();
  });
});

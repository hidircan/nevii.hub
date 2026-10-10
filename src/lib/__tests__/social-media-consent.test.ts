import { describe, it, expect, beforeEach, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import {
  setSocialMediaConsentTool,
  getSocialMediaConsentTool,
  listSocialMediaConsentHistoryTool,
  withdrawSocialMediaConsentTool,
} from "../services/tools";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import { STUDENT_PORTAL_ACCESS_FILE } from "../student-portal-access";
import { grantStudentAccess } from "./portal-access-test-helper";

const SMC_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "social-media-consents.json");

function ctx(overrides?: Partial<ServiceContext>): ServiceContext {
  return {
    role: "SCHOOL_ADMIN",
    userId: "u1",
    tenantId: DEFAULT_TENANT_ID,
    channel: "web",
    ...overrides,
  };
}

function studentCtx(overrides?: Partial<ServiceContext>): ServiceContext {
  return { role: "STUDENT", userId: "u2", tenantId: DEFAULT_TENANT_ID, studentId: "s1", channel: "web", ...overrides };
}

beforeEach(async () => {
  await fs.rm(SMC_FILE, { force: true });
  await fs.rm(STUDENT_PORTAL_ACCESS_FILE, { force: true });
});

/**
 * Evraklar Faz 2 — Veli Onamı. `social-media-consent.ts`'in tool katmanı
 * (`setSocialMediaConsentTool`/`getSocialMediaConsentTool`) daha önce
 * yazılmıştı ama hiçbir hedefli testi yoktu — bu dosya ilk kez ekliyor.
 */
describe("Veli onamı — durum, tarih, kapsam, belge bağlantısı", () => {
  it("verildi (granted) durumu kaydedilir; onay veren kişi/tarih/kapsam saklanır", async () => {
    const res = await setSocialMediaConsentTool(ctx(), {
      studentId: "s1",
      status: "granted",
      representativeName: "Ayşe Ak",
      relationship: "Anne",
      scopes: ["photo", "instagram"],
      sourceDocumentRef: "NP-CONSENT-2026-ABC12345",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.status).toBe("granted");

    const fetched = await getSocialMediaConsentTool(ctx(), { studentId: "s1" });
    expect(fetched.ok).toBe(true);
    if (!fetched.ok) return;
    expect(fetched.data.consent?.status).toBe("granted");
    expect(fetched.data.consent?.representativeName).toBe("Ayşe Ak");
    expect(fetched.data.consent?.relationship).toBe("Anne");
    expect(fetched.data.consent?.scopes).toEqual(["photo", "instagram"]);
    expect(fetched.data.consent?.sourceDocumentRef).toBe("NP-CONSENT-2026-ABC12345");
    expect(fetched.data.consent?.grantedAt).toBeTruthy();
  });

  it("verilmedi (denied) durumu 'yok'/'hiç kaydedilmemiş' ile karışmadan ayrı görünür", async () => {
    const res = await setSocialMediaConsentTool(ctx(), {
      studentId: "s1",
      status: "denied",
      representativeName: "Ayşe Ak",
      relationship: "Anne",
      scopes: ["photo"],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.status).toBe("denied");
    const fetched = await getSocialMediaConsentTool(ctx(), { studentId: "s1" });
    if (!fetched.ok) return;
    expect(fetched.data.consent?.status).toBe("denied");
    expect(fetched.data.consent?.withdrawnAt).toBeUndefined(); // denied ≠ withdrawn, ayrı kavramlar
  });

  it("geri çekilme (withdrawn) durumu withdrawnAt ile açıkça etiketlenir", async () => {
    await setSocialMediaConsentTool(ctx(), {
      studentId: "s1",
      status: "granted",
      representativeName: "Ayşe Ak",
      relationship: "Anne",
      scopes: ["photo"],
    });
    const withdrawn = await setSocialMediaConsentTool(ctx(), {
      studentId: "s1",
      status: "withdrawn",
      representativeName: "Ayşe Ak",
      relationship: "Anne",
      scopes: ["photo"],
    });
    expect(withdrawn.ok).toBe(true);
    const fetched = await getSocialMediaConsentTool(ctx(), { studentId: "s1" });
    if (!fetched.ok) return;
    expect(fetched.data.consent?.status).toBe("withdrawn");
    expect(fetched.data.consent?.withdrawnAt).toBeTruthy();
  });

  it("her değişiklik yeni bir tarihçe kaydı ekler — geçmiş kaybolmaz", async () => {
    await setSocialMediaConsentTool(ctx(), {
      studentId: "s1",
      status: "granted",
      representativeName: "Ayşe Ak",
      relationship: "Anne",
      scopes: ["photo"],
    });
    await setSocialMediaConsentTool(ctx(), {
      studentId: "s1",
      status: "withdrawn",
      representativeName: "Ayşe Ak",
      relationship: "Anne",
      scopes: ["photo"],
    });
    const history = await listSocialMediaConsentHistoryTool(ctx(), { studentId: "s1" });
    expect(history.ok).toBe(true);
    if (!history.ok) return;
    expect(history.data.history.length).toBe(2);
    expect(history.data.history.map((h) => h.status).sort()).toEqual(["granted", "withdrawn"]);
  });

  it("yalnız yönetici onam oluşturup güncelleyebilir — TEACHER/PARENT/STUDENT reddedilir", async () => {
    for (const role of ["TEACHER", "STUDENT", "STUDENT"] as const) {
      const res = await setSocialMediaConsentTool(ctx({ role, teacherId: "t1", studentId: "s1" }), {
        studentId: "s1",
        status: "granted",
        representativeName: "X",
        relationship: "Anne",
        scopes: ["photo"],
      });
      expect(res.ok).toBe(false);
      if (res.ok) continue;
      expect(res.error.code).toBe("FORBIDDEN");
    }
  });

  it("cross-tenant/sahte öğrenci ID'sine onam yazılamaz", async () => {
    const res = await setSocialMediaConsentTool(ctx(), {
      studentId: "does-not-exist",
      status: "granted",
      representativeName: "X",
      relationship: "Anne",
      scopes: ["photo"],
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("NOT_FOUND");
  });

  it("bir tenant'ın onam KAYDI (veri) başka tenant'tan görünmez — social-media-consent.ts kendi tenantId filtresini uygular", async () => {
    await setSocialMediaConsentTool(ctx(), {
      studentId: "s1",
      status: "granted",
      representativeName: "Ayşe Ak",
      relationship: "Anne",
      scopes: ["photo"],
    });
    // NOT: STORE_MODE=json altında `readData()` öğrencileri tenant'a göre
    // filtrelemez (bkz. CLAUDE.md "json/memory effectively run
    // single-tenant") — bu yüzden `assertStudentAccess` burada geçer. Asıl
    // izolasyon garantisi `social-media-consent.ts`'in KENDİ `tenantId`
    // filtresinden gelir (gerçek cross-tenant testi STORE_MODE=db altında
    // gözlemlenebilir) — burada VERİNİN sızmadığını doğruluyoruz.
    const otherTenant = await getSocialMediaConsentTool(ctx({ tenantId: "other-tenant-consent", role: "SCHOOL_ADMIN" }), {
      studentId: "s1",
    });
    expect(otherTenant.ok).toBe(true);
    if (!otherTenant.ok) return;
    expect(otherTenant.data.consent).toBeUndefined();
  });

  it("henüz hiç kayıt girilmemiş öğrenci için consent undefined döner (hata değil)", async () => {
    const res = await getSocialMediaConsentTool(ctx(), { studentId: "s1" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.consent).toBeUndefined();
  });
});

describe("PORTAL-CONTRACT-001 — öğrenci/veli (STUDENT rolü) kendi fotoğraf/video rızasına erişir", () => {
  it("aktif portal erişimi olan STUDENT rolü kendi öğrencisinin rızasını görebilir", async () => {
    await setSocialMediaConsentTool(ctx(), {
      studentId: "s1",
      status: "granted",
      representativeName: "Selin Arslan",
      relationship: "veli",
      scopes: ["website", "in_house_board"],
    });
    await grantStudentAccess({ tenantId: DEFAULT_TENANT_ID, userId: "u2" }, "s1");

    const res = await getSocialMediaConsentTool(studentCtx(), { studentId: "s1" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.consent?.status).toBe("granted");

    const history = await listSocialMediaConsentHistoryTool(studentCtx(), { studentId: "s1" });
    expect(history.ok).toBe(true);
    if (!history.ok) return;
    expect(history.data.history).toHaveLength(1);
  });

  it("aktif portal erişimi OLMAYAN STUDENT rolü başka öğrencinin rızasını GÖREMEZ", async () => {
    await setSocialMediaConsentTool(ctx(), {
      studentId: "s1",
      status: "granted",
      representativeName: "Selin Arslan",
      relationship: "veli",
      scopes: ["photo"],
    });
    const res = await getSocialMediaConsentTool(studentCtx({ userId: "u9" }), { studentId: "s1" });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("FORBIDDEN");
  });

  it("withdrawSocialMediaConsentTool — konu kendi rızasını geleceğe etkili geri çekebilir, başka alan DEĞİŞMEZ", async () => {
    await setSocialMediaConsentTool(ctx(), {
      studentId: "s1",
      status: "granted",
      representativeName: "Selin Arslan",
      relationship: "veli",
      scopes: ["website", "digital_ads"],
    });
    await grantStudentAccess({ tenantId: DEFAULT_TENANT_ID, userId: "u2" }, "s1");

    const res = await withdrawSocialMediaConsentTool(studentCtx(), { studentId: "s1" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.status).toBe("withdrawn");

    const fetched = await getSocialMediaConsentTool(ctx(), { studentId: "s1" });
    expect(fetched.ok).toBe(true);
    if (!fetched.ok) return;
    expect(fetched.data.consent?.status).toBe("withdrawn");
    expect(fetched.data.consent?.representativeName).toBe("Selin Arslan");

    const history = await listSocialMediaConsentHistoryTool(ctx(), { studentId: "s1" });
    expect(history.ok).toBe(true);
    if (!history.ok) return;
    expect(history.data.history).toHaveLength(2); // append-only — eski "granted" satırı SİLİNMEDİ.
  });

  it("withdrawSocialMediaConsentTool — kayıt yoksa NOT_FOUND, zaten geri çekilmişse VALIDATION_ERROR döner", async () => {
    await grantStudentAccess({ tenantId: DEFAULT_TENANT_ID, userId: "u2" }, "s1");
    const noRecord = await withdrawSocialMediaConsentTool(studentCtx(), { studentId: "s1" });
    expect(noRecord.ok).toBe(false);
    if (noRecord.ok) return;
    expect(noRecord.error.code).toBe("NOT_FOUND");

    await setSocialMediaConsentTool(ctx(), {
      studentId: "s1",
      status: "granted",
      representativeName: "Selin Arslan",
      relationship: "veli",
      scopes: ["photo"],
    });
    await withdrawSocialMediaConsentTool(studentCtx(), { studentId: "s1" });
    const alreadyWithdrawn = await withdrawSocialMediaConsentTool(studentCtx(), { studentId: "s1" });
    expect(alreadyWithdrawn.ok).toBe(false);
    if (alreadyWithdrawn.ok) return;
    expect(alreadyWithdrawn.error.code).toBe("VALIDATION_ERROR");
  });

  /**
   * 2026-09-20 KÖK NEDEN — "en güncel izin" yalnız `grantedAt` (milisaniye)
   * ile seçiliyordu. Verilme ve geri çekilme AYNI milisaniyede olursa
   * (hızlı istek zinciri / hızlı makine) sıralama kararsız kalıyor ve ÖNCE
   * eklenen "granted" kaydı en güncel sanılıyordu: geri çekilmiş bir izin
   * sistemde HÂLÂ VERİLMİŞ görünüyordu. KVKK açısından kabul edilemez.
   */
  it("aynı milisaniyede verilip geri çekilen izin GERİ ÇEKİLMİŞ okunur (tie-break)", async () => {
    // Yalnız `Date` sahte — zamanlayıcılar gerçek kalır (dosya G/Ç asılmasın).
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-20T10:00:00.000Z"));
    try {
      await setSocialMediaConsentTool(ctx(), {
        studentId: "s1",
        status: "granted",
        representativeName: "Selin Arslan",
        relationship: "veli",
        scopes: ["photo"],
      });
      await withdrawSocialMediaConsentTool(ctx(), { studentId: "s1" });
    } finally {
      vi.useRealTimers();
    }

    const latest = await getSocialMediaConsentTool(ctx(), { studentId: "s1" });
    expect(latest.ok).toBe(true);
    if (!latest.ok) return;
    expect(latest.data.consent?.status).toBe("withdrawn");

    // Tekrar geri çekme reddedilmeli — "zaten geri çekilmiş".
    const again = await withdrawSocialMediaConsentTool(ctx(), { studentId: "s1" });
    expect(again.ok).toBe(false);
    if (again.ok) return;
    expect(again.error.code).toBe("VALIDATION_ERROR");
  });

  it("başka öğrencinin rızasını geri çekmeye çalışan STUDENT FORBIDDEN alır", async () => {
    await setSocialMediaConsentTool(ctx(), {
      studentId: "s1",
      status: "granted",
      representativeName: "Selin Arslan",
      relationship: "veli",
      scopes: ["photo"],
    });
    const res = await withdrawSocialMediaConsentTool(studentCtx({ userId: "u9" }), { studentId: "s1" });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("FORBIDDEN");
  });
});

/**
 * 10. tur iş #11 — öğretmen hakediş ekran hiyerarşisi.
 *
 * Ürün kararı: eşik öğretmene özeldir (genel eşik AYARI YOKTUR) → düzenleme
 * evi Hakedişler ana ekranı (satır-içi, tüm öğretmenler) + öğretmen profili
 * (bilgiler); detay ekranı ilk bakışta dönem hakedişi + ödenen + kalan +
 * durum + işlemleri gösterir, eşik yalnız kapalı bilgi satırıdır.
 * Hesap/ödeme mantığı DEĞİŞMEDİ (yalnız yerleşim + düzenleme evi).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs, readFileSync } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import {
  computeTeacherPayoutTool,
  createTeacherPayoutTool,
  markTeacherPayoutPaidTool,
  updateTeacherProfileTool,
} from "../services/tools";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf-8");
const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

const admin: ServiceContext = { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web" };

describe("detay hiyerarşisi (statik)", () => {
  const dash = () => read("src/components/teacher-payout-dashboard.tsx");

  it("eşik düzenleme formu detayda YOK (ana ekran + profile taşındı)", () => {
    expect(dash()).not.toContain("Eşiği kaydet");
    expect(dash()).not.toContain("Ödeme yöntemi eşiği");
    expect(dash()).not.toContain("initialThreshold");
    expect(dash()).not.toContain("handleSaveThreshold");
  });

  it("ilk bakış: dönem hakedişi + ödenen + kalan + durum + geçmiş", () => {
    const src = dash();
    for (const label of ["Dönem hakedişi", "Ödenen", "Kalan", "Durum", "Ödeme geçmişini gör"]) {
      expect(src).toContain(label);
    }
  });

  it("birincil işlemler ders tablosunun ÖNÜNDE (kaydırma yok)", () => {
    const src = dash();
    const createIdx = src.indexOf("Hakediş oluştur");
    const payIdx = src.indexOf("Hakedişi öde");
    const tableIdx = src.indexOf("<table");
    expect(createIdx).toBeGreaterThan(-1);
    expect(payIdx).toBeGreaterThan(-1);
    expect(tableIdx).toBeGreaterThan(-1);
    expect(createIdx).toBeLessThan(tableIdx);
    expect(payIdx).toBeLessThan(tableIdx);
    // İşlem satırında kompakt yöntem seçimi korunur.
    expect(src).toContain("Yöntemi güncelle");
    expect(src).toContain("Varsayılanı kullan");
  });

  it("eşik bağlamı kapalı bilgi satırında + düzenleme evlerine bağlantı", () => {
    const src = dash();
    expect(src).toContain("Ödeme yöntemi ayarları");
    expect(src).toContain("/panel/hakedisler");
    expect(src).toContain("/bilgiler");
  });

  it("kritik işlevler korunur: revizyon, ücret-kuralı uyarısı, çift-ödeme kilidi", () => {
    const src = dash();
    expect(src).toContain("Revizyon");
    expect(src).toContain("missingFeeRuleLessonIds");
    expect(src).toContain("disabled={paying");
    expect(src).toContain("handleUpdateMethod");
  });
});

describe("eşik düzenleme evleri (statik)", () => {
  it("ana ekran: Eşik sütunu + satır-içi hücre (yetki kapılı)", () => {
    const page = read("src/app/panel/hakedisler/page.tsx");
    expect(page).toContain("Eşik (sa/hafta)");
    expect(page).toContain("PayoutThresholdCell");
    expect(page).toMatch(/canEdit=\{session\.role === "SCHOOL_ADMIN" \|\| session\.role === "SUPER_ADMIN"\}/);
    const cell = read("src/components/payout-threshold-cell.tsx");
    expect(cell).toContain("actionUpdateTeacherProfile");
    expect(cell).toContain("weeklyHoursThreshold");
  });

  it("öğretmen profili: okuma + düzenleme alanı", () => {
    expect(read("src/app/panel/ogretmenler/[teacherId]/bilgiler/page.tsx")).toContain("Hakediş ödeme eşiği");
    expect(read("src/components/teacher-profile-editor.tsx")).toContain("weeklyHoursThreshold");
  });

  it("pasif öğretmen ayrımı korunur (kapsam sekmeleri + pasif bölümü)", () => {
    const page = read("src/app/panel/hakedisler/page.tsx");
    expect(page).toContain("ScopeTabs");
    expect(page).toContain("passiveTeacherOpenPayouts");
    expect(page).toContain("Pasif öğretmene kalan");
  });
});

describe("ödeme güvenliği (davranış)", () => {
  beforeEach(async () => {
    await fs.rm(DATA_FILE, { force: true });
  });

  it("çift ödeme engellenir: ikinci işaretleme ALREADY_PAID, tutar değişmez", async () => {
    const created = await createTeacherPayoutTool(admin, {
      teacherId: "t1",
      periodStart: "2026-08-01",
      periodEnd: "2026-08-14",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const first = await markTeacherPayoutPaidTool(admin, { payoutId: created.data.payout.id });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.data.payout.status).toBe("paid");
    const second = await markTeacherPayoutPaidTool(admin, { payoutId: created.data.payout.id });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error.code).toBe("CONFLICT");
    expect(second.error.message).toMatch(/zaten ödendi/);
    // Tutar ilk ödemedekiyle aynı kalır.
    const preview = await computeTeacherPayoutTool(admin, {
      teacherId: "t1",
      periodStart: "2026-08-01",
      periodEnd: "2026-08-14",
    });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.data.existingPayout?.totalAmount).toBe(created.data.payout.totalAmount);
    expect(preview.data.existingPayout?.status).toBe("paid");
  });

  it("eşik değişikliği kayıtlı hakedişi yeniden hesaplamaz, yalnız varsayımı etkiler", async () => {
    const created = await createTeacherPayoutTool(admin, {
      teacherId: "t1",
      periodStart: "2026-08-01",
      periodEnd: "2026-08-14",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const before = created.data.payout.totalAmount;
    expect((await updateTeacherProfileTool(admin, { teacherId: "t1", weeklyHoursThreshold: 40 })).ok).toBe(true);
    const preview = await computeTeacherPayoutTool(admin, {
      teacherId: "t1",
      periodStart: "2026-08-01",
      periodEnd: "2026-08-14",
    });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.data.existingPayout?.totalAmount).toBe(before);
    expect(preview.data.paymentMethodInfo?.threshold).toBe(40);
  });
});

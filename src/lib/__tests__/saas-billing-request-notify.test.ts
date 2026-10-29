import { describe, it, expect, beforeEach } from "vitest";
import { resetPlatformStoreForTests, listPlatformAudit } from "../platform/store";
import { __resetSaasBillingStoreForTests } from "../saas-billing/store";
import { notifyOwnerNewRequest, ownerNotifyEmail } from "../saas-billing/request-notify";
import { submitTrialRequest } from "../saas-billing/trial";

beforeEach(async () => {
  await resetPlatformStoreForTests();
  await __resetSaasBillingStoreForTests();
});

describe("yeni talep bildirimi", () => {
  it("alıcı sunucu ayarından gelir, varsayılan info@neviihub.com", () => {
    expect(ownerNotifyEmail()).toBe("info@neviihub.com");
  });

  it("test ortamında gerçek posta çıkmaz, sonuç denetime yazılır", async () => {
    const r = await notifyOwnerNewRequest({
      kind: "deneme",
      id: "saas_tr_test1",
      institutionName: "Test Koleji",
      createdAt: new Date().toISOString(),
    });
    // Test modu: izin listesi dışı alıcı engellenir, sahte başarı yok.
    expect(["blocked", "failed", "sent"]).toContain(r.mailed);
    if (!process.env.SAAS_EMAIL_LIVE || process.env.SAAS_EMAIL_LIVE !== "true") {
      expect(r.mailed).not.toBe("sent");
    }
    const audit = await listPlatformAudit({ limit: 5 });
    expect(audit.some((e) => e.action === "saas.request.notified" && e.entityId === "saas_tr_test1")).toBe(true);
  });

  it("yeni deneme başvurusu tek bildirim üretir", async () => {
    const r = await submitTrialRequest({
      input: {
        institutionName: "Bildirim Koleji",
        ownerName: "Bildirim Sahibi",
        ownerEmail: "bildirim@test.com",
      },
    });
    expect(r.ok).toBe(true);
    const audit = await listPlatformAudit({ limit: 5 });
    const notes = audit.filter((e) => e.action === "saas.request.notified");
    expect(notes.length).toBe(1);
  });

  it("posta hatası başvuruyu kaybettirmez", async () => {
    // Geçersiz tarih gibi uç girdi bile akışı bozmamalı (sonuç failed olur).
    const r = await notifyOwnerNewRequest({
      kind: "teklif",
      id: "saas_qt_test1",
      institutionName: "Hata Koleji",
      createdAt: "gecersiz-tarih",
    });
    expect(["sent", "blocked", "failed"]).toContain(r.mailed);
  });
});

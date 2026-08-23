import { describe, it, expect } from "vitest";
import { homePathForRole, notificationSettingsPathForRole, notificationListPathForRole } from "../auth/role-routes";
import { NOTIFICATION_CATEGORIES } from "../notification-categories";
import type { AppRole } from "../auth/types";

const ALL_ROLES: AppRole[] = ["SUPER_ADMIN", "SCHOOL_ADMIN", "TEACHER", "STUDENT", "AI_AGENT"];

describe("notificationSettingsPathForRole (bell + portal navigasyonu)", () => {
  it("her rol için doğru, role-özel bir rota üretir", () => {
    expect(notificationSettingsPathForRole("SCHOOL_ADMIN")).toBe("/panel/ayarlar/bildirimler");
    expect(notificationSettingsPathForRole("SUPER_ADMIN")).toBe("/panel/ayarlar/bildirimler");
    expect(notificationSettingsPathForRole("TEACHER")).toBe("/ogretmen/ayarlar/bildirimler");
    expect(notificationSettingsPathForRole("STUDENT")).toBe("/ogrenci/ayarlar/bildirimler");
  });

  it("bilinmeyen/AI_AGENT gibi roller yönetici paneline yanlışlıkla link üretmez değil, güvenli varsayılana düşer", () => {
    // AI_AGENT bir insan portalı değil ama fail-safe default panel'dir (mevcut homePathForRole ile tutarlı).
    expect(notificationSettingsPathForRole("AI_AGENT")).toBe("/panel/ayarlar/bildirimler");
  });

  it("her rol için homePathForRole ile aynı portal önekini paylaşır (tutarlılık)", () => {
    for (const role of ALL_ROLES) {
      const home = homePathForRole(role);
      const settings = notificationSettingsPathForRole(role);
      expect(settings.startsWith(home === "/panel" ? "/panel" : home)).toBe(true);
    }
  });
});

describe("notificationListPathForRole — Bildirimler / İletişim Merkezi ayrımı", () => {
  it("admin rolleri gerçek 'tüm bildirimler' listesine gider (/panel/bildirimler)", () => {
    expect(notificationListPathForRole("SCHOOL_ADMIN")).toBe("/panel/bildirimler");
    expect(notificationListPathForRole("SUPER_ADMIN")).toBe("/panel/bildirimler");
  });

  it("portal rolleri (henüz ayrı liste sayfası olmadığı için) kendi ana sayfasına gider — yanlışlıkla admin paneline değil", () => {
    expect(notificationListPathForRole("TEACHER")).toBe("/ogretmen");
    expect(notificationListPathForRole("STUDENT")).toBe("/ogrenci");
  });
});

describe("NOTIFICATION_CATEGORIES.roles — role-uyumlu tercih ekranı kapsamı", () => {
  it("her kategori en az bir role atanmış (dürüstlük — gösterilecek/gösterilmeyecek net)", () => {
    for (const def of NOTIFICATION_CATEGORIES) {
      expect(def.roles.length).toBeGreaterThan(0);
    }
  });

  it("finans/personel kategorileri yalnızca admin rollerine görünür (STUDENT'a — veli veya öğrenci — etkisiz toggle sunulmaz)", () => {
    const financeAndStaff = NOTIFICATION_CATEGORIES.filter((c) => c.group === "finance" || c.group === "staff");
    for (const def of financeAndStaff) {
      expect(def.roles).not.toContain("STUDENT");
    }
  });

  it("ders kategorileri (lesson_upcoming/cancelled/rescheduled) veliye ve öğrenciye de görünür (Karma Öğrenci Portalı — tek STUDENT rolü)", () => {
    for (const cat of ["lesson_upcoming", "lesson_cancelled", "lesson_rescheduled"] as const) {
      const def = NOTIFICATION_CATEGORIES.find((c) => c.category === cat);
      expect(def?.roles).toContain("STUDENT");
      expect(def?.roles).toContain("TEACHER");
    }
  });

  it("görev kategorileri öğretmene görünür ama veli/öğrenciye görünmez", () => {
    for (const cat of ["task_new_assignment", "task_due_today", "task_overdue"] as const) {
      const def = NOTIFICATION_CATEGORIES.find((c) => c.category === cat);
      expect(def?.roles).toContain("TEACHER");
      expect(def?.roles).not.toContain("STUDENT");
    }
  });
});

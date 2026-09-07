import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { promises as fs } from "fs";
import {
  createNotification,
  listNotificationsForUser,
  listAllNotifications,
  NOTIFICATIONS_FILE,
} from "../notifications";
import { notifyUserIfEnabled, notifyStudentIfEnabled } from "../notification-dispatch";
import { notifyAdmins } from "../manager-notifications";
import { DEFAULT_TENANT_ID } from "../auth/config";

/**
 * P0 bildirim paralelleştirmesi (2026-09-07, onaylı) — GÜVENLİK testleri.
 *
 * Paralelleştirmenin ön koşulu iki şeydi ve ikisi de burada kilitlenir:
 *  1. Eşzamanlı yazımda VERİ KAYBI olmaması (dosya kilidi + atomik yazım),
 *  2. Aynı olayın eşzamanlı iki denemesinde ÇİFT bildirim oluşmaması
 *     (türetilmiş satır kimliği — şema değişikliği olmadan idempotans).
 *
 * Testler `STORE_MODE=json` altında koşar (vitest.config.mts). `memory` modu
 * AYNI dosya tabanlı bildirim yolunu kullanır (`notifications/index.ts`
 * yalnızca `isDbMode` ile dallanır), bu yüzden json için kanıtlanan davranış
 * memory için de geçerlidir; db modunun karşılığı ise `Notification.id`
 * birincil anahtarıdır (bkz. `createNotificationDb`, `skipDuplicates`).
 */
beforeEach(async () => {
  await fs.rm(NOTIFICATIONS_FILE, { force: true });
});

const TENANT_A = DEFAULT_TENANT_ID;
const TENANT_B = "tenant_baska_kurum";

describe("createNotification — eşzamanlı yazımda veri kaybı yok", () => {
  it("AYNI hedefe 25 eşzamanlı FARKLI bildirim: hepsi kalır", async () => {
    const total = 25;
    const results = await Promise.all(
      Array.from({ length: total }, (_, i) =>
        createNotification({
          tenantId: TENANT_A,
          targetUserId: "same_target_user",
          kind: "race_same_target",
          title: `T${i}`,
          body: `benzersiz-govde-${i}`,
        })
      )
    );
    expect(results.every((r) => r.status === "created")).toBe(true);

    const rows = await listNotificationsForUser({ tenantId: TENANT_A, userId: "same_target_user" });
    const bodies = new Set(rows.filter((n) => n.kind === "race_same_target").map((n) => n.body));
    expect(bodies.size).toBe(total);
  });

  it("FARKLI hedeflere eşzamanlı yazım: hiçbiri kaybolmaz", async () => {
    const total = 24;
    await Promise.all(
      Array.from({ length: total }, (_, i) =>
        createNotification({
          tenantId: TENANT_A,
          targetUserId: `race_user_${i % 4}`,
          kind: "race_multi_target",
          title: `T${i}`,
          body: `B${i}`,
        })
      )
    );
    const seen = new Set<string>();
    for (const userId of ["race_user_0", "race_user_1", "race_user_2", "race_user_3"]) {
      for (const n of await listNotificationsForUser({ tenantId: TENANT_A, userId })) {
        if (n.kind === "race_multi_target") seen.add(n.body);
      }
    }
    expect(seen.size).toBe(total);
  });
});

describe("createNotification — idempotans (retry / eşzamanlı çift deneme)", () => {
  it("aynı dedupeKey ile ARDIŞIK ikinci çağrı yeni satır yazmaz", async () => {
    const input = {
      tenantId: TENANT_A,
      targetUserId: "idem_user",
      kind: "lesson_rescheduled",
      title: "Ders saati değişti",
      body: "l1:2026-09-09T08:00:00.000Z",
      dedupeKey: "l1:2026-09-09T08:00:00.000Z",
    };
    const first = await createNotification(input);
    const second = await createNotification(input);
    expect(first.status).toBe("created");
    expect(second.status).toBe("duplicate");
    expect(second.notification.id).toBe(first.notification.id);

    const rows = await listNotificationsForUser({ tenantId: TENANT_A, userId: "idem_user" });
    expect(rows.filter((n) => n.kind === "lesson_rescheduled")).toHaveLength(1);
  });

  it("aynı dedupeKey ile 10 EŞZAMANLI çağrı: tam olarak 1 satır", async () => {
    const input = {
      tenantId: TENANT_A,
      targetUserId: "idem_race_user",
      kind: "lesson_rescheduled",
      title: "Ders saati değişti",
      body: "l2:2026-09-10T08:00:00.000Z",
      dedupeKey: "l2:2026-09-10T08:00:00.000Z",
    };
    const results = await Promise.all(Array.from({ length: 10 }, () => createNotification(input)));
    expect(results.filter((r) => r.status === "created")).toHaveLength(1);
    expect(results.filter((r) => r.status === "duplicate")).toHaveLength(9);

    const rows = await listNotificationsForUser({ tenantId: TENANT_A, userId: "idem_race_user" });
    expect(rows.filter((n) => n.kind === "lesson_rescheduled")).toHaveLength(1);
  });

  it("FARKLI dedupeKey'ler ayrı satır üretir (tekilleştirme fazla geniş değil)", async () => {
    const base = { tenantId: TENANT_A, targetUserId: "idem_user2", kind: "lesson_rescheduled", title: "T" };
    await createNotification({ ...base, body: "l3:08:00", dedupeKey: "l3:08:00" });
    await createNotification({ ...base, body: "l3:09:00", dedupeKey: "l3:09:00" });
    const rows = await listNotificationsForUser({ tenantId: TENANT_A, userId: "idem_user2" });
    expect(rows.filter((n) => n.kind === "lesson_rescheduled")).toHaveLength(2);
  });

  it("aynı anahtar FARKLI kullanıcılara ayrı satır üretir (hedefler karışmaz)", async () => {
    const base = { tenantId: TENANT_A, kind: "lesson_rescheduled", title: "T", body: "l4:08:00", dedupeKey: "l4:08:00" };
    const a = await createNotification({ ...base, targetUserId: "u_alice" });
    const b = await createNotification({ ...base, targetUserId: "u_bob" });
    expect(a.status).toBe("created");
    expect(b.status).toBe("created");
    expect(a.notification.id).not.toBe(b.notification.id);
  });

  it("dedupeKey VERİLMEZSE eski davranış korunur: her çağrı yeni satır", async () => {
    const input = { tenantId: TENANT_A, targetUserId: "no_key_user", kind: "generic", title: "T", body: "B" };
    await createNotification(input);
    await createNotification(input);
    const rows = await listNotificationsForUser({ tenantId: TENANT_A, userId: "no_key_user" });
    expect(rows.filter((n) => n.kind === "generic")).toHaveLength(2);
  });

  it("aynı anahtar FARKLI tenant'larda ayrı satır üretir (tenant sızıntısı yok)", async () => {
    const base = { kind: "lesson_rescheduled", title: "T", body: "l5:08:00", dedupeKey: "l5:08:00", targetUserId: "shared_user_id" };
    const a = await createNotification({ ...base, tenantId: TENANT_A });
    const b = await createNotification({ ...base, tenantId: TENANT_B });
    expect(a.status).toBe("created");
    expect(b.status).toBe("created");
    expect(a.notification.id).not.toBe(b.notification.id);

    // Okuma da tenant ile kapsamlanır — B'nin satırı A'ya sızmaz.
    const aRows = await listNotificationsForUser({ tenantId: TENANT_A, userId: "shared_user_id" });
    const bRows = await listNotificationsForUser({ tenantId: TENANT_B, userId: "shared_user_id" });
    expect(aRows).toHaveLength(1);
    expect(bRows).toHaveLength(1);
    expect(await listAllNotifications(TENANT_B)).toHaveLength(1);
  });
});

describe("notifyUserIfEnabled — her sonuç açıkça döner, hata yutulmaz", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("başarılı yazımda 'created', aynı olayın tekrarında 'duplicate' döner", async () => {
    const input = {
      tenantId: TENANT_A,
      userId: "dispatch_user",
      category: "lesson_rescheduled" as const,
      title: "Ders saati değişti",
      body: "l6:2026-09-11T08:00:00.000Z detay",
      dedupeKey: "l6:2026-09-11T08:00:00.000Z",
    };
    expect(await notifyUserIfEnabled(input)).toBe("created");
    expect(await notifyUserIfEnabled(input)).toBe("duplicate");
  });

  it("altta yatan yazım fırlatırsa 'failed' döner — fırlatmaz, sessizce de yutmaz", async () => {
    const notifications = await import("../notifications");
    const spy = vi
      .spyOn(notifications, "createNotification")
      .mockRejectedValue(new Error("simüle edilmiş depolama hatası"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const outcome = await notifyUserIfEnabled({
      tenantId: TENANT_A,
      userId: "failing_user",
      category: "lesson_rescheduled",
      title: "T",
      body: "B",
      dedupeKey: "fail-key",
    });

    expect(outcome).toBe("failed");
    expect(spy).toHaveBeenCalled();
    // Hata GÖRÜNÜR: loglandı.
    expect(errorSpy).toHaveBeenCalled();
  });
});

describe("paralel hedefler — biri başarısızken diğeri başarılı", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("bir hedefin yazımı patlasa bile diğer hedefin bildirimi yazılır", async () => {
    const notifications = await import("../notifications");
    const real = notifications.createNotification;
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(notifications, "createNotification").mockImplementation(async (input) => {
      if (input.targetUserId === "admin_broken") throw new Error("simüle edilmiş hata");
      return real(input);
    });

    const outcomes = await Promise.all([
      notifyUserIfEnabled({
        tenantId: TENANT_A,
        userId: "admin_broken",
        category: "lesson_rescheduled",
        title: "T",
        body: "B",
        dedupeKey: "mixed-key",
      }),
      notifyUserIfEnabled({
        tenantId: TENANT_A,
        userId: "admin_ok",
        category: "lesson_rescheduled",
        title: "T",
        body: "B",
        dedupeKey: "mixed-key",
      }),
    ]);

    expect(outcomes).toContain("failed");
    expect(outcomes).toContain("created");
    const okRows = await listNotificationsForUser({ tenantId: TENANT_A, userId: "admin_ok" });
    expect(okRows).toHaveLength(1);
    const brokenRows = await listNotificationsForUser({ tenantId: TENANT_A, userId: "admin_broken" });
    expect(brokenRows).toHaveLength(0);
  });
});

describe("notifyAdmins / notifyStudentIfEnabled — sonuç dizisi döner", () => {
  it("hedef yoksa boş dizi döner, fırlatmaz", async () => {
    await expect(
      notifyAdmins("tenant_hicbir_admin_yok", "lesson_rescheduled", { title: "T", body: "B" })
    ).resolves.toEqual([]);
    await expect(
      notifyStudentIfEnabled({
        tenantId: TENANT_A,
        studentId: "s_olmayan_ogrenci",
        category: "lesson_rescheduled",
        title: "T",
        body: "B",
        dedupeKey: "k",
      })
    ).resolves.toEqual([]);
  });
});

/**
 * Faz 5 — push dokunuş yönlendirme sözleşmeleri (statik).
 *
 * - Killed (kapalı uygulama) dokunuşu `useLastNotificationResponse` ile
 *   açılışta bir kez işlenir (tekrar YOK).
 * - Veli bildirimindeki `studentId` sunucu-doğrulamalı `select()` ile
 *   seçilir, sonra hedefe gidilir.
 */
import { describe, expect, it } from "vitest";
import { promises as fs } from "fs";
import path from "path";

const HOOK = path.join(__dirname, "..", "use-push-notifications.ts");

describe("push dokunuş yönlendirme", () => {
  it("killed dokunuşu tek-sefer işlenir", async () => {
    const content = await fs.readFile(HOOK, "utf-8");
    expect(content).toMatch(/useLastNotificationResponse\(\)/);
    expect(content).toMatch(/handledKilled\.current === key/);
  });

  it("veli studentId bağlamı select() ile kurulur", async () => {
    const content = await fs.readFile(HOOK, "utf-8");
    expect(content).toMatch(/persona === "parent" && typeof data\.studentId/);
    expect(content).toMatch(/await select\(data\.studentId\)/);
  });

  it("canlı dokunuş dinleyicisi korunur", async () => {
    const content = await fs.readFile(HOOK, "utf-8");
    expect(content).toMatch(/addNotificationResponseReceivedListener/);
    expect(content).toMatch(/resolvePushDestination\(data, persona\)/);
  });
});

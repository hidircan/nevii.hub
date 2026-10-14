/**
 * Push production sözleşmesi (statik).
 * Kural: token alımı EAS projectId'yi kullanır; test bildirimi düğmesi
 * yalnız __DEV__'de render edilir; sunucu test ucu production'da gizlidir.
 */
import { describe, expect, it } from "vitest";
import { promises as fs } from "fs";
import path from "path";

const SRC = path.join(__dirname, "..", "..");

describe("push production sözleşmesi", () => {
  it("token alımı EAS projectId ile (dev build gereksinimi)", async () => {
    const content = await fs.readFile(path.join(SRC, "push", "expo-push-deps.ts"), "utf-8");
    expect(content).toMatch(/eas\.projectId/);
    expect(content).toMatch(/getExpoPushTokenAsync\(projectId \? \{ projectId \} : undefined\)/);
  });

  it("test bildirimi düğmesi yalnız __DEV__", async () => {
    const content = await fs.readFile(
      path.join(SRC, "features", "notifications", "notification-settings-screen.tsx"),
      "utf-8"
    );
    expect(content).toMatch(/__DEV__ \? <DevPushTestSection/);
    expect(content).toMatch(/\/api\/v1\/mobile\/push-test/);
  });

  it("eas.json development profili + varyant env", async () => {
    const content = await fs.readFile(path.join(SRC, "..", "eas.json"), "utf-8");
    const eas = JSON.parse(content) as { build: Record<string, { env?: Record<string, string> }> };
    expect(eas.build.development).toBeDefined();
    expect(eas.build.preview?.env?.EXPO_PUBLIC_APP_VARIANT).toBe("preview");
    expect(eas.build.production?.env?.EXPO_PUBLIC_APP_VARIANT).toBe("production");
    expect(eas.build.development?.env?.EXPO_PUBLIC_APP_VARIANT).toBe("development");
  });
});

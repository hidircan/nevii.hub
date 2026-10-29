import { describe, expect, it } from "vitest";
import { assertProductionApiUrl, unsafeProductionApiUrlReason } from "../api-url-policy";

describe("production API URL politikası", () => {
  it.each([
    "https://neviihub.com",
    "https://app.neviihub.com/",
    "https://neviihub.vercel.app",
  ])("kabul eder: %s", (url) => {
    expect(unsafeProductionApiUrlReason(url)).toBeNull();
    expect(() => assertProductionApiUrl(url)).not.toThrow();
  });

  it.each([
    undefined,
    "",
    "   ",
    "not a url",
    "http://neviihub.com",
    "http://localhost:3000",
    "https://localhost:3000",
    "https://api.localhost",
    "http://127.0.0.1:3000",
    "https://127.0.0.1",
    "http://192.168.1.23:3000",
    "https://10.0.0.5",
    "https://172.16.0.1",
    "https://172.31.255.1",
    "https://169.254.1.1",
    "https://0.0.0.0",
    "https://8.8.8.8",
    "https://[::1]",
    "https://mac.local",
    "https://devbox",
    "https://user:pass@neviihub.com",
  ])("reddeder: %s", (url) => {
    expect(unsafeProductionApiUrlReason(url)).not.toBeNull();
    expect(() => assertProductionApiUrl(url)).toThrow(/Production build durduruldu/);
  });

  it("172.15 / 172.32 özel aralık dışıdır (ham IP olduğu için yine reddedilir)", () => {
    expect(unsafeProductionApiUrlReason("https://172.15.0.1")).toMatch(/ham IP/);
    expect(unsafeProductionApiUrlReason("https://172.32.0.1")).toMatch(/ham IP/);
  });
});

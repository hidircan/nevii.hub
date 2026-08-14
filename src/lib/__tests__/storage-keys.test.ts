import { describe, it, expect } from "vitest";
import { assertTenantStorageKey, sanitizeAttachmentFileName } from "../storage/keys";
import { assertAnnouncementFileBuffer } from "../storage/file-guards";

describe("announcement storage keys", () => {
  it("dosya adından path traversal temizler", () => {
    expect(sanitizeAttachmentFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeAttachmentFileName("a/b\\c.png")).toBe("c.png");
  });

  it("tenant prefix'i zorunlu tutar", () => {
    expect(() => assertTenantStorageKey("t1", "t1/ok.png")).not.toThrow();
    expect(() => assertTenantStorageKey("t1", "t2/ok.png")).toThrow();
    expect(() => assertTenantStorageKey("t1", "t1/../x")).toThrow();
  });

  it("PNG magic byte doğrular", () => {
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64"
    );
    expect(() => assertAnnouncementFileBuffer(png, "image/png")).not.toThrow();
    expect(() => assertAnnouncementFileBuffer(Buffer.from("notpng"), "image/png")).toThrow();
  });
});

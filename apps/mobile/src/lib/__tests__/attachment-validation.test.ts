import { describe, it, expect } from "vitest";
import { validateAttachment } from "../attachment-validation";

describe("validateAttachment", () => {
  it("izin verilen türde, sınır altında dosya → geçerli", () => {
    expect(validateAttachment("application/pdf", 1024)).toBeNull();
  });

  it("desteklenmeyen tür → hata", () => {
    expect(validateAttachment("application/zip", 1024)).toMatch(/Desteklenmeyen dosya türü/);
  });

  it("2 MB üstü dosya → hata", () => {
    expect(validateAttachment("image/png", 3 * 1024 * 1024)).toMatch(/çok büyük/);
  });

  it("tür/boyut belirtilmemiş → geçerli (opsiyonel alan)", () => {
    expect(validateAttachment(undefined, undefined)).toBeNull();
  });
});

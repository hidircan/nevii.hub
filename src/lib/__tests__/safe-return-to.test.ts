import { describe, it, expect } from "vitest";
import { resolveSafeReturnTo } from "../safe-return-to";

describe("resolveSafeReturnTo — Ödemeler → Kaynak ders → güvenli geri dönüş", () => {
  it("allowlist edilmiş bir panel yolunu kabul eder", () => {
    expect(resolveSafeReturnTo("/panel/odemeler/s1")).toBe("/panel/odemeler/s1");
  });

  it("URL-encode edilmiş bir yolu doğru şekilde çözer", () => {
    expect(resolveSafeReturnTo(encodeURIComponent("/panel/odemeler/s1"))).toBe("/panel/odemeler/s1");
  });

  it("boş/undefined/null için null döner", () => {
    expect(resolveSafeReturnTo(undefined)).toBeNull();
    expect(resolveSafeReturnTo(null)).toBeNull();
    expect(resolveSafeReturnTo("")).toBeNull();
  });

  it("mutlak/harici bir URL'yi (open redirect denemesi) reddeder", () => {
    expect(resolveSafeReturnTo("https://evil.com/phish")).toBeNull();
    expect(resolveSafeReturnTo("http://evil.com")).toBeNull();
  });

  it("protokol-göreli bir URL'yi (//evil.com) reddeder", () => {
    expect(resolveSafeReturnTo("//evil.com")).toBeNull();
  });

  it("şema enjeksiyonu (javascript:, /x:@evil.com gibi) içeren bir değeri reddeder", () => {
    expect(resolveSafeReturnTo("javascript:alert(1)")).toBeNull();
    expect(resolveSafeReturnTo("/panel/odemeler/s1:@evil.com")).toBeNull();
  });

  it("allowlist dışı bir panel yolunu (ör. /panel/paketler) reddeder", () => {
    expect(resolveSafeReturnTo("/panel/paketler")).toBeNull();
    expect(resolveSafeReturnTo("/panel/duyurular")).toBeNull();
  });

  it("İş 5 — geri navigasyon standardizasyonuyla eklenen yolları kabul eder", () => {
    expect(resolveSafeReturnTo("/panel/telafi")).toBe("/panel/telafi");
    expect(resolveSafeReturnTo("/panel/kurulum")).toBe("/panel/kurulum");
    expect(resolveSafeReturnTo("/panel/ders-duzeltme")).toBe("/panel/ders-duzeltme");
    expect(resolveSafeReturnTo("/panel/subeler")).toBe("/panel/subeler");
    expect(resolveSafeReturnTo("/panel/evraklar/doc1")).toBe("/panel/evraklar/doc1");
    expect(resolveSafeReturnTo("/panel/personel")).toBe("/panel/personel");
    expect(resolveSafeReturnTo("/panel/bildirimler")).toBe("/panel/bildirimler");
  });

  it("cross-tenant/yetkisiz bir studentId formatça geçerli görünse de yalnızca yol biçimini doğrular — asıl erişim kontrolü hedef sayfada yeniden yapılır", () => {
    // Bu fonksiyon TENANT/ROL doğrulaması yapmaz (bilinçli tasarım, bkz. dosya
    // başlığı yorumu) — yalnızca "uygulama içi, allowlist'te bir yol mu" sorusuna
    // cevap verir. Format olarak geçerli olduğu için burada null DÖNMEZ.
    expect(resolveSafeReturnTo("/panel/odemeler/baska-tenant-student-id")).toBe(
      "/panel/odemeler/baska-tenant-student-id"
    );
  });
});

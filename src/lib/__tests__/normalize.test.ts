import { describe, it, expect } from "vitest";
import { normalizeMatchKey, looseMatchKey, resolveCanonicalValue } from "../normalize";

describe("normalizeMatchKey", () => {
  it("Türkçe büyük/küçük harfi doğru katlar (İ/I/ı/i)", () => {
    expect(normalizeMatchKey("İZMİR")).toBe("izmir");
    expect(normalizeMatchKey("Yan Flüt")).toBe("yan flüt");
  });

  it("baştaki/sondaki ve fazla iç boşlukları tek boşluğa indirger", () => {
    expect(normalizeMatchKey("  Yan   Flüt  ")).toBe("yan flüt");
  });

  it("NFC/NFD Unicode biçimlerini aynı anahtara çözer", () => {
    const nfc = "Yan Flüt".normalize("NFC");
    const nfd = "Yan Flüt".normalize("NFD");
    expect(normalizeMatchKey(nfc)).toBe(normalizeMatchKey(nfd));
  });
});

describe("looseMatchKey", () => {
  it("tüm boşlukları kaldırır — 'Yanflüt' ile 'Yan Flüt' aynı anahtara çözülür", () => {
    expect(looseMatchKey("Yanflüt")).toBe(looseMatchKey("Yan Flüt"));
  });
});

describe("resolveCanonicalValue", () => {
  const candidates = ["Piyano", "Yan Flüt", "Elektro Gitar", "Bağlama"];

  it("tam (boşluk-duyarlı) eşleşmede kanonik yazımı döner", () => {
    expect(resolveCanonicalValue("yan flüt", candidates)).toBe("Yan Flüt");
    expect(resolveCanonicalValue("YAN FLÜT", candidates)).toBe("Yan Flüt");
  });

  it("boşluk varyasyonunda (Yanflüt) gevşek eşleşmeyle kanonik yazımı döner", () => {
    expect(resolveCanonicalValue("Yanflüt", candidates)).toBe("Yan Flüt");
    expect(resolveCanonicalValue("elektrogitar", candidates)).toBe("Elektro Gitar");
  });

  it("hiçbir aday eşleşmezse null döner (asla tahmin etmez)", () => {
    expect(resolveCanonicalValue("Ukulele", candidates)).toBeNull();
  });
});

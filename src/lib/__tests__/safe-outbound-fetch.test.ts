import { describe, it, expect } from "vitest";
import { isBlockedAddress, safeOutboundFetch } from "../net/safe-outbound-fetch";

/**
 * SSRF koruması — indirilen bayt saklanıp EKRANDA GÖSTERİLDİĞİ için bu,
 * okunabilir (blind olmayan) bir SSRF yüzeyidir; kurallar test altında.
 */
describe("isBlockedAddress", () => {
  it("IPv4 özel/loopback/link-local/reserved bloklarını reddeder", () => {
    for (const ip of [
      "0.0.0.0",
      "10.0.0.1",
      "127.0.0.1",
      "169.254.169.254", // bulut metadata
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "192.0.0.1",
      "100.64.0.1",
      "198.18.0.1",
      "224.0.0.1",
      "255.255.255.255",
    ]) {
      expect(isBlockedAddress(ip), ip).toBe(true);
    }
  });

  it("genel IPv4 adreslerine izin verir", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "93.184.216.34", "172.32.0.1", "192.167.1.1"]) {
      expect(isBlockedAddress(ip), ip).toBe(false);
    }
  });

  it("IPv6 loopback/unique-local/link-local ve IPv4-mapped biçimlerini reddeder", () => {
    for (const ip of ["::1", "::", "fc00::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1"]) {
      expect(isBlockedAddress(ip), ip).toBe(true);
    }
    expect(isBlockedAddress("2606:4700:4700::1111")).toBe(false);
  });

  it("IP olmayan/çözümlenemeyen değeri güvenli saymaz", () => {
    expect(isBlockedAddress("not-an-ip")).toBe(true);
    expect(isBlockedAddress("")).toBe(true);
  });
});

describe("safeOutboundFetch", () => {
  it("https dışındaki şemaları reddeder", async () => {
    for (const url of ["http://example.com/a.png", "file:///etc/passwd", "gopher://x/1"]) {
      const r = await safeOutboundFetch(url);
      expect(r.ok, url).toBe(false);
    }
  });

  it("geçersiz adresi reddeder", async () => {
    const r = await safeOutboundFetch("bu bir url değil");
    expect(r.ok).toBe(false);
  });

  it("loopback/dahili hedefe ağa ÇIKMADAN engel olur", async () => {
    for (const url of ["https://127.0.0.1/x.png", "https://localhost/x.png", "https://169.254.169.254/latest/meta-data/"]) {
      const r = await safeOutboundFetch(url, { timeoutMs: 1500 });
      expect(r.ok, url).toBe(false);
      if (!r.ok) expect(r.reason).toContain("dahili");
    }
  });
});

import { describe, expect, it } from "vitest";
import { cacheClassForPath } from "../cache-keys";

describe("pencereli/sınırlı URL'lerin cache sınıflandırması", () => {
  it("öğrenci programı pencere/limit ile de schedule sınıfındadır", () => {
    expect(cacheClassForPath("/api/v1/students/s1/schedule?from=2026-01-01&to=2026-01-08")).toBe("schedule");
    expect(cacheClassForPath("/api/v1/students/s1/schedule?limit=2000")).toBe("schedule");
    expect(cacheClassForPath("/api/v1/students/s1/schedule?from=2026-01-01&limit=2000")).toBe("schedule");
  });

  it("öğretmen programı cache-dışıdır (allowlist'e eklenmedi)", () => {
    expect(cacheClassForPath("/api/v1/teachers/t1/schedule")).toBeNull();
    expect(cacheClassForPath("/api/v1/teachers/t1/schedule?from=2026-01-01&to=2026-01-08")).toBeNull();
    expect(cacheClassForPath("/api/v1/teachers/t1/schedule?limit=1")).toBeNull();
  });

  it("arama sorgulu listeler cache-dışıdır (taze sonuç)", () => {
    expect(cacheClassForPath("/api/v1/students?q=ab&limit=50")).toBeNull();
    expect(cacheClassForPath("/api/v1/teachers?q=ab&limit=50")).toBeNull();
  });
});

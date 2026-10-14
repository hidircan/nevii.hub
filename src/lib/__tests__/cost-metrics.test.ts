import { describe, it, expect } from "vitest";
import {
  buildCostMetric,
  costSampleRateFromEnv,
  estimateServiceResultBytes,
  formatCostMetric,
  normalizeRouteTemplate,
  shouldSampleCostMetric,
} from "../api/cost-metrics";

describe("normalizeRouteTemplate", () => {
  it("kimlik segmentlerini maskeler, query'yi atar", () => {
    expect(normalizeRouteTemplate("/api/v1/students/s1/schedule")).toBe("/api/v1/students/:id/schedule");
    expect(normalizeRouteTemplate("/api/v1/students/550e8400-e29b-41d4-a716-446655440000/schedule")).toBe(
      "/api/v1/students/:id/schedule"
    );
    expect(normalizeRouteTemplate("/api/v1/users/12345/photo")).toBe("/api/v1/users/:id/photo");
    expect(normalizeRouteTemplate("/api/v1/students/uid_abc123XYZ/schedule")).toBe("/api/v1/students/:id/schedule");
    expect(normalizeRouteTemplate("/api/v1/students?q=zeynep&limit=50")).toBe("/api/v1/students");
  });

  it("kısa sözlük segmentleri korunur, uzun girdiler maskelenir", () => {
    expect(normalizeRouteTemplate("/api/v1/dashboard/summary")).toBe("/api/v1/dashboard/summary");
    expect(normalizeRouteTemplate(`/api/v1/x/${"a".repeat(50)}`)).toBe("/api/v1/x/:id");
  });
});

describe("shouldSampleCostMetric", () => {
  it("sınırlar deterministiktir", () => {
    expect(shouldSampleCostMetric(0, () => 0)).toBe(false);
    expect(shouldSampleCostMetric(-1, () => 0)).toBe(false);
    expect(shouldSampleCostMetric(1, () => 0.99)).toBe(true);
    expect(shouldSampleCostMetric(0.5, () => 0.49)).toBe(true);
    expect(shouldSampleCostMetric(0.5, () => 0.5)).toBe(false);
  });
});

describe("costSampleRateFromEnv", () => {
  it("geçerli aralık kabul, geçersizde varsayılan", () => {
    expect(costSampleRateFromEnv({})).toBe(0.1);
    expect(costSampleRateFromEnv({ COST_METRICS_SAMPLE_RATE: "" })).toBe(0.1);
    expect(costSampleRateFromEnv({ COST_METRICS_SAMPLE_RATE: "0.5" })).toBe(0.5);
    expect(costSampleRateFromEnv({ COST_METRICS_SAMPLE_RATE: "2" })).toBe(0.1);
    expect(costSampleRateFromEnv({ COST_METRICS_SAMPLE_RATE: "-1" })).toBe(0.1);
    expect(costSampleRateFromEnv({ COST_METRICS_SAMPLE_RATE: "abc" })).toBe(0.1);
  });
});

describe("buildCostMetric + format", () => {
  it("PII taşımaz: yalnız agregalar", () => {
    const metric = buildCostMetric({
      method: "get",
      pathname: "/api/v1/students/550e8400-e29b-41d4-a716-446655440000/balance",
      status: 200,
      durationMs: 123.6,
      responseBytes: 456,
    });
    expect(metric).toEqual({
      kind: "cost_metric",
      method: "GET",
      route: "/api/v1/students/:id/balance",
      status: 200,
      durationMs: 124,
      responseBytes: 456,
      cached: false,
      forced: false,
    });
    const line = formatCostMetric(metric);
    expect(() => JSON.parse(line)).not.toThrow();
    expect(line).not.toContain("550e8400");
    expect(Object.keys(JSON.parse(line)).sort()).toEqual(
      ["cached", "durationMs", "forced", "kind", "method", "responseBytes", "route", "status"].sort()
    );
  });
});

describe("estimateServiceResultBytes", () => {
  it("zarf baytını ölçer, içeriği döndürmez", () => {
    const bytes = estimateServiceResultBytes({ ok: true, data: { a: "x".repeat(100) } });
    expect(bytes).toBeGreaterThan(100);
    expect(estimateServiceResultBytes({ ok: false, error: { code: "X", message: "y" } })).toBeGreaterThan(0);
    const circular: { self?: unknown } = {};
    circular.self = circular;
    expect(estimateServiceResultBytes({ ok: true, data: circular })).toBe(-1);
  });
});

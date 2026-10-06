import { describe, it, expect } from "vitest";
import { planAiInvocation } from "../ai/plan-invocation";
import { AI_CAPABILITIES } from "../ai/capabilities";

const TENANT = "tenant_nilufer_acar";

describe("planAiInvocation — fail closed (eksik bağlam)", () => {
  it("tenantId eksikse (boş string) reddeder", () => {
    const plan = planAiInvocation("collectionsROIReport", {
      callerRole: "SCHOOL_ADMIN",
      tenantId: "",
      operation: "workflows",
    });
    expect(plan.allowed).toBe(false);
    if (!plan.allowed) expect(plan.reason).toMatch(/kurum/i);
  });

  it("callerRole eksikse (undefined/boş) reddeder", () => {
    const plan = planAiInvocation("collectionsROIReport", {
      // @ts-expect-error kasıtlı olarak eksik role — runtime davranışı test ediliyor
      callerRole: undefined,
      tenantId: TENANT,
      operation: "workflows",
    });
    expect(plan.allowed).toBe(false);
  });

  it("bilinmeyen bir capability id'si reddeder", () => {
    const plan = planAiInvocation("notARealCapability", {
      callerRole: "SUPER_ADMIN",
      tenantId: TENANT,
      operation: "workflows",
    });
    expect(plan.allowed).toBe(false);
    if (!plan.allowed) expect(plan.reason).toMatch(/bilinmeyen/i);
  });
});

describe("planAiInvocation — RBAC (yanlış rol)", () => {
  it("STUDENT rolü (veli/öğrenci) collectionsROIReport çalıştıramaz (yalnız SUPER_ADMIN/SCHOOL_ADMIN)", () => {
    const plan = planAiInvocation("collectionsROIReport", {
      callerRole: "STUDENT",
      tenantId: TENANT,
      operation: "payments",
    });
    expect(plan.allowed).toBe(false);
    if (!plan.allowed) {
      expect(plan.reason).toMatch(/STUDENT/);
      expect(plan.capability?.id).toBe("collectionsROIReport");
    }
  });

  it("TEACHER rolü collectionsMessageDraft çalıştıramaz (yalnız SUPER_ADMIN/SCHOOL_ADMIN/AI_AGENT)", () => {
    const plan = planAiInvocation("collectionsMessageDraft", {
      callerRole: "TEACHER",
      tenantId: TENANT,
      operation: "payments",
    });
    expect(plan.allowed).toBe(false);
  });
});

describe("planAiInvocation — doğru rol/tenant ile izin + provider seçimi", () => {
  it("SCHOOL_ADMIN + geçerli tenant ile collectionsROIReport izinlidir ve preferredProvider'ı seçer", () => {
    const plan = planAiInvocation("collectionsROIReport", {
      callerRole: "SCHOOL_ADMIN",
      tenantId: TENANT,
      operation: "payments",
    });
    expect(plan.allowed).toBe(true);
    if (plan.allowed) {
      expect(plan.chosenProvider).toBe(AI_CAPABILITIES.collectionsROIReport.preferredProvider);
      expect(plan.chosenProvider).toBe("groq");
      expect(plan.fallbackProvider).toBe("heuristic");
    }
  });

  it("AI_AGENT + geçerli tenant ile collectionsMessageDraft izinlidir, requiresApproval true kalır", () => {
    const plan = planAiInvocation("collectionsMessageDraft", {
      callerRole: "AI_AGENT",
      tenantId: TENANT,
      operation: "workflows",
    });
    expect(plan.allowed).toBe(true);
    if (plan.allowed) {
      expect(plan.capability.requiresApproval).toBe(true);
      expect(plan.chosenProvider).toBe("claude");
    }
  });

  it("preferredProvider zaten 'heuristic' olan bir capability için fallbackProvider tanımsızdır", () => {
    const plan = planAiInvocation("makeupSlotSuggestion", {
      callerRole: "TEACHER",
      tenantId: TENANT,
      operation: "telafi",
    });
    expect(plan.allowed).toBe(true);
    if (plan.allowed) {
      expect(plan.chosenProvider).toBe("heuristic");
      expect(plan.fallbackProvider).toBeUndefined();
    }
  });

  it("SUPER_ADMIN her capability için en azından kendi tenant'ında değerlendirilir (rol reddi yaşanmaz)", () => {
    for (const id of Object.keys(AI_CAPABILITIES) as (keyof typeof AI_CAPABILITIES)[]) {
      const plan = planAiInvocation(id, {
        callerRole: "SUPER_ADMIN",
        tenantId: TENANT,
        operation: "test",
      });
      expect(plan.allowed, `capability ${id} SUPER_ADMIN için izinli olmalı`).toBe(true);
    }
  });
});

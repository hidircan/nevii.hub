/**
 * Workflow Registry — recurring autonomous jobs.
 * Every step uses Agent Runtime (executeAgentTool) only.
 */

import type { WorkflowDefinition, WorkflowId } from "./types";
import { runWorkflowTool } from "./runtime";

/** Known demo teacher/lesson IDs from seed (no direct DB) */
const TEACHERS = ["t1", "t2", "t3", "t4", "t5"];
const MAKEUP_REQUESTS = ["m1", "m2", "m3"];
const LESSONS = ["l8", "l9", "l10", "l11"];

export const WORKFLOW_REGISTRY: Record<WorkflowId, WorkflowDefinition> = {
  /**
   * EPIC 1 (IMPLEMENTATION_PLAN.md) — sabit demo ID listesi TARAMAZ;
   * `scanOverduePaymentsTool` kendi içinde tenant'ın TÜM gecikmiş
   * ödemelerini `readData()` ile okur (checkMakeupSla/makeup_sla_check ile
   * aynı desen). communicationOptOut ve sıklık limiti (collectionsSettings)
   * bu tool'un içinde uygulanır — bkz. src/lib/services/tools.ts.
   */
  payment_reminders: {
    id: "payment_reminders",
    name: "Ödeme hatırlatmaları",
    description:
      "Gecikmiş ödemeleri tarar; her biri için takip vakası açar/günceller ve veliye " +
      "uygulama içi bildirim oluşturur (opt-out ve sıklık limitine uyar).",
    intervalMinutes: 60 * 24,
    defaultEnabled: true,
    async run(ctx) {
      return [await runWorkflowTool(ctx, "scanOverduePayments", {})];
    },
  },

  lesson_reminders: {
    id: "lesson_reminders",
    name: "Ders hatırlatmaları",
    description: "Yaklaşan ders programlarını öğrenci bazında çeker.",
    intervalMinutes: 60 * 12,
    defaultEnabled: true,
    async run(ctx) {
      const steps = [];
      for (const studentId of ["s1", "s2", "s5"]) {
        steps.push(await runWorkflowTool(ctx, "getStudentSchedule", { studentId }));
      }
      return steps;
    },
  },

  attendance_followup: {
    id: "attendance_followup",
    name: "Yoklama takibi",
    description: "Seçili dersler için yoklama durumunu günceller / takip eder.",
    intervalMinutes: 60 * 6,
    defaultEnabled: false,
    async run(ctx) {
      const steps = [];
      // Read-only style: mark present for a scheduled lesson only if needed — use present as soft check
      for (const lessonId of LESSONS.slice(0, 2)) {
        steps.push(
          await runWorkflowTool(ctx, "markAttendance", {
            lessonId,
            status: "present",
            reason: "workflow:attendance_followup",
          })
        );
      }
      return steps;
    },
  },

  weekly_reports: {
    id: "weekly_reports",
    name: "Haftalık rapor",
    description: "Öğrenci programları + bakiyelerden özet veri toplar.",
    intervalMinutes: 60 * 24 * 7,
    defaultEnabled: true,
    async run(ctx) {
      const steps = [];
      steps.push(await runWorkflowTool(ctx, "getStudentSchedule", { studentId: "s1" }));
      steps.push(await runWorkflowTool(ctx, "getParentBalance", { studentId: "s1" }));
      steps.push(await runWorkflowTool(ctx, "getTeacherSchedule", { teacherId: "t2" }));
      steps.push(await runWorkflowTool(ctx, "findAvailableTeachers", {}));
      return steps;
    },
  },

  teacher_utilization: {
    id: "teacher_utilization",
    name: "Öğretmen doluluk",
    description: "Öğretmen programlarını çekerek doluluk analizi için veri üretir.",
    intervalMinutes: 60 * 24,
    defaultEnabled: true,
    async run(ctx) {
      const steps = [];
      for (const teacherId of TEACHERS) {
        steps.push(await runWorkflowTool(ctx, "getTeacherSchedule", { teacherId }));
      }
      steps.push(await runWorkflowTool(ctx, "findAvailableTeachers", {}));
      return steps;
    },
  },

  makeup_suggestions: {
    id: "makeup_suggestions",
    name: "Telafi saat önerileri",
    description: "Açık telafi talepleri için Agent Runtime ile slot önerir.",
    intervalMinutes: 60 * 6,
    defaultEnabled: true,
    async run(ctx) {
      const steps = [];
      for (const requestId of MAKEUP_REQUESTS) {
        steps.push(await runWorkflowTool(ctx, "findAvailableSlots", { requestId }));
      }
      return steps;
    },
  },

  /**
   * EPIC 10 — sabit demo ID listesi TARAMAZ; `checkMakeupSlaTool` kendi
   * içinde tenant'ın TÜM onaylı telafi taleplerini `readData()` ile okur
   * (bkz. `findAvailableTeachers`'ın `{}` girdili tarama deseni). Eşik
   * atlaması (15/7/3/1 gün, aşıldı) yalnızca YÜKSELEN seviyeler için
   * audit log üretir — idempotent, günde birden çok kez çalıştırılabilir.
   */
  makeup_sla_check: {
    id: "makeup_sla_check",
    name: "Telafi SLA kontrolü",
    description: "Onaylı telafi taleplerinin 30 günlük SLA süresini tarar; eşik aşımlarını kaydeder.",
    intervalMinutes: 60 * 6,
    defaultEnabled: true,
    async run(ctx) {
      return [await runWorkflowTool(ctx, "checkMakeupSla", {})];
    },
  },
};

export function listWorkflowDefinitions() {
  return Object.values(WORKFLOW_REGISTRY);
}

export function getWorkflowDefinition(id: string) {
  return WORKFLOW_REGISTRY[id as WorkflowId];
}

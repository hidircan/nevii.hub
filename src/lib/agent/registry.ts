/**
 * Central Tool Registry — metadata + handlers that ONLY call the Tool Layer.
 * No database access here.
 */

import { z } from "zod";
import {
  attendanceSchema,
  makeupSlotSchema,
  studentSchema,
  teacherSchema,
} from "../validation";
import type { AppRole } from "../auth/types";
import {
  cancelMakeupLessonTool,
  checkMakeupSlaTool,
  confirmMakeupLessonTool,
  createMakeupLessonTool,
  createPaymentTool,
  createStudentTool,
  createTeacherTool,
  findAvailableSlotsTool,
  findAvailableTeachersTool,
  findPersonScheduleTool,
  getParentBalanceTool,
  getStudentScheduleTool,
  getTeacherScheduleTool,
  markAttendanceTool,
  resetDemoTool,
  scanOverduePaymentsTool,
  sendParentMessageTool,
  sendTeacherMessageTool,
} from "../services/tools";
import type { AgentToolName, ToolDefinition } from "./types";

const idSchema = z.object({ id: z.string().min(1) }).strict();
const requestIdSchema = z.object({ requestId: z.string().min(1) });
const studentIdSchema = z.object({ studentId: z.string().min(1) });
const teacherIdSchema = z.object({ teacherId: z.string().min(1) });
const paymentIdSchema = z.object({ paymentId: z.string().min(1) });

const emptyOrRecord = z.record(z.string(), z.unknown()).optional().default({});

const STAFF: AppRole[] = ["SUPER_ADMIN", "SCHOOL_ADMIN", "TEACHER", "AI_AGENT"];
const ADMIN: AppRole[] = ["SUPER_ADMIN", "SCHOOL_ADMIN", "AI_AGENT"];
const ALL: AppRole[] = [
  "SUPER_ADMIN",
  "SCHOOL_ADMIN",
  "TEACHER",
  "STUDENT",
  "AI_AGENT",
];

/** Registry map — single source for agents & MCP */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const TOOL_REGISTRY: Record<AgentToolName, ToolDefinition<any, any>> = {
  markAttendance: {
    name: "markAttendance",
    description: "Mark lesson attendance; may create makeup credit on absence",
    inputSchema: attendanceSchema,
    outputSchema: z.object({ lessonId: z.string(), status: z.string() }),
    requiredRoles: STAFF,
    execute: (ctx, input) => markAttendanceTool(ctx, input),
  },
  findAvailableSlots: {
    name: "findAvailableSlots",
    description: "Suggest and persist makeup slots for a makeup request",
    inputSchema: requestIdSchema,
    outputSchema: z.object({
      requestId: z.string(),
      slots: z.array(z.unknown()),
    }),
    requiredRoles: STAFF,
    execute: (ctx, input) => findAvailableSlotsTool(ctx, input),
  },
  confirmMakeupLesson: {
    name: "confirmMakeupLesson",
    description:
      "Confirm a suggested makeup slot and schedule the lesson (past dates allowed up to the request's " +
      "expiry). decisionNote (why this slot) is optional — starts the 30-day SLA clock.",
    inputSchema: z.object({
      requestId: z.string().min(1),
      slot: makeupSlotSchema,
      decisionNote: z.string().max(1000).optional(),
    }),
    outputSchema: z.object({
      requestId: z.string(),
      lessonId: z.string().optional(),
    }),
    requiredRoles: ADMIN,
    execute: (ctx, input) => confirmMakeupLessonTool(ctx, input),
  },
  createMakeupLesson: {
    name: "createMakeupLesson",
    description: "Create makeup credit from absent or school-cancelled lesson",
    inputSchema: attendanceSchema.extend({
      status: z.enum(["absent", "cancelled_by_school"]),
    }),
    outputSchema: z.object({ requestId: z.string() }),
    requiredRoles: STAFF,
    execute: (ctx, input) => createMakeupLessonTool(ctx, input),
  },
  cancelMakeupLesson: {
    name: "cancelMakeupLesson",
    description:
      "Cancel/reject an open makeup request. A non-empty decisionNote (reason for " +
      "cancelling/rejecting) is REQUIRED.",
    inputSchema: requestIdSchema.extend({
      decisionNote: z.string().min(1, "Karar notu zorunludur"),
    }),
    outputSchema: z.object({ requestId: z.string() }),
    requiredRoles: ADMIN,
    execute: (ctx, input) => cancelMakeupLessonTool(ctx, input),
  },
  checkMakeupSla: {
    name: "checkMakeupSla",
    description:
      "Scan confirmed makeup requests for SLA threshold crossings (15/7/3/1 days remaining, " +
      "or exceeded) and record any escalation. Idempotent — re-running does not re-notify " +
      "for a threshold already reached.",
    inputSchema: emptyOrRecord,
    outputSchema: z.object({ checked: z.number(), escalated: z.array(z.unknown()) }),
    requiredRoles: ADMIN,
    execute: (ctx) => checkMakeupSlaTool(ctx),
  },
  /**
   * EPIC 1 (IMPLEMENTATION_PLAN.md) — sabit demo ID listesi TARAMAZ;
   * `scanOverduePaymentsTool` kendi içinde tenant'ın TÜM gecikmiş
   * ödemelerini `readData()` ile okur (checkMakeupSla ile aynı desen).
   */
  scanOverduePayments: {
    name: "scanOverduePayments",
    description:
      "Scan all overdue payments for the tenant; open/update a follow-up case and an in-app " +
      "parent notification for each (skipping opted-out students and payments contacted " +
      "within the frequency limit). Never marks a case as actually sent/delivered.",
    inputSchema: emptyOrRecord,
    outputSchema: z.object({
      scanned: z.number(),
      casesUpserted: z.number(),
      notificationsCreated: z.number(),
    }),
    requiredRoles: ADMIN,
    execute: (ctx) => scanOverduePaymentsTool(ctx),
  },
  findAvailableTeachers: {
    name: "findAvailableTeachers",
    description: "List active teachers filtered by instrument and/or branch",
    inputSchema: z.object({
      instrument: z.string().optional(),
      branchId: z.string().min(1).optional(),
    }),
    outputSchema: z.object({
      teachers: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          branchId: z.string(),
          instruments: z.array(z.string()),
        })
      ),
    }),
    requiredRoles: STAFF,
    execute: (ctx, input) => findAvailableTeachersTool(ctx, input),
  },
  getStudentSchedule: {
    name: "getStudentSchedule",
    description: "Get all lessons for a student",
    inputSchema: studentIdSchema,
    outputSchema: z.object({
      studentId: z.string(),
      lessons: z.array(z.unknown()),
    }),
    requiredRoles: ALL,
    execute: (ctx, input) => getStudentScheduleTool(ctx, input),
  },
  getTeacherSchedule: {
    name: "getTeacherSchedule",
    description: "Get all lessons for a teacher",
    inputSchema: teacherIdSchema,
    outputSchema: z.object({
      teacherId: z.string(),
      lessons: z.array(z.unknown()),
    }),
    requiredRoles: STAFF,
    execute: (ctx, input) => getTeacherScheduleTool(ctx, input),
  },
  findPersonSchedule: {
    name: "findPersonSchedule",
    description:
      "Resolve a person's NAME (student or teacher, not an id) to their next few upcoming " +
      "lessons. Use this whenever the user refers to someone by name instead of an id — " +
      "e.g. \"when is Can's lesson\", \"Ayşe öğretmenin programı\". Returns matchType: " +
      "'none' (no match), 'ambiguous' (multiple people matched — ask which one), or " +
      "'student'/'teacher' (single match, with upcomingLessons).",
    inputSchema: z.object({ query: z.string().min(1) }),
    outputSchema: z.object({ matchType: z.string() }).passthrough(),
    requiredRoles: ALL,
    execute: (ctx, input) => findPersonScheduleTool(ctx, input),
  },
  getParentBalance: {
    name: "getParentBalance",
    description: "Get payment balance / outstanding amount for a student",
    inputSchema: studentIdSchema,
    outputSchema: z.object({
      studentId: z.string(),
      payments: z.array(z.unknown()),
      outstanding: z.number(),
    }),
    requiredRoles: ["SUPER_ADMIN", "SCHOOL_ADMIN", "STUDENT", "AI_AGENT"],
    execute: (ctx, input) => getParentBalanceTool(ctx, input),
  },
  createPayment: {
    name: "createPayment",
    description: "Mark an existing payment as paid",
    inputSchema: paymentIdSchema,
    outputSchema: z.object({ paymentId: z.string(), status: z.string() }),
    requiredRoles: ADMIN,
    execute: (ctx, input) => createPaymentTool(ctx, input),
  },
  sendParentMessage: {
    name: "sendParentMessage",
    description: "Build a WhatsApp message payload for a parent (does not send)",
    inputSchema: z.object({
      studentId: z.string().min(1),
      kind: z.enum(["makeup_created", "makeup_confirmed"]).default("makeup_created"),
      makeupRequestId: z.string().optional(),
    }),
    outputSchema: z.object({ message: z.unknown() }),
    requiredRoles: STAFF,
    execute: (ctx, input) => sendParentMessageTool(ctx, input),
  },
  sendTeacherMessage: {
    name: "sendTeacherMessage",
    description: "Build a WhatsApp message payload for a teacher (does not send)",
    inputSchema: z.object({ makeupRequestId: z.string().min(1) }),
    outputSchema: z.object({ message: z.unknown() }),
    requiredRoles: ADMIN,
    execute: (ctx, input) => sendTeacherMessageTool(ctx, input),
  },
  createStudent: {
    name: "createStudent",
    description: "Register a new student in the tenant school",
    inputSchema: studentSchema,
    outputSchema: z.object({ studentId: z.string() }),
    requiredRoles: ADMIN,
    execute: (ctx, input) => createStudentTool(ctx, input),
  },
  createTeacher: {
    name: "createTeacher",
    description: "Register a new teacher in the tenant school",
    inputSchema: teacherSchema,
    outputSchema: z.object({ teacherId: z.string() }),
    requiredRoles: ADMIN,
    execute: (ctx, input) => createTeacherTool(ctx, input),
  },
  resetDemo: {
    name: "resetDemo",
    description: "Reset tenant demo data to seed (admin only)",
    inputSchema: emptyOrRecord,
    outputSchema: z.object({ reset: z.literal(true) }),
    requiredRoles: ["SUPER_ADMIN", "SCHOOL_ADMIN"],
    execute: (ctx) => resetDemoTool(ctx),
  },
};

export function listToolDefinitions() {
  return Object.values(TOOL_REGISTRY).map((t) => ({
    name: t.name,
    description: t.description,
    requiredRoles: t.requiredRoles,
    inputSchema: zodToJsonSchemaLite(t.inputSchema),
    outputSchema: t.outputSchema
      ? zodToJsonSchemaLite(t.outputSchema)
      : undefined,
  }));
}

export function getTool(name: string): ToolDefinition | undefined {
  return TOOL_REGISTRY[name as AgentToolName];
}

export function isRegisteredTool(name: string): name is AgentToolName {
  return name in TOOL_REGISTRY;
}

/** Minimal JSON-schema-like export for LLMs (not full OpenAPI) */
function zodToJsonSchemaLite(schema: z.ZodType): Record<string, unknown> {
  // Prefer Zod 4 JSON schema if available
  const s = schema as z.ZodType & {
    toJSONSchema?: () => Record<string, unknown>;
  };
  if (typeof s.toJSONSchema === "function") {
    try {
      return s.toJSONSchema();
    } catch {
      // fall through
    }
  }
  return { type: "object", description: schema.description || "object" };
}

// silence unused
void idSchema;

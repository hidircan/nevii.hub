/**
 * Memory Layer — above Conversation Store.
 * Retrieval + write; never executes business tools (RBAC/tenant via caller context).
 */

import type { ServiceContext } from "../../services/context";
import type { MemoryKind, MemoryRecord, MemoryScope } from "./types";
import { memoryStore } from "./store";

export async function retrieveRelevantMemories(args: {
  ctx: ServiceContext;
  conversationId?: string;
  queryText: string;
  limit?: number;
  topK?: number;
  minScore?: number;
}): Promise<MemoryRecord[]> {
  const { ctx, conversationId, queryText, limit, topK, minScore } = args;
  // Tenant isolation: only this tenant (from ServiceContext / JWT)
  return memoryStore.search({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    conversationId,
    queryText,
    scopes: ["conversation", "user", "tenant", "workflow"],
    limit: limit ?? topK ?? Number(process.env.MEMORY_TOP_K || 10),
    topK: topK ?? limit ?? Number(process.env.MEMORY_TOP_K || 10),
    minScore: minScore ?? Number(process.env.MEMORY_MIN_SCORE || 0.25),
  });
}

/** Format memories for LLM system injection */
export function formatMemoriesForPrompt(memories: MemoryRecord[]): string {
  if (!memories.length) return "";
  const lines = memories.map(
    (m, i) =>
      `${i + 1}. [${m.scope}/${m.kind}] ${m.content}${
        m.score != null ? ` (score=${m.score.toFixed(2)})` : ""
      }`
  );
  return (
    "Relevant long-term memories for this tenant/user (do not invent beyond these):\n" +
    lines.join("\n")
  );
}

export async function rememberFact(args: {
  ctx: ServiceContext;
  scope: MemoryScope;
  scopeKey: string;
  kind: MemoryKind;
  content: string;
  metadata?: Record<string, unknown>;
}): Promise<MemoryRecord> {
  // Enforce tenant from context only; embedding generated inside store.upsert
  return memoryStore.upsert({
    tenantId: args.ctx.tenantId,
    scope: args.scope,
    scopeKey: args.scopeKey,
    kind: args.kind,
    content: args.content,
    metadata: {
      ...args.metadata,
      writtenBy: args.ctx.userId,
      role: args.ctx.role,
    },
  });
}

/**
 * After a turn: extract simple durable facts (heuristic; LLM can replace later).
 * Does not call Agent Runtime tools — memory only.
 */
export async function updateMemoryAfterTurn(args: {
  ctx: ServiceContext;
  conversationId: string;
  userMessage: string;
  assistantMessage: string;
  toolNames?: string[];
}): Promise<MemoryRecord[]> {
  const { ctx, conversationId, userMessage, assistantMessage, toolNames } = args;
  const written: MemoryRecord[] = [];
  const text = `${userMessage} ${assistantMessage}`.toLowerCase();

  // Conversation short-term summary
  written.push(
    await rememberFact({
      ctx,
      scope: "conversation",
      scopeKey: conversationId,
      kind: "summary",
      content: `User: ${userMessage.slice(0, 200)} | Assistant: ${assistantMessage.slice(0, 280)}`,
      metadata: { toolNames },
    })
  );

  // Recurring intent heuristics
  if (/her\s*hafta|every week|düzenli|recurring|her ay/i.test(text)) {
    written.push(
      await rememberFact({
        ctx,
        scope: "user",
        scopeKey: ctx.userId,
        kind: "recurring_request",
        content: `Recurring interest: ${userMessage.slice(0, 240)}`,
      })
    );
  }

  if (/tercih|preference|seviyorum|istemiyorum|prefer/i.test(text)) {
    const kind: MemoryKind =
      ctx.role === "TEACHER"
        ? "teacher_preference"
        : ctx.role === "STUDENT"
          ? "parent_preference"
          : "preference";
    written.push(
      await rememberFact({
        ctx,
        scope: "user",
        scopeKey: ctx.userId,
        kind,
        content: userMessage.slice(0, 300),
      })
    );
  }

  if (/okul|şube|branch|politika|policy/i.test(text)) {
    written.push(
      await rememberFact({
        ctx,
        scope: "tenant",
        scopeKey: ctx.tenantId,
        kind: "fact",
        content: `Tenant note: ${userMessage.slice(0, 240)}`,
      })
    );
  }

  if (toolNames?.length) {
    written.push(
      await rememberFact({
        ctx,
        scope: "user",
        scopeKey: ctx.userId,
        kind: "fact",
        content: `Recently used tools: ${toolNames.join(", ")}`,
        metadata: { toolNames },
      })
    );
  }

  return written;
}

export async function recordWorkflowMemory(args: {
  tenantId: string;
  workflowId: string;
  summary: string;
  success: boolean;
  metadata?: Record<string, unknown>;
}): Promise<MemoryRecord> {
  return memoryStore.upsert({
    tenantId: args.tenantId,
    scope: "workflow",
    scopeKey: args.workflowId,
    kind: "workflow_outcome",
    content: args.summary,
    metadata: { success: args.success, ...args.metadata },
    embedding: null,
    embeddingModel: null,
  });
}

export async function listMemoriesForAdmin(tenantId: string, limit = 100) {
  const all = await memoryStore.list(tenantId);
  return all.slice(0, limit);
}

export async function deleteMemory(tenantId: string, id: string) {
  return memoryStore.delete(tenantId, id);
}

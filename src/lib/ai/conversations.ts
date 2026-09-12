/**
 * Tenant-scoped conversation persistence (in-process + optional file under /tmp or data/).
 * Future: move to Prisma Conversation / Message models.
 */

import { promises as fs } from "fs";
import path from "path";
import type { ChatMessage, Conversation } from "./types";
import { resolveDataDir } from "../config";

type StoreShape = { conversations: Conversation[] };

const g = globalThis as unknown as { __notaplanChats?: StoreShape };

function mem(): StoreShape {
  if (!g.__notaplanChats) g.__notaplanChats = { conversations: [] };
  return g.__notaplanChats;
}

function filePath() {
  return path.join(resolveDataDir(path.join(process.cwd(), "data")), "conversations.json");
}

async function load(): Promise<StoreShape> {
  const m = mem();
  if (m.conversations.length) return m;
  try {
    const raw = await fs.readFile(filePath(), "utf-8");
    const data = JSON.parse(raw) as StoreShape;
    g.__notaplanChats = data;
    return data;
  } catch {
    return m;
  }
}

async function save(data: StoreShape): Promise<void> {
  g.__notaplanChats = data;
  try {
    const dir = path.dirname(filePath());
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath(), JSON.stringify(data, null, 2), "utf-8");
  } catch {
    // disk may be read-only in some hosts; memory still works
  }
}

function uid(prefix: string) {
  return `${prefix}_${crypto.randomUUID().slice(0, 12)}`;
}

export async function listConversations(
  tenantId: string,
  userId: string
): Promise<Conversation[]> {
  const data = await load();
  return data.conversations
    .filter((c) => c.tenantId === tenantId && c.userId === userId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * P1 (2026-09-12) — tenant'taki TÜM sohbetler (kullanıcı ayrımı yok).
 * YALNIZCA admin-only çağıranlar içindir (örn. İletişim Merkezi gelen
 * WhatsApp listesi) — normal kullanıcı yolu her zaman kullanıcı-scoped
 * `listConversations` kullanır. Ham telefon/mesaj içerir; çağıran
 * maskelemeden UI'ya döndürmez.
 */
export async function listTenantConversations(tenantId: string): Promise<Conversation[]> {
  const data = await load();
  return data.conversations
    .filter((c) => c.tenantId === tenantId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getConversation(
  tenantId: string,
  userId: string,
  conversationId: string
): Promise<Conversation | null> {
  const data = await load();
  const c = data.conversations.find(
    (x) => x.id === conversationId && x.tenantId === tenantId && x.userId === userId
  );
  return c ?? null;
}

export async function createConversation(
  tenantId: string,
  userId: string,
  title?: string
): Promise<Conversation> {
  const data = await load();
  const now = new Date().toISOString();
  const conv: Conversation = {
    id: uid("conv"),
    tenantId,
    userId,
    title: title || "Yeni sohbet",
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
  data.conversations.unshift(conv);
  await save(data);
  return conv;
}

export async function appendMessages(
  tenantId: string,
  userId: string,
  conversationId: string,
  messages: ChatMessage[]
): Promise<Conversation> {
  const data = await load();
  const idx = data.conversations.findIndex(
    (x) => x.id === conversationId && x.tenantId === tenantId && x.userId === userId
  );
  if (idx < 0) throw new Error("Conversation not found");
  const conv = data.conversations[idx];
  conv.messages.push(...messages);
  conv.updatedAt = new Date().toISOString();
  if (conv.title === "Yeni sohbet") {
    const firstUser = conv.messages.find((m) => m.role === "user");
    if (firstUser) conv.title = firstUser.content.slice(0, 48);
  }
  data.conversations[idx] = conv;
  await save(data);
  return conv;
}

export function newMessage(
  role: ChatMessage["role"],
  content: string,
  extra?: Partial<ChatMessage>
): ChatMessage {
  return {
    id: uid("msg"),
    role,
    content,
    createdAt: new Date().toISOString(),
    ...extra,
  };
}

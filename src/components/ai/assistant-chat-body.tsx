"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Bot, History, Loader2, Maximize2, Send, Sparkles, Wrench, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { QuickAction } from "./assistant-quick-actions";

type UiMessage = {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  toolName?: string;
  toolStatus?: "pending" | "success" | "error";
};

type ConvSummary = { id: string; title: string; updatedAt: string; messageCount: number };

type StreamEvent =
  | { type: "meta"; conversationId: string; provider: string }
  | { type: "tool_start"; tool: string; messageId: string }
  | { type: "tool_end"; tool: string; messageId: string; ok: boolean; content: string }
  | { type: "token"; text: string }
  | { type: "done"; conversationId: string; messages: UiMessage[]; assistantMessage: UiMessage; provider: string }
  | { type: "error"; message: string };

/** Tools whose result is a draft that still needs a separate human send step. */
const DRAFT_TOOLS = new Set(["sendParentMessage", "sendTeacherMessage"]);

export function AssistantChatBody({
  quickActions,
  prefillText,
  onPrefillConsumed,
  onProviderChange,
  initialConversationId,
  onConversationIdChange,
  hideChrome = false,
  expandHref,
}: {
  quickActions: QuickAction[];
  prefillText?: string | null;
  onPrefillConsumed?: () => void;
  onProviderChange?: (provider: string) => void;
  /** Popup ↔ büyük ekran arasında paylaşılan sohbet. */
  initialConversationId?: string | null;
  onConversationIdChange?: (id: string | null) => void;
  /** Büyük sayfa kendi PageHeader'ını kullanır. */
  hideChrome?: boolean;
  /** Küçük popup'ta büyütme linki (/panel/maestron-ai). */
  expandHref?: string;
}) {
  const [conversations, setConversations] = useState<ConvSummary[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>(
    initialConversationId ?? undefined
  );
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const bootstrappedRef = useRef(false);

  // Apply an incoming prefill during render (React's documented pattern for
  // "adjust state when a prop changes") rather than in an effect — it's a
  // plain value mirror, not an external-system read.
  const [appliedPrefill, setAppliedPrefill] = useState<string | null | undefined>(prefillText);
  if (prefillText && prefillText !== appliedPrefill) {
    setAppliedPrefill(prefillText);
    setInput(prefillText);
  }
  // The actual side effects (notify parent, focus) run once that lands.
  useEffect(() => {
    if (!appliedPrefill) return;
    onPrefillConsumed?.();
    inputRef.current?.focus();
  }, [appliedPrefill, onPrefillConsumed]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading, streamingText]);

  const loadList = useCallback(async () => {
    const res = await fetch("/api/v1/chat", { credentials: "include" });
    const json = await res.json();
    if (json.ok) setConversations(json.data.conversations || []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/v1/chat", { credentials: "include" });
      const json = await res.json();
      if (!cancelled && json.ok) setConversations(json.data.conversations || []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Paylaşılan conversationId ile büyük/küçük ekran senkronu.
  useEffect(() => {
    if (bootstrappedRef.current) return;
    if (!initialConversationId) return;
    bootstrappedRef.current = true;
    void (async () => {
      const res = await fetch(`/api/v1/chat/${initialConversationId}`, { credentials: "include" });
      const json = await res.json();
      if (!json.ok) return;
      setConversationId(initialConversationId);
      const raw = (json.data.conversation.messages || []) as UiMessage[];
      setMessages(
        raw.filter(
          (msg) =>
            msg.role !== "tool" ||
            (msg.toolName && DRAFT_TOOLS.has(msg.toolName) && msg.toolStatus === "success")
        )
      );
    })();
  }, [initialConversationId]);

  async function loadConversation(id: string) {
    setError(null);
    setShowHistory(false);
    const res = await fetch(`/api/v1/chat/${id}`, { credentials: "include" });
    const json = await res.json();
    if (!json.ok) {
      setError(json.error?.message || "Sohbet yüklenemedi");
      return;
    }
    setConversationId(id);
    onConversationIdChange?.(id);
    const raw = (json.data.conversation.messages || []) as UiMessage[];
    setMessages(
      raw.filter(
        (msg) =>
          msg.role !== "tool" ||
          (msg.toolName && DRAFT_TOOLS.has(msg.toolName) && msg.toolStatus === "success")
      )
    );
    setStreamingText("");
  }

  function newChat() {
    setConversationId(undefined);
    onConversationIdChange?.(null);
    setMessages([]);
    setStreamingText("");
    setError(null);
    setShowHistory(false);
  }

  const send = useCallback(
    async (override?: string) => {
      const text = (override ?? input).trim();
      if (!text || loading) return;
      setInput("");
      setLoading(true);
      setError(null);
      setStreamingText("");
      setMessages((m) => [...m, { id: `local_${Date.now()}`, role: "user", content: text }]);

      try {
        const res = await fetch("/api/v1/chat/stream", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, conversationId }),
        });

        if (!res.ok || !res.body) {
          const fallback = await fetch("/api/v1/chat", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: text, conversationId }),
          });
          const json = await fallback.json();
          if (!json.ok) {
            setError(json.error?.message || "İstek başarısız");
            setLoading(false);
            return;
          }
          setConversationId(json.data.conversationId);
          setProvider(json.data.provider);
          onProviderChange?.(json.data.provider);
          setMessages(json.data.messages || []);
          await loadList();
          setLoading(false);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let liveAssistant = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split("\n\n");
          buffer = chunks.pop() || "";
          for (const chunk of chunks) {
            const line = chunk.trim();
            if (!line.startsWith("data:")) continue;
            let event: StreamEvent;
            try {
              event = JSON.parse(line.slice(5).trim()) as StreamEvent;
            } catch {
              continue;
            }

            if (event.type === "meta") {
              setConversationId(event.conversationId);
              onConversationIdChange?.(event.conversationId);
              setProvider(event.provider);
              onProviderChange?.(event.provider);
            } else if (event.type === "tool_start") {
              // Normal kullanıcıya tool/debug satırı gösterme.
            } else if (event.type === "tool_end") {
              // Draft araçları (WhatsApp vb.) için yalnız güvenli özet; ham tool adı yok.
              if (event.ok && DRAFT_TOOLS.has(event.tool) && event.content?.trim()) {
                setMessages((m) => [
                  ...m,
                  {
                    id: event.messageId,
                    role: "tool",
                    content: event.content,
                    toolName: event.tool,
                    toolStatus: "success",
                  },
                ]);
              }
            } else if (event.type === "token") {
              liveAssistant += event.text;
              setStreamingText(liveAssistant);
            } else if (event.type === "done") {
              setConversationId(event.conversationId);
              onConversationIdChange?.(event.conversationId);
              setProvider(event.provider);
              onProviderChange?.(event.provider);
              // Tool satırlarını sohbet geçmişinden süz (draft hariç).
              const cleaned = (event.messages || []).filter(
                (msg) =>
                  msg.role !== "tool" ||
                  (msg.toolName && DRAFT_TOOLS.has(msg.toolName) && msg.toolStatus === "success")
              );
              setMessages(cleaned);
              setStreamingText("");
              await loadList();
            } else if (event.type === "error") {
              setError(event.message);
            }
          }
        }
      } catch {
        setError("Bağlantı hatası — internet bağlantınızı kontrol edin.");
      } finally {
        setLoading(false);
      }
    },
    [input, loading, conversationId, loadList, onProviderChange, onConversationIdChange]
  );

  const isEmpty = !messages.length && !streamingText;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      {!hideChrome ? (
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--color-border)] px-4 py-3 dark:border-slate-800">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-sm">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--color-text)] dark:text-slate-50">Nevii Hub AI</p>
          <p className="truncate text-[11px] text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
            {provider ? `Aktif: ${provider}` : "Operasyon asistanı"}
          </p>
        </div>
        {expandHref ? (
          <a
            href={expandHref}
            aria-label="Nevii Hub AI'yi büyüt"
            title="Büyüt"
            className="rounded-lg p-1.5 text-[var(--color-text-muted)] transition hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)]"
          >
            <Maximize2 className="h-4 w-4" />
          </a>
        ) : null}
        <button
          type="button"
          onClick={newChat}
          className="rounded-lg px-2 py-1.5 text-xs font-medium text-[var(--color-text-muted)] transition hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)] dark:text-[var(--color-text-muted)] dark:hover:bg-slate-800 dark:hover:text-slate-100"
        >
          Yeni
        </button>
        <button
          type="button"
          onClick={() => setShowHistory((v) => !v)}
          aria-label="Sohbet geçmişi"
          className={cn(
            "rounded-lg p-1.5 transition",
            showHistory
              ? "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300"
              : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)] dark:text-[var(--color-text-muted)] dark:hover:bg-slate-800 dark:hover:text-slate-100"
          )}
        >
          <History className="h-4 w-4" />
        </button>
      </div>
      ) : (
        <div className="flex shrink-0 items-center justify-end gap-2 border-b border-[var(--color-border)] px-4 py-2">
          <button
            type="button"
            onClick={newChat}
            className="rounded-lg px-2 py-1.5 text-xs font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
          >
            Yeni sohbet
          </button>
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            aria-label="Sohbet geçmişi"
            className="rounded-lg p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
          >
            <History className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* History dropdown */}
      {showHistory ? (
        <div className="max-h-40 shrink-0 overflow-y-auto border-b border-[var(--color-border)] bg-[var(--color-surface-muted)]/60 px-2 py-2 dark:border-slate-800 dark:bg-slate-900/60">
          {conversations.length ? (
            <ul className="space-y-0.5">
              {conversations.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => void loadConversation(c.id)}
                    className={cn(
                      "block w-full rounded-lg px-2.5 py-1.5 text-left text-xs transition",
                      conversationId === c.id
                        ? "bg-violet-100 text-violet-900 dark:bg-violet-500/20 dark:text-violet-200"
                        : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] dark:text-slate-300 dark:hover:bg-slate-800"
                    )}
                  >
                    <span className="line-clamp-1 font-medium">{c.title}</span>
                    <span className="ml-1 text-[var(--color-text-muted)]">· {c.messageCount} mesaj</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-2.5 py-1.5 text-xs text-[var(--color-text-muted)]">Henüz sohbet yok</p>
          )}
        </div>
      ) : null}

      {/* Messages */}
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {isEmpty ? (
          <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-6 text-center dark:border-slate-700 dark:bg-slate-900/50">
            <Bot className="mx-auto mb-2 h-7 w-7 text-violet-400" />
            <p className="text-sm text-[var(--color-text-muted)] dark:text-slate-300">
              Size nasıl yardımcı olabilirim? Öğrenci, öğretmen, program veya ödeme hakkında
              sorabilirsiniz.
            </p>
          </div>
        ) : null}

        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}

        {streamingText ? (
          <div className="flex justify-start">
            <div className="max-w-[88%] rounded-2xl rounded-bl-sm bg-[var(--color-surface-muted)] px-3.5 py-2.5 text-sm text-[var(--color-text)] dark:bg-slate-800 dark:text-slate-200">
              <p className="whitespace-pre-wrap">{streamingText}</p>
            </div>
          </div>
        ) : null}

        {loading && !streamingText ? (
          <div className="flex items-center gap-2 px-1 text-xs text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
            <span className="flex gap-0.5">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-400 [animation-delay:-0.3s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-400 [animation-delay:-0.15s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-400" />
            </span>
            Düşünüyor…
          </div>
        ) : null}
        <div ref={bottomRef} />
      </div>

      {error ? (
        <div className="mx-4 mb-2 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Kapat">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      {/* Persistent (not just empty-state) so a quick action stays reachable
          after the page context changes mid-conversation. */}
      {quickActions.length ? (
        <div className="flex shrink-0 flex-wrap gap-1.5 border-t border-[var(--color-border)] px-3 pt-2.5 pb-1 sm:flex-nowrap sm:overflow-x-auto">
          {quickActions.map((qa) => (
            <button
              key={qa.id}
              type="button"
              disabled={loading}
              onClick={() => void send(qa.message)}
              className="max-w-full shrink-0 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-1.5 text-left text-xs font-medium text-[var(--color-text)] transition hover:border-[var(--color-primary)] disabled:opacity-40"
            >
              {qa.label}
            </button>
          ))}
        </div>
      ) : null}

      <form
        className={cn(
          "flex shrink-0 gap-2 p-3",
          quickActions.length ? "" : "border-t border-[var(--color-border)] dark:border-slate-800"
        )}
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Mesajınızı yazın…"
          disabled={loading}
          className="flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] outline-none ring-violet-500/30 placeholder:text-[var(--color-text-muted)] focus:ring-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-[var(--color-text-muted)] dark:ring-violet-400/30"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          aria-label="Gönder"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white transition hover:bg-violet-700 disabled:opacity-40 dark:bg-violet-500 dark:hover:bg-violet-400"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </form>
    </div>
  );
}

function MessageBubble({ message: m }: { message: UiMessage }) {
  if (m.role === "tool") {
    const isDraft = m.toolName && DRAFT_TOOLS.has(m.toolName) && m.toolStatus === "success";
    if (isDraft) {
      return (
        <div className="flex justify-start">
          <div className="max-w-[92%] rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
              <Wrench className="h-3 w-3" />
              Taslak hazırlandı — henüz gönderilmedi
            </p>
            <p className="whitespace-pre-wrap">{m.content}</p>
          </div>
        </div>
      );
    }
    // Teknik tool/debug satırları kullanıcıya gösterilmez.
    return null;
  }

  return (
    <div className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[88%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
          m.role === "user"
            ? "rounded-br-sm bg-violet-600 text-white"
            : "rounded-bl-sm bg-[var(--color-surface-muted)] text-[var(--color-text)] dark:bg-slate-800 dark:text-slate-100"
        )}
      >
        {m.content}
      </div>
    </div>
  );
}

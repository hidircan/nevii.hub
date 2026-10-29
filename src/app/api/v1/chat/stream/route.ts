import { z } from "zod";
import { streamChatTurn } from "@/lib/ai/orchestrator";
import { authenticateRequest } from "@/lib/auth/authenticate";
import { assertPermission } from "@/lib/auth/rbac";
import { buildServiceContext } from "@/lib/api/context";
import { runWithTenantAsync } from "@/lib/tenant-context";
import { consumeRateLimit } from "@/lib/rate-limit";
import { CROSS_SITE_REJECTED_MESSAGE, isCrossSiteMutation } from "@/lib/api/csrf-guard";

export const dynamic = "force-dynamic";

const CHAT_STREAM_RATE_WINDOW_MS = 60_000;
const CHAT_STREAM_RATE_MAX = 20;

const bodySchema = z.object({
  message: z.string().min(1).max(4000),
  conversationId: z.string().optional(),
});

/**
 * POST /api/v1/chat/stream
 * SSE stream: meta | tool_start | tool_end | token | done | error
 */
export async function POST(request: Request) {
  const requestId =
    request.headers.get("x-request-id") || crypto.randomUUID();

  const auth = await authenticateRequest(request, requestId);
  if (!auth.ok) {
    return new Response(JSON.stringify({ ok: false, error: auth }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (auth.via === "cookie" && isCrossSiteMutation(request)) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: { code: "FORBIDDEN", message: CROSS_SITE_REJECTED_MESSAGE },
      }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  const perm = assertPermission(auth.user.role, "tools:catalog");
  if (!perm.ok) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: { code: "FORBIDDEN", message: perm.message },
      }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  if (
    !consumeRateLimit("chat-stream-turn", auth.user.userId, {
      windowMs: CHAT_STREAM_RATE_WINDOW_MS,
      max: CHAT_STREAM_RATE_MAX,
    })
  ) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: { code: "RATE_LIMITED", message: "Çok fazla istek gönderildi. Lütfen biraz sonra tekrar deneyin." },
      }),
      {
        status: 429,
        headers: { "Content-Type": "application/json", "Retry-After": String(Math.ceil(CHAT_STREAM_RATE_WINDOW_MS / 1000)) },
      }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({
        ok: false,
        error: { code: "VALIDATION_ERROR", message: "Invalid JSON" },
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: { code: "VALIDATION_ERROR", message: "Invalid payload" },
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const ctx = buildServiceContext(auth.user, request, requestId);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      try {
        await runWithTenantAsync(ctx.tenantId, async () => {
          for await (const event of streamChatTurn({
            ctx: { ...ctx, channel: "chat" },
            conversationId: parsed.data.conversationId,
            message: parsed.data.message,
          })) {
            send(event);
          }
        });
      } catch (e) {
        send({
          type: "error",
          message: e instanceof Error ? e.message : "Stream failed",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

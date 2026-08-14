import { z } from "zod";
import { NextResponse } from "next/server";
import { withApiHandler } from "@/lib/api/handler";
import { jsonFail } from "@/lib/api/http";
import { authenticateUser, issueTokenPair, auditLog } from "@/lib/auth";
import { applyAuthCookies } from "@/lib/auth/cookies";
import { clientIp } from "@/lib/http/client-ip";
import { consumeRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const LOGIN_RATE_WINDOW_MS = 15 * 60_000;
const LOGIN_RATE_MAX_PER_IP = 20;
const LOGIN_RATE_MAX_PER_IP_EMAIL = 5;

/**
 * POST /api/v1/auth/login
 * Public — JWT pair in body + HttpOnly cookies for web.
 */
export const POST = withApiHandler(
  async ({ body, ctx, request }) => {
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return jsonFail("VALIDATION_ERROR", "Invalid login payload", parsed.error.flatten());
    }

    const ip = clientIp(request);
    const normalizedEmail = parsed.data.email.trim().toLowerCase();
    // Two buckets: coarse per-IP (any account) and tighter per-IP+account, so a single
    // attacker can't credential-stuff many accounts from one IP, nor hammer one account.
    const ipOk = consumeRateLimit("auth-login-ip", ip, {
      windowMs: LOGIN_RATE_WINDOW_MS,
      max: LOGIN_RATE_MAX_PER_IP,
    });
    const ipEmailOk = consumeRateLimit("auth-login-ip-email", `${ip}:${normalizedEmail}`, {
      windowMs: LOGIN_RATE_WINDOW_MS,
      max: LOGIN_RATE_MAX_PER_IP_EMAIL,
    });
    if (!ipOk || !ipEmailOk) {
      auditLog({
        action: "auth.login_rate_limited",
        requestId: ctx.requestId || "unknown",
        outcome: "denied",
        meta: { email: normalizedEmail },
      });
      const res = jsonFail("RATE_LIMITED", "Too many login attempts. Please try again later.");
      res.headers.set("Retry-After", String(Math.ceil(LOGIN_RATE_WINDOW_MS / 1000)));
      return res;
    }

    const user = await authenticateUser(parsed.data.email, parsed.data.password);
    if (!user) {
      auditLog({
        action: "auth.login_failed",
        requestId: ctx.requestId || "unknown",
        outcome: "denied",
        meta: { email: parsed.data.email },
      });
      return jsonFail("UNAUTHORIZED", "Invalid email or password");
    }

    const tokens = await issueTokenPair(user);
    auditLog({
      action: "auth.login_success",
      requestId: ctx.requestId || "unknown",
      userId: user.userId,
      tenantId: user.tenantId,
      role: user.role,
      outcome: "success",
    });

    const res = NextResponse.json({
      ok: true as const,
      data: {
        user: {
          userId: user.userId,
          email: user.email,
          role: user.role,
          tenantId: user.tenantId,
          teacherId: user.teacherId,
          studentId: user.studentId,
        },
        ...tokens,
      },
    });
    applyAuthCookies(res, tokens);
    return res;
  },
  { public: true }
);

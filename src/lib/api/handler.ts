import { NextResponse } from "next/server";
import { logger } from "../logger";
import type { ServiceContext } from "../services/context";
import { fromServiceResult, jsonFail, readJsonBody } from "./http";
import { buildServiceContext } from "./context";
import type { ServiceResult } from "../services/result";
import { authenticateRequest } from "../auth/authenticate";
import { isCrossSiteMutation } from "./csrf-guard";
import { assertPermission, type Permission } from "../auth/rbac";
import { auditLog } from "../auth/audit";
import { runWithTenantAsync } from "../tenant-context";

export type ApiHandlerArgs = {
  request: Request;
  ctx: ServiceContext;
  params: Record<string, string>;
  body: unknown;
  searchParams: URLSearchParams;
};

type ApiHandler = (args: ApiHandlerArgs) => Promise<ServiceResult<unknown> | NextResponse>;

export type ApiHandlerOptions = {
  /** Skip JWT (only health / auth endpoints) */
  public?: boolean;
  /** Required permission for this route */
  permission?: Permission;
};

/**
 * Centralized API wrapper: auth, RBAC, body parse, tool mapping, errors.
 */
export function withApiHandler(handler: ApiHandler, options: ApiHandlerOptions = {}) {
  return async (
    request: Request,
    segment?: { params: Promise<Record<string, string>> | Record<string, string> }
  ) => {
    const requestId =
      request.headers.get("x-request-id") ||
      request.headers.get("x-correlation-id") ||
      crypto.randomUUID();

    try {
      let ctx: ServiceContext;

      if (options.public) {
        // Public handlers must not rely on tenant-scoped tools without auth
        ctx = {
          role: "AI_AGENT",
          userId: "anonymous",
          tenantId: "public",
          channel: "web",
          requestId,
        };
      } else {
        const auth = await authenticateRequest(request, requestId);
        if (!auth.ok) {
          return jsonFail("UNAUTHORIZED", auth.message);
        }

        // CSRF defense-in-depth: only cookie-authenticated (browser) requests are at
        // risk — Bearer-token requests are never auto-attached by a browser, so they're
        // exempt. See src/lib/api/csrf-guard.ts for the full rationale.
        if (auth.via === "cookie" && isCrossSiteMutation(request)) {
          auditLog({
            action: "csrf.rejected",
            requestId,
            userId: auth.user.userId,
            tenantId: auth.user.tenantId,
            role: auth.user.role,
            path: new URL(request.url).pathname,
            method: request.method,
            outcome: "denied",
          });
          return jsonFail("FORBIDDEN", "Cross-origin request rejected");
        }

        if (options.permission) {
          const perm = assertPermission(auth.user.role, options.permission);
          if (!perm.ok) {
            auditLog({
              action: "authz.denied",
              requestId,
              userId: auth.user.userId,
              tenantId: auth.user.tenantId,
              role: auth.user.role,
              path: new URL(request.url).pathname,
              method: request.method,
              outcome: "denied",
              meta: { permission: options.permission },
            });
            return jsonFail("FORBIDDEN", perm.message);
          }
        }

        ctx = buildServiceContext(auth.user, request, requestId);
      }

      const url = new URL(request.url);
      const rawParams = segment?.params
        ? await Promise.resolve(segment.params)
        : {};
      const params = rawParams ?? {};

      let body: unknown = {};
      if (request.method !== "GET" && request.method !== "HEAD") {
        const parsed = await readJsonBody(request);
        if (!parsed.ok) return parsed.response;
        body = parsed.body;
      }

      const result = await runWithTenantAsync(ctx.tenantId, () =>
        handler({
          request,
          ctx,
          params,
          body,
          searchParams: url.searchParams,
        })
      );

      if (result instanceof NextResponse) return result;
      return fromServiceResult(result);
    } catch (error) {
      // Internal error detail (DB/provider/stack) is logged and audited server-side only —
      // never returned to the client, which would leak schema/infra/credential-adjacent info.
      logger.error(`API handler error [${requestId}]`, error);
      auditLog({
        action: "api.error",
        requestId,
        path: new URL(request.url).pathname,
        method: request.method,
        outcome: "error",
        meta: { message: error instanceof Error ? error.message : "unknown" },
      });
      return jsonFail(
        "INTERNAL_ERROR",
        "Beklenmeyen bir hata oluştu. Sorun devam ederse destek ekibine başvurun.",
        { requestId }
      );
    }
  };
}

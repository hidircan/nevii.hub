import type { ServiceContext } from "../services/context";
import type { AuthUser } from "../auth/types";

/**
 * Build ServiceContext from verified auth user + request metadata.
 * tenantId / userId / role always come from JWT claims (AuthUser).
 */
export function buildServiceContext(
  user: AuthUser,
  request: Request,
  requestId: string
): ServiceContext {
  const channelHeader = request.headers.get("x-channel")?.toLowerCase();
  return {
    role: user.role,
    loginRole: user.loginRole,
    sid: user.sid,
    userId: user.userId,
    tenantId: user.tenantId,
    teacherId: user.teacherId,
    studentId: user.studentId,
    channel: mapChannel(channelHeader) ?? "mobile",
    requestId,
  };
}

function mapChannel(
  value?: string | null
): ServiceContext["channel"] | undefined {
  if (!value) return undefined;
  const allowed = ["web", "mobile", "chat", "whatsapp", "voice", "mcp"] as const;
  return (allowed as readonly string[]).includes(value)
    ? (value as ServiceContext["channel"])
    : undefined;
}

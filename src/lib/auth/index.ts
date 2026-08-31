export type { AppRole, AuthUser, JwtClaims, AuditEvent } from "./types";
export { APP_ROLES } from "./types";
export { issueTokenPair, verifyAccessToken, verifyRefreshToken, signToken } from "./jwt";
export { authenticateRequest } from "./authenticate";
export { hasPermission, assertPermission } from "./rbac";
export type { Permission } from "./rbac";
export { auditLog } from "./audit";
export {
  authenticateUser,
  authenticateDemoUser,
  getUserById,
  getBootstrapUsersForSeed,
  findUserByEmail,
  updatePasswordHash,
  changeOwnPassword,
} from "./users";
export { hashPassword, verifyPassword } from "./password";
export { DEFAULT_TENANT_ID, ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL } from "./config";
export { getSessionContext, requireSessionContext, homePathForRole } from "./session";
export { ACCESS_COOKIE, REFRESH_COOKIE, applyAuthCookies, clearAuthCookies } from "./cookies";
export { createPasswordResetToken, consumePasswordResetToken, isRateLimited, normalizeResetCode } from "./password-reset";

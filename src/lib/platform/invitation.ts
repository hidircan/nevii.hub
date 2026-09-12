import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { OwnerInvitationRecord, PublicOwnerInvitation } from "./types";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function generateInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function inviteTokenMatches(token: string, tokenHash: string): boolean {
  const got = Buffer.from(hashInviteToken(token), "hex");
  const expected = Buffer.from(tokenHash, "hex");
  if (got.length !== expected.length) return false;
  return timingSafeEqual(got, expected);
}

export function invitationPublicStatus(row: OwnerInvitationRecord, now = new Date()): PublicOwnerInvitation["status"] {
  if (row.revokedAt) return "revoked";
  if (row.usedAt) return "used";
  if (new Date(row.expiresAt).getTime() <= now.getTime()) return "expired";
  return "pending";
}

export function toPublicInvitation(row: OwnerInvitationRecord, now = new Date()): PublicOwnerInvitation {
  return {
    id: row.id,
    tenantId: row.tenantId,
    email: row.email,
    name: row.name,
    phone: row.phone,
    expiresAt: row.expiresAt,
    usedAt: row.usedAt,
    revokedAt: row.revokedAt,
    createdAt: row.createdAt,
    role: row.role ?? "SUPER_ADMIN",
    branchIds: row.branchIds ?? [],
    status: invitationPublicStatus(row, now),
  };
}

export function inviteExpiresAt(from = new Date(), ttlDays?: number): string {
  const ms = ttlDays ? ttlDays * 24 * 60 * 60 * 1000 : INVITE_TTL_MS;
  return new Date(from.getTime() + ms).toISOString();
}

export function buildInviteAcceptPath(inviteId: string, rawToken: string): string {
  const params = new URLSearchParams({ invite: inviteId, token: rawToken });
  return `/davet/kurum-sahibi?${params.toString()}`;
}

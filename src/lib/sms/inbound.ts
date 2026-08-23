import { createHash } from "crypto";
import { isDbMode } from "../config";
import { recordAuditLog } from "../audit/log";
import { runWithTenantAsync } from "../tenant-context";
import { applyFollowUpDelivery } from "../tahsilat/cases";
import { isSmsOptOutText, normalizeToE164 } from "./index";
import { claimSmsInboundEvent } from "./inbound-store";
import type { FollowUpAttempt } from "../tahsilat/types";

export type InboundSmsFields = {
  messageSid: string;
  from: string;
  body: string;
  messageStatus: string;
};

function phoneFingerprint(e164: string): string {
  return createHash("sha256").update(e164).digest("hex").slice(0, 12);
}

function last10(digits: string): string {
  const d = digits.replace(/\D/g, "");
  return d.slice(-10);
}

function mapDelivery(rawStatus: string): {
  status: FollowUpAttempt["status"];
  confidence: FollowUpAttempt["deliveryConfidence"];
} | null {
  if (!rawStatus) return null;
  if (rawStatus === "delivered") return { status: "delivered", confidence: "delivered" };
  if (rawStatus === "undelivered") return { status: "undelivered", confidence: "none" };
  if (rawStatus === "failed") return { status: "failed", confidence: "none" };
  if (rawStatus === "sent") return { status: "sent", confidence: "provider_accepted" };
  if (rawStatus === "queued") return { status: "queued", confidence: "none" };
  return null;
}

async function findTenantsForPhone(e164: string): Promise<Array<{ tenantId: string; studentId: string }>> {
  const needle = last10(e164);
  if (needle.length < 10) return [];
  if (isDbMode) {
    const { prisma } = await import("../db");
    const rows = await prisma.student.findMany({
      where: { parentPhone: { contains: needle } },
      select: { id: true, tenantId: true, parentPhone: true },
    });
    return rows
      .filter((r) => last10(r.parentPhone ?? "") === needle)
      .map((r) => ({ tenantId: r.tenantId, studentId: r.id }));
  }
  const { readData } = await import("../store");
  const data = await readData();
  const tenantId = data.settings.tenantId;
  return data.students
    .filter((s) => last10(s.parentPhone || "") === needle)
    .map((s) => ({ tenantId, studentId: s.id }));
}

export async function processInboundSms(fields: InboundSmsFields): Promise<{
  accepted: true;
  delivery: "applied" | "duplicate" | "none";
  optOut: "applied" | "duplicate" | "ambiguous" | "none";
}> {
  let delivery: "applied" | "duplicate" | "none" = "none";
  let optOut: "applied" | "duplicate" | "ambiguous" | "none" = "none";

  const mapped = mapDelivery(fields.messageStatus);
  if (fields.messageSid && mapped) {
    const claim = await claimSmsInboundEvent({
      providerMessageId: fields.messageSid,
      kind: `delivery:${mapped.status}`,
      processedAt: new Date().toISOString(),
    });
    if (claim === "duplicate") {
      delivery = "duplicate";
    } else {
      if (isDbMode) {
        const { prisma } = await import("../db");
        const rows = await prisma.paymentFollowUpCase.findMany();
        for (const row of rows) {
          const attempts = Array.isArray(row.attempts) ? row.attempts : [];
          const hit = (attempts as Array<{ providerMessageId?: string }>).some(
            (a) => a.providerMessageId === fields.messageSid
          );
          if (hit) {
            await applyFollowUpDelivery({
              tenantId: row.tenantId,
              providerMessageId: fields.messageSid,
              status: mapped.status,
              deliveryConfidence: mapped.confidence,
            });
            break;
          }
        }
      } else {
        const { loadAllFollowUpCasesUnlocked } = await import("../tahsilat/cases");
        const all = await loadAllFollowUpCasesUnlocked();
        const owner = all.find((c) => c.attempts?.some((a) => a.providerMessageId === fields.messageSid));
        if (owner) {
          await applyFollowUpDelivery({
            tenantId: owner.tenantId,
            providerMessageId: fields.messageSid,
            status: mapped.status,
            deliveryConfidence: mapped.confidence,
          });
        }
      }
      delivery = "applied";
    }
  }

  if (fields.from && fields.body && isSmsOptOutText(fields.body)) {
    const e164 = normalizeToE164(fields.from);
    if (e164.ok) {
      const matches = await findTenantsForPhone(e164.e164);
      const tenantIds = [...new Set(matches.map((m) => m.tenantId))];
      const claimId = fields.messageSid || `optout:${phoneFingerprint(e164.e164)}`;
      if (tenantIds.length > 1) {
        optOut = "ambiguous";
        void recordAuditLog({
          tenantId: tenantIds[0]!,
          actorUserId: "sms-webhook",
          actorRole: "system",
          action: "tahsilat.sms.opt_out_ambiguous",
          entityType: "SmsInbound",
          entityId: claimId,
          outcome: "denied",
          meta: { tenants: tenantIds.length, fp: phoneFingerprint(e164.e164) },
        });
      } else if (tenantIds.length === 1) {
        const claim = await claimSmsInboundEvent({
          providerMessageId: claimId,
          kind: "opt_out",
          tenantId: tenantIds[0],
          processedAt: new Date().toISOString(),
        });
        if (claim === "duplicate") {
          optOut = "duplicate";
        } else {
          const { updateStudentProfile } = await import("../store");
          await runWithTenantAsync(tenantIds[0]!, async () => {
            for (const m of matches.filter((x) => x.tenantId === tenantIds[0])) {
              await updateStudentProfile(m.studentId, { communicationOptOut: true });
            }
          });
          void recordAuditLog({
            tenantId: tenantIds[0]!,
            actorUserId: "sms-webhook",
            actorRole: "system",
            action: "tahsilat.sms.opt_out",
            entityType: "Student",
            entityId: matches[0]!.studentId,
            outcome: "success",
            meta: { source: "inbound_keyword", fp: phoneFingerprint(e164.e164) },
          });
          optOut = "applied";
        }
      }
    }
  }

  return { accepted: true, delivery, optOut };
}

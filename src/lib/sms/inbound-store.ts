import path from "path";
import { isDbMode, resolveDataDir } from "../config";
import { withFileLock, writeJsonFileAtomic } from "../atomic-json-file";

const FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "sms-inbound-events.json");

export type SmsInboundRecord = {
  providerMessageId: string;
  kind: string;
  tenantId?: string;
  processedAt: string;
};

async function loadAll(): Promise<SmsInboundRecord[]> {
  try {
    const fs = await import("fs/promises");
    return JSON.parse(await fs.readFile(FILE, "utf8")) as SmsInboundRecord[];
  } catch {
    return [];
  }
}

export async function claimSmsInboundEvent(rec: SmsInboundRecord): Promise<"claimed" | "duplicate"> {
  if (isDbMode) {
    const { prisma } = await import("../db");
    try {
      await prisma.smsInboundEvent.create({
        data: {
          id: `smsin_${rec.providerMessageId}_${rec.kind}`.slice(0, 190),
          providerMessageId: rec.providerMessageId,
          kind: rec.kind,
          tenantId: rec.tenantId ?? null,
          processedAt: new Date(rec.processedAt),
        },
      });
      return "claimed";
    } catch {
      return "duplicate";
    }
  }
  return withFileLock(FILE, async () => {
    const all = await loadAll();
    if (all.some((r) => r.providerMessageId === rec.providerMessageId && r.kind === rec.kind)) {
      return "duplicate";
    }
    await writeJsonFileAtomic(FILE, [...all, rec]);
    return "claimed";
  });
}

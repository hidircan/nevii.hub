/** `src/lib/sms/inbound-store.ts` ile BİREBİR AYNI desen — bkz. oradaki yorum. */
import path from "path";
import { isDbMode, resolveDataDir } from "../config";
import { withFileLock, writeJsonFileAtomic } from "../atomic-json-file";

const FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "communication-inbound-events.json");

export type CommunicationInboundRecord = {
  providerMessageId: string;
  kind: string;
  tenantId?: string;
  processedAt: string;
};

async function loadAll(): Promise<CommunicationInboundRecord[]> {
  try {
    const fs = await import("fs/promises");
    return JSON.parse(await fs.readFile(FILE, "utf8")) as CommunicationInboundRecord[];
  } catch {
    return [];
  }
}

export async function claimCommunicationInboundEvent(
  rec: CommunicationInboundRecord
): Promise<"claimed" | "duplicate"> {
  if (isDbMode) {
    const { prisma } = await import("../db");
    try {
      await prisma.communicationInboundEvent.create({
        data: {
          id: `commin_${rec.providerMessageId}_${rec.kind}`.slice(0, 190),
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

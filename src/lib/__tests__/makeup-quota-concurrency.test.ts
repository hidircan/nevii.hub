import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import * as jsonStore from "../store-json";
import * as memoryStore from "../store-memory";
import { MakeupQuotaExceededError } from "../makeup-quota";
import { DEFAULT_TENANT_ID } from "../auth/config";
import { runWithTenantAsync } from "../tenant-context";
import { clearKeyLocksForTests } from "../keyed-lock";
import type { AppData, Lesson } from "../types";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

type QuotaStore = {
  resetData: () => Promise<unknown>;
  readData: () => Promise<AppData>;
  writeData: (data: AppData) => Promise<void>;
};

async function seedThreeLessons(store: QuotaStore) {
  await store.resetData();
  const data = await store.readData();
  data.settings.monthlyMakeupAllowance = 2;
  data.makeupRequests = data.makeupRequests.filter((m) => m.studentId !== "s1");
  const now = new Date();
  const ids: string[] = [];
  for (let i = 0; i < 3; i++) {
    const id = `les_quota_${Date.now()}_${i}`;
    const startAt = new Date(now.getTime() + (i + 1) * 60000).toISOString();
    const endAt = new Date(new Date(startAt).getTime() + 45 * 60000).toISOString();
    data.lessons.push({
      id,
      studentId: "s1",
      teacherId: "t1",
      roomId: "r1",
      branchId: "erzene",
      instrument: "Piyano",
      startAt,
      endAt,
      type: "regular",
      status: "scheduled",
    } as Lesson);
    ids.push(id);
  }
  await store.writeData(data);
  const beforeMk = (await store.readData()).makeupRequests.filter((m) => m.studentId === "s1").length;
  return { ids, beforeMk };
}

beforeEach(async () => {
  clearKeyLocksForTests();
  await fs.rm(DATA_FILE, { force: true });
});

describe("makeup quota concurrency", () => {
  it("json store: concurrent creates allow at most allowance (2)", async () => {
    await runWithTenantAsync(DEFAULT_TENANT_ID, async () => {
      const { ids } = await seedThreeLessons(jsonStore);
      const results = await Promise.allSettled(
        ids.map((id) => jsonStore.markAttendance({ lessonId: id, status: "absent" }))
      );
      const final = await jsonStore.readData();
      const mkCount = final.makeupRequests.filter((m) => m.studentId === "s1").length;
      const rejected = results.filter((r) => r.status === "rejected");
      expect(mkCount).toBe(2);
      expect(results).toHaveLength(3);
      expect(rejected.length).toBeGreaterThanOrEqual(1);
      const rejectedMessages = rejected.map((r) =>
        r.status === "rejected" ? (r.reason as Error)?.message || String(r.reason) : ""
      );
      expect(rejectedMessages.join("\n")).toContain("telafi hakkını");
    });
  }, 20000);

  it("memory store: concurrent creates allow at most allowance (2) and rejected is MAKEUP_QUOTA_EXCEEDED", async () => {
    await runWithTenantAsync(DEFAULT_TENANT_ID, async () => {
      const { ids, beforeMk } = await seedThreeLessons(memoryStore);
      const results = await Promise.allSettled(
        ids.map((id) => memoryStore.markAttendance({ lessonId: id, status: "absent" }))
      );
      const rejected = results.filter((r) => r.status === "rejected");
      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const final = await memoryStore.readData();
      const mks = final.makeupRequests.filter((m) => m.studentId === "s1").length;
      expect(mks - beforeMk).toBe(2);
      expect(rejected.length).toBeGreaterThanOrEqual(1);
      const rej = rejected[0] as PromiseRejectedResult;
      expect(rej.reason).toBeInstanceOf(MakeupQuotaExceededError);
      expect((rej.reason as MakeupQuotaExceededError).code).toBe("MAKEUP_QUOTA_EXCEEDED");
      const atts = final.attendances.filter((a) => ids.includes(a.lessonId)).length;
      expect(atts).toBe(fulfilled.length);
    });
  }, 20000);
});

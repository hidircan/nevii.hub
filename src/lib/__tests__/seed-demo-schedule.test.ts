import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { differenceInCalendarDays, parseISO } from "date-fns";
import { resolveDataDir } from "../config";
import { readData } from "../store";
import { NOTIFICATIONS_FILE } from "../notifications";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");
const SCRIPT_PATH = path.join(process.cwd(), "scripts", "seed-demo-schedule.ts");
const DEMO_TAG = "demo-schedule-seed-v1";

function runSeedScript(): string {
  return execFileSync("npx", ["tsx", SCRIPT_PATH], { encoding: "utf8", env: process.env });
}

function parseSummary(output: string) {
  const match = output.match(
    /Tamamlandı\. Oluşturulan: (\d+), zaten programı olan: (\d+), uygun eşleşme bulunamayan: (\d+)\./
  );
  if (!match) throw new Error(`Beklenen özet satırı bulunamadı:\n${output}`);
  return { created: Number(match[1]), skippedHasSchedule: Number(match[2]), skippedNoMatch: Number(match[3]) };
}

describe("scripts/seed-demo-schedule.ts", () => {
  beforeEach(async () => {
    await fs.rm(DATA_FILE, { force: true });
    await fs.rm(NOTIFICATIONS_FILE, { force: true });
  });

  it(
    "ilk çalıştırmada demo etiketli seriler oluşturur, ikinci çalıştırmada idempotent şekilde 0 yeni kayıt üretir",
    () => {
      const first = parseSummary(runSeedScript());
      expect(first.created).toBeGreaterThan(0);

      const second = parseSummary(runSeedScript());
      expect(second.created).toBe(0);
      expect(second.skippedHasSchedule).toBe(first.created + first.skippedHasSchedule);
    },
    60_000
  );

  it(
    "oluşturulan seriler demoTag taşır ve bugünden en az 1 ay sonrasına uzanır",
    async () => {
      runSeedScript();
      const data = await readData();
      const demoSeries = data.lessonSeries.filter((s) => s.demoTag === DEMO_TAG);
      expect(demoSeries.length).toBeGreaterThan(0);
      for (const series of demoSeries) {
        const spanDays = differenceInCalendarDays(parseISO(series.endsOn), new Date());
        expect(spanDays).toBeGreaterThanOrEqual(30);
      }
    },
    30_000
  );
});

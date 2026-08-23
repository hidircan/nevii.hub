import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { NOTIFICATIONS_FILE } from "../notifications";
import { POST, GET } from "../../app/api/v1/teachers/contracts/reminders/tick/route";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");
const ORIGINAL_SECRET = process.env.TEACHER_CONTRACT_REMINDER_CRON_SECRET;

function req(headers?: Record<string, string>): Request {
  return new Request("http://localhost/api/v1/teachers/contracts/reminders/tick", {
    method: "POST",
    headers: headers ?? {},
  });
}

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
  await fs.rm(NOTIFICATIONS_FILE, { force: true });
});

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.TEACHER_CONTRACT_REMINDER_CRON_SECRET;
  else process.env.TEACHER_CONTRACT_REMINDER_CRON_SECRET = ORIGINAL_SECRET;
});

describe("POST /api/v1/teachers/contracts/reminders/tick — güvenlik", () => {
  it("TEACHER_CONTRACT_REMINDER_CRON_SECRET env değişkeni ayarlı DEĞİLSE her istek fail-closed reddedilir", async () => {
    delete process.env.TEACHER_CONTRACT_REMINDER_CRON_SECRET;
    const res = await POST(req({ authorization: "Bearer herhangi-bir-deger" }));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.ok).toBe(false);
  });

  it("secret ayarlıyken Authorization başlığı EKSİKSE reddedilir", async () => {
    process.env.TEACHER_CONTRACT_REMINDER_CRON_SECRET = "gercek-secret";
    const res = await POST(req());
    expect(res.status).toBe(401);
  });

  it("secret ayarlıyken YANLIŞ bir değerle reddedilir", async () => {
    process.env.TEACHER_CONTRACT_REMINDER_CRON_SECRET = "gercek-secret";
    const res = await POST(req({ authorization: "Bearer yanlis-deger" }));
    expect(res.status).toBe(401);
  });

  it("doğru secret ile çağrılırsa 200 döner ve özet alanları içerir", async () => {
    process.env.TEACHER_CONTRACT_REMINDER_CRON_SECRET = "gercek-secret";
    const res = await POST(req({ authorization: "Bearer gercek-secret" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(typeof json.data.tenantsProcessed).toBe("number");
    expect(typeof json.data.teachersEvaluated).toBe("number");
    expect(typeof json.data.remindersCreated).toBe("number");
    expect(typeof json.data.duplicatesSkipped).toBe("number");
    expect(typeof json.data.skipped).toBe("number");
    expect(typeof json.data.errors).toBe("number");
  });

  it("GET method'u desteklemez (yalnızca POST)", async () => {
    const res = await GET();
    expect(res.status).toBe(400);
  });
});

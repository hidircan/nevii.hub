import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs, readFileSync } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { createFeedbackInviteTool } from "../services/tools";
import { FEEDBACK_INVITES_FILE } from "../feedback-invites";
import { TEACHER_FEEDBACK_FILE_PATH, findTeacherFeedbackThisMonth } from "../teacher-feedback";
import { __resetRateLimitForTests } from "../rate-limit";
import { DEFAULT_TENANT_ID } from "../auth/config";
import { POST } from "../../app/api/degerlendir/[kod]/route";

/** Rapor portalı Task 6 — `/api/degerlendir/<kod>` ve öğrenci sayfaları. */
const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");
const SCORES = { clarity: 5, communication: 4, effectiveness: 5, motivation: 4, punctuality: 5 };
const call = (kod: string, body: unknown) =>
  POST(new Request(`https://x.test/api/degerlendir/${kod}`, { method: "POST", body: JSON.stringify(body), headers: { "x-real-ip": "1.2.3.4" } }), {
    params: Promise.resolve({ kod }),
  });

beforeEach(async () => {
  for (const f of [DATA_FILE, FEEDBACK_INVITES_FILE, TEACHER_FEEDBACK_FILE_PATH]) await fs.rm(f, { force: true });
  __resetRateLimitForTests();
});

describe("POST /api/degerlendir/<kod>", () => {
  it("geçersiz kod → 404, Türkçe nedenli mesaj, iç ayrıntı yok", async () => {
    const res = await call("y".repeat(43), { teacherId: "t1", scores: SCORES });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { message: string };
    expect(body.message).toMatch(/bağlantı/i);
    expect(JSON.stringify(body)).not.toMatch(/prisma|postgres|stack|Error:/i);
  });

  it("eksik puan → 400 sade Türkçe mesaj (zod ayrıntısı sızmaz)", async () => {
    const r = await createFeedbackInviteTool({ role: "SCHOOL_ADMIN", userId: "u", tenantId: DEFAULT_TENANT_ID, channel: "web" }, { studentId: "s1" });
    const kod = r.ok ? r.data.url.split("/degerlendir/")[1] : "";
    const res = await call(kod, { teacherId: "t1", scores: { clarity: 9 } });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { message: string }).message).toMatch(/puan/);
  });

  it("geçerli gönderim → 200, kayıt oluşur", async () => {
    const r = await createFeedbackInviteTool({ role: "SCHOOL_ADMIN", userId: "u", tenantId: DEFAULT_TENANT_ID, channel: "web" }, { studentId: "s1" });
    const kod = r.ok ? r.data.url.split("/degerlendir/")[1] : "";
    const res = await call(kod, { teacherId: "t1", scores: SCORES, continueWithTeacher: "yes" });
    expect(res.status).toBe(200);
    expect(await findTeacherFeedbackThisMonth(DEFAULT_TENANT_ID, "s1", "t1")).not.toBeNull();
  });
});

describe("kaynak sözleşmesi", () => {
  const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");
  it("bağlantı sayfası indekslenmez, tam okuma yok", () => {
    const src = read("src/app/degerlendir/[kod]/page.tsx");
    expect(src).toMatch(/robots: \{ index: false/);
    for (const rel of ["src/app/degerlendir/[kod]/page.tsx", "src/app/degerlendir/page.tsx", "src/app/api/degerlendir/[kod]/route.ts"]) {
      expect(read(rel)).not.toMatch(/\breadData\s*\(|\breadScopedData\s*\(/);
    }
  });
});

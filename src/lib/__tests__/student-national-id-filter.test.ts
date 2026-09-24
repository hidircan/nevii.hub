/**
 * UAT 2026-09-24 (B) — Öğrenciler listesi TC Kimlik No filtresi: tam eşleşme,
 * aynı son 2 haneyi paylaşan başka öğrenci eşleşmez, TC audit'e yazılmaz, RBAC.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { findStudentsByNationalIdTool, setNationalIdTool } from "../services/tools";
import { readData } from "../store";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");
const auditMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("../audit/log", () => ({ recordAuditLog: auditMock }));

const ctx = (o?: Partial<ServiceContext>): ServiceContext => ({
  role: "SCHOOL_ADMIN",
  userId: "u1",
  tenantId: DEFAULT_TENANT_ID,
  channel: "web",
  ...o,
});

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
  vi.clearAllMocks();
});

describe("findStudentsByNationalIdTool", () => {
  it("tam eşleşen öğrenciyi döner; aynı son 2 haneli diğer öğrenciyi döndürmez", async () => {
    const [a, b] = (await readData()).students;
    expect((await setNationalIdTool(ctx(), { entity: "student", entityId: a!.id, nationalId: "10000000146" })).ok).toBe(true);
    expect((await setNationalIdTool(ctx(), { entity: "student", entityId: b!.id, nationalId: "10000005646" })).ok).toBe(true);

    const res = await findStudentsByNationalIdTool(ctx(), { nationalId: "100 000 001 46" });
    expect(res.ok && res.data.studentIds).toEqual([a!.id]);

    const none = await findStudentsByNationalIdTool(ctx(), { nationalId: "10000000200" });
    expect(none.ok && none.data.studentIds).toEqual([]);
  });

  it("TC audit kaydına yazılmaz", async () => {
    await findStudentsByNationalIdTool(ctx(), { nationalId: "10000000146" });
    expect(JSON.stringify(auditMock.mock.calls)).not.toContain("10000000146");
  });

  it("eksik hane açık Türkçe hata verir", async () => {
    const res = await findStudentsByNationalIdTool(ctx(), { nationalId: "1234" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toContain("11 haneli");
  });

  it("öğretmen/veli TC ile arayamaz", async () => {
    const res = await findStudentsByNationalIdTool(ctx({ role: "TEACHER", teacherId: "t1" }), { nationalId: "10000000146" });
    expect(res.ok).toBe(false);
  });
});

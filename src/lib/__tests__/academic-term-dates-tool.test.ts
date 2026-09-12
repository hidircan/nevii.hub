import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { updateAcademicTermDatesTool, getFinanceSummaryTool, listStaffTool } from "../services/tools";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import { INSTITUTION_MANAGER_USER_ID, INSTITUTION_OWNER_USER_ID } from "../auth/platform-access";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

function ctx(over: Partial<ServiceContext> = {}): ServiceContext {
  return { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web", ...over };
}

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
});

describe("updateAcademicTermDatesTool", () => {
  it("öğretmen kurum dönem tarihini değiştiremez", async () => {
    const res = await updateAcademicTermDatesTool(ctx({ role: "TEACHER" }), {
      guzStart: "2026-09-15",
      guzEnd: "2027-06-15",
      yazStart: "2026-07-01",
      yazEnd: "2026-09-14",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("FORBIDDEN");
  });

  it("çakışan tarihleri alan hatasıyla reddeder", async () => {
    const res = await updateAcademicTermDatesTool(ctx(), {
      guzStart: "2026-09-01",
      guzEnd: "2027-06-30",
      yazStart: "2026-08-01",
      yazEnd: "2026-09-15",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("VALIDATION_ERROR");
      const details = res.error.details as { fieldErrors?: Record<string, string> };
      expect(details.fieldErrors?.guzStart).toMatch(/çakışamaz/);
    }
  });

  it("geçerli Eylül geçişini kaydeder", async () => {
    const res = await updateAcademicTermDatesTool(ctx(), {
      guzStart: "2026-09-15",
      guzEnd: "2027-06-15",
      yazStart: "2026-07-01",
      yazEnd: "2026-09-14",
    });
    expect(res.ok).toBe(true);
  });
});

describe("Ezgi Güçlü finans/personel özeti", () => {
  it("fail-closed reddedilir", async () => {
    const ezgi = ctx({ userId: INSTITUTION_MANAGER_USER_ID, role: "SCHOOL_ADMIN" });
    const finance = await getFinanceSummaryTool(ezgi, {});
    const staff = await listStaffTool(ezgi, {});
    expect(finance.ok).toBe(false);
    expect(staff.ok).toBe(false);
    if (!finance.ok) expect(finance.error.code).toBe("FORBIDDEN");
  });

  it("kurum sahibi (SUPER_ADMIN) kendi kurumunda görebilir", async () => {
    const owner = ctx({ userId: INSTITUTION_OWNER_USER_ID, role: "SUPER_ADMIN" });
    const finance = await getFinanceSummaryTool(owner, {});
    expect(finance.ok).toBe(true);
  });
});

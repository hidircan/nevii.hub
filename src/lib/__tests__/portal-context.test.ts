/**
 * 10. tur iş #1 — veli daveti sonrası yanlış "pasif hesap" uyarısı.
 *
 * Gerçek UAT vakası: aynı veli e-postası birden fazla öğrenciye (aktif +
 * pasif) bağlıyken portal bağlamı statik JWT `studentId`'ye kilitleniyor,
 * veli aktif öğrencisine davet edilip giriş yapsa bile "Bugün"/"Program"
 * ekranlarında "Hesabınız pasif durumda" görüyordu. Ayrıca mevcut hesaba
 * tekrar davet, şifre sıfırlamayı ZORUNLU tutuyordu.
 *
 * Bu dosya: saf seçim (`pickPortalStudent`), davet bağlama
 * (`inviteStudentPortalAccessTool`), IO'lu çözüm (`resolvePortalStudent`),
 * inceleme/onarım (`inspectPortalAccessTool`/`repairPortalAccessTool`) ve
 * mobil oturum rotası (`GET /api/v1/mobile/session`) regresyonlarını kapsar.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import { DEFAULT_TENANT_ID } from "../auth/config";
import { issueTokenPair } from "../auth/jwt";
import type { AuthUser } from "../auth/types";
import {
  provisionEntityLogin,
  getUserIdByEmail,
  getUserIdByEmailIncludingInactive,
  getPasswordHashForVerify,
  bindUserStudentIdIfEmpty,
  clearUserStudentBinding,
  setUserActive,
} from "../auth/users";
import { DYNAMIC_USERS_FILE, findDynamicUserById } from "../auth/dynamic-users";
import {
  STUDENT_PORTAL_ACCESS_FILE,
  inviteStudentPortalAccess,
  activateStudentPortalAccess,
  grantActiveStudentPortalAccess,
  revokeStudentPortalAccess,
  listAccessForUser,
  type StudentPortalAccessRecord,
} from "../student-portal-access";
import { pickPortalStudent, resolvePortalStudent } from "../portal-context";
import {
  inviteStudentPortalAccessTool,
  inspectPortalAccessTool,
  repairPortalAccessTool,
  archiveStudentTool,
} from "../services/tools";
import type { ServiceContext } from "../services/context";
import { setEmailTransportForTests, type EmailSendResult } from "../email";
import type { EmailSendInput } from "../email/types";
import { GET as getMobileSession } from "../../app/api/v1/mobile/session/route";

const T = DEFAULT_TENANT_ID;
const adminCtx: ServiceContext = { role: "SCHOOL_ADMIN", userId: "admin_round10", tenantId: T, channel: "web" };
const studentCtx = (userId: string): ServiceContext => ({ role: "STUDENT", userId, tenantId: T, channel: "web" });

const uniqueEmail = (tag: string) =>
  `round10-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;

async function grant(userId: string, studentId: string, accessType: "GUARDIAN" | "SELF" = "GUARDIAN") {
  await inviteStudentPortalAccess({ tenantId: T, userId, studentId, accessType, invitedBy: "test" });
  await activateStudentPortalAccess(T, userId, studentId);
}

function mockTransport(result: EmailSendResult, captured?: EmailSendInput[]) {
  setEmailTransportForTests({
    name: "mock",
    send: async (input) => {
      captured?.push(input);
      return result;
    },
  });
}

async function bearer(user: AuthUser): Promise<string> {
  const { accessToken } = await issueTokenPair(user);
  return `Bearer ${accessToken}`;
}

function authedGet(url: string, auth: string): Request {
  return new Request(`http://localhost${url}`, { headers: { authorization: auth } });
}

beforeEach(async () => {
  await fs.rm(STUDENT_PORTAL_ACCESS_FILE, { force: true });
  await fs.rm(DYNAMIC_USERS_FILE, { force: true });
});
afterEach(() => setEmailTransportForTests(null));

function row(studentId: string, status: "invited" | "active" | "revoked", activatedAt: string | null): StudentPortalAccessRecord {
  return {
    id: `spa_${studentId}_${status}`,
    tenantId: T,
    userId: "u_veli",
    studentId,
    accessType: "GUARDIAN",
    status,
    invitedBy: "admin",
    invitedAt: "2026-01-01T00:00:00.000Z",
    activatedAt,
    revokedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("pickPortalStudent — saf seçim", () => {
  const students = [
    { id: "s_pasif", name: "Pasif Kardeş", active: false },
    { id: "s_aktif", name: "Aktif Kardeş", active: true },
  ];

  it("UAT repro: bayat pasif tercih (stale JWT) yok sayılır, aktif kardeş seçilir", () => {
    const res = pickPortalStudent(
      [row("s_pasif", "active", "2026-01-01T00:00:00.000Z"), row("s_aktif", "active", "2026-02-01T00:00:00.000Z")],
      students,
      "s_pasif"
    );
    expect(res.status).toBe("ok");
    if (res.status !== "ok") return;
    expect(res.studentId).toBe("s_aktif");
    expect(res.siblings).toHaveLength(2);
    expect(res.siblings.find((s) => s.studentId === "s_pasif")?.active).toBe(false);
  });

  it("tercih aktif kardeşse saygı duyulur", () => {
    const res = pickPortalStudent(
      [row("s_pasif", "active", "2026-01-01T00:00:00.000Z"), row("s_aktif", "active", "2026-02-01T00:00:00.000Z")],
      students,
      "s_aktif"
    );
    expect(res.status).toBe("ok");
    if (res.status !== "ok") return;
    expect(res.studentId).toBe("s_aktif");
  });

  it("tercih yoksa en eski aktivasyonlu AKTİF öğrenci varsayılandır", () => {
    const res = pickPortalStudent(
      [row("s_pasif", "active", "2026-01-01T00:00:00.000Z"), row("s_aktif", "active", "2026-02-01T00:00:00.000Z")],
      students,
      null
    );
    expect(res.status).toBe("ok");
    if (res.status !== "ok") return;
    expect(res.studentId).toBe("s_aktif");
  });

  it("yalnızca pasif erişim varsa passive-only (veri açılmaz, kardeş listesi bilgi amaçlı)", () => {
    const res = pickPortalStudent([row("s_pasif", "active", "2026-01-01T00:00:00.000Z")], students, "s_pasif");
    expect(res.status).toBe("passive-only");
    if (res.status !== "passive-only") return;
    expect(res.siblings).toHaveLength(1);
  });

  it("kayıp/silinmiş öğrenciler kardeş listesine bile girmez", () => {
    const res = pickPortalStudent(
      [row("s_yok", "active", "2026-01-01T00:00:00.000Z")],
      [...students, { id: "s_sil", name: "Silinmiş", active: true, deletedAt: "2026-03-01T00:00:00.000Z" }],
      "s_yok"
    );
    expect(res.status).toBe("no-access");
  });

  it("invited/revoked satırlar asla seçilmez", () => {
    const res = pickPortalStudent(
      [row("s_aktif", "invited", null), row("s_pasif", "revoked", null)],
      students,
      "s_aktif"
    );
    expect(res.status).toBe("no-access");
  });
});

describe("inviteStudentPortalAccessTool — mevcut hesap bağlama", () => {
  it("yeni e-posta: normal davet akışı (invited + e-posta, linkedExistingAccount=false)", async () => {
    const captured: EmailSendInput[] = [];
    mockTransport({ delivered: true }, captured);
    const email = uniqueEmail("yeni");
    const r = await inviteStudentPortalAccessTool(adminCtx, { studentId: "s1", email, accessType: "GUARDIAN" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.linkedExistingAccount).toBe(false);
    expect(r.data.delivered).toBe(true);
    expect(captured).toHaveLength(1);
    const userId = await getUserIdByEmail(T, email);
    expect(userId).toBeTruthy();
    const rows = await listAccessForUser(T, userId!);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("invited");
  });

  it("yerleşik hesap (aktif erişimli) ikinci öğrenciye: doğrudan bağlanır, e-posta YOK, şifre değişmez", async () => {
    const captured: EmailSendInput[] = [];
    mockTransport({ delivered: true }, captured);
    const email = uniqueEmail("veli");
    // 1. öğrenci: davet + kabul (yerleşik hesap).
    const first = await inviteStudentPortalAccessTool(adminCtx, { studentId: "s1", email, accessType: "GUARDIAN" });
    expect(first.ok).toBe(true);
    const userId = await getUserIdByEmail(T, email);
    expect(userId).toBeTruthy();
    await activateStudentPortalAccess(T, userId!, "s1");
    const hashBefore = await getPasswordHashForVerify(userId!);
    captured.length = 0;
    // 2. öğrenci (kardeş): aynı e-posta.
    const second = await inviteStudentPortalAccessTool(adminCtx, { studentId: "s2", email, accessType: "GUARDIAN" });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.data.linkedExistingAccount).toBe(true);
    expect(captured).toHaveLength(0); // şifre daveti gönderilmez
    expect(await getUserIdByEmail(T, email)).toBe(userId); // kopya kullanıcı yok
    const rows = await listAccessForUser(T, userId!);
    const s2row = rows.find((r) => r.studentId === "s2");
    expect(s2row?.status).toBe("active");
    expect(await getPasswordHashForVerify(userId!)).toBe(hashBefore); // şifre değişmedi
  });

  it("hiç kabul etmemiş hesap (yalnızca invited): normal davet akışı çalışır", async () => {
    const captured: EmailSendInput[] = [];
    mockTransport({ delivered: true }, captured);
    const email = uniqueEmail("kabul-yok");
    const first = await inviteStudentPortalAccessTool(adminCtx, { studentId: "s1", email, accessType: "GUARDIAN" });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.data.linkedExistingAccount).toBe(false);
    captured.length = 0;
    // Kabul etmeden ikinci davet (aynı veya başka öğrenci) → yine davet e-postası.
    const second = await inviteStudentPortalAccessTool(adminCtx, { studentId: "s2", email, accessType: "GUARDIAN" });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.data.linkedExistingAccount).toBe(false);
    expect(captured).toHaveLength(1);
  });

  it("davet tekrarı idempotent: kopya satır oluşmaz", async () => {
    mockTransport({ delivered: true });
    const email = uniqueEmail("tekrar");
    for (let i = 0; i < 2; i++) {
      const r = await inviteStudentPortalAccessTool(adminCtx, { studentId: "s1", email, accessType: "GUARDIAN" });
      expect(r.ok).toBe(true);
    }
    const userId = await getUserIdByEmail(T, email);
    const rows = await listAccessForUser(T, userId!);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("invited");
  });

  it("revoke sonrası yeniden davet satırı tekrar invited yapar (kabul edilebilir)", async () => {
    mockTransport({ delivered: true });
    const email = uniqueEmail("revoke");
    const first = await inviteStudentPortalAccessTool(adminCtx, { studentId: "s1", email, accessType: "GUARDIAN" });
    expect(first.ok).toBe(true);
    const userId = await getUserIdByEmail(T, email);
    await revokeStudentPortalAccess(T, userId!, "s1");
    const resend = await inviteStudentPortalAccessTool(adminCtx, { studentId: "s1", email, accessType: "GUARDIAN" });
    expect(resend.ok).toBe(true);
    const rows = await listAccessForUser(T, userId!);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("invited");
    // Kabul yolu artık çalışır.
    const activated = await activateStudentPortalAccess(T, userId!, "s1");
    expect(activated?.status).toBe("active");
  });

  it("kapalı hesaba davet: net hata, kopya kullanıcı yok", async () => {
    mockTransport({ delivered: true });
    const email = uniqueEmail("kapali");
    const created = await provisionEntityLogin({ tenantId: T, email, role: "STUDENT" });
    expect(created).not.toBeNull();
    expect(await setUserActive(created!.userId, false)).toBe(true);
    const r = await inviteStudentPortalAccessTool(adminCtx, { studentId: "s1", email, accessType: "GUARDIAN" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("VALIDATION_ERROR");
    expect(r.error.message).toMatch(/kapalı/);
    // Kopya oluşmadı: kayıtsız e-posta gibi davranılmadı (hâlâ tek kullanıcı, o da kapalı).
    expect(await getUserIdByEmailIncludingInactive(T, email)).toBe(created!.userId);
    expect(await getUserIdByEmail(T, email)).toBeNull();
  });

  it("aynı e-posta farklı rolde (öğretmen): davet engellenir", async () => {
    const r = await inviteStudentPortalAccessTool(adminCtx, {
      studentId: "s1",
      email: "turgay.hosbas@niluferacar.com.tr",
      accessType: "GUARDIAN",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("VALIDATION_ERROR");
  });

  it("SELF ikinci öğrenci: mevcut studentId bağlaması üzerine YAZILMAZ", async () => {
    mockTransport({ delivered: true });
    const email = uniqueEmail("self2");
    const created = await provisionEntityLogin({ tenantId: T, email, role: "STUDENT", studentId: "s1" });
    expect(created).not.toBeNull();
    await grantActiveStudentPortalAccess({
      tenantId: T,
      userId: created!.userId,
      studentId: "s1",
      accessType: "SELF",
      invitedBy: "test",
    });
    const r = await inviteStudentPortalAccessTool(adminCtx, { studentId: "s2", email, accessType: "SELF" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.linkedExistingAccount).toBe(true);
    const dyn = await findDynamicUserById(created!.userId);
    expect(dyn?.studentId).toBe("s1"); // ilk bağ korundu
    const rows = await listAccessForUser(T, created!.userId);
    expect(rows.find((x) => x.studentId === "s2")?.status).toBe("active");
  });

  it("farklı tenant aynı e-posta: ayrı hesap (tenant izolasyonu)", async () => {
    const email = uniqueEmail("tenant");
    const a = await provisionEntityLogin({ tenantId: T, email, role: "STUDENT" });
    const b = await provisionEntityLogin({ tenantId: "tenant_b_test", email, role: "STUDENT" });
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a!.userId).not.toBe(b!.userId);
    expect(await getUserIdByEmail("tenant_b_test", email)).toBe(b!.userId);
  });
});

describe("resolvePortalStudent — IO'lu çözüm (web+mobil ortak)", () => {
  it("aktif kardeşler: bayat tercih yok sayılır, deterministik aktif varsayılan", async () => {
    await grant("u_cozum", "s1", "GUARDIAN");
    await grant("u_cozum", "s2", "GUARDIAN");
    const res = await resolvePortalStudent(T, "u_cozum", "s_yok");
    expect(res.status).toBe("ok");
    if (res.status !== "ok") return;
    expect(["s1", "s2"]).toContain(res.studentId);
    expect(res.siblings).toHaveLength(2);
  });

  it("aktif+pasif kardeş: pasif tercih aktif olana düşer; tek-pasif pasif-dışı kalır", async () => {
    const archived = await archiveStudentTool(adminCtx, { studentId: "s3", archived: true });
    expect(archived.ok).toBe(true);
    try {
      await grant("u_karisik", "s3", "GUARDIAN");
      await grant("u_karisik", "s1", "GUARDIAN");
      const mixed = await resolvePortalStudent(T, "u_karisik", "s3");
      expect(mixed.status).toBe("ok");
      if (mixed.status !== "ok") return;
      expect(mixed.studentId).toBe("s1");

      await grant("u_teknpasif", "s3", "GUARDIAN");
      const passiveOnly = await resolvePortalStudent(T, "u_teknpasif", "s3");
      expect(passiveOnly.status).toBe("passive-only");
    } finally {
      await archiveStudentTool(adminCtx, { studentId: "s3", archived: false });
    }
  });

  it("erişim yoksa no-access", async () => {
    const res = await resolvePortalStudent(T, "u_hicbiri", "s1");
    expect(res.status).toBe("no-access");
  });
});

describe("inspect/repair — güvenli, idempotent onarım", () => {
  it("yetim erişim bulunur, tek hedefle revoke edilir, ikinci çalış idempotent", async () => {
    await inviteStudentPortalAccess({
      tenantId: T,
      userId: "user_hayalet_1",
      studentId: "s1",
      accessType: "GUARDIAN",
      invitedBy: "test",
    });
    const before = await inspectPortalAccessTool(adminCtx, { studentId: "s1" });
    expect(before.ok).toBe(true);
    if (!before.ok) return;
    expect(before.data.findings.some((f) => f.kind === "orphan_access" && f.userId === "user_hayalet_1")).toBe(true);

    const repaired = await repairPortalAccessTool(adminCtx, {
      action: "revoke_orphan_access",
      userId: "user_hayalet_1",
      studentId: "s1",
    });
    expect(repaired.ok).toBe(true);
    if (!repaired.ok) return;
    expect(repaired.data.repaired).toBe(true);

    const again = await repairPortalAccessTool(adminCtx, {
      action: "revoke_orphan_access",
      userId: "user_hayalet_1",
      studentId: "s1",
    });
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.data.repaired).toBe(false);

    const after = await inspectPortalAccessTool(adminCtx, { studentId: "s1" });
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    expect(after.data.findings.some((f) => f.kind === "orphan_access")).toBe(false);
  });

  it("onarım fail-closed: User mevcutsa yetim revoke YAPILMAZ", async () => {
    const email = uniqueEmail("yetim-degil");
    const created = await provisionEntityLogin({ tenantId: T, email, role: "STUDENT" });
    await grant(created!.userId, "s1", "GUARDIAN");
    const r = await repairPortalAccessTool(adminCtx, {
      action: "revoke_orphan_access",
      userId: created!.userId,
      studentId: "s1",
    });
    expect(r.ok).toBe(false);
  });

  it("bayat bağ (kayıp öğrenci + başka aktif erişim): bulunur ve temizlenir", async () => {
    const email = uniqueEmail("bayat");
    const created = await provisionEntityLogin({ tenantId: T, email, role: "STUDENT", studentId: "s_kayip" });
    await grant(created!.userId, "s1", "GUARDIAN");
    const found = await inspectPortalAccessTool(adminCtx, { email });
    expect(found.ok).toBe(true);
    if (!found.ok) return;
    expect(found.data.findings.some((f) => f.kind === "stale_student_binding")).toBe(true);

    const r = await repairPortalAccessTool(adminCtx, { action: "clear_stale_student_binding", userId: created!.userId });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.repaired).toBe(true);
    expect((await findDynamicUserById(created!.userId))?.studentId).toBeNull();
  });

  it("gerçek pasif durum bayat sayılmaz ve temizlenmez", async () => {
    const archived = await archiveStudentTool(adminCtx, { studentId: "s4", archived: true });
    expect(archived.ok).toBe(true);
    try {
      const email = uniqueEmail("gercek-pasif");
      const created = await provisionEntityLogin({ tenantId: T, email, role: "STUDENT", studentId: "s4" });
      await grant(created!.userId, "s4", "SELF");
      const found = await inspectPortalAccessTool(adminCtx, { email });
      expect(found.ok).toBe(true);
      if (!found.ok) return;
      expect(found.data.findings.some((f) => f.kind === "stale_student_binding")).toBe(false);
      const r = await repairPortalAccessTool(adminCtx, {
        action: "clear_stale_student_binding",
        userId: created!.userId,
      });
      expect(r.ok).toBe(false);
    } finally {
      await archiveStudentTool(adminCtx, { studentId: "s4", archived: false });
    }
  });

  it("RBAC: öğrenci rolü inceleme/onarım yapamaz", async () => {
    const ctx = studentCtx("u_ogr");
    expect((await inspectPortalAccessTool(ctx, {})).ok).toBe(false);
    expect(
      (await repairPortalAccessTool(ctx, { action: "revoke_orphan_access", userId: "x", studentId: "s1" })).ok
    ).toBe(false);
  });
});

describe("kullanıcı bağlama yardımcıları", () => {
  it("includingInactive kapalı hesabı bulur; bind boşken doldurur, doluyken korur; clear temizler", async () => {
    const email = uniqueEmail("yardimci");
    const created = await provisionEntityLogin({ tenantId: T, email, role: "STUDENT" });
    expect(await bindUserStudentIdIfEmpty(created!.userId, "s1")).toBe("set");
    expect(await bindUserStudentIdIfEmpty(created!.userId, "s2")).toBe("already-set");
    expect((await findDynamicUserById(created!.userId))?.studentId).toBe("s1");
    expect(await clearUserStudentBinding(created!.userId)).toBe(true);
    expect((await findDynamicUserById(created!.userId))?.studentId).toBeNull();
    expect(await setUserActive(created!.userId, false)).toBe(true);
    expect(await getUserIdByEmailIncludingInactive(T, email)).toBe(created!.userId);
  });

  it("bootstrap (sistem) hesabında bağ temizliği desteklenmez", async () => {
    expect(await clearUserStudentBinding("user_student_s1")).toBe(false);
  });
});

describe("GET /api/v1/mobile/session — aktif bağlam + kardeşler", () => {
  it("veli: pasif JWT tercihi aktif kardeşe düşer, students listesi döner", async () => {
    const archived = await archiveStudentTool(adminCtx, { studentId: "s3", archived: true });
    expect(archived.ok).toBe(true);
    try {
      const email = uniqueEmail("mobil");
      const created = await provisionEntityLogin({ tenantId: T, email, role: "STUDENT", studentId: "s3" });
      await grant(created!.userId, "s3", "GUARDIAN");
      await grant(created!.userId, "s1", "GUARDIAN");
      const auth = await bearer({
        userId: created!.userId,
        email,
        role: "STUDENT",
        tenantId: T,
        studentId: "s3",
      });
      const res = await getMobileSession(authedGet("/api/v1/mobile/session", auth));
      const json = (await res.json()) as {
        ok: boolean;
        data?: { studentId?: string; portalAccessType?: string | null; portalStatus?: string; students?: unknown[] };
      };
      expect(json.ok).toBe(true);
      expect(json.data?.studentId).toBe("s1");
      expect(json.data?.portalAccessType).toBe("GUARDIAN");
      expect(json.data?.portalStatus).toBe("ok");
      expect(json.data?.students).toHaveLength(2);
    } finally {
      await archiveStudentTool(adminCtx, { studentId: "s3", archived: false });
    }
  });

  it("?studentId= tercihi yetkisiz/pasifse yok sayılır", async () => {
    const email = uniqueEmail("mobil2");
    const created = await provisionEntityLogin({ tenantId: T, email, role: "STUDENT" });
    await grant(created!.userId, "s1", "GUARDIAN");
    const auth = await bearer({ userId: created!.userId, email, role: "STUDENT", tenantId: T });
    const res = await getMobileSession(authedGet("/api/v1/mobile/session?studentId=s2", auth));
    const json = (await res.json()) as { ok: boolean; data?: { studentId?: string } };
    expect(json.ok).toBe(true);
    expect(json.data?.studentId).toBe("s1"); // s2 erişimi yok → varsayılan
  });
});

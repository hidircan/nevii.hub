/**
 * 10. tur iş #2 — davet e-postası logosu (CID eki + metin geri dönüşü) ve
 * kurum bazlı e-posta şablonları (taslak/yayımla/sürüm/önizleme/test).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import { setEmailTransportForTests } from "../email";
import type { EmailSendInput } from "../email/types";
import {
  INSTITUTION_LOGO_CID,
  institutionLogoEmailBlock,
  parseLogoDataUri,
} from "../institution-logo";
import { EMAIL_TEMPLATES_FILE } from "../email-templates/store";
import { getDefaultEmailTemplate } from "../email-templates/defaults";
import {
  getEmailTemplateTool,
  listEmailTemplatesTool,
  previewEmailTemplateTool,
  publishEmailTemplateTool,
  resetEmailTemplateTool,
  saveEmailTemplateDraftTool,
  sendEmailTemplateTestTool,
} from "../email-templates/tools";
import { validateTemplateFields } from "../email-templates/engine";
import { sendAccountInvitationEmail, sendPasswordResetEmail } from "../auth/invitation";
import { findUserByEmail, provisionEntityLogin } from "../auth/users";

const T = DEFAULT_TENANT_ID;
const adminCtx: ServiceContext = { role: "SCHOOL_ADMIN", userId: "admin_tpl", tenantId: T, channel: "web" };
const studentCtx: ServiceContext = { role: "STUDENT", userId: "u_tpl", tenantId: T, channel: "web" };

const FAKE_LOGO =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

beforeEach(async () => {
  await fs.rm(EMAIL_TEMPLATES_FILE, { force: true });
});
afterEach(() => setEmailTransportForTests(null));

describe("institutionLogoEmailBlock — e-posta logosu", () => {
  it("data-URI: CID <img> + ek üretilir, data-URI HTML'e gömülmez", () => {
    const block = institutionLogoEmailBlock(FAKE_LOGO, "Örnek Kurs");
    expect(block.html).toContain("<img");
    expect(block.html).toContain(`cid:${INSTITUTION_LOGO_CID}`);
    expect(block.html).not.toContain("data:image/png;base64");
    expect(block.attachment).not.toBeNull();
    expect(block.attachment!.contentType).toBe("image/png");
    expect(block.attachment!.filename).toBe("kurum-logo.png");
    expect(block.attachment!.contentBase64).toContain("iVBORw0KGgo");
  });

  it("mutlak https: doğrudan <img>, ek yok", () => {
    const block = institutionLogoEmailBlock("https://okul.example/logo.png", "Örnek Kurs");
    expect(block.html).toContain("<img");
    expect(block.html).toContain("https://okul.example/logo.png");
    expect(block.attachment).toBeNull();
  });

  it.each([
    ["göreli URL", "/uploads/logo.png"],
    ["http (güvensiz)", "http://okul.example/logo.png"],
    ["geçersiz", "javascript:alert(1)"],
    ["boş", ""],
    ["yok", null],
  ])("%s: kırık görsel DEĞİL temiz kurum-adı metni", (_label, logo) => {
    const block = institutionLogoEmailBlock(logo as string | null, "Örnek Kurs");
    expect(block.html).not.toContain("<img");
    expect(block.html).not.toContain("logo.png");
    expect(block.html).toContain("Örnek Kurs");
    expect(block.attachment).toBeNull();
  });

  it("görseller engelliyse alt metin kurum adını gösterir", () => {
    const block = institutionLogoEmailBlock(FAKE_LOGO, "Örnek Kurs <Test>");
    expect(block.html).toContain('alt="Örnek Kurs &lt;Test&gt;"');
  });

  it("devasa/bozuk data-URI metin geri dönüşüne düşer", () => {
    expect(parseLogoDataUri("data:image/svg+xml;base64,AAAA")).toBeNull();
    const huge = `data:image/png;base64,${"A".repeat(1_200_000)}`;
    expect(parseLogoDataUri(huge)).toBeNull();
    expect(institutionLogoEmailBlock(huge, "Örnek Kurs").html).not.toContain("<img");
  });
});

describe("şablon doğrulama", () => {
  it("bilinmeyen yer tutucu taslağı da engeller", () => {
    const d = getDefaultEmailTemplate("parent_invite", "tr");
    const v = validateTemplateFields("parent_invite", { ...d, preheader: "", signatureHtml: "", bodyHtml: "<p>{{bilinmeyen_alan}}</p>{{davet_butonu}}" }, false);
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.errors.join(" ")).toContain("bilinmeyen_alan");
  });

  it("zorunlu alan (davet düğmesi) yoksa yayımlanamaz ama taslak kaydedilir", async () => {
    const d = getDefaultEmailTemplate("parent_invite", "tr");
    const fields = { ...d, preheader: "", signatureHtml: "", bodyHtml: "<p>Düğmesiz gövde</p>" };
    const strict = validateTemplateFields("parent_invite", fields, true);
    expect(strict.ok).toBe(false);
    const loose = validateTemplateFields("parent_invite", fields, false);
    expect(loose.ok).toBe(true);
    const saved = await saveEmailTemplateDraftTool(adminCtx, { key: "parent_invite", locale: "tr", fields });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    const pub = await publishEmailTemplateTool(adminCtx, { key: "parent_invite", locale: "tr", version: saved.data.version });
    expect(pub.ok).toBe(false);
  });

  it("zararlı HTML kayıt sırasında temizlenir", async () => {
    const d = getDefaultEmailTemplate("parent_invite", "tr");
    const saved = await saveEmailTemplateDraftTool(adminCtx, {
      key: "parent_invite",
      locale: "tr",
      fields: { ...d, preheader: "", signatureHtml: "", bodyHtml: `<p>Merhaba</p><script>alert(1)</script><a href="javascript:alert(1)">tıkla</a>{{davet_butonu}}` },
    });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    const detail = await getEmailTemplateTool(adminCtx, { key: "parent_invite", locale: "tr" });
    expect(detail.ok).toBe(true);
    if (!detail.ok) return;
    expect(detail.data.fields.bodyHtml).not.toContain("<script");
    expect(detail.data.fields.bodyHtml).not.toContain("javascript:");
    expect(detail.data.fields.bodyHtml).toContain("{{davet_butonu}}");
  });
});

describe("taslak → yayımla → sürüm → varsayılana dön", () => {
  const fieldsFor = (subject: string) => {
    const d = getDefaultEmailTemplate("teacher_invite", "tr");
    return { ...d, preheader: "", signatureHtml: "", subject };
  };

  it("akış: kaydet → yayımla → yeni taslak → yayımlanan korunur → varsayılana dön", async () => {
    const v1 = await saveEmailTemplateDraftTool(adminCtx, { key: "teacher_invite", locale: "tr", fields: fieldsFor("Özel konu v1") });
    expect(v1.ok).toBe(true);
    if (!v1.ok) return;
    expect(v1.data.version).toBe(1);
    const pub = await publishEmailTemplateTool(adminCtx, { key: "teacher_invite", locale: "tr", version: 1 });
    expect(pub.ok).toBe(true);

    const list = await listEmailTemplatesTool(adminCtx, { locale: "tr" });
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    expect(list.data.templates.find((t) => t.key === "teacher_invite")?.publishedVersion).toBe(1);

    const v2 = await saveEmailTemplateDraftTool(adminCtx, { key: "teacher_invite", locale: "tr", fields: fieldsFor("Özel konu v2") });
    expect(v2.ok).toBe(true);
    if (!v2.ok) return;
    expect(v2.data.version).toBe(2);

    // Yayımlanmamış taslak üretimi etkilemez.
    const preview = await previewEmailTemplateTool(adminCtx, { key: "teacher_invite", locale: "tr" });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.data.subject).toContain("Özel konu v1");
    expect(preview.data.customized).toBe(true);

    const reset = await resetEmailTemplateTool(adminCtx, { key: "teacher_invite", locale: "tr" });
    expect(reset.ok).toBe(true);
    if (!reset.ok) return;
    expect(reset.data.archivedCount).toBe(2);

    const after = await previewEmailTemplateTool(adminCtx, { key: "teacher_invite", locale: "tr" });
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    expect(after.data.customized).toBe(false);
    expect(after.data.subject).toContain("Ekibimize Hoş Geldiniz");

    // Geçmiş korunur.
    const detail = await getEmailTemplateTool(adminCtx, { key: "teacher_invite", locale: "tr" });
    expect(detail.ok).toBe(true);
    if (!detail.ok) return;
    expect(detail.data.versions).toHaveLength(2);
    expect(detail.data.source).toBe("default");
  });

  it("yayımlanan özel şablon GERÇEK davet gönderiminde kullanılır", async () => {
    const captured: EmailSendInput[] = [];
    setEmailTransportForTests({ name: "mock", async send(input) { captured.push(input); return { delivered: true }; } });
    const d = getDefaultEmailTemplate("parent_invite", "tr");
    const saved = await saveEmailTemplateDraftTool(adminCtx, {
      key: "parent_invite",
      locale: "tr",
      fields: { ...d, preheader: "", signatureHtml: "", subject: "KURUMUMUZUN ÖZEL DAVET KONUSU", bodyHtml: `<p>Özel gövde</p>{{davet_butonu}}` },
    });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect((await publishEmailTemplateTool(adminCtx, { key: "parent_invite", locale: "tr", version: saved.data.version })).ok).toBe(true);

    const user = await findUserByEmail("turgay.hosbas@niluferacar.com.tr");
    expect(user).not.toBeNull();
    if (!user) return;
    await sendAccountInvitationEmail({
      tenantId: user.tenantId,
      userId: user.userId,
      email: "veli@example.com",
      recipientName: "Veli",
      institutionName: "Test Kurumu",
      role: "STUDENT",
      portalAccessType: "GUARDIAN",
    });
    expect(captured).toHaveLength(1);
    expect(captured[0]!.subject).toBe("KURUMUMUZUN ÖZEL DAVET KONUSU");
    expect(captured[0]!.html).toContain("Özel gövde");
    expect(captured[0]!.html).toContain("/hesap-aktivasyon?token=");
  });

  it("şifre sıfırlamada özel şablon + kod korunur", async () => {
    const captured: EmailSendInput[] = [];
    setEmailTransportForTests({ name: "mock", async send(input) { captured.push(input); return { delivered: true }; } });
    const d = getDefaultEmailTemplate("password_reset", "tr");
    const saved = await saveEmailTemplateDraftTool(adminCtx, {
      key: "password_reset",
      locale: "tr",
      fields: { ...d, preheader: "", signatureHtml: "", subject: "ÖZEL SIFIRLAMA KONUSU", bodyHtml: `<p>Özel sıfırlama</p>{{sifirlama_butonu}}{{sifirlama_kodu}}` },
    });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    await publishEmailTemplateTool(adminCtx, { key: "password_reset", locale: "tr", version: saved.data.version });
    const user = await findUserByEmail("turgay.hosbas@niluferacar.com.tr");
    if (!user) return;
    await sendPasswordResetEmail({
      tenantId: user.tenantId,
      userId: user.userId,
      email: "turgay.hosbas@niluferacar.com.tr",
      recipientName: "Turgay Hoşbaş",
      institutionName: "Test Kurumu",
      rawToken: "AB12CD34",
    });
    expect(captured).toHaveLength(1);
    expect(captured[0]!.subject).toBe("ÖZEL SIFIRLAMA KONUSU");
    expect(captured[0]!.html).toContain("AB12CD34");
    expect(captured[0]!.html).toContain("/sifre-sifirla?token=");
  });
});

describe("önizleme, test e-postası, RBAC, izolasyon", () => {
  it("test e-postası YALNIZCA işlemi yapan adminin kendi adresine gider", async () => {
    const captured: EmailSendInput[] = [];
    setEmailTransportForTests({ name: "mock", async send(input) { captured.push(input); return { delivered: true }; } });
    const email = `tpl-admin-${Date.now()}@example.com`;
    const created = await provisionEntityLogin({ tenantId: T, email, role: "STUDENT" });
    expect(created).not.toBeNull();
    // Admin rolüyle ama STUDENT kaydıyla: getUserById e-postayı döndürür.
    const ctx: ServiceContext = { role: "SCHOOL_ADMIN", userId: created!.userId, tenantId: T, channel: "web" };
    const r = await sendEmailTemplateTestTool(ctx, { key: "parent_invite", locale: "tr" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.to).toBe(email);
    expect(captured).toHaveLength(1);
    expect(captured[0]!.to).toBe(email);
    expect(captured[0]!.subject.startsWith("[TEST]")).toBe(true);
  });

  it("RBAC: öğrenci şablonları yönetemez", async () => {
    const d = getDefaultEmailTemplate("parent_invite", "tr");
    expect((await listEmailTemplatesTool(studentCtx, { locale: "tr" })).ok).toBe(false);
    expect((await getEmailTemplateTool(studentCtx, { key: "parent_invite", locale: "tr" })).ok).toBe(false);
    expect(
      (await saveEmailTemplateDraftTool(studentCtx, { key: "parent_invite", locale: "tr", fields: { ...d, preheader: "", signatureHtml: "" } })).ok
    ).toBe(false);
    expect((await publishEmailTemplateTool(studentCtx, { key: "parent_invite", locale: "tr", version: 1 })).ok).toBe(false);
    expect((await resetEmailTemplateTool(studentCtx, { key: "parent_invite", locale: "tr" })).ok).toBe(false);
    expect((await previewEmailTemplateTool(studentCtx, { key: "parent_invite", locale: "tr" })).ok).toBe(false);
    expect((await sendEmailTemplateTestTool(studentCtx, { key: "parent_invite", locale: "tr" })).ok).toBe(false);
  });

  it("tenant izolasyonu: A kurumunun şablonu B kurumuna sızmaz", async () => {
    const d = getDefaultEmailTemplate("parent_invite", "tr");
    const ctxB: ServiceContext = { role: "SCHOOL_ADMIN", userId: "admin_b", tenantId: "tenant_b_tpl", channel: "web" };
    const saved = await saveEmailTemplateDraftTool(ctxB, {
      key: "parent_invite",
      locale: "tr",
      fields: { ...d, preheader: "", signatureHtml: "", subject: "B KURUMU ÖZEL" },
    });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    await publishEmailTemplateTool(ctxB, { key: "parent_invite", locale: "tr", version: saved.data.version });
    const previewA = await previewEmailTemplateTool(adminCtx, { key: "parent_invite", locale: "tr" });
    expect(previewA.ok).toBe(true);
    if (!previewA.ok) return;
    expect(previewA.data.customized).toBe(false);
    const previewB = await previewEmailTemplateTool(ctxB, { key: "parent_invite", locale: "tr" });
    expect(previewB.ok).toBe(true);
    if (!previewB.ok) return;
    expect(previewB.data.customized).toBe(true);
    expect(previewB.data.subject).toBe("B KURUMU ÖZEL");
  });

  it("şifre sıfırlamada EN varsayılan İngilizce üretilir; davette EN TR'ye düşer", async () => {
    const enReset = await previewEmailTemplateTool(adminCtx, { key: "password_reset", locale: "en" });
    expect(enReset.ok).toBe(true);
    if (!enReset.ok) return;
    expect(enReset.data.subject).toContain("Reset your password");
    const enInvite = await previewEmailTemplateTool(adminCtx, { key: "parent_invite", locale: "en" });
    expect(enInvite.ok).toBe(true);
    if (!enInvite.ok) return;
    expect(enInvite.data.subject).toContain("Hoş Geldiniz");
  });
});

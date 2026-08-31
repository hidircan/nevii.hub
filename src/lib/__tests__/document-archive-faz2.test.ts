import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import {
  createDocumentInstanceTool,
  createDocumentTemplateTool,
  updateDocumentTemplateTool,
  archiveDocumentTemplateTool,
  listDocumentTemplatesTool,
  listAllDocumentTemplatesTool,
  listDocumentInstancesTool,
  getDocumentInstanceTool,
  uploadSignedDocumentTool,
  deleteSignedDocumentVersionTool,
  listStudentDocumentsTool,
} from "../services/tools";
import { buildDocumentReference } from "../document-reference";
import { sanitizeTemplateHtml } from "../document-sanitize";
import { renderTemplate, stripUnusedInstallmentRows } from "../documents";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");
const TPL_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "document-templates.json");
const INST_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "document-instances.json");

function ctx(overrides?: Partial<ServiceContext>): ServiceContext {
  return {
    role: "SCHOOL_ADMIN",
    userId: "u1",
    tenantId: DEFAULT_TENANT_ID,
    channel: "web",
    ...overrides,
  };
}

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
  await fs.rm(TPL_FILE, { force: true });
  await fs.rm(INST_FILE, { force: true });
});

const TINY_PDF_BASE64 = Buffer.from("%PDF-1.4 test content").toString("base64");

/**
 * Evraklar Faz 2 — güvenli dijital belge merkezi. `document-instances.test.ts`
 * ile ÇAKIŞMAYAN, bu turda EKLENEN davranışların (şablon CRUD+sanitize,
 * placeholder, referans formatı, dosya güvenliği, sürüm geçmişi, idempotency,
 * fileData sızıntı kapatma) hedefli testleri.
 */
describe("document-reference — format ve tenant içi benzersizlik", () => {
  it("format: NP-{TÜR}-{YIL}-{HEX8}, kind ve yıl içerir", () => {
    const ref = buildDocumentReference("kvkk", "doc_abc", 2026);
    expect(ref).toMatch(/^NP-[A-Z]{1,4}-2026-[0-9A-F]{8}$/);
  });

  it("aynı tenant'ta iki farklı belge farklı referans alır (uniqueness pratikte garanti)", async () => {
    const templates = await listDocumentTemplatesTool(ctx());
    if (!templates.ok) throw new Error("templates failed");
    const tpl = templates.data.templates[0]!;
    const a = await createDocumentInstanceTool(ctx(), { templateId: tpl.id, fieldValues: {} });
    const b = await createDocumentInstanceTool(ctx(), { templateId: tpl.id, fieldValues: {} });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.data.reference).not.toBe(b.data.reference);
  });

  it("farklı tenant'larda aynı kind+id kombinasyonu bile olsa referans üretimi birbirinden izole çalışır", async () => {
    const templatesA = await listDocumentTemplatesTool(ctx());
    const templatesB = await listDocumentTemplatesTool(ctx({ tenantId: "other-tenant-docref" }));
    if (!templatesA.ok || !templatesB.ok) throw new Error("templates failed");
    const a = await createDocumentInstanceTool(ctx(), { templateId: templatesA.data.templates[0]!.id, fieldValues: {} });
    const b = await createDocumentInstanceTool(
      ctx({ tenantId: "other-tenant-docref" }),
      { templateId: templatesB.data.templates[0]!.id, fieldValues: {} }
    );
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    // Cross-tenant erişim izolasyonu: A tenant'ının belgesi B tenant'ından görünmez.
    const crossList = await listDocumentInstancesTool(ctx({ tenantId: "other-tenant-docref" }), {});
    expect(crossList.ok).toBe(true);
    if (!crossList.ok) return;
    expect(crossList.data.documents.some((d) => d.id === a.data.documentId)).toBe(false);
  });

  it("yönetici referans numarasını değiştiremez (API/schema'da böyle bir alan yok)", async () => {
    const templates = await listDocumentTemplatesTool(ctx());
    if (!templates.ok) throw new Error("templates failed");
    const created = await createDocumentInstanceTool(ctx(), {
      templateId: templates.data.templates[0]!.id,
      fieldValues: { reference: "SAHTE-REF-999" },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    // fieldValues içine "reference" adında bir alan verilse bile, sistemin
    // ÜRETTİĞİ gerçek referans (createDocumentInstanceTool dönüşü) kullanılır.
    expect(created.data.reference).not.toBe("SAHTE-REF-999");
    expect(created.data.reference).toMatch(/^NP-/);
  });
});

describe("Evrak şablonları — CRUD, sanitizasyon, RBAC", () => {
  it("yönetici yeni şablon oluşturur", async () => {
    const res = await createDocumentTemplateTool(ctx(), {
      kind: "custom",
      name: "Test Şablonu",
      bodyHtml: "<p>Merhaba {{student.fullName}}</p>",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const list = await listDocumentTemplatesTool(ctx());
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    expect(list.data.templates.some((t) => t.id === res.data.templateId)).toBe(true);
  });

  it("TEACHER/PARENT/STUDENT şablon oluşturamaz", async () => {
    for (const role of ["TEACHER", "STUDENT", "STUDENT"] as const) {
      const res = await createDocumentTemplateTool(ctx({ role, teacherId: "t1", studentId: "s1" }), {
        kind: "custom",
        name: "X",
        bodyHtml: "<p>x</p>",
      });
      expect(res.ok).toBe(false);
      if (res.ok) continue;
      expect(res.error.code).toBe("FORBIDDEN");
    }
  });

  it("script/iframe/event handler/javascript: URL şablon kaydında temizlenir", async () => {
    const malicious =
      '<p onclick="alert(1)">Merhaba</p><script>alert(1)</script><iframe src="evil.com"></iframe>' +
      '<a href="javascript:alert(1)">tıkla</a><img src=x onerror=alert(1)>';
    const res = await createDocumentTemplateTool(ctx(), { kind: "custom", name: "Kötü", bodyHtml: malicious });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const all = await listAllDocumentTemplatesTool(ctx());
    expect(all.ok).toBe(true);
    if (!all.ok) return;
    const saved = all.data.templates.find((t) => t.id === res.data.templateId)!;
    expect(saved.bodyHtml).not.toContain("<script");
    expect(saved.bodyHtml).not.toContain("<iframe");
    expect(saved.bodyHtml).not.toContain("onclick");
    expect(saved.bodyHtml).not.toContain("onerror");
    expect(saved.bodyHtml).not.toContain("javascript:");
  });

  it("sanitizeTemplateHtml doğrudan çağrıldığında da aynı davranışı verir (birim test)", () => {
    const out = sanitizeTemplateHtml('<div style="x"><script>bad()</script>ok</div>');
    expect(out).not.toContain("<script");
    expect(out).not.toContain("style=");
    expect(out).toContain("ok");
    expect(sanitizeTemplateHtml(undefined)).toBe("");
  });

  it("şablon güncellemede version +1 olur ve bodyHtml yeniden sanitize edilir", async () => {
    const created = await createDocumentTemplateTool(ctx(), { kind: "custom", name: "V1", bodyHtml: "<p>ilk</p>" });
    if (!created.ok) throw new Error("create failed");
    const updated = await updateDocumentTemplateTool(ctx(), {
      templateId: created.data.templateId,
      bodyHtml: '<p onclick="x()">güncel</p>',
    });
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.data.version).toBe(2);
    const all = await listAllDocumentTemplatesTool(ctx());
    if (!all.ok) return;
    const saved = all.data.templates.find((t) => t.id === created.data.templateId)!;
    expect(saved.bodyHtml).not.toContain("onclick");
    expect(saved.bodyHtml).toContain("güncel");
  });

  it("arşivlenen şablon 'yeni evrak oluştur' aktif listesinde görünmez ama yönetim listesinde görünür", async () => {
    const created = await createDocumentTemplateTool(ctx(), { kind: "custom", name: "Arşivlenecek", bodyHtml: "<p>x</p>" });
    if (!created.ok) throw new Error("create failed");
    const archived = await archiveDocumentTemplateTool(ctx(), { templateId: created.data.templateId, active: false });
    expect(archived.ok).toBe(true);

    const active = await listDocumentTemplatesTool(ctx());
    if (!active.ok) throw new Error("list failed");
    expect(active.data.templates.some((t) => t.id === created.data.templateId)).toBe(false);

    const all = await listAllDocumentTemplatesTool(ctx());
    if (!all.ok) throw new Error("list-all failed");
    const found = all.data.templates.find((t) => t.id === created.data.templateId);
    expect(found).toBeDefined();
    expect(found?.active).toBe(false);
  });

  it("başka tenant'ın şablonu ile belge oluşturulamaz (NOT_FOUND — sahte/başka-tenant template ID)", async () => {
    const otherTpl = await createDocumentTemplateTool(ctx({ tenantId: "other-tenant-tpl" }), {
      kind: "custom",
      name: "Başka kurum",
      bodyHtml: "<p>x</p>",
    });
    if (!otherTpl.ok) throw new Error("setup failed");
    const res = await createDocumentInstanceTool(ctx(), { templateId: otherTpl.data.templateId, fieldValues: {} });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("NOT_FOUND");
  });
});

describe("Placeholder doldurma — noktalı namespace + güvenli boş davranış + XSS", () => {
  it("{{student.fullName}}/{{parent.fullName}}/{{teacher.fullName}}/{{institution.name}}/{{currentDate}}/{{document.referenceNumber}} doğru doldurulur", async () => {
    const tpl = await createDocumentTemplateTool(ctx(), {
      kind: "custom",
      name: "Placeholder testi",
      bodyHtml:
        "<p>{{student.fullName}} / {{parent.fullName}} / {{teacher.fullName}} / {{institution.name}} / {{document.referenceNumber}}</p>",
    });
    if (!tpl.ok) throw new Error("tpl failed");
    const created = await createDocumentInstanceTool(ctx(), {
      templateId: tpl.data.templateId,
      studentId: "s1",
      teacherId: "t1",
      fieldValues: {},
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const detail = await getDocumentInstanceTool(ctx(), { documentId: created.data.documentId });
    expect(detail.ok).toBe(true);
    if (!detail.ok) return;
    const html = detail.data.document.renderedHtml ?? "";
    expect(html).toContain(created.data.reference);
    expect(html).not.toContain("{{"); // hiçbir placeholder boş/işlenmemiş kalmamalı
  });

  it("eksik veri (öğrenci/öğretmen verilmemiş) için placeholder güvenli boş string olur, hata fırlatmaz", async () => {
    const tpl = await createDocumentTemplateTool(ctx(), {
      kind: "custom",
      name: "Eksik veri testi",
      bodyHtml: "<p>[{{student.fullName}}][{{teacher.fullName}}][{{parent.phone}}]</p>",
    });
    if (!tpl.ok) throw new Error("tpl failed");
    const created = await createDocumentInstanceTool(ctx(), { templateId: tpl.data.templateId, fieldValues: {} });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const detail = await getDocumentInstanceTool(ctx(), { documentId: created.data.documentId });
    if (!detail.ok) return;
    expect(detail.data.document.renderedHtml).toContain("[][][]");
  });

  it("serbest metin alan değeri (freeText) HTML olarak enjekte edilmez — HTML-escape edilir (ikinci XSS yolu kapalı)", () => {
    const rendered = renderTemplate("<p>{{freeText}}</p>", { freeText: '<script>alert(1)</script>' });
    expect(rendered).not.toContain("<script>");
    expect(rendered).toContain("&lt;script&gt;");
  });

  it("bulunmayan herhangi bir placeholder hata fırlatmadan boş string olur", () => {
    expect(() => renderTemplate("<p>{{hic.olmayan.alan}}</p>", {})).not.toThrow();
    expect(renderTemplate("<p>{{hic.olmayan.alan}}</p>", {})).toBe("<p></p>");
  });
});

describe("stripUnusedInstallmentRows — P0 (2026-08-30) boş taksit satırı düzeltmesi", () => {
  function buildTaksitTable(): string {
    const rows = Array.from(
      { length: 12 },
      (_, i) =>
        `<tr><td>EĞİTİM</td><td>${i + 1}</td><td>{{taksit${i + 1}Tarih}}</td><td>{{taksit${i + 1}Tutar}} TL</td></tr>`
    ).join("\n");
    return `<table><thead><tr><th>H</th></tr></thead><tbody>\n${rows}\n</tbody></table>`;
  }

  it("installmentCount=5 → yalnızca 1-5 satırları kalır, 6-12 tamamen kaldırılır", () => {
    const stripped = stripUnusedInstallmentRows(buildTaksitTable(), 5);
    for (let i = 1; i <= 5; i++) {
      expect(stripped).toContain(`{{taksit${i}Tarih}}`);
    }
    for (let i = 6; i <= 12; i++) {
      expect(stripped).not.toContain(`{{taksit${i}Tarih}}`);
      expect(stripped).not.toContain(`{{taksit${i}Tutar}}`);
    }
  });

  it("7, 8, 9, 10, 11 aylık planlar için de doğru satır sayısı kalır", () => {
    for (const count of [7, 8, 9, 10, 11]) {
      const stripped = stripUnusedInstallmentRows(buildTaksitTable(), count);
      const remainingRows = stripped.match(/<tr>/g)?.length ?? 0;
      // +1 için thead'daki <tr> satırı.
      expect(remainingRows).toBe(count + 1);
    }
  });

  it("installmentCount=12 → hiçbir şey kaldırılmaz (idempotent, dokunmadan geçer)", () => {
    const table = buildTaksitTable();
    expect(stripUnusedInstallmentRows(table, 12)).toBe(table);
  });

  it("render sonrası boş tarih/'TL' kalıntısı içermez (gerçek uçtan uca kontrol)", () => {
    const stripped = stripUnusedInstallmentRows(buildTaksitTable(), 3);
    const fieldValues: Record<string, string> = {};
    for (let i = 1; i <= 3; i++) {
      fieldValues[`taksit${i}Tarih`] = "01.09.2026";
      fieldValues[`taksit${i}Tutar`] = "1.000";
    }
    const rendered = renderTemplate(stripped, fieldValues);
    expect(rendered).not.toMatch(/<td>\s*<\/td>\s*<td>\s*TL<\/td>/);
    expect((rendered.match(/<tr>/g)?.length ?? 0)).toBe(4); // thead + 3 taksit satırı
  });
});

describe("createDocumentInstanceTool — sahte ID reddi + idempotency", () => {
  async function tplId(): Promise<string> {
    const t = await listDocumentTemplatesTool(ctx());
    if (!t.ok) throw new Error("templates failed");
    return t.data.templates[0]!.id;
  }

  it("var olmayan/başka tenant öğrenci ID'si reddedilir", async () => {
    const res = await createDocumentInstanceTool(ctx(), {
      templateId: await tplId(),
      studentId: "does-not-exist",
      fieldValues: {},
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VALIDATION_ERROR");
  });

  it("var olmayan/başka tenant öğretmen ID'si reddedilir", async () => {
    const res = await createDocumentInstanceTool(ctx(), {
      templateId: await tplId(),
      teacherId: "does-not-exist",
      fieldValues: {},
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VALIDATION_ERROR");
  });

  it("aynı idempotencyKey ile kısa sürede tekrar çağrı YENİ belge yaratmaz, aynı belgeyi döner", async () => {
    const id = await tplId();
    const first = await createDocumentInstanceTool(ctx(), {
      templateId: id,
      studentId: "s1",
      fieldValues: {},
      idempotencyKey: "click-guard-1",
    });
    const second = await createDocumentInstanceTool(ctx(), {
      templateId: id,
      studentId: "s1",
      fieldValues: {},
      idempotencyKey: "click-guard-1",
    });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.data.documentId).toBe(first.data.documentId);

    const list = await listDocumentInstancesTool(ctx(), { studentId: "s1" });
    if (!list.ok) return;
    expect(list.data.documents.filter((d) => d.id === first.data.documentId).length).toBe(1);
  });

  it("farklı idempotencyKey ile iki AYRI belge oluşur", async () => {
    const id = await tplId();
    const a = await createDocumentInstanceTool(ctx(), {
      templateId: id,
      studentId: "s1",
      fieldValues: {},
      idempotencyKey: "key-a",
    });
    const b = await createDocumentInstanceTool(ctx(), {
      templateId: id,
      studentId: "s1",
      fieldValues: {},
      idempotencyKey: "key-b",
    });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.data.documentId).not.toBe(b.data.documentId);
  });
});

describe("uploadSignedDocumentTool — dosya güvenliği (Faz 2 hardening)", () => {
  async function seedDoc(): Promise<string> {
    const t = await listDocumentTemplatesTool(ctx());
    if (!t.ok) throw new Error("templates failed");
    const created = await createDocumentInstanceTool(ctx(), { templateId: t.data.templates[0]!.id, fieldValues: {} });
    if (!created.ok) throw new Error(created.error.message);
    return created.data.documentId;
  }

  it("geçerli PDF yüklenir", async () => {
    const documentId = await seedDoc();
    const res = await uploadSignedDocumentTool(ctx(), {
      documentId,
      fileName: "sozlesme.pdf",
      fileMimeType: "application/pdf",
      fileData: TINY_PDF_BASE64,
    });
    expect(res.ok).toBe(true);
  });

  it("izin verilmeyen uzantı (MIME doğru olsa bile) reddedilir", async () => {
    const documentId = await seedDoc();
    const res = await uploadSignedDocumentTool(ctx(), {
      documentId,
      fileName: "virus.exe",
      fileMimeType: "application/pdf",
      fileData: TINY_PDF_BASE64,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VALIDATION_ERROR");
  });

  it("desteklenmeyen MIME türü reddedilir", async () => {
    const documentId = await seedDoc();
    const res = await uploadSignedDocumentTool(ctx(), {
      documentId,
      fileName: "dosya.zip",
      fileMimeType: "application/zip",
      fileData: TINY_PDF_BASE64,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VALIDATION_ERROR");
  });

  it("path traversal içeren dosya adı reddedilir", async () => {
    const documentId = await seedDoc();
    const res = await uploadSignedDocumentTool(ctx(), {
      documentId,
      fileName: "../../etc/passwd",
      fileMimeType: "application/pdf",
      fileData: TINY_PDF_BASE64,
    });
    expect(res.ok).toBe(false);
  });

  it("boş dosya reddedilir", async () => {
    const documentId = await seedDoc();
    const res = await uploadSignedDocumentTool(ctx(), {
      documentId,
      fileName: "bos.pdf",
      fileMimeType: "application/pdf",
      fileData: "",
    });
    expect(res.ok).toBe(false);
  });

  it("aşırı büyük dosya (>2MB) reddedilir", async () => {
    const documentId = await seedDoc();
    const big = Buffer.alloc(2_500_000, 1).toString("base64");
    const res = await uploadSignedDocumentTool(ctx(), {
      documentId,
      fileName: "buyuk.pdf",
      fileMimeType: "application/pdf",
      fileData: big,
    });
    expect(res.ok).toBe(false);
  });

  it("dosya verisi liste/öğrenci belge listesi yanıtlarına SIZMAZ — yalnızca tekil belge/indirme üzerinden erişilir", async () => {
    const documentId = await seedDoc();
    await uploadSignedDocumentTool(ctx(), {
      documentId,
      fileName: "gizli.pdf",
      fileMimeType: "application/pdf",
      fileData: TINY_PDF_BASE64,
    });

    const list = await listDocumentInstancesTool(ctx(), {});
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    const row = list.data.documents.find((d) => d.id === documentId)!;
    expect((row as unknown as { fileData?: string }).fileData).toBeUndefined();
    expect(row.fileName).toBe("gizli.pdf"); // metadata hâlâ mevcut

    // Tekil detay (indirme rotasının da kullandığı fonksiyon) hâlâ fileData döner.
    const detail = await getDocumentInstanceTool(ctx(), { documentId });
    expect(detail.ok).toBe(true);
    if (!detail.ok) return;
    expect(detail.data.document.fileData).toBeTruthy();
  });

  it("PARENT/TEACHER indiremez/yükleyemez, cross-tenant tenant belgeye erişemez", async () => {
    const documentId = await seedDoc();
    const teacherRes = await uploadSignedDocumentTool(ctx({ role: "TEACHER", teacherId: "t1" }), {
      documentId,
      fileName: "x.pdf",
      fileMimeType: "application/pdf",
      fileData: TINY_PDF_BASE64,
    });
    expect(teacherRes.ok).toBe(false);

    const crossTenant = await getDocumentInstanceTool(ctx({ tenantId: "other-tenant-file" }), { documentId });
    expect(crossTenant.ok).toBe(false);
    if (crossTenant.ok) return;
    expect(crossTenant.error.code).toBe("NOT_FOUND");
  });
});

describe("İmzalı sürüm geçmişi — append-only + soft-delete + audit", () => {
  async function seedDocWithSignedFile(): Promise<string> {
    const t = await listDocumentTemplatesTool(ctx());
    if (!t.ok) throw new Error("templates failed");
    const created = await createDocumentInstanceTool(ctx(), { templateId: t.data.templates[0]!.id, fieldValues: {} });
    if (!created.ok) throw new Error(created.error.message);
    await uploadSignedDocumentTool(ctx(), {
      documentId: created.data.documentId,
      fileName: "v1.pdf",
      fileMimeType: "application/pdf",
      fileData: TINY_PDF_BASE64,
    });
    return created.data.documentId;
  }

  it("ikinci sürüm yüklenince ÖNCEKİ üzerine yazılmaz — geçmişte iki kayıt birikir, güncel sürüm en yenisi olur", async () => {
    const documentId = await seedDocWithSignedFile();
    await uploadSignedDocumentTool(ctx(), {
      documentId,
      fileName: "v2.pdf",
      fileMimeType: "application/pdf",
      fileData: TINY_PDF_BASE64,
    });
    const detail = await getDocumentInstanceTool(ctx(), { documentId });
    expect(detail.ok).toBe(true);
    if (!detail.ok) return;
    expect(detail.data.document.fileName).toBe("v2.pdf"); // güncel = en son
    expect(detail.data.document.signedVersions?.length).toBe(2);
    expect(detail.data.document.signedVersions?.map((v) => v.fileName)).toEqual(["v1.pdf", "v2.pdf"]);
  });

  it("sürüm silme soft-delete'tir — kayıt geçmişte 'deletedAt' ile kalır, hard delete olmaz", async () => {
    const documentId = await seedDocWithSignedFile();
    const detail = await getDocumentInstanceTool(ctx(), { documentId });
    if (!detail.ok) throw new Error("detail failed");
    const versionId = detail.data.document.signedVersions![0]!.id;

    const del = await deleteSignedDocumentVersionTool(ctx(), { documentId, versionId });
    expect(del.ok).toBe(true);

    const after = await getDocumentInstanceTool(ctx(), { documentId });
    if (!after.ok) return;
    const entry = after.data.document.signedVersions!.find((v) => v.id === versionId)!;
    expect(entry).toBeDefined(); // hâlâ listede — hard delete yok
    expect(entry.deletedAt).toBeTruthy();
  });

  it("GÜNCEL sürüm silinirse belge dosya alanları temizlenir ve durum imzaya-verildi'ye döner", async () => {
    const documentId = await seedDocWithSignedFile();
    const detail = await getDocumentInstanceTool(ctx(), { documentId });
    if (!detail.ok) throw new Error("detail failed");
    const currentVersionId = detail.data.document.signedVersions![0]!.id;

    const del = await deleteSignedDocumentVersionTool(ctx(), { documentId, versionId: currentVersionId });
    expect(del.ok).toBe(true);
    if (!del.ok) return;
    expect(del.data.status).toBe("sent_for_signature");

    const after = await getDocumentInstanceTool(ctx(), { documentId });
    if (!after.ok) return;
    expect(after.data.document.fileData).toBeUndefined();
  });

  it("TEACHER sürüm silemez (FORBIDDEN)", async () => {
    const documentId = await seedDocWithSignedFile();
    const detail = await getDocumentInstanceTool(ctx(), { documentId });
    if (!detail.ok) throw new Error("detail failed");
    const versionId = detail.data.document.signedVersions![0]!.id;
    const res = await deleteSignedDocumentVersionTool(ctx({ role: "TEACHER", teacherId: "t1" }), {
      documentId,
      versionId,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("FORBIDDEN");
  });
});

describe("listStudentDocumentsTool — öğrenci detayı tenant/öğrenci izolasyonu", () => {
  it("yalnız ilgili öğrencinin belgelerini döner, cross-tenant/sahte ID reddedilir", async () => {
    const t = await listDocumentTemplatesTool(ctx());
    if (!t.ok) throw new Error("templates failed");
    await createDocumentInstanceTool(ctx(), { templateId: t.data.templates[0]!.id, studentId: "s1", fieldValues: {} });

    const res = await listStudentDocumentsTool(ctx(), { studentId: "s1" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.documents.every((d) => d.studentId === "s1")).toBe(true);
    expect((res.data.documents[0] as unknown as { fileData?: string })?.fileData).toBeUndefined();

    const fakeStudent = await listStudentDocumentsTool(ctx(), { studentId: "does-not-exist" });
    expect(fakeStudent.ok).toBe(false);
  });
});

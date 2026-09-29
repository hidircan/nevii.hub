/**
 * İK / işe alım modülü — CV okuma, herkese açık başvuru, filtre, aşama, e-posta, puan kartı, KVKK, aktarma.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { CRIT, withTestCriticalPassword } from "./helpers/critical-delete";
import { promises as fs } from "fs";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import { setEmailTransportForTests } from "../email";
import type { EmailSendInput } from "../email/types";
import { __resetRateLimitForTests } from "../rate-limit";
import { RECRUITMENT_FILE, getApplication, listActivities, updateApplication } from "../recruitment/store";
import { detectCvKind, parseCvText } from "../recruitment/cv-parser";
import { applyApplicationFilter, parseApplicationFilter, applicationFilterToSearchParams } from "../recruitment/filters";
import { submitPublicApplication, getPublicCareerPage } from "../recruitment/public";
import { fillPlaceholders, unknownPlaceholders, textToHtml } from "../recruitment/emails";
import {
  addEvaluationTool,
  anonymizeApplicationTool,
  changeStageTool,
  convertToEmployeeTool,
  getApplicationDetailTool,
  getDashboardTool,
  listApplicationsTool,
  listTemplatesTool,
  runRetentionSweep,
  saveJobTool,
  saveSettingsTool,
  saveTemplateTool,
  scheduleInterviewTool,
  sendTemplateEmailTool,
} from "../recruitment/tools";
import { readData } from "../store";
import { runWithTenantAsync } from "../tenant-context";

const T = DEFAULT_TENANT_ID;
const admin: ServiceContext = { role: "SCHOOL_ADMIN", userId: "admin_ik", tenantId: T, channel: "web" };
const teacher: ServiceContext = { role: "TEACHER", userId: "t_ik", tenantId: T, channel: "web" };
const tenant = { tenantId: T, name: "Test Müzik", slug: "test-muzik" };

const SAMPLE_CV = `ELİF KAYA
Piyano Eğitmeni
E-posta: elif.kaya@example.com | Tel: 0532 123 45 67 | İstanbul
linkedin.com/in/elifkaya

DENEYİM
Piyano Öğretmeni — Nota Müzik Kursu
2016 - Günümüz
Korrepetitör — Opera Stüdyo
2012 - 2016

EĞİTİM
Mimar Sinan Güzel Sanatlar Üniversitesi Devlet Konservatuvarı 2012
Piyano Anasanat Dalı
Yüksek Lisans — Müzik Eğitimi

DİLLER: İngilizce (ileri), Almanca (başlangıç)
Solfej ve armoni dersleri de verebilirim.`;

const sent: EmailSendInput[] = [];

beforeEach(async () => {
  await fs.rm(RECRUITMENT_FILE, { force: true });
  sent.length = 0;
  __resetRateLimitForTests();
  setEmailTransportForTests({
    name: "test",
    async send(input) {
      sent.push(input);
      return { delivered: true, messageId: "m1" };
    },
  });
});
afterEach(() => setEmailTransportForTests(null));

async function publishedJob(overrides: Record<string, unknown> = {}) {
  const r = await saveJobTool(admin, {
    title: "Piyano Öğretmeni",
    category: "teacher",
    instruments: ["Piyano"],
    employmentType: "part_time",
    location: "Kadıköy",
    summary: "Haftada 3 gün",
    status: "published",
    ...overrides,
  });
  if (!r.ok) throw new Error(r.error.message);
  return r.data.job;
}

function form(overrides: Record<string, unknown> = {}) {
  return {
    firstName: "Elif",
    lastName: "Kaya",
    email: "elif@example.com",
    phone: "0532 123 45 67",
    city: "İstanbul",
    instruments: ["Piyano"],
    experienceYears: "10",
    teachingYears: 8,
    educationLevel: "master",
    kvkkConsent: true,
    source: "linkedin",
    ...overrides,
  };
}

describe("CV okuma — kural tabanlı", () => {
  it("ad, iletişim, enstrüman, deneyim, eğitim ve dilleri çıkarır", () => {
    const p = parseCvText(SAMPLE_CV, { now: new Date("2026-09-28") });
    expect(p.firstName).toBe("Elif");
    expect(p.lastName).toBe("Kaya");
    expect(p.email).toBe("elif.kaya@example.com");
    expect(p.phone?.replace(/\D/g, "")).toContain("5321234567");
    expect(p.city).toBe("İstanbul");
    expect(p.instruments).toEqual(expect.arrayContaining(["Piyano", "Solfej"]));
    expect(p.experienceYears).toBe(14);
    expect(p.teachingYears).toBe(10);
    expect(p.educationLevel).toBe("master");
    expect(p.school).toMatch(/Mimar Sinan/);
    expect(p.languages).toEqual(expect.arrayContaining(["İngilizce", "Almanca"]));
    expect(p.linkedinUrl).toBe("https://linkedin.com/in/elifkaya");
  });

  it("iş satırındaki 'Akademi'yi okul sanmaz; üniversiteyi ve mezuniyet yılını seçer", () => {
    const p = parseCvText(
      "ZEYNEP ARSLAN\nKeman Öğretmeni — Ankara Müzik Akademisi\n2018 - Günümüz\nHacettepe Üniversitesi Ankara Devlet Konservatuvarı 2014\nYaylı Çalgılar Anasanat Dalı",
      { now: new Date("2026-09-28") }
    );
    expect(p.school).toMatch(/^Hacettepe/);
    expect(p.graduationYear).toBe(2014);
    expect(p.firstName).toBe("Zeynep");
    expect(p.teachingYears).toBe(8);
  });

  it("katalogdaki enstrüman yazımını tercih eder", () => {
    const p = parseCvText("Ali Veli\nKlasik gitar ve bağlama öğretmeni", { knownInstruments: ["Klasik Gitar"] });
    expect(p.instruments).toContain("Klasik Gitar");
    expect(p.instruments).toContain("Bağlama");
  });

  it("uzantı taklidi yapan dosyayı reddeder (sihirli bayt)", () => {
    expect(detectCvKind(Buffer.from("merhaba"), "application/pdf", "cv.pdf")).toBeNull();
    expect(detectCvKind(Buffer.from("%PDF-1.7 ..."), "application/pdf", "cv.pdf")).toBe("pdf");
    expect(detectCvKind(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0]), "application/octet-stream", "cv.docx")).toBe("docx");
    expect(detectCvKind(Buffer.from("MZ"), "application/x-msdownload", "cv.exe")).toBeNull();
  });
});

describe("Herkese açık başvuru", () => {
  it("yayındaki ilana başvuru oluşturur, adaya alındı e-postası ve zaman çizelgesi yazar", async () => {
    const job = await publishedJob();
    const page = await getPublicCareerPage(tenant);
    expect(page?.jobs.map((j) => j.id)).toContain(job.id);

    const pdf = Buffer.from("%PDF-1.4\n% sahte ama sihirli baytı doğru\n");
    const r = await submitPublicApplication(tenant, form({ jobSlug: job.slug }), { fileName: "elif cv.pdf", mimeType: "application/pdf", data: pdf });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.applicationNumber).toBe("IK-000001");
    expect(r.duplicate).toBe(false);

    const list = await listApplicationsTool(admin, {});
    expect(list.ok && list.data.applications).toHaveLength(1);
    const app = list.ok ? list.data.applications[0]! : null;
    expect(app?.source).toBe("linkedin");
    expect(app?.experienceYears).toBe(10);
    expect(app?.cvFileId).toBeTruthy();
    expect(app?.retentionUntil).toBeTruthy();
    expect(sent.some((m) => m.to === "elif@example.com" && m.subject.includes("başvurunuz alındı"))).toBe(true);
    const acts = await listActivities(T, app!.id);
    expect(acts.some((a) => a.type === "email")).toBe(true);
  });

  it("aynı e-posta + ilan için 24 saat içinde ikinci kayıt açmaz", async () => {
    const job = await publishedJob();
    await submitPublicApplication(tenant, form({ jobSlug: job.slug }), null);
    const again = await submitPublicApplication(tenant, form({ jobSlug: job.slug }), null);
    expect(again.ok && again.duplicate).toBe(true);
    const list = await listApplicationsTool(admin, {});
    expect(list.ok && list.data.applications).toHaveLength(1);
  });

  it("KVKK onayı olmadan, kapalı ilana veya geçersiz CV ile başvuru kabul edilmez", async () => {
    const job = await publishedJob();
    const noConsent = await submitPublicApplication(tenant, form({ jobSlug: job.slug, kvkkConsent: false }), null);
    expect(noConsent.ok).toBe(false);
    const draft = await publishedJob({ title: "Keman Öğretmeni", status: "draft" });
    const closed = await submitPublicApplication(tenant, form({ jobSlug: draft.slug, email: "x@example.com" }), null);
    expect(closed.ok).toBe(false);
    const badCv = await submitPublicApplication(tenant, form({ jobSlug: job.slug, email: "y@example.com" }), {
      fileName: "cv.pdf", mimeType: "application/pdf", data: Buffer.from("not a pdf"),
    });
    expect(badCv.ok).toBe(false);
  });

  it("kariyer sayfası varsayılan kapalıdır; ilk ilan yayınlanınca açılır", async () => {
    expect(await getPublicCareerPage(tenant)).toBeNull();
    await publishedJob();
    expect(await getPublicCareerPage(tenant)).not.toBeNull();
  });

  it("ad alanına bağlantı/e-posta yazılamaz (form spam koruması)", async () => {
    const job = await publishedJob();
    const r = await submitPublicApplication(tenant, form({ jobSlug: job.slug, firstName: "Kazan http://x.co" }), null);
    expect(r.ok).toBe(false);
  });

  it("kariyer sayfası kapatılınca herkese açık sayfa dönmez", async () => {
    await saveSettingsTool(admin, {
      careerPageEnabled: false, careerPageIntro: "", kvkkText: "", notifyInApp: true, notifyEmails: [],
      autoAcknowledge: true, retentionMonths: 12, scorecardCriteria: [{ key: "a", label: "Genel" }],
    });
    expect(await getPublicCareerPage(tenant)).toBeNull();
  });
});

describe("Filtreler", () => {
  it("URL parametreleri ↔ filtre gidiş-dönüş ve eşleştirme", async () => {
    const job = await publishedJob();
    await submitPublicApplication(tenant, form({ jobSlug: job.slug }), null);
    await submitPublicApplication(tenant, form({ email: "b@example.com", firstName: "Burak", instruments: ["Keman"], experienceYears: 2, educationLevel: "bachelor", category: "teacher" }), null);
    await submitPublicApplication(tenant, form({ email: "c@example.com", firstName: "Can", instruments: [], category: "staff", experienceYears: 5, educationLevel: "high_school" }), null);
    const list = await listApplicationsTool(admin, {});
    const apps = list.ok ? list.data.applications : [];
    expect(apps).toHaveLength(3);

    const f = parseApplicationFilter({ tur: "teacher", enstruman: "piyano", deneyim: "5" });
    expect(applyApplicationFilter(apps, f).map((a) => a.firstName)).toEqual(["Elif"]);
    expect(parseApplicationFilter(Object.fromEntries(applicationFilterToSearchParams(f)))).toEqual(f);

    expect(applyApplicationFilter(apps, { category: "staff" }).map((a) => a.firstName)).toEqual(["Can"]);
    expect(applyApplicationFilter(apps, { education: "bachelor" }).map((a) => a.firstName).sort()).toEqual(["Burak", "Elif"]);
    expect(applyApplicationFilter(apps, { jobId: "general" })).toHaveLength(2);
    expect(applyApplicationFilter(apps, { q: "burak keman" }).map((a) => a.firstName)).toEqual(["Burak"]);
    expect(applyApplicationFilter(apps, { sort: "experience" })[0]!.firstName).toBe("Elif");
  });
});

describe("Yönetici işlemleri", () => {
  async function seedApp() {
    const job = await publishedJob();
    await submitPublicApplication(tenant, form({ jobSlug: job.slug }), null);
    const list = await listApplicationsTool(admin, {});
    return list.ok ? list.data.applications[0]! : (null as never);
  }

  it("öğretmen rolü İK araçlarına erişemez", async () => {
    const r = await listApplicationsTool(teacher, {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("FORBIDDEN");
  });

  it("toplu aşama değişimi zaman çizelgesine yazılır", async () => {
    const app = await seedApp();
    const r = await changeStageTool(admin, { ids: [app.id], stage: "screening", note: "CV uygun" });
    expect(r.ok && r.data.updated).toBe(1);
    const acts = await listActivities(T, app.id);
    expect(acts.find((a) => a.type === "stage_change")?.body).toContain("Ön eleme");
  });

  it("görüşme planlama aşamayı ilerletir ve davet e-postası gönderir", async () => {
    const app = await seedApp();
    const r = await scheduleInterviewTool(admin, {
      applicationId: app.id, kind: "demo_lesson", scheduledAt: "2026-10-05T10:00:00+03:00", location: "Merkez şube", sendInvitation: true,
    });
    expect(r.ok).toBe(true);
    expect((await getApplication(T, app.id))?.stage).toBe("demo_lesson");
    const invite = sent.find((m) => m.subject.includes("deneme dersi"));
    expect(invite?.text).toContain("Merkez şube");
    expect(invite?.text).toMatch(/10:00/);
  });

  it("SMTP yokken toplu e-posta dürüstçe başarısız sayılır ve loglanır", async () => {
    const app = await seedApp();
    setEmailTransportForTests({ name: "blocked", async send() { return { delivered: false, blocked: true, reason: "EMAIL_PROVIDER_NOT_CONFIGURED" }; } });
    const tpls = await listTemplatesTool(admin);
    const negative = tpls.ok ? tpls.data.templates.find((t) => t.kind === "negative")! : null;
    const r = await sendTemplateEmailTool(admin, { ids: [app.id], templateId: negative!.id, moveToStage: "rejected" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.sent).toBe(0);
    expect(r.data.failed).toBe(1);
    expect(r.data.blocked).toBe(true);
    expect((await getApplication(T, app.id))?.stage).toBe("rejected");
    const acts = await listActivities(T, app.id);
    expect(acts.some((a) => a.type === "email" && a.body.includes("SMTP"))).toBe(true);
  });

  it("şablonda bilinmeyen yer tutucu reddedilir", async () => {
    const r = await saveTemplateTool(admin, { kind: "custom", name: "Deneme", subject: "Merhaba {{aday_adi}}", body: "Maaşınız {{maas}} olacak, tebrikler." });
    expect(r.ok).toBe(false);
    expect(unknownPlaceholders("{{aday_adi}} {{foo}}")).toEqual(["foo"]);
    expect(fillPlaceholders("Merhaba {{ aday_adi }}", { aday_adi: "Elif" })).toBe("Merhaba Elif");
    expect(textToHtml("<script>")).not.toContain("<script>");
  });

  it("puan kartı ortalaması adaya yazılır", async () => {
    const app = await seedApp();
    await addEvaluationTool(admin, { applicationId: app.id, scores: { musicianship: 5, pedagogy: 4 }, recommendation: "yes" });
    const r = await addEvaluationTool(admin, { applicationId: app.id, scores: { musicianship: 3, pedagogy: 3 }, recommendation: "neutral" });
    expect(r.ok && r.data.ratingAvg).toBe(3.8);
    const d = await getApplicationDetailTool(admin, { id: app.id });
    expect(d.ok && d.data.evaluations).toHaveLength(2);
  });

  it("anonimleştirme kişisel veriyi ve CV'yi siler; saklama süresi taraması idempotenttir", async () => {
    const job = await publishedJob();
    await submitPublicApplication(tenant, form({ jobSlug: job.slug }), { fileName: "cv.pdf", mimeType: "application/pdf", data: Buffer.from("%PDF-1.4 x") });
    await submitPublicApplication(tenant, form({ email: "eski@example.com", firstName: "Eski" }), null);
    const list = await listApplicationsTool(admin, { sort: "name" });
    const [eski, elif] = list.ok ? list.data.applications : [];
    await addEvaluationTool(admin, { applicationId: elif!.id, scores: { a: 4 }, recommendation: "yes", comment: "Elif çok iyi çaldı" });
    const denied = await anonymizeApplicationTool(admin, { id: elif!.id, criticalPassword: "yanlis", reason: "KVKK talebi" });
    expect(denied.ok).toBe(false);
    expect((await getApplication(T, elif!.id))?.firstName).not.toBe("Anonim");
    await withTestCriticalPassword(T);
    const r = await anonymizeApplicationTool(admin, { id: elif!.id, ...CRIT });
    expect(r.ok).toBe(true);
    const det = await getApplicationDetailTool(admin, { id: elif!.id });
    expect(det.ok && det.data.evaluations[0]!.comment).toBe("");
    expect(det.ok && det.data.activities.every((x) => x.body === "[anonimleştirildi]")).toBe(true);
    const a = await getApplication(T, elif!.id);
    expect(a?.firstName).toBe("Anonim");
    expect(a?.cvFileId).toBeNull();
    expect(a?.email).not.toContain("example.com");

    await updateApplication(T, eski!.id, { retentionUntil: "2020-01-01T00:00:00.000Z" });
    expect(await runRetentionSweep(T)).toBe(1);
    expect(await runRetentionSweep(T)).toBe(0);
    const after = await listApplicationsTool(admin, {});
    expect(after.ok && after.data.applications).toHaveLength(0);
  });

  it("işe alınan aday öğretmen kaydına aktarılır (tekrar aktarılamaz)", async () => {
    const app = await seedApp();
    const data = await runWithTenantAsync(T, () => readData());
    const branchId = data.settings.branches[0]!.id;
    const r = await convertToEmployeeTool(admin, { applicationId: app.id, target: "teacher", branchId, instrument: "Piyano" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const after = await runWithTenantAsync(T, () => readData());
    expect(after.teachers.some((t) => t.id === r.data.recordId && t.name === "Elif Kaya")).toBe(true);
    expect((await getApplication(T, app.id))?.stage).toBe("hired");
    const again = await convertToEmployeeTool(admin, { applicationId: app.id, target: "teacher", branchId, instrument: "Piyano" });
    expect(again.ok).toBe(false);
    // Eşzamanlı çift tıklama: ikinci istek kayıt açmaz.
    const other = (await (async () => {
      await submitPublicApplication(tenant, form({ email: "iki@example.com", firstName: "İkinci" }), null);
      const l = await listApplicationsTool(admin, { q: "İkinci" });
      return l.ok ? l.data.applications[0]! : (null as never);
    })());
    const [x, y] = await Promise.all([
      convertToEmployeeTool(admin, { applicationId: other.id, target: "teacher", branchId, instrument: "Piyano" }),
      convertToEmployeeTool(admin, { applicationId: other.id, target: "teacher", branchId, instrument: "Piyano" }),
    ]);
    expect([x.ok, y.ok].filter(Boolean)).toHaveLength(1);
    expect(again.ok).toBe(false);
  }, 20_000);

  it("özet: aşama sayıları ve bekleyen inceleme", async () => {
    await seedApp();
    const d = await getDashboardTool(admin);
    expect(d.ok && d.data.awaitingReview).toBe(1);
    expect(d.ok && d.data.openJobs).toBe(1);
    expect(d.ok && d.data.byStage.find((s) => s.stage === "new")?.count).toBe(1);
  });
});

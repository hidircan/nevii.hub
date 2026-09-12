import { describe, it, expect, vi, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { DEFAULT_TENANT_ID } from "../auth/config";
import { clearInstrumentCatalog } from "../instrument-catalog";
import type { ServiceContext } from "../services/context";

/**
 * actions.ts'in her mutasyonu withAuthContext üzerinden resolveWriteScope
 * çağırır; bu da taze bir oturum + cookie okuması gerektirir. Bu testler
 * sayfayı/aksiyonu gerçek bir HTTP isteği olmadan doğrudan çağırdığından
 * oturumu ve kurum cookie'sini burada sahteler (bkz. csv-import-teacher-bug
 * testindeki aynı desen).
 */
const mockSession: { ctx: ServiceContext } = {
  ctx: { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web" },
};
const mockCookieValue: { value: string | undefined } = { value: undefined };
const mockTenants: { list: { tenantId: string; name: string }[] } = { list: [] };

vi.mock("@/lib/auth/session", () => ({
  requireSessionContext: async () => mockSession.ctx,
  getSessionContext: async () => mockSession.ctx,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "notaplan_kurum" && mockCookieValue.value !== undefined
        ? { value: mockCookieValue.value }
        : undefined,
    set: () => {},
  }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
}));

vi.mock("@/lib/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../store")>();
  return {
    ...actual,
    listTenants: async () => mockTenants.list,
  };
});

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

const actions = await import("../actions");
const { readData } = await import("../store");
const { ALL_MODE_WRITE_DENIED_MESSAGE } = await import("../institution/write-scope");

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
  // P0-A — `createStudentTool` artık `resolveActiveInstrumentNames`'e (tenant
  // kataloğu) bağımlı; katalog `store.json`'dan AYRI bir dosyada yaşıyor ve
  // önceki test dosyalarının (ör. instrument-catalog.test.ts) bıraktığı
  // pasif/arşivlenmiş kayıtlar burada sızıntı yapıp "Piyano" gibi varsayılan
  // enstrümanları yanlışlıkla pasif gösterebilir — her testten önce temizlenip
  // `ensureDefaultCatalogSeeded` ile TÜM varsayılanlar (Piyano dahil) aktif
  // olarak yeniden tohumlanır.
  await clearInstrumentCatalog(DEFAULT_TENANT_ID);
  mockCookieValue.value = undefined;
  mockSession.ctx = { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web" };
  mockTenants.list = [{ tenantId: DEFAULT_TENANT_ID, name: "Nilüfer Açar Müzik Akademisi" }];
});

function studentFormData(): FormData {
  const fd = new FormData();
  fd.set("name", "Test Öğrenci");
  fd.set("email", "test-student@example.com");
  fd.set("phone", "05550000000");
  fd.set("parentName", "Test Veli");
  fd.set("parentPhone", "05550000001");
  fd.set("branchId", "erzene");
  fd.set("instrument", "Piyano");
  fd.set("teacherId", "t1");
  // Owner policy (2026-08-30) — createStudentTool artık ilk ödeme zorunlu kılıyor.
  fd.set("firstPaymentMethod", "cash");
  fd.set("firstPaymentAmount", "3000");
  fd.set("firstPaymentDate", "2026-08-30");
  // P0-C (2026-09-02) — enrollmentStartDate artık zorunlu (studentSchema);
  // lessonDays weeklyLessonCount'a (varsayılan 1) karşılık gelen tam/tekil
  // sayıda gün olmalı — ikisi de actionAddStudent'ın YENİ sunucu-taraflı
  // gate'lerinden geçmek için gerekli.
  fd.set("enrollmentStartDate", "2026-09-01");
  fd.append("lessonDays", "1");
  return fd;
}

/**
 * Faz 4 — başarılı kayıttan sonra `actionAddStudent` artık öğrenci detayına
 * (`?yeniKayit=1#sozlesme`) `redirect()` eder; Next.js'in `redirect()`'i
 * TASARIM GEREĞİ bir NEXT_REDIRECT hatası fırlatır (App Router server action
 * deseni). Bu yüzden "başarılı" senaryo burada rejection'ı BEKLEYEREK
 * doğrulanır — asıl mutasyonun gerçekleştiği ayrıca kontrol edilir.
 */
async function addStudentExpectingRedirect(fd: FormData) {
  await expect(actions.actionAddStudent(null, fd)).rejects.toThrow("NEXT_REDIRECT");
}

describe("Yazma kapsamı koruması — Öğrenciler (actionAddStudent)", () => {
  it("HYPER_ADMIN 'Tüm kurumlar' modunda (varsayılan) tam Türkçe mesajla reddedilir", async () => {
    mockSession.ctx = { role: "HYPER_ADMIN", userId: "super1", tenantId: DEFAULT_TENANT_ID, channel: "web" };
    mockTenants.list = [
      { tenantId: DEFAULT_TENANT_ID, name: "Nilüfer Açar Müzik Akademisi" },
      { tenantId: "tenant_other", name: "Diğer Kurum" },
    ];
    const before = await readData();
    // P0-2 (2026-08-29) — kurum kapsamı reddi artık THROW ETMEZ, diğer tüm
    // action'larla AYNI grasyollu desenle `NewStudentFormState` döner (form
    // açık kalır, kullanıcı üstte Türkçe mesajı görür).
    const result = await actions.actionAddStudent(null, studentFormData());
    expect(result?.ok).toBe(false);
    expect(result?.formError).toBe(ALL_MODE_WRITE_DENIED_MESSAGE);
    const after = await readData();
    expect(after.students.length).toBe(before.students.length);
  });

  it("SUPER_ADMIN tek bir geçerli kurum seçtiğinde mutasyon başarılı olur", async () => {
    mockSession.ctx = { role: "SUPER_ADMIN", userId: "super1", tenantId: DEFAULT_TENANT_ID, channel: "web" };
    mockTenants.list = [{ tenantId: DEFAULT_TENANT_ID, name: "Nilüfer Açar Müzik Akademisi" }];
    mockCookieValue.value = DEFAULT_TENANT_ID;
    const before = await readData();
    await addStudentExpectingRedirect(studentFormData());
    const after = await readData();
    expect(after.students.length).toBe(before.students.length + 1);
    expect(after.students.some((s) => s.name === "Test Öğrenci")).toBe(true);
  });

  it("SCHOOL_ADMIN sahte/başka bir kurum cookie'siyle bile yalnızca kendi kurumuna yazar", async () => {
    mockSession.ctx = { role: "SCHOOL_ADMIN", userId: "admin1", tenantId: DEFAULT_TENANT_ID, channel: "web" };
    mockTenants.list = [{ tenantId: DEFAULT_TENANT_ID, name: "Nilüfer Açar Müzik Akademisi" }];
    mockCookieValue.value = "tenant_forged_other_school";
    const before = await readData();
    await addStudentExpectingRedirect(studentFormData());
    const after = await readData();
    // Sahte cookie yok sayılır, varsayılan (kendi) kuruma yazılır — hiç
    // başka bir kuruma sızma olmadığı, aynı (tek) veri dosyasında öğrencinin
    // gerçekten oluşmasıyla kanıtlanır.
    expect(after.students.length).toBe(before.students.length + 1);
  });

  it("SCHOOL_ADMIN 'ALL' cookie'si göndermeyi dener ama kendi kurumunda kalır ve mutasyon başarılı olur", async () => {
    mockSession.ctx = { role: "SCHOOL_ADMIN", userId: "admin1", tenantId: DEFAULT_TENANT_ID, channel: "web" };
    mockCookieValue.value = "ALL";
    const before = await readData();
    await addStudentExpectingRedirect(studentFormData());
    const after = await readData();
    expect(after.students.length).toBe(before.students.length + 1);
  });
});

/**
 * FAZ (2026-2027 SÖZLEŞME KAYNAĞI) — formal (3-12 ay) kayıt Bağımsız
 * Sözleşme Merkezi'ne (`/sozlesmeler`) yönlendirilir; tanışma paketi (1-2 ay)
 * öğrenci detayında kalır. Next.js `redirect()` hedefi `error.digest`
 * içinde (`NEXT_REDIRECT;push;<url>;...`) taşınır — bkz. yukarıdaki
 * addStudentExpectingRedirect yorumu.
 */
describe("actionAddStudent — kayıt sonrası yönlendirme (formal/tanışma ayrımı)", () => {
  beforeEach(() => {
    mockSession.ctx = { role: "SCHOOL_ADMIN", userId: "admin1", tenantId: DEFAULT_TENANT_ID, channel: "web" };
    mockCookieValue.value = DEFAULT_TENANT_ID;
  });

  it("3 aylık (formal) kayıt Sözleşme Merkezi'ne (/sozlesmeler) yönlendirir", async () => {
    const fd = studentFormData();
    fd.set("intendedDurationMonths", "3");
    let digest = "";
    try {
      await actions.actionAddStudent(null, fd);
    } catch (e) {
      digest = (e as { digest?: string }).digest ?? "";
    }
    expect(digest).toContain("/sozlesmeler?yeniKayit=1&sure=3");
  });

  it("1 aylık (tanışma) kayıt öğrenci detayında kalır — /sozlesmeler'e YÖNLENDİRMEZ", async () => {
    const fd = studentFormData();
    fd.set("intendedDurationMonths", "1");
    let digest = "";
    try {
      await actions.actionAddStudent(null, fd);
    } catch (e) {
      digest = (e as { digest?: string }).digest ?? "";
    }
    expect(digest).not.toContain("/sozlesmeler");
    expect(digest).toContain("?yeniKayit=1&sure=1");
  });
});

/**
 * P0-2 (2026-08-29) — normal kullanıcı hataları (eksik/geçersiz alan, iş
 * kuralı ihlali) artık `actionAddStudent`'ı THROW ETTİRMEZ; `NewStudentFormState`
 * döner. Bu, P0-1'in kök nedeni olan "Invalid input" runtime hatasının bir
 * DAHA geri gelmemesini (herhangi bir gelecekteki doğrulama boşluğu için de)
 * garanti eden YAPISAL düzeltmedir.
 */
describe("actionAddStudent — P0-2 zarif doğrulama hatası davranışı (throw YOK)", () => {
  beforeEach(() => {
    mockSession.ctx = { role: "SCHOOL_ADMIN", userId: "admin1", tenantId: DEFAULT_TENANT_ID, channel: "web" };
    mockCookieValue.value = DEFAULT_TENANT_ID;
  });

  it("boş 'Ad soyad' — THROW ETMEZ, alan bazlı Türkçe hata döner, öğrenci OLUŞTURULMAZ", async () => {
    const fd = studentFormData();
    fd.set("name", "");
    const before = await readData();
    const result = await actions.actionAddStudent(null, fd);
    expect(result?.ok).toBe(false);
    expect(result?.fieldErrors?.name).toBeTruthy();
    expect(result?.formError).toBeTruthy();
    const after = await readData();
    expect(after.students.length).toBe(before.students.length);
  });

  it("var olmayan öğretmen — iş kuralı hatası THROW ETMEZ, üstte Türkçe özet döner", async () => {
    const fd = studentFormData();
    fd.set("teacherId", "no-such-teacher");
    const before = await readData();
    const result = await actions.actionAddStudent(null, fd);
    expect(result?.ok).toBe(false);
    expect(result?.formError).toContain("Seçilen öğretmen bulunamadı");
    const after = await readData();
    expect(after.students.length).toBe(before.students.length);
  });

  it("düzeltme sonrası tekrar gönderim başarılı olur (aynı action, geçerli veriyle)", async () => {
    const fd = studentFormData();
    fd.set("name", "");
    const failed = await actions.actionAddStudent(null, fd);
    expect(failed?.ok).toBe(false);

    fd.set("name", "Düzeltilmiş Öğrenci");
    await expect(actions.actionAddStudent(null, fd)).rejects.toThrow("NEXT_REDIRECT");
    const after = await readData();
    expect(after.students.some((s) => s.name === "Düzeltilmiş Öğrenci")).toBe(true);
  });
});

/**
 * P0-B (2026-09-02) — kök neden: `actionAddStudent` formdan
 * `firstPaymentAdjustmentReason`'ı HİÇ okumuyordu (yalnız yeniden-gösterim
 * için `STUDENT_FORM_VALUE_KEYS`'e alınıyordu, asıl `createStudentTool`
 * çağrısına hiç iletilmiyordu) — kullanıcı geçerli bir gerekçe yazsa bile
 * sunucu bunu HİÇ GÖRMÜYOR, "gerekçe zorunludur" hatası koşulsuz dönüyordu.
 * Bu testler gerçek action katmanını (yalnızca createStudentTool'u değil)
 * FormData ile uçtan uca çalıştırır — hata tam olarak burada yaşıyordu.
 */
describe("actionAddStudent — P0-B: ilk ödeme düzeltme gerekçesi", () => {
  beforeEach(() => {
    mockSession.ctx = { role: "SCHOOL_ADMIN", userId: "admin1", tenantId: DEFAULT_TENANT_ID, channel: "web" };
    mockCookieValue.value = DEFAULT_TENANT_ID;
  });

  it("(A) otomatik öneri === fiili tutar (ayın 1'i, tam ay) — gerekçe İSTENMEZ, kayıt başarılı olur", async () => {
    const fd = studentFormData();
    fd.set("enrollmentStartDate", "2026-09-01");
    fd.set("firstPaymentAmount", "3000"); // monthlyFee=3000 (varsayılan), weeklyLessonCount=1 → tam ay otomatik öneri = 3000
    fd.set("firstPaymentDate", "2026-09-01");
    await expect(actions.actionAddStudent(null, fd)).rejects.toThrow("NEXT_REDIRECT");
    const after = await readData();
    const student = after.students.find((s) => s.name === "Test Öğrenci");
    expect(student).toBeDefined();
    const payment = after.payments.find(
      (p) => p.studentId === student!.id && p.source === "registration_first_payment"
    );
    expect(payment?.paidAmount).toBe(3000);
  });

  it("(C) otomatik öneri ≠ fiili tutar, gerekçe HİÇ girilmedi — alan bazlı hata döner (genel 'Invalid input' DEĞİL), form verisi korunur, kayıt OLUŞTURULMAZ", async () => {
    const fd = studentFormData();
    fd.set("enrollmentStartDate", "2026-09-08"); // tam ay değil, lessonDays=[1] Pazartesi → dönemde 3 Pazartesi (KESİN) → otomatik öneri 2250, 3000'den farklı
    fd.set("firstPaymentAmount", "3000");
    fd.set("firstPaymentDate", "2026-09-10");
    const before = await readData();
    const result = await actions.actionAddStudent(null, fd);
    expect(result?.ok).toBe(false);
    expect(result?.formError).toContain("gerekçe zorunludur");
    expect(result?.formError).not.toBe("Invalid input");
    // Alan bazlı hata — yalnız üstteki genel özet DEĞİL, `FieldError` bileşeninin
    // okuduğu `fieldErrors.firstPaymentAdjustmentReason` altında da gösterilir.
    expect(result?.fieldErrors?.firstPaymentAdjustmentReason).toContain("gerekçe zorunludur");
    // Diğer form verisi (P0-4 deseni) korunur — kullanıcı her şeyi yeniden yazmaz.
    expect(result && "values" in result ? result.values?.firstPaymentAmount : undefined).toBe("3000");
    expect(result && "values" in result ? result.values?.enrollmentStartDate : undefined).toBe("2026-09-08");
    const after = await readData();
    expect(after.students.length).toBe(before.students.length);
  });

  it("(C variant) yalnızca BOŞLUK içeren gerekçe de reddedilir — trim edilince boş", async () => {
    const fd = studentFormData();
    fd.set("enrollmentStartDate", "2026-09-08");
    fd.set("firstPaymentAmount", "3000");
    fd.set("firstPaymentDate", "2026-09-10");
    fd.set("firstPaymentAdjustmentReason", "   ");
    const before = await readData();
    const result = await actions.actionAddStudent(null, fd);
    expect(result?.ok).toBe(false);
    expect(result?.fieldErrors?.firstPaymentAdjustmentReason).toContain("gerekçe zorunludur");
    const after = await readData();
    expect(after.students.length).toBe(before.students.length);
  });

  it("(B) otomatik öneri ≠ fiili tutar, GEÇERLİ (trim edilmiş) bir gerekçe girildi — kayıt başarılı olur, Payment'a tam düzeltme izi yazılır", async () => {
    const fd = studentFormData();
    fd.set("enrollmentStartDate", "2026-09-08");
    fd.set("firstPaymentAmount", "3000");
    fd.set("firstPaymentDate", "2026-09-10");
    fd.set("firstPaymentAdjustmentReason", "  Kardeş indirimi  ");
    await expect(actions.actionAddStudent(null, fd)).rejects.toThrow("NEXT_REDIRECT");

    const after = await readData();
    const student = after.students.find((s) => s.name === "Test Öğrenci");
    expect(student).toBeDefined();
    const payment = after.payments.find(
      (p) => p.studentId === student!.id && p.source === "registration_first_payment"
    );
    expect(payment).toBeDefined();
    expect(payment?.paidAmount).toBe(3000);
    expect(payment?.adjustmentReason).toBe("Kardeş indirimi"); // trim edilmiş
    expect(payment?.autoSuggestedAmount).toBeDefined();
    expect(payment?.autoSuggestedAmount).not.toBe(3000);
  });
});

/**
 * P0-C (2026-09-02) — kayıt formunun iki YENİ zorunlu alanı: ilk ödeme
 * TÜRÜ ve haftalık ders sayısına karşılık gelen ders GÜNLERİ. İkisi de
 * yalnız istemcinin `required` işaretine GÜVENMEZ — `actionAddStudent`
 * içinde `createStudentTool`'a ULAŞMADAN, alan-bazlı Türkçe hatayla
 * reddedilir (öğrenci hiç OLUŞTURULMAZ).
 */
describe("actionAddStudent — P0-C: ilk ödeme türü ve ders günü zorunluluğu", () => {
  beforeEach(() => {
    mockSession.ctx = { role: "SCHOOL_ADMIN", userId: "admin1", tenantId: DEFAULT_TENANT_ID, channel: "web" };
    mockCookieValue.value = DEFAULT_TENANT_ID;
  });

  it("firstPaymentMethod seçilmezse 'İlk ödeme türü seçilmelidir.' alan bazlı hatası döner, öğrenci OLUŞTURULMAZ", async () => {
    const fd = studentFormData();
    fd.delete("firstPaymentMethod");
    fd.set("firstPaymentMethod", "");
    const before = await readData();
    const result = await actions.actionAddStudent(null, fd);
    expect(result?.ok).toBe(false);
    expect(result?.fieldErrors?.firstPaymentMethod).toBe("İlk ödeme türü seçilmelidir.");
    expect(result?.formError).toBe("İlk ödeme türü seçilmelidir.");
    const after = await readData();
    expect(after.students.length).toBe(before.students.length);
  });

  it("weeklyLessonCount=1 iken ders günü HİÇ seçilmezse reddedilir, öğrenci OLUŞTURULMAZ", async () => {
    const fd = studentFormData();
    fd.delete("lessonDays");
    const before = await readData();
    const result = await actions.actionAddStudent(null, fd);
    expect(result?.ok).toBe(false);
    expect(result?.fieldErrors?.lessonDays).toContain("Haftalık 1 ders için 1 farklı ders günü seçmelisiniz.");
    const after = await readData();
    expect(after.students.length).toBe(before.students.length);
  });

  it("weeklyLessonCount=2 iken yalnız 1 gün seçilirse reddedilir — 'Haftalık 2 ders için 2 farklı ders günü seçmelisiniz.'", async () => {
    const fd = studentFormData();
    fd.set("weeklyLessonCount", "2");
    // studentFormData() zaten 1 gün ekliyor (lessonDays=1); ikinci gün YOK.
    const before = await readData();
    const result = await actions.actionAddStudent(null, fd);
    expect(result?.ok).toBe(false);
    expect(result?.fieldErrors?.lessonDays).toBe("Haftalık 2 ders için 2 farklı ders günü seçmelisiniz.");
    const after = await readData();
    expect(after.students.length).toBe(before.students.length);
  });

  it("weeklyLessonCount=2 iken AYNI gün iki kez seçilirse (yinelenen) reddedilir", async () => {
    const fd = studentFormData();
    fd.set("weeklyLessonCount", "2");
    fd.append("lessonDays", "1"); // zaten var olan "1" ile birlikte [1,1] — yinelenen
    const before = await readData();
    const result = await actions.actionAddStudent(null, fd);
    expect(result?.ok).toBe(false);
    expect(result?.fieldErrors?.lessonDays).toBe("Haftalık 2 ders için 2 farklı ders günü seçmelisiniz.");
    const after = await readData();
    expect(after.students.length).toBe(before.students.length);
  });

  it("weeklyLessonCount=2 ve 2 FARKLI gün seçilirse kayıt başarılı olur", async () => {
    const fd = studentFormData();
    fd.set("weeklyLessonCount", "2");
    fd.append("lessonDays", "4"); // [1,4] — 2 farklı gün
    await expect(actions.actionAddStudent(null, fd)).rejects.toThrow("NEXT_REDIRECT");
    const after = await readData();
    expect(after.students.some((s) => s.name === "Test Öğrenci")).toBe(true);
  });
});

/**
 * P0-D (2026-09-02) — "Öğrencinin kendisi" (SELF) portal davetinde e-posta
 * senkronu istemci tarafında yapılır (`new-student-form.tsx`); burada yalnız
 * SUNUCU tarafı güvenlik ağı test edilir — istemci senkronu atlanıp boş bir
 * `invitePortalEmail` gönderilse bile (ör. eski/bozuk istemci), kayıt
 * ENGELLENMEZ (davet best-effort'tur, `firstPaymentMethod`/`lessonDays`
 * gibi kaydı bloklayan zorunlu alanlardan FARKLI) ama admin'e artık
 * SESSİZCE değil, açık bir uyarı ile bildirilir.
 */
describe("actionAddStudent — P0-D: portal daveti (SELF) e-posta boşsa açık uyarı, kayıt ENGELLENMEZ", () => {
  beforeEach(() => {
    mockSession.ctx = { role: "SCHOOL_ADMIN", userId: "admin1", tenantId: DEFAULT_TENANT_ID, channel: "web" };
    mockCookieValue.value = DEFAULT_TENANT_ID;
  });

  it("inviteToPortal işaretli + SELF + boş invitePortalEmail — kayıt BAŞARILI olur, redirect'e açık uyarı eklenir", async () => {
    const fd = studentFormData();
    fd.set("inviteToPortal", "1");
    fd.set("invitePortalAccessType", "SELF");
    fd.set("invitePortalEmail", "");
    let digest = "";
    try {
      await actions.actionAddStudent(null, fd);
    } catch (e) {
      digest = (e as { digest?: string }).digest ?? "";
    }
    expect(digest).toContain("NEXT_REDIRECT");
    expect(digest).toContain("davetUyari=");
    expect(decodeURIComponent(digest)).toContain("öğrenci e-postası boş");
    const after = await readData();
    expect(after.students.some((s) => s.name === "Test Öğrenci")).toBe(true);
  });

  it("inviteToPortal işaretli + SELF + dolu invitePortalEmail — normal davet akışı ÇALIŞIR, ekstra uyarı EKLENMEZ", async () => {
    const fd = studentFormData();
    fd.set("inviteToPortal", "1");
    fd.set("invitePortalAccessType", "SELF");
    fd.set("invitePortalEmail", "ogrenci@example.com");
    let digest = "";
    try {
      await actions.actionAddStudent(null, fd);
    } catch (e) {
      digest = (e as { digest?: string }).digest ?? "";
    }
    expect(digest).toContain("NEXT_REDIRECT");
    expect(decodeURIComponent(digest)).not.toContain("öğrenci e-postası boş");
  });
});

describe("NeviiOS — panel aksiyonları platform sahibi ve şube müdürüne kapalı", () => {
  it("HYPER_ADMIN kurum seçici ile tek kurum seçse bile panel aksiyonu yazamaz", async () => {
    mockSession.ctx = { role: "HYPER_ADMIN", userId: "hyper1", tenantId: "tenant_platform", channel: "web" };
    mockTenants.list = [
      { tenantId: DEFAULT_TENANT_ID, name: "A" },
      { tenantId: "tenant_other", name: "B" },
    ];
    mockCookieValue.value = DEFAULT_TENANT_ID;
    const { runWithTenantAsync } = await import("../tenant-context");
    const count = async () => (await runWithTenantAsync(DEFAULT_TENANT_ID, () => readData())).students.length;
    const before = await count();
    const result = await actions.actionAddStudent(null, studentFormData());
    expect(result?.ok).toBe(false);
    expect(await count()).toBe(before);
  });

  it("BRANCH_MANAGER kurum geneli panel aksiyonunu çağıramaz", async () => {
    mockSession.ctx = { role: "BRANCH_MANAGER", userId: "bm1", tenantId: DEFAULT_TENANT_ID, channel: "web" };
    const before = await readData();
    const result = await actions.actionAddStudent(null, studentFormData());
    expect(result?.ok).toBe(false);
    expect((await readData()).students.length).toBe(before.students.length);
  });
});

describe("Yazma kapsamı koruması — Yoklama (actionMarkAttendance)", () => {
  it("HYPER_ADMIN 'Tüm kurumlar' modunda reddedilir, yoklama kaydedilmez", async () => {
    mockSession.ctx = { role: "HYPER_ADMIN", userId: "super1", tenantId: DEFAULT_TENANT_ID, channel: "web" };
    mockTenants.list = [
      { tenantId: DEFAULT_TENANT_ID, name: "A" },
      { tenantId: "tenant_other", name: "B" },
    ];
    const before = await readData();
    const fd = new FormData();
    fd.set("lessonId", before.lessons[0].id);
    fd.set("status", "present");
    // P0-2 (2026-08-29) — diğer action'larla AYNI grasyollu desen: THROW ETMEZ, state döner.
    const result = await actions.actionMarkAttendance(null, fd);
    expect(result?.ok).toBe(false);
    expect(result?.message).toBe(ALL_MODE_WRITE_DENIED_MESSAGE);
    const after = await readData();
    expect(after.attendances.length).toBe(before.attendances.length);
  });

  it("var olmayan ders — VALIDATION_ERROR THROW ETMEZ, mesaj döner", async () => {
    mockSession.ctx = { role: "TEACHER", userId: "t1", tenantId: DEFAULT_TENANT_ID, channel: "web", teacherId: "t1" };
    mockCookieValue.value = DEFAULT_TENANT_ID;
    const fd = new FormData();
    fd.set("lessonId", "no-such-lesson");
    fd.set("status", "present");
    const result = await actions.actionMarkAttendance(null, fd);
    expect(result?.ok).toBe(false);
    expect(result?.message).toBeTruthy();
  });
});

describe("Yazma kapsamı koruması — Öğretmenler (actionAddTeacher)", () => {
  it("HYPER_ADMIN 'Tüm kurumlar' modunda reddedilir", async () => {
    mockSession.ctx = { role: "HYPER_ADMIN", userId: "super1", tenantId: DEFAULT_TENANT_ID, channel: "web" };
    mockTenants.list = [
      { tenantId: DEFAULT_TENANT_ID, name: "A" },
      { tenantId: "tenant_other", name: "B" },
    ];
    const fd = new FormData();
    fd.set("name", "Test Öğretmen");
    fd.set("email", "test-teacher@example.com");
    fd.set("phone", "05551111111");
    fd.set("branchId", "erzene");
    fd.set("instrument", "Piyano");
    // P0-2 (2026-08-29) — diğer tüm action'larla AYNI grasyollu desen: THROW ETMEZ, state döner.
    const result = await actions.actionAddTeacher(null, fd);
    expect(result?.ok).toBe(false);
    expect((result as { ok: false; formError?: string } | null)?.formError).toBe(ALL_MODE_WRITE_DENIED_MESSAGE);
  });

  it("kataloga yeni eklenmiş bir enstrüman (ör. 'Bas Gitar') şema seviyesinde REDDEDİLMEZ, THROW ETMEZ", async () => {
    mockSession.ctx = { role: "SCHOOL_ADMIN", userId: "admin1", tenantId: DEFAULT_TENANT_ID, channel: "web" };
    mockCookieValue.value = DEFAULT_TENANT_ID;
    const fd = new FormData();
    fd.set("name", "Bas Gitar Öğretmeni");
    fd.set("email", "basgitar-actions@test.com");
    fd.set("phone", "05551112222");
    fd.set("branchId", "erzene");
    fd.set("instrument", "Bas Gitar");
    const result = await actions.actionAddTeacher(null, fd);
    expect(result).toBeNull(); // null = başarı (redirect yok, mevcut davranış korunur)
  });

  it("boş isim (gerçek geçersiz girdi) THROW ETMEZ, alan bazlı Türkçe hata döner", async () => {
    mockSession.ctx = { role: "SCHOOL_ADMIN", userId: "admin1", tenantId: DEFAULT_TENANT_ID, channel: "web" };
    mockCookieValue.value = DEFAULT_TENANT_ID;
    const fd = new FormData();
    fd.set("name", "");
    fd.set("email", "eksik@test.com");
    fd.set("phone", "05551113333");
    fd.set("branchId", "erzene");
    fd.set("instrument", "Piyano");
    const result = await actions.actionAddTeacher(null, fd);
    expect(result?.ok).toBe(false);
    expect((result as { ok: false; fieldErrors?: Record<string, string> } | null)?.fieldErrors?.name).toBeTruthy();
  });
});

describe("actionAddRoom — P0-2 zarif doğrulama hatası davranışı (throw YOK)", () => {
  it("HYPER_ADMIN 'Tüm kurumlar' modunda THROW ETMEZ, formError döner", async () => {
    mockSession.ctx = { role: "HYPER_ADMIN", userId: "hyper1", tenantId: DEFAULT_TENANT_ID, channel: "web" };
    mockTenants.list = [
      { tenantId: DEFAULT_TENANT_ID, name: "A" },
      { tenantId: "tenant_other", name: "B" },
    ];
    const fd = new FormData();
    fd.set("name", "Stüdyo Test");
    fd.set("branchId", "erzene");
    fd.set("capacity", "2");
    fd.set("instruments", "Piyano");
    const result = await actions.actionAddRoom(null, fd);
    expect(result?.ok).toBe(false);
    expect(result?.formError).toBe(ALL_MODE_WRITE_DENIED_MESSAGE);
  });

  it("hiç enstrüman seçilmemesi (gerçek geçersiz girdi) THROW ETMEZ, alan bazlı hata döner", async () => {
    mockSession.ctx = { role: "SCHOOL_ADMIN", userId: "admin1", tenantId: DEFAULT_TENANT_ID, channel: "web" };
    mockCookieValue.value = DEFAULT_TENANT_ID;
    const fd = new FormData();
    fd.set("name", "Stüdyo Test");
    fd.set("branchId", "erzene");
    fd.set("capacity", "2");
    const result = await actions.actionAddRoom(null, fd);
    expect(result?.ok).toBe(false);
    expect(result?.fieldErrors?.instruments).toBeTruthy();
  });

  it("kataloga yeni eklenmiş bir enstrüman (ör. 'Bas Gitar' — checkbox listesinde olmasa bile formdan gönderilirse) REDDEDİLMEZ", async () => {
    mockSession.ctx = { role: "SCHOOL_ADMIN", userId: "admin1", tenantId: DEFAULT_TENANT_ID, channel: "web" };
    mockCookieValue.value = DEFAULT_TENANT_ID;
    const fd = new FormData();
    fd.set("name", "Bas Gitar Stüdyosu");
    fd.set("branchId", "erzene");
    fd.set("capacity", "2");
    fd.set("instruments", "Bas Gitar");
    const result = await actions.actionAddRoom(null, fd);
    expect(result).toBeNull();
  });
});

describe("actionAddBranch / actionUpdateBranch — P0-2 zarif doğrulama hatası davranışı (throw YOK)", () => {
  it("actionAddBranch: HYPER_ADMIN 'Tüm kurumlar' modunda THROW ETMEZ, formError döner", async () => {
    mockSession.ctx = { role: "HYPER_ADMIN", userId: "hyper1", tenantId: DEFAULT_TENANT_ID, channel: "web" };
    mockTenants.list = [
      { tenantId: DEFAULT_TENANT_ID, name: "A" },
      { tenantId: "tenant_other", name: "B" },
    ];
    const fd = new FormData();
    fd.set("name", "Test Şube");
    fd.set("shortName", "Test");
    fd.set("city", "İzmir");
    fd.set("phone", "05551234567");
    fd.set("address", "Test adres");
    const result = await actions.actionAddBranch(null, fd);
    expect(result?.ok).toBe(false);
    expect(result?.formError).toBe(ALL_MODE_WRITE_DENIED_MESSAGE);
  });

  it("actionAddBranch: boş ad (gerçek geçersiz girdi) THROW ETMEZ, alan bazlı hata döner", async () => {
    mockSession.ctx = { role: "SCHOOL_ADMIN", userId: "admin1", tenantId: DEFAULT_TENANT_ID, channel: "web" };
    mockCookieValue.value = DEFAULT_TENANT_ID;
    const fd = new FormData();
    fd.set("name", "");
    fd.set("shortName", "Test");
    fd.set("city", "İzmir");
    fd.set("phone", "05551234567");
    fd.set("address", "Test adres");
    const result = await actions.actionAddBranch(null, fd);
    expect(result?.ok).toBe(false);
    expect(result?.fieldErrors?.name).toBeTruthy();
  });

  it("actionUpdateBranch: var olmayan şube — iş kuralı hatası THROW ETMEZ, üstte mesaj döner", async () => {
    mockSession.ctx = { role: "SCHOOL_ADMIN", userId: "admin1", tenantId: DEFAULT_TENANT_ID, channel: "web" };
    mockCookieValue.value = DEFAULT_TENANT_ID;
    const fd = new FormData();
    fd.set("branchId", "no-such-branch");
    fd.set("name", "Test Şube");
    fd.set("shortName", "Test");
    fd.set("city", "İzmir");
    fd.set("phone", "05551234567");
    fd.set("address", "Test adres");
    const result = await actions.actionUpdateBranch(null, fd);
    expect(result?.ok).toBe(false);
    expect(result?.formError).toBeTruthy();
  });
});

describe("actionCreateTaskForm — P0-2 zarif doğrulama hatası davranışı (throw YOK)", () => {
  it("HYPER_ADMIN 'Tüm kurumlar' modunda THROW ETMEZ, mesaj döner", async () => {
    mockSession.ctx = { role: "HYPER_ADMIN", userId: "hyper1", tenantId: DEFAULT_TENANT_ID, channel: "web" };
    mockTenants.list = [
      { tenantId: DEFAULT_TENANT_ID, name: "A" },
      { tenantId: "tenant_other", name: "B" },
    ];
    const fd = new FormData();
    fd.set("title", "Test görev");
    fd.set("category", "Kayıt");
    const result = await actions.actionCreateTaskForm(null, fd);
    expect(result?.ok).toBe(false);
    expect(result?.message).toBe(ALL_MODE_WRITE_DENIED_MESSAGE);
  });

  it("boş başlık (gerçek geçersiz girdi) THROW ETMEZ, mesaj döner", async () => {
    mockSession.ctx = { role: "SCHOOL_ADMIN", userId: "admin1", tenantId: DEFAULT_TENANT_ID, channel: "web" };
    mockCookieValue.value = DEFAULT_TENANT_ID;
    const fd = new FormData();
    fd.set("title", "");
    fd.set("category", "Kayıt");
    const result = await actions.actionCreateTaskForm(null, fd);
    expect(result?.ok).toBe(false);
    expect(result?.message).toBeTruthy();
  });

  it("geçerli veriyle THROW ETMEZ, başarıyla döner (bağlamsız görev — redirect YOK, null döner)", async () => {
    mockSession.ctx = { role: "SCHOOL_ADMIN", userId: "admin1", tenantId: DEFAULT_TENANT_ID, channel: "web" };
    mockCookieValue.value = DEFAULT_TENANT_ID;
    const fd = new FormData();
    fd.set("title", "Test görev");
    fd.set("category", "Kayıt");
    const result = await actions.actionCreateTaskForm(null, fd);
    expect(result).toBeNull();
  });
});

describe("Yazma kapsamı koruması — Ödemeler (actionAddPayment / actionMarkPaymentPaid)", () => {
  it("actionAddPayment HYPER_ADMIN 'Tüm kurumlar' modunda reddedilir", async () => {
    mockSession.ctx = { role: "HYPER_ADMIN", userId: "super1", tenantId: DEFAULT_TENANT_ID, channel: "web" };
    mockTenants.list = [
      { tenantId: DEFAULT_TENANT_ID, name: "A" },
      { tenantId: "tenant_other", name: "B" },
    ];
    const fd = new FormData();
    fd.set("studentId", "s1");
    fd.set("description", "Test ödeme");
    fd.set("amount", "1000");
    fd.set("dueDate", "2026-12-01");
    // P0-2 (2026-08-29) — diğer action'larla AYNI grasyollu desen: THROW ETMEZ, state döner.
    const result = await actions.actionAddPayment(null, fd);
    expect(result?.ok).toBe(false);
    expect(result?.formError).toBe(ALL_MODE_WRITE_DENIED_MESSAGE);
  });

  it("actionMarkPaymentPaidDetailed HYPER_ADMIN 'Tüm kurumlar' modunda reddedilir, ödeme durumu değişmez", async () => {
    // NOT (2026-08-29): eski `actionMarkPaymentPaid` (assertOk/throw deseni,
    // AYNI P0 çökme sınıfı) hiçbir UI'dan ÇAĞRILMIYORDU — tamamen
    // `actionMarkPaymentPaidDetailed`'in (zaten grasyollu) süperseti tarafından
    // örtülüyordu. Ölü kod olarak SİLİNDİ; bu test aynı korumayı gerçek
    // çağıran üzerinden doğrular.
    mockSession.ctx = { role: "HYPER_ADMIN", userId: "hyper1", tenantId: DEFAULT_TENANT_ID, channel: "web" };
    mockTenants.list = [
      { tenantId: DEFAULT_TENANT_ID, name: "A" },
      { tenantId: "tenant_other", name: "B" },
    ];
    const before = await readData();
    const unpaid = before.payments.find((p) => p.status !== "paid")!;
    const result = await actions.actionMarkPaymentPaidDetailed({
      paymentId: unpaid.id,
      method: "cash",
      amount: unpaid.amount,
      paidAt: "2026-08-29",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toBe(ALL_MODE_WRITE_DENIED_MESSAGE);
    const after = await readData();
    expect(after.payments.find((p) => p.id === unpaid.id)?.status).toBe(unpaid.status);
  });
});

describe("Yazma kapsamı koruması — Telafi (actionCancelMakeup / actionGenerateSuggestions / actionConfirmSlot)", () => {
  it("actionCancelMakeup HYPER_ADMIN 'Tüm kurumlar' modunda reddedilir", async () => {
    mockSession.ctx = { role: "HYPER_ADMIN", userId: "super1", tenantId: DEFAULT_TENANT_ID, channel: "web" };
    mockTenants.list = [
      { tenantId: DEFAULT_TENANT_ID, name: "A" },
      { tenantId: "tenant_other", name: "B" },
    ];
    const before = await readData();
    const req = before.makeupRequests[0];
    const fd = new FormData();
    fd.set("requestId", req.id);
    // P0-2 (2026-08-29) — diğer action'larla AYNI grasyollu desen: THROW ETMEZ, state döner.
    const result = await actions.actionCancelMakeup(null, fd);
    expect(result?.ok).toBe(false);
    expect(result?.message).toBe(ALL_MODE_WRITE_DENIED_MESSAGE);
    const after = await readData();
    expect(after.makeupRequests.find((m) => m.id === req.id)?.status).toBe(req.status);
  });

  it("actionGenerateSuggestions HYPER_ADMIN 'Tüm kurumlar' modunda reddedilir", async () => {
    mockSession.ctx = { role: "HYPER_ADMIN", userId: "super1", tenantId: DEFAULT_TENANT_ID, channel: "web" };
    mockTenants.list = [
      { tenantId: DEFAULT_TENANT_ID, name: "A" },
      { tenantId: "tenant_other", name: "B" },
    ];
    const before = await readData();
    const req = before.makeupRequests[0];
    const fd = new FormData();
    fd.set("requestId", req.id);
    const result = await actions.actionGenerateSuggestions(null, fd);
    expect(result?.ok).toBe(false);
    expect(result?.message).toBe(ALL_MODE_WRITE_DENIED_MESSAGE);
  });

  it("actionConfirmSlot: var olmayan istek — VALIDATION_ERROR THROW ETMEZ, mesaj döner", async () => {
    mockSession.ctx = { role: "SCHOOL_ADMIN", userId: "admin1", tenantId: DEFAULT_TENANT_ID, channel: "web" };
    mockCookieValue.value = DEFAULT_TENANT_ID;
    const fd = new FormData();
    fd.set("requestId", "no-such-request");
    fd.set("slot", JSON.stringify({ teacherId: "t1", roomId: "r1", branchId: "erzene", startAt: "2026-09-01T10:00:00.000Z", endAt: "2026-09-01T10:30:00.000Z" }));
    fd.set("decisionNote", "Test onay notu");
    const result = await actions.actionConfirmSlot(null, fd);
    expect(result?.ok).toBe(false);
    expect(result?.message).toBeTruthy();
  });
});

describe("Yazma kapsamı koruması — Öğretmenler + Hakediş (fee rule / payout)", () => {
  it("actionCreateFeeRule HYPER_ADMIN 'Tüm kurumlar' modunda tam mesajla reddedilir (nesne döner, fırlatmaz)", async () => {
    mockSession.ctx = { role: "HYPER_ADMIN", userId: "super1", tenantId: DEFAULT_TENANT_ID, channel: "web" };
    mockTenants.list = [
      { tenantId: DEFAULT_TENANT_ID, name: "A" },
      { tenantId: "tenant_other", name: "B" },
    ];
    const result = await actions.actionCreateFeeRule({
      teacherId: "t1",
      perMinuteRate: 10,
      effectiveFrom: "2026-01-01",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe(ALL_MODE_WRITE_DENIED_MESSAGE);
  });

  it("actionComputeTeacherPayout HYPER_ADMIN 'Tüm kurumlar' modunda tam mesajla reddedilir", async () => {
    mockSession.ctx = { role: "HYPER_ADMIN", userId: "super1", tenantId: DEFAULT_TENANT_ID, channel: "web" };
    mockTenants.list = [
      { tenantId: DEFAULT_TENANT_ID, name: "A" },
      { tenantId: "tenant_other", name: "B" },
    ];
    const result = await actions.actionComputeTeacherPayout({
      teacherId: "t1",
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe(ALL_MODE_WRITE_DENIED_MESSAGE);
  });

  it("actionUpdateFeeRule tek bir geçerli kurum seçiliyken başarılı olur (kayıtlı seed kuralı güncellenir)", async () => {
    mockSession.ctx = { role: "SUPER_ADMIN", userId: "super1", tenantId: DEFAULT_TENANT_ID, channel: "web" };
    mockTenants.list = [{ tenantId: DEFAULT_TENANT_ID, name: "A" }];
    mockCookieValue.value = DEFAULT_TENANT_ID;
    const before = await readData();
    const existingRule = before.teacherFeeRules.find((r) => r.teacherId === "t1")!;
    const result = await actions.actionUpdateFeeRule({
      ruleId: existingRule.id,
      perMinuteRate: 15,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.rule.perMinuteRate).toBe(15);
  });
});

describe("Program (canCreate) referans davranışı değişmedi", () => {
  it("actionAddLesson HYPER_ADMIN 'Tüm kurumlar' modunda tam mesajla reddedilir (nesne döner)", async () => {
    mockSession.ctx = { role: "HYPER_ADMIN", userId: "super1", tenantId: DEFAULT_TENANT_ID, channel: "web" };
    mockTenants.list = [
      { tenantId: DEFAULT_TENANT_ID, name: "A" },
      { tenantId: "tenant_other", name: "B" },
    ];
    const fd = new FormData();
    fd.set("studentId", "s1");
    fd.set("teacherId", "t1");
    fd.set("roomId", "r1");
    fd.set("instrument", "Piyano");
    fd.set("startAt", "2026-09-01T10:00");
    const result = await actions.actionAddLesson(fd);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe(ALL_MODE_WRITE_DENIED_MESSAGE);
  });
});

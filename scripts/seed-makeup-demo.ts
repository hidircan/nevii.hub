/**
 * P0 (2026-09-03) — Telafi Merkezi (dönem başına 2 hak) + program vitrini
 * demo/QA seed script'i. Dev/demo-only: PRODUCTION'da (NODE_ENV veya
 * VERCEL_ENV=production) KOŞULSUZ reddedilir — bkz. seed-attendance-demo.ts
 * ile AYNI ilke, buradan kopyalanmadı, yalnız aynı deseni izler.
 *
 * Kapsam:
 *  - Öğrenci A: aktif dönemde 1 onaylı (confirmed) telafi → "1 / 2 kullanıldı · 1 hak kaldı"
 *  - Öğrenci B: aktif dönemde 2 onaylı telafi → "2 / 2 kullanıldı · Hak kalmadı"
 *  - Öğrenci C: ÖNCEKİ dönemde 2 onaylı telafi, aktif dönemde 0 → "0 / 2 kullanıldı · 2 hak kaldı"
 *  - Öğrenci D: iptal edilmiş telafi talebi → kota tüketmez
 *  - Program Vitrini öğrencisi: ≥8 geçmiş ders (≥2 Geldi, ≥2 İşlendi, ≥2
 *    Telafi, ≥1 İptal) + ≥3 gelecek Planlandı ders, farklı gün/saatlere
 *    dağıtılmış.
 *
 * Telafi talepleri GERÇEK Tool Layer çağrılarıyla (createMakeupLessonTool /
 * cancelMakeupLessonTool) üretilir — kota kontrolü (assertCanCreateMakeup)
 * dahil tüm iş kuralları GERÇEKTEN çalışır. Üretim akışlarının BİLEREK
 * reddettiği iki kayıt — geçmiş tarihli ders (PAST_START) ve önceki dönemde
 * kalmış bir talebin onaylanması (AFTER_EXPIRY) — store soyutlamasının
 * demo'ya özel `seedDemoRecords` kapısından yazılır (bkz. src/lib/demo-seed.ts).
 * Bu kapı AKTİF store'a yazar, yani `STORE_MODE=db` altında kayıtlar JSON
 * dosyasına DEĞİL PostgreSQL'e gider.
 *
 * İdempotenlik: script kendi DEMO öğretmeninin adından (aşağıdaki DEMO_TAG'i
 * içeren) tanır — ikinci çalıştırmada bu öğretmen zaten varsa TÜM seed adımı
 * atlanır.
 *
 * STORE_MODE=json UYARISI: bu scripti `npm run dev` AÇIKKEN çalıştırmayın
 * (cross-process dosya kilidi yok, bkz. src/lib/atomic-json-file.ts).
 *
 * Kullanım: npm run seed:makeup-demo (== npx tsx scripts/seed-makeup-demo.ts)
 */
import "dotenv/config";
import { assertSeedTarget } from "../src/lib/env/test-target-guard";
import { readData, seedDemoRecords } from "../src/lib/store";
import { runWithTenantAsync } from "../src/lib/tenant-context";
import { DEFAULT_TENANT_ID } from "../src/lib/auth/config";
import {
  createTeacherTool,
  createRoomTool,
  createStudentTool,
  createLessonTool,
  createMakeupLessonTool,
  cancelMakeupLessonTool,
  setLessonOpsFlagTool,
  cancelLessonTool,
} from "../src/lib/services/tools";
import type { ServiceContext } from "../src/lib/services/context";
import { resolveDayStatus, resolveLessonAcademicPeriod } from "../src/lib/attendance-calendar";
import { listClosedDays } from "../src/lib/closed-day-overrides";

const DEMO_TAG = "[DEMO-TELAFİ]";
const DEMO_TEACHER_NAME = `${DEMO_TAG} Telafi Öğretmeni`;
const DEMO_ROOM_NAME = `${DEMO_TAG} Telafi Odası`;
/** Seed'in EN SON oluşturduğu öğrenci — "demo tam" işareti olarak kullanılır. */
const DEMO_SHOWCASE_NAME = `${DEMO_TAG} Program Vitrini`;
const BRANCH_ID = "erzene";
const INSTRUMENT = "Piyano";

const ctx: ServiceContext = {
  role: "SCHOOL_ADMIN",
  tenantId: DEFAULT_TENANT_ID,
  userId: "seed_makeup_demo_script",
  channel: "web",
};

async function requireOk<T>(
  label: string,
  promise: Promise<{ ok: true; data: T } | { ok: false; error: { message: string } }>
): Promise<T> {
  const res = await promise;
  if (!res.ok) throw new Error(`${label} başarısız: ${res.error.message}`);
  return res.data;
}

function isoDaysAgo(days: number, hour = "10:00"): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  const [h, m] = hour.split(":").map(Number);
  d.setUTCHours(h, m, 0, 0);
  return d.toISOString();
}

function isoDaysAhead(days: number, hour = "10:00"): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  const [h, m] = hour.split(":").map(Number);
  d.setUTCHours(h, m, 0, 0);
  return d.toISOString();
}

/** Ağustos (önceki eğitim dönemi = "yaz") içinde, bugünden ~5 ay önceye denk bir tarih. */
function isoPreviousPeriod(day: number, hour = "10:00"): string {
  const now = new Date();
  const year = now.getUTCMonth() + 1 >= 9 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const [h, m] = hour.split(":").map(Number);
  return new Date(Date.UTC(year, 7, day, h, m, 0)).toISOString(); // ay index 7 = Ağustos
}

async function main() {
  assertSeedTarget();
  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
    console.error(
      "[HATA] Bu script PRODUCTION ortamında ÇALIŞTIRILAMAZ (NODE_ENV/VERCEL_ENV=production). " +
        "Yalnız dev/demo ortamları içindir."
    );
    process.exit(1);
  }
  if (process.env.STORE_MODE === "json") {
    console.warn(
      "[UYARI] STORE_MODE=json — `npm run dev` şu an açık bir process'te " +
        "çalışıyorsa bu scripti ÇALIŞTIRMAYIN. Önce dev server'ı durdurun."
    );
  }

  await runWithTenantAsync(DEFAULT_TENANT_ID, async () => {
    const before = await readData();

    /**
     * İdempotenlik işareti, ÖĞRETMEN değil EN SON oluşturulan öğrencidir.
     * Öğretmene bakmak, yarıda kalan bir seed'i kalıcı olarak kilitliyordu:
     * öğretmen ilk adımda yazılıyor, sonraki bir adım patlarsa script bir
     * daha ASLA devam edemiyor ("zaten seed edilmiş" deyip çıkıyor) ve
     * öğrenci/ders hiç oluşmuyordu.
     */
    const existingShowcase = before.students.find(
      (student) => student.name === DEMO_SHOWCASE_NAME
    );
    const showcaseFutureLessons = existingShowcase
      ? before.lessons.filter(
          (lesson) =>
            lesson.studentId === existingShowcase.id && new Date(lesson.startAt) > new Date()
        ).length
      : 0;
    if (showcaseFutureLessons >= 3) {
      console.log(
        `Atlandı — demo zaten TAM seed edilmiş ("${DEMO_SHOWCASE_NAME}" + ` +
          `${showcaseFutureLessons} gelecek ders mevcut). Yinelenen kayıt oluşturulmadı.`
      );
      return;
    }

    /**
     * Buraya düşüyorsak ya hiç seed yok ya da yarım kalmış bir çalıştırma var.
     * Her adım "zaten var mı" diye bakar (öğretmen/oda/öğrenci ada göre,
     * öğrencinin ders üretimi ise o öğrencinin HİÇ dersi yoksa) — böylece
     * yarım kalan seed kaldığı yerden tamamlanır, tamamlananlar yinelenmez.
     */
    const studentsWithLessons = new Set(before.lessons.map((lesson) => lesson.studentId));

    const wideOpenAvailability = Array.from({ length: 7 }, (_, dayOfWeek) => ({
      dayOfWeek,
      start: "00:00",
      end: "23:59",
    }));

    /**
     * Yoklama/ops araçları (setLessonOpsFlagTool, cancelLessonTool,
     * createLessonTool) KAPALI günde (Pazartesi, dönem haftalık kuralı, resmî
     * tatil, manuel istisna) işlem yapmayı reddeder. Sabit gün ofsetleri
     * (isoDaysAgo(20) gibi) scriptin ÇALIŞTIRILDIĞI güne göre kapalı bir güne
     * denk gelebiliyordu — seed o zaman patlıyordu, yani takvime bağlı olarak
     * bazen geçip bazen kalıyordu. Tarihler artık aracın kullandığı AYNI
     * kaynakla (`resolveDayStatus`) seçiliyor.
     */
    const closedDayOverrides = await listClosedDays(ctx.tenantId);
    const weeklyClosedDays = before.settings.termWeeklyClosedDays;
    function isOpenDay(iso: string): boolean {
      return (
        resolveDayStatus(new Date(iso), "guz", closedDayOverrides, weeklyClosedDays).status !==
        "closed"
      );
    }

    /** `startDaysAgo`'dan geriye doğru yürüyerek `count` adet AÇIK gün üretir. */
    function openPastDates(startDaysAgo: number, count: number, hours: string[]): string[] {
      const found: string[] = [];
      for (let offset = startDaysAgo; offset > 0 && found.length < count; offset -= 1) {
        const iso = isoDaysAgo(offset, hours[found.length % hours.length]);
        if (isOpenDay(iso)) found.push(iso);
      }
      if (found.length < count) {
        throw new Error(
          `Program Vitrini için ${count} açık geçmiş gün bulunamadı (${found.length} bulundu) — ` +
            "kapalı gün kuralları demo için fazla dar."
        );
      }
      return found;
    }

    /**
     * Telafi kotası DÖNEM başınadır (`countStudentMakeupsInPeriod`). "N gün
     * önce" sabit ofsetleri dönem sınırını görmez: dönem başında çalıştırılan
     * seed, "aktif dönem" senaryolarını (Öğrenci A/B) bir ÖNCEKİ döneme
     * yazıyordu — B "2/2 kullanıldı" yerine "0/2" görünüyordu. Tarihler artık
     * uygulamanın kendi dönem çözümleyicisiyle seçiliyor.
     */
    const periodKeyOf = (iso: string): string => {
      const period = resolveLessonAcademicPeriod({ startAt: iso }, "guz");
      return `${period.academicYearStart}-${period.term}`;
    };
    const activePeriodKey = periodKeyOf(new Date().toISOString());

    /** AKTİF dönemde kalan, kapalı olmayan geçmiş günler. */
    function activePeriodPastDates(count: number, hours: string[]): string[] {
      const found: string[] = [];
      for (let offset = 1; offset <= 120 && found.length < count; offset += 1) {
        const iso = isoDaysAgo(offset, hours[found.length % hours.length]);
        if (periodKeyOf(iso) !== activePeriodKey) continue;
        if (isOpenDay(iso)) found.push(iso);
      }
      if (found.length < count) {
        throw new Error(
          `Aktif dönemde (${activePeriodKey}) ${count} açık geçmiş gün bulunamadı ` +
            `(${found.length} bulundu). Dönem henüz çok yeni olabilir — telafi ` +
            "senaryoları aktif dönemde geçmiş ders gerektirir."
        );
      }
      return found;
    }

    /** Bugünden ileriye yürüyerek `count` adet AÇIK gün üretir. */
    function openFutureDates(startDaysAhead: number, count: number, hours: string[]): string[] {
      const found: string[] = [];
      for (let offset = startDaysAhead; offset < startDaysAhead + 90 && found.length < count; offset += 1) {
        const iso = isoDaysAhead(offset, hours[found.length % hours.length]);
        if (isOpenDay(iso)) found.push(iso);
      }
      if (found.length < count) {
        throw new Error(`Program Vitrini için ${count} açık gelecek gün bulunamadı.`);
      }
      return found;
    }

    // Öğretmen/oda yarım kalmış bir çalıştırmadan kalmış olabilir — varsa
    // yeniden kullanılır, yoksa oluşturulur (yinelenen kayıt üretmez).
    const teacherId: string =
      before.teachers.find((teacher) => teacher.name === DEMO_TEACHER_NAME)?.id ??
      (await requireOk(
        "createTeacherTool",
        createTeacherTool(ctx, {
          name: DEMO_TEACHER_NAME,
          email: "",
          phone: "0500 000 0001",
          branchId: BRANCH_ID,
          instrument: INSTRUMENT,
          availability: wideOpenAvailability,
        })
      ).then((d) => d.teacherId));

    const roomId: string =
      before.rooms.find((room) => room.name === DEMO_ROOM_NAME)?.id ??
      (await requireOk(
        "createRoomTool",
        createRoomTool(ctx, {
          name: DEMO_ROOM_NAME,
          branchId: BRANCH_ID,
          capacity: 1,
          instruments: [INSTRUMENT],
        })
      ).then((d) => d.roomId));

    /** Ada göre bulur, yoksa oluşturur — yarım kalan seed yinelenen öğrenci üretmez. */
    async function createDemoStudent(name: string, phoneSuffix: string): Promise<string> {
      const existing = before.students.find((student) => student.name === name);
      if (existing) return existing.id;
      return requireOk(
        "createStudentTool",
        createStudentTool(ctx, {
          name,
          email: "",
          phone: `0500 000 ${phoneSuffix}`,
          parentName: `${DEMO_TAG} Veli`,
          parentPhone: `0500 111 ${phoneSuffix}`,
          branchId: BRANCH_ID,
          instrument: INSTRUMENT,
          teacherId,
          packageName: "Bireysel Aylık — 4 ders",
          weeklyLessonCount: 1,
          monthlyFee: 3000,
          enrollmentStartDate: isoDaysAgo(120).slice(0, 10),
          firstPaymentCollected: { method: "cash", amount: 3000, collectedAt: isoDaysAgo(120).slice(0, 10) },
          // Kayıt 120 gün geriye tarihli olduğu için motorun ürettiği ilk dönem
          // tutarı oransal çıkıyor ve sabit 3000 TL'den farklı oluyor; bu fark
          // `first-payment-adjustment.ts` gereği GEREKÇESİZ geçemez (otomatik ≠
          // manuel → reddedilir). Demo tutarını sabit tutmak bilinçli bir
          // override, o yüzden gerekçe açıkça veriliyor — audit izi üretilir.
          firstPaymentAdjustmentReason: `${DEMO_TAG} demo verisi — sabit gösterim tutarı.`,
        })
      ).then((d) => d.studentId);
    }

    // Geçmiş bir ders TAM Tool katmanından geçirilemez (`createLessonTool`
    // geçmiş startAt'ı reddeder; `validateLessonSlot` PAST_START). Bu koruma
    // GERÇEK kullanıcı hatalarını önler ve GEVŞETİLMEZ — bunun yerine kayıt,
    // store soyutlamasının demo'ya özel kapısından geçer. Kritik fark: bu kapı
    // AKTİF store'a yazar, yani `STORE_MODE=db` altında ders PostgreSQL'e
    // gider. (Eskiden doğrudan `store-json` kullanılıyordu; db modunda dersler
    // JSON dosyasına, telafi talepleri veritabanına yazılıp veri ikiye
    // bölünüyordu — bkz. src/lib/demo-seed.ts.)
    async function createPastLesson(studentId: string, startAt: string): Promise<string> {
      const endAt = new Date(new Date(startAt).getTime() + 40 * 60_000).toISOString();
      const { lessonIds } = await seedDemoRecords({
        lessons: [
          {
            studentId,
            teacherId,
            roomId,
            branchId: BRANCH_ID,
            instrument: INSTRUMENT,
            startAt,
            endAt,
            type: "regular",
            status: "scheduled",
          },
        ],
      });
      return lessonIds[0];
    }

    /** `createMakeupLessonTool` üzerinden GERÇEK kota kontrolüyle bir "pending" talep açar. */
    async function openMakeupRequest(lessonId: string): Promise<string> {
      const requestId = await requireOk(
        "createMakeupLessonTool",
        createMakeupLessonTool(ctx, {
          lessonId,
          status: "absent",
          reason: `${DEMO_TAG} devamsızlık.`,
        })
      ).then((d) => d.requestId);
      return requestId;
    }

    /**
     * "pending → confirmed" geçişi gerçek akışta öğretmen uygunluğu/slot
     * önerisi + onay gerektirir. Öğrenci C senaryosu ÖNCEKİ dönemde kaldığı
     * için `confirmMakeupSlot` onu AFTER_EXPIRY ile reddeder — yani gerçek
     * akışla ÜRETİLEMEZ. Bu yüzden karar, store'un demo kapısından yazılır;
     * `createPastLesson` ile AYNI kapı, dolayısıyla telafi kararı ve kaynak
     * ders HER ZAMAN aynı persistence backend'ine gider.
     */
    async function markConfirmed(requestId: string): Promise<void> {
      await seedDemoRecords({
        makeupDecisions: [
          {
            requestId,
            status: "confirmed",
            decidedBy: ctx.userId,
            decisionNote: `${DEMO_TAG} demo onayı`,
          },
        ],
      });
    }

    // A/B/D senaryoları AKTİF dönemde geçmiş ders ister (C bilerek önceki
    // dönemde kalır). 4 gün: A=1, B=2, D=1.
    const activePast = activePeriodPastDates(4, ["10:00", "11:00", "14:00", "15:00"]);

    // Bir öğrencinin DERSİ zaten varsa, telafi senaryosu önceki (yarım kalan)
    // çalıştırmada tamamlanmış demektir — yeniden üretmek kotayı bozar.
    const needsScenario = (studentId: string) => !studentsWithLessons.has(studentId);

    // ---- Öğrenci A: aktif dönemde 1 onaylı telafi ----
    const studentA = await createDemoStudent(`${DEMO_TAG} Öğrenci A`, "2001");
    if (needsScenario(studentA)) {
      const lessonA1 = await createPastLesson(studentA, activePast[0]);
      await markConfirmed(await openMakeupRequest(lessonA1));
    }

    // ---- Öğrenci B: aktif dönemde 2 onaylı telafi (hak kalmadı) ----
    const studentB = await createDemoStudent(`${DEMO_TAG} Öğrenci B`, "2002");
    if (needsScenario(studentB)) {
      const lessonB1 = await createPastLesson(studentB, activePast[1]);
      await markConfirmed(await openMakeupRequest(lessonB1));
      const lessonB2 = await createPastLesson(studentB, activePast[2]);
      await markConfirmed(await openMakeupRequest(lessonB2));
    }

    // ---- Öğrenci C: ÖNCEKİ dönemde 2 onaylı telafi, aktif dönemde 0 ----
    const studentC = await createDemoStudent(`${DEMO_TAG} Öğrenci C`, "2003");
    if (needsScenario(studentC)) {
      const lessonC1 = await createPastLesson(studentC, isoPreviousPeriod(10));
      await markConfirmed(await openMakeupRequest(lessonC1));
      const lessonC2 = await createPastLesson(studentC, isoPreviousPeriod(12));
      await markConfirmed(await openMakeupRequest(lessonC2));
    }

    // ---- Öğrenci D: iptal edilmiş telafi talebi — kota tüketmez ----
    const studentD = await createDemoStudent(`${DEMO_TAG} Öğrenci D`, "2004");
    if (needsScenario(studentD)) {
      const lessonD1 = await createPastLesson(studentD, activePast[3]);
      const requestD1 = await openMakeupRequest(lessonD1);
      await requireOk(
        "cancelMakeupLessonTool",
        cancelMakeupLessonTool(ctx, { requestId: requestD1, decisionNote: `${DEMO_TAG} veli vazgeçti.` })
      );
    }

    // ---- Program Vitrini öğrencisi: geçmiş + gelecek ders programı ----
    const showcase = await createDemoStudent(DEMO_SHOWCASE_NAME, "2005");
    /**
     * A–D ile AYNI kural: vitrin öğrencisinin dersleri zaten üretilmişse
     * yeniden üretilmez. Bu blok eskiden koşulsuzdu — yarıda kalıp tekrar
     * çalıştırılan her seed, vitrine 8 ders DAHA ekliyordu (aynı öğrenci +
     * aynı başlangıç saatiyle yinelenen dersler).
     */
    if (!needsScenario(showcase)) {
      console.log(
        `Program Vitrini dersleri zaten mevcut — yeniden üretilmedi. ` +
          `(Gelecek ders sayısı ${showcaseFutureLessons} < 3 ise demo yarım kalmıştır; ` +
          "vitrin öğrencisinin derslerini temizleyip scripti tekrar çalıştırın.)"
      );
      console.log("Tamamlandı — mevcut demo verisi korundu.");
      return;
    }

    // 8 geçmiş + 3 gelecek AÇIK gün — saatler bilinçli olarak farklı, vitrin
    // farklı gün/saatlere dağılmış bir program göstersin.
    const past = openPastDates(20, 8, ["10:00", "14:00", "16:00", "11:00", "09:00"]);
    const upcoming = openFutureDates(2, 3, ["10:00", "15:00", "17:00"]);

    const attended1 = await createPastLesson(showcase, past[0]);
    await requireOk("setLessonOpsFlagTool(attended)", setLessonOpsFlagTool(ctx, { lessonId: attended1, flag: "attended" }));
    const attended2 = await createPastLesson(showcase, past[1]);
    await requireOk("setLessonOpsFlagTool(attended)", setLessonOpsFlagTool(ctx, { lessonId: attended2, flag: "attended" }));

    const processed1 = await createPastLesson(showcase, past[2]);
    await requireOk(
      "setLessonOpsFlagTool(processed)",
      setLessonOpsFlagTool(ctx, { lessonId: processed1, flag: "processed", reason: `${DEMO_TAG} işlendi.` })
    );
    const processed2 = await createPastLesson(showcase, past[3]);
    await requireOk(
      "setLessonOpsFlagTool(processed)",
      setLessonOpsFlagTool(ctx, { lessonId: processed2, flag: "processed", reason: `${DEMO_TAG} işlendi.` })
    );

    const makeup1 = await createPastLesson(showcase, past[4]);
    await requireOk(
      "setLessonOpsFlagTool(makeup)",
      setLessonOpsFlagTool(ctx, { lessonId: makeup1, flag: "makeup", reason: `${DEMO_TAG} telafi.` })
    );
    const makeup2 = await createPastLesson(showcase, past[5]);
    await requireOk(
      "setLessonOpsFlagTool(makeup)",
      setLessonOpsFlagTool(ctx, { lessonId: makeup2, flag: "makeup", reason: `${DEMO_TAG} telafi.` })
    );

    const cancelled1 = await createPastLesson(showcase, past[6]);
    await requireOk("cancelLessonTool", cancelLessonTool(ctx, { lessonId: cancelled1 }));

    const past8 = await createPastLesson(showcase, past[7]);
    await requireOk("setLessonOpsFlagTool(attended)", setLessonOpsFlagTool(ctx, { lessonId: past8, flag: "attended" }));

    const upcoming1 = await requireOk(
      "createLessonTool",
      createLessonTool(ctx, {
        studentId: showcase,
        teacherId,
        roomId,
        instrument: INSTRUMENT,
        startAt: upcoming[0],
      })
    ).then((d) => d.lessonId);
    const upcoming2 = await requireOk(
      "createLessonTool",
      createLessonTool(ctx, {
        studentId: showcase,
        teacherId,
        roomId,
        instrument: INSTRUMENT,
        startAt: upcoming[1],
      })
    ).then((d) => d.lessonId);
    const upcoming3 = await requireOk(
      "createLessonTool",
      createLessonTool(ctx, {
        studentId: showcase,
        teacherId,
        roomId,
        instrument: INSTRUMENT,
        startAt: upcoming[2],
      })
    ).then((d) => d.lessonId);

    console.log("Tamamlandı — Telafi Merkezi demo verisi oluşturuldu:");
    console.log(`  Öğretmen: ${DEMO_TEACHER_NAME} (${teacherId})`);
    console.log(`  Oda: ${DEMO_ROOM_NAME} (${roomId})`);
    console.log(`  Öğrenci A (${studentA}): 1 / 2 kullanıldı · 1 hak kaldı`);
    console.log(`  Öğrenci B (${studentB}): 2 / 2 kullanıldı · Hak kalmadı`);
    console.log(`  Öğrenci C (${studentC}): önceki dönem 2 telafi, aktif dönemde 0 / 2 kullanıldı · 2 hak kaldı`);
    console.log(`  Öğrenci D (${studentD}): 1 iptal edilmiş talep — kota tüketmedi`);
    console.log(
      `  Program vitrini (${showcase}): 8 geçmiş ders (2 Geldi, 2 İşlendi, 2 Telafi, 1 İptal, 1 Geldi) + 3 gelecek Planlandı (${upcoming1}, ${upcoming2}, ${upcoming3})`
    );
    console.log("  Telafi Merkezi: /panel/telafi — Yoklama takvimi/raporu ve öğretmen/öğrenci programı ekranlarında da görünür.");
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

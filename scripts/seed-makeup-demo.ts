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

const DEMO_TAG = "[DEMO-TELAFİ]";
const DEMO_TEACHER_NAME = `${DEMO_TAG} Telafi Öğretmeni`;
const DEMO_ROOM_NAME = `${DEMO_TAG} Telafi Odası`;
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
    const alreadySeeded = before.teachers.some((t) => t.name === DEMO_TEACHER_NAME);
    if (alreadySeeded) {
      console.log(
        `Atlandı — demo zaten seed edilmiş (öğretmen "${DEMO_TEACHER_NAME}" mevcut). ` +
          "Yinelenen kayıt oluşturulmadı."
      );
      return;
    }

    const wideOpenAvailability = Array.from({ length: 7 }, (_, dayOfWeek) => ({
      dayOfWeek,
      start: "00:00",
      end: "23:59",
    }));

    const teacherId = await requireOk(
      "createTeacherTool",
      createTeacherTool(ctx, {
        name: DEMO_TEACHER_NAME,
        email: "",
        phone: "0500 000 0001",
        branchId: BRANCH_ID,
        instrument: INSTRUMENT,
        availability: wideOpenAvailability,
      })
    ).then((d) => d.teacherId);

    const roomId = await requireOk(
      "createRoomTool",
      createRoomTool(ctx, {
        name: DEMO_ROOM_NAME,
        branchId: BRANCH_ID,
        capacity: 1,
        instruments: [INSTRUMENT],
      })
    ).then((d) => d.roomId);

    async function createDemoStudent(name: string, phoneSuffix: string): Promise<string> {
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

    // ---- Öğrenci A: aktif dönemde 1 onaylı telafi ----
    const studentA = await createDemoStudent(`${DEMO_TAG} Öğrenci A`, "2001");
    const lessonA1 = await createPastLesson(studentA, isoDaysAgo(5));
    await markConfirmed(await openMakeupRequest(lessonA1));

    // ---- Öğrenci B: aktif dönemde 2 onaylı telafi (hak kalmadı) ----
    const studentB = await createDemoStudent(`${DEMO_TAG} Öğrenci B`, "2002");
    const lessonB1 = await createPastLesson(studentB, isoDaysAgo(6));
    await markConfirmed(await openMakeupRequest(lessonB1));
    const lessonB2 = await createPastLesson(studentB, isoDaysAgo(7));
    await markConfirmed(await openMakeupRequest(lessonB2));

    // ---- Öğrenci C: ÖNCEKİ dönemde 2 onaylı telafi, aktif dönemde 0 ----
    const studentC = await createDemoStudent(`${DEMO_TAG} Öğrenci C`, "2003");
    const lessonC1 = await createPastLesson(studentC, isoPreviousPeriod(10));
    await markConfirmed(await openMakeupRequest(lessonC1));
    const lessonC2 = await createPastLesson(studentC, isoPreviousPeriod(12));
    await markConfirmed(await openMakeupRequest(lessonC2));

    // ---- Öğrenci D: iptal edilmiş telafi talebi — kota tüketmez ----
    const studentD = await createDemoStudent(`${DEMO_TAG} Öğrenci D`, "2004");
    const lessonD1 = await createPastLesson(studentD, isoDaysAgo(4));
    const requestD1 = await openMakeupRequest(lessonD1);
    await requireOk(
      "cancelMakeupLessonTool",
      cancelMakeupLessonTool(ctx, { requestId: requestD1, decisionNote: `${DEMO_TAG} veli vazgeçti.` })
    );

    // ---- Program Vitrini öğrencisi: geçmiş + gelecek ders programı ----
    const showcase = await createDemoStudent(`${DEMO_TAG} Program Vitrini`, "2005");

    const attended1 = await createPastLesson(showcase, isoDaysAgo(20));
    await requireOk("setLessonOpsFlagTool(attended)", setLessonOpsFlagTool(ctx, { lessonId: attended1, flag: "attended" }));
    const attended2 = await createPastLesson(showcase, isoDaysAgo(19, "14:00"));
    await requireOk("setLessonOpsFlagTool(attended)", setLessonOpsFlagTool(ctx, { lessonId: attended2, flag: "attended" }));

    const processed1 = await createPastLesson(showcase, isoDaysAgo(18));
    await requireOk(
      "setLessonOpsFlagTool(processed)",
      setLessonOpsFlagTool(ctx, { lessonId: processed1, flag: "processed", reason: `${DEMO_TAG} işlendi.` })
    );
    const processed2 = await createPastLesson(showcase, isoDaysAgo(17, "16:00"));
    await requireOk(
      "setLessonOpsFlagTool(processed)",
      setLessonOpsFlagTool(ctx, { lessonId: processed2, flag: "processed", reason: `${DEMO_TAG} işlendi.` })
    );

    const makeup1 = await createPastLesson(showcase, isoDaysAgo(16));
    await requireOk(
      "setLessonOpsFlagTool(makeup)",
      setLessonOpsFlagTool(ctx, { lessonId: makeup1, flag: "makeup", reason: `${DEMO_TAG} telafi.` })
    );
    const makeup2 = await createPastLesson(showcase, isoDaysAgo(15, "11:00"));
    await requireOk(
      "setLessonOpsFlagTool(makeup)",
      setLessonOpsFlagTool(ctx, { lessonId: makeup2, flag: "makeup", reason: `${DEMO_TAG} telafi.` })
    );

    const cancelled1 = await createPastLesson(showcase, isoDaysAgo(14));
    await requireOk("cancelLessonTool", cancelLessonTool(ctx, { lessonId: cancelled1 }));

    const past8 = await createPastLesson(showcase, isoDaysAgo(13, "09:00"));
    await requireOk("setLessonOpsFlagTool(attended)", setLessonOpsFlagTool(ctx, { lessonId: past8, flag: "attended" }));

    const upcoming1 = await requireOk(
      "createLessonTool",
      createLessonTool(ctx, {
        studentId: showcase,
        teacherId,
        roomId,
        instrument: INSTRUMENT,
        startAt: isoDaysAhead(2, "10:00"),
      })
    ).then((d) => d.lessonId);
    const upcoming2 = await requireOk(
      "createLessonTool",
      createLessonTool(ctx, {
        studentId: showcase,
        teacherId,
        roomId,
        instrument: INSTRUMENT,
        startAt: isoDaysAhead(9, "15:00"),
      })
    ).then((d) => d.lessonId);
    const upcoming3 = await requireOk(
      "createLessonTool",
      createLessonTool(ctx, {
        studentId: showcase,
        teacherId,
        roomId,
        instrument: INSTRUMENT,
        startAt: isoDaysAhead(16, "17:00"),
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

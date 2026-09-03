/**
 * P0-F (2026-09-02) — Yoklama Raporu (`/panel/yoklama-raporu`) demo/QA seed
 * script'i. Dev/demo-only: PRODUCTION'da KOŞULSUZ reddedilir (aşağıdaki
 * NODE_ENV kontrolü). Amaç, rapordaki HER durum rengini VE risk bildirimi
 * akışını GERÇEK Tool Layer çağrılarıyla (setLessonOpsFlagTool,
 * cancelLessonTool — src/lib/services/tools.ts) üretmek; store'a doğrudan
 * satır yazmak DEĞİL — böylece risk bildirimi
 * (notifyAttendanceRiskIfThresholdCrossed, bkz. attendance-risk-check.ts)
 * ve tüm iş kuralları (kapalı gün, gerekçe zorunluluğu vb.) gerçek üretim
 * kodundan aynen geçer.
 *
 * Kapsanan durumlar (hepsi GEÇMİŞ — 2026-08, "bugün"den — 2026-09-02 —
 * önceki bir ay, rapor filtresi "Bu ay"ın DIŞINDA kalsa da "Özel aralık"
 * ile her zaman görülebilir):
 *   - GELDİ (attended, yeşil)
 *   - İŞLENDİ (processed, sarı) — gerekçe: "Öğrenci talebiyle ders
 *     işlenmiş sayıldı."
 *   - TELAFİ (makeup, kırmızı) — gerekçe: "Öğretmen program değişikliği
 *     nedeniyle telafi."
 *   - GELMEDİ (absent, gri/turuncu)
 *   - MAZERETLİ (excused, mor/nötr mavi)
 *   - İPTAL (cancelled, koyu gri)
 *   - RİSK ÖĞRENCİ — AYNI takvim ayında (2026-08) 3 "İşlendi" ders → tam
 *     olarak BİR risk bildirimi (tenant admin/superadmin'e,
 *     notifyAdmins ile) — idempotency ZATEN `student-attendance-risk-log.ts`
 *     tarafından garanti edilir, burada YENİDEN İCAT EDİLMEZ.
 *
 * İdempotenlik: script, kendi oluşturduğu DEMO öğretmeni adından (aşağıdaki
 * DEMO_TAG'i içeren, tek/benzersiz bir isim) tanır — ikinci çalıştırmada bu
 * öğretmen zaten varsa TÜM seed adımı atlanır, hiçbir yeni kayıt üretilmez
 * (store.json'a ek satır yazan diğer script'lerin AYNI ilkesi — bkz.
 * seed-demo-schedule.ts "zaten programı olan" kontrolü).
 *
 * STORE_MODE=json UYARISI: src/lib/atomic-json-file.ts yalnızca AYNI process
 * içindeki eşzamanlı yazmaları korur — process'ler ARASI kilit YOKTUR. Bu
 * scripti `npm run dev` AÇIKKEN çalıştırmayın.
 *
 * Kullanım: npm run seed:attendance-demo (== npx tsx scripts/seed-attendance-demo.ts)
 */
import "dotenv/config";
import { readData } from "../src/lib/store";
import { readData as readDataJson, writeData as writeDataJson } from "../src/lib/store-json";
import { runWithTenantAsync } from "../src/lib/tenant-context";
import { DEFAULT_TENANT_ID } from "../src/lib/auth/config";
import { uid } from "../src/lib/utils";
import type { Lesson } from "../src/lib/types";
import {
  createTeacherTool,
  createRoomTool,
  createStudentTool,
  createLessonTool,
  setLessonOpsFlagTool,
  cancelLessonTool,
} from "../src/lib/services/tools";
import type { ServiceContext } from "../src/lib/services/context";

// P0-F — bu tag isimde/e-postada görünür, kalıcı bir demoTag ALANI İCAT
// EDİLMEDİ (Lesson tipinde yok — yalnız LessonSeries'te var, bkz.
// types.ts); "[DEMO-YOKLAMA]" öneki hem idempotency kontrolü hem de
// gerçek personelin kayıtlarıyla karışmaması için görsel/greplenebilir
// bir işaretçi olarak yeterli ve daha küçük bir değişiklik yüzeyi.
const DEMO_TAG = "[DEMO-YOKLAMA]";
const DEMO_TEACHER_NAME = `${DEMO_TAG} Vitrin Öğretmeni`;
const DEMO_ROOM_NAME = `${DEMO_TAG} Vitrin Odası`;
const DEMO_STUDENT_STATUS_NAME = `${DEMO_TAG} Durum Vitrini Öğrencisi`;
const DEMO_STUDENT_RISK_NAME = `${DEMO_TAG} Risk Öğrencisi`;
const BRANCH_ID = "erzene";
const INSTRUMENT = "Piyano";

const ctx: ServiceContext = {
  role: "SCHOOL_ADMIN",
  tenantId: DEFAULT_TENANT_ID,
  userId: "seed_attendance_demo_script",
  channel: "web",
};

/** Geçmiş bir ay (2026-08) — "bugün" (2026-09-02) ne olursa olsun KESİN geçmiş kalır. */
const DEMO_MONTH = "2026-08";

function pastAt(day: number, hour: string): string {
  return `${DEMO_MONTH}-${String(day).padStart(2, "0")}T${hour}:00.000Z`;
}

async function requireOk<T>(label: string, promise: Promise<{ ok: true; data: T } | { ok: false; error: { message: string } }>): Promise<T> {
  const res = await promise;
  if (!res.ok) throw new Error(`${label} başarısız: ${res.error.message}`);
  return res.data;
}

async function main() {
  // P0 (2026-09-03) — `NODE_ENV=production` tek başına Vercel prod'u
  // yakalamayabilir (Vercel preview deploy'ları da `NODE_ENV=production`
  // set edebilir, AMA gerçek prod ayrıca `VERCEL_ENV=production` taşır) —
  // ikisinden BİRİ bile prod işareti taşıyorsa KOŞULSUZ reddedilir.
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
        "çalışıyorsa bu scripti ÇALIŞTIRMAYIN (cross-process dosya kilidi yok, " +
        "bkz. src/lib/atomic-json-file.ts). Önce dev server'ı durdurun."
    );
  }

  await runWithTenantAsync(DEFAULT_TENANT_ID, async () => {
    const before = await readData();
    const alreadySeeded = before.teachers.some((t) => t.name === DEMO_TEACHER_NAME);
    if (alreadySeeded) {
      console.log(
        `Atlandı — demo zaten seed edilmiş (öğretmen "${DEMO_TEACHER_NAME}" mevcut). ` +
          "Yinelenen kayıt oluşturulmadı. Sıfırdan yeniden seed etmek için önce demo " +
          "öğretmeni/öğrencileri/odayı panelden manuel silin."
      );
      return;
    }

    // Geniş açık müsaitlik (her gün 00:00-23:59) — GERÇEK öğretmenlerin
    // müsaitlik/çakışma kısıtına HİÇ takılmadan, tamamen İZOLE bir demo
    // öğretmen+oda kullanılır (mevcut hiçbir gerçek veriye dokunulmaz).
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
        phone: "0500 000 0000",
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
      const studentId = await requireOk(
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
          enrollmentStartDate: `${DEMO_MONTH}-01`,
          firstPaymentCollected: { method: "cash", amount: 3000, collectedAt: `${DEMO_MONTH}-01` },
        })
      ).then((d) => d.studentId);
      return studentId;
    }

    const statusStudentId = await createDemoStudent(DEMO_STUDENT_STATUS_NAME, "1001");
    const riskStudentId = await createDemoStudent(DEMO_STUDENT_RISK_NAME, "1002");

    // P0-F — kök neden: `createLessonTool` (ve altındaki `validateLessonSlot`)
    // KASITLI olarak geçmiş bir `startAt`'ı reddeder ("Başlangıç saati
    // geçmişte olamaz.") — bu, GERÇEK kullanıcı hatalarını (yanlışlıkla
    // geçmişe ders planlamak) önleyen DEĞERLİ bir korumadır ve BURADA
    // GEVŞETİLMEZ/kaldırılmaz. Bu script GEÇMİŞ (zaten olmuş) dersleri
    // TEMSİL etmek zorunda olduğundan — `seed-ogrenci-demo-json.ts` ile
    // AYNI, önceden kabul edilmiş desen: yalnız STORE_MODE=json için,
    // Lesson kaydı `addLesson`'ın ÜRETTİĞİ AYNI şekilde doğrudan
    // store-json'a yazılır (atomic — bkz. store-json.ts writeData). Ders
    // OLUŞTUKTAN SONRAKİ durum geçişi (attended/processed/makeup/absent/
    // excused/cancelled) GERÇEK Tool Layer çağrılarıyla yapılır (aşağıda)
    // — `setLessonOpsFlagTool`/`cancelLessonTool` var olan bir dersin
    // durumunu değiştirir, YENİ bir ders PLANLAMAZ, bu yüzden geçmiş
    // tarih kısıtı hiç ÖNCELİKLE onlara uygulanmaz.
    async function createDemoLesson(studentId: string, startAt: string): Promise<string> {
      const endAt = new Date(new Date(startAt).getTime() + 40 * 60_000).toISOString();
      const lesson: Lesson = {
        id: uid("les"),
        studentId,
        teacherId,
        roomId,
        branchId: BRANCH_ID,
        instrument: INSTRUMENT,
        startAt,
        endAt,
        type: "regular",
        status: "scheduled",
      };
      const data = await readDataJson();
      data.lessons.push(lesson);
      await writeDataJson(data);
      return lesson.id;
    }

    // 1) GELDİ (yeşil) — 5 Ağustos 2026 10:00.
    const attendedId = await createDemoLesson(statusStudentId, pastAt(5, "10:00"));
    await requireOk("setLessonOpsFlagTool(attended)", setLessonOpsFlagTool(ctx, { lessonId: attendedId, flag: "attended" }));

    // 2) İŞLENDİ (sarı) — 6 Ağustos 2026 10:00.
    const processedId = await createDemoLesson(statusStudentId, pastAt(6, "10:00"));
    await requireOk(
      "setLessonOpsFlagTool(processed)",
      setLessonOpsFlagTool(ctx, {
        lessonId: processedId,
        flag: "processed",
        reason: "Öğrenci talebiyle ders işlenmiş sayıldı.",
      })
    );

    // 3) TELAFİ (kırmızı) — 7 Ağustos 2026 10:00.
    const makeupId = await createDemoLesson(statusStudentId, pastAt(7, "10:00"));
    await requireOk(
      "setLessonOpsFlagTool(makeup)",
      setLessonOpsFlagTool(ctx, {
        lessonId: makeupId,
        flag: "makeup",
        reason: "Öğretmen program değişikliği nedeniyle telafi.",
      })
    );

    // 4) GELMEDİ (gri/turuncu) — 8 Ağustos 2026 10:00.
    const absentId = await createDemoLesson(statusStudentId, pastAt(8, "10:00"));
    await requireOk("setLessonOpsFlagTool(absent)", setLessonOpsFlagTool(ctx, { lessonId: absentId, flag: "absent" }));

    // 5) MAZERETLİ (mor/nötr mavi) — 9 Ağustos 2026 10:00.
    const excusedId = await createDemoLesson(statusStudentId, pastAt(9, "10:00"));
    await requireOk("setLessonOpsFlagTool(excused)", setLessonOpsFlagTool(ctx, { lessonId: excusedId, flag: "excused" }));

    // 6) İPTAL (koyu gri) — 10 Ağustos 2026 10:00.
    const cancelledId = await createDemoLesson(statusStudentId, pastAt(10, "10:00"));
    await requireOk("cancelLessonTool", cancelLessonTool(ctx, { lessonId: cancelledId }));

    // 7) RİSK ÖĞRENCİ — AYNI ay (2026-08) içinde 3 "İşlendi" ders, SIRAYLA
    // işlenir; risk bildirimi eşiği (>2, yani 3.'de) yalnız SON derste
    // aşılır — `notifyAttendanceRiskIfThresholdCrossed`
    // (setLessonOpsFlagTool içinde ZATEN bağlı, bkz. tools.ts) idempotency'yi
    // KENDİSİ garanti eder; burada yeniden İCAT EDİLMEZ.
    const riskDays = [12, 13, 14];
    for (const day of riskDays) {
      const lessonId = await createDemoLesson(riskStudentId, pastAt(day, "10:00"));
      await requireOk(
        "setLessonOpsFlagTool(processed, risk)",
        setLessonOpsFlagTool(ctx, {
          lessonId,
          flag: "processed",
          reason: "Öğrenci talebiyle ders işlenmiş sayıldı.",
        })
      );
    }

    // 8) GÜNCEL/GELECEK DERSLER — Ders Programı ekranı varsayılan olarak
    // İÇİNDE BULUNULAN HAFTAYI gösterir; yukarıdaki 6 ders KASITLI olarak
    // GEÇMİŞTE (2026-08, Yoklama Raporu testi için) — bu yüzden demo
    // öğrencisi Ders Programı'nı bugün açan bir kullanıcıya HİÇ görünmezdi
    // (kök neden: seed verisi ekranın varsayılan tarih aralığının DIŞINDA,
    // bir filtre/ilişki hatası DEĞİL). Bunu gidermek için AYNI öğrenciye
    // `createLessonTool` ile (gerçek gelecek tarih, gerçek kapalı-gün
    // kuralından geçerek) birkaç GÜNCEL/gelecek ders eklenir — Ders
    // Programı'nda da normal bir öğrenci gibi görünür.
    const upcomingLessonIds: string[] = [];
    for (const offsetDays of [1, 3, 8]) {
      const day = new Date();
      day.setUTCDate(day.getUTCDate() + offsetDays);
      if (day.getUTCDay() === 1) day.setUTCDate(day.getUTCDate() + 1); // Pazartesi kapalı — legacy kural
      day.setUTCHours(11, 0, 0, 0);
      const created = await requireOk(
        "createLessonTool",
        createLessonTool(ctx, {
          studentId: statusStudentId,
          teacherId,
          roomId,
          instrument: INSTRUMENT,
          startAt: day.toISOString(),
        })
      );
      upcomingLessonIds.push(created.lessonId);
    }

    console.log("Tamamlandı — Yoklama Raporu demo verisi oluşturuldu:");
    console.log(`  Öğretmen: ${DEMO_TEACHER_NAME} (${teacherId})`);
    console.log(`  Oda: ${DEMO_ROOM_NAME} (${roomId})`);
    console.log(`  Durum vitrini öğrencisi: ${DEMO_STUDENT_STATUS_NAME} (${statusStudentId}) — 6 geçmiş ders (Geldi/İşlendi/Telafi/Gelmedi/Mazeretli/İptal) + ${upcomingLessonIds.length} güncel/gelecek Planlandı ders`);
    console.log(`  Risk öğrencisi: ${DEMO_STUDENT_RISK_NAME} (${riskStudentId}) — 3 "İşlendi" ders, ${DEMO_MONTH} ayında`);
    console.log("  Rapor: /panel/yoklama-raporu — filtre 'Özel aralık' ile 2026-08-01 – 2026-08-31 seçin.");
    console.log("  Ders Programı: /panel/program — içinde bulunulan hafta veya sonraki haftalarda görünür.");
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

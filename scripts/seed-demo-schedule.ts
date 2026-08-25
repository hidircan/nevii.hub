/**
 * Demo ders programı seed script'i — mevcut haftadan başlayıp en az 3 ay
 * sonrasına uzanan, TEKRARLAYAN (haftalık) ders serileri oluşturur (Faz 6,
 * bkz. docs/implementation-plans/notaplan-product-expansion.md).
 *
 * Aktif, henüz hiçbir aktif seriye sahip olmayan HER öğrenci için: öğrencinin
 * KENDİ atanmış öğretmeni/şubesi/enstrümanı kullanılır (yeni bir eşleştirme
 * icat edilmez), öğretmenin müsaitlik pencerelerinden ilk uygun olanı ve
 * şubede o enstrümanı destekleyen ilk uygun oda seçilir. Zaten bir programı
 * olan (gerçek ya da daha önce demo ile oluşturulmuş) öğrenciler ASLA
 * dokunulmaz — bu, gerçek kullanıcı verisinin hiç değişmemesini garanti eder.
 *
 * Tool Layer üzerinden (createLessonSeriesTool — RBAC, çakışma/müsaitlik
 * doğrulaması ve tek özet bildirim dahil, mevcut kurallarla birebir aynı
 * yoldan) ders serisi ekler; src/lib/seed.ts'in createSeedData()'sına DOKUNMAZ.
 *
 * İdempotenlik: "öğrencinin zaten aktif bir serisi var mı?" kontrolü ile
 * ikinci çalıştırmada hiçbir yeni kayıt üretilmez.
 *
 * Demo etiketi: oluşturulan her LessonSeries, gerçek (insan tarafından
 * girilen) serilerden ayırt edilebilmesi için `demoTag` alanına DEMO_TAG
 * değerini yazar (bkz. prisma/schema.prisma LessonSeries.demoTag).
 *
 * STORE_MODE=json UYARISI: src/lib/atomic-json-file.ts yalnızca AYNI process
 * içindeki eşzamanlı yazmaları korur — process'ler ARASI kilit YOKTUR. Bu
 * scripti `npm run dev` AÇIKKEN çalıştırmayın (aynı data/store.json dosyasına
 * yarışan yazmalar veri kaybına yol açabilir).
 *
 * Kullanım: npm run seed:demo-schedule  (== npx tsx scripts/seed-demo-schedule.ts)
 */
import "dotenv/config";
import { addDays, format, getDay } from "date-fns";
import { readData } from "../src/lib/store";
import { runWithTenantAsync } from "../src/lib/tenant-context";
import { DEFAULT_TENANT_ID } from "../src/lib/auth/config";
import { createLessonSeriesTool } from "../src/lib/services/tools";
import type { ServiceContext } from "../src/lib/services/context";

const ctx: ServiceContext = {
  role: "SCHOOL_ADMIN",
  tenantId: DEFAULT_TENANT_ID,
  userId: "seed_demo_schedule_script",
  channel: "web",
};

const DEMO_TAG = "demo-schedule-seed-v2-3ay";

/**
 * "En az 3 ay" garantisi mevcut haftadan (BUGÜNDEN) itibarendir; en kötü
 * durumda (öğretmenin müsait olduğu gün BUGÜNSE) startsOn=bugün olur — bu
 * yüzden yalnızca (WEEKS-1)*7 gün ile ölçüldüğünde bile 90 günü aşacak kadar
 * geniş tutulur.
 */
const WEEKS = 13;

function nextDateForWeekday(from: Date, weekday: number): Date {
  let cursor = from;
  let guard = 0;
  while (getDay(cursor) !== weekday && guard < 7) {
    cursor = addDays(cursor, 1);
    guard += 1;
  }
  return cursor;
}

function iso(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function toHHMM(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Bir müsaitlik penceresi içindeki tüm olası ders başlangıç saatleri (durationMinutes adımlarla). */
function candidateStartTimes(window: { start: string; end: string }, durationMinutes: number): string[] {
  const times: string[] = [];
  for (let t = toMinutes(window.start); t + durationMinutes <= toMinutes(window.end); t += durationMinutes) {
    times.push(toHHMM(t));
  }
  return times;
}

const today = new Date();

async function main() {
  if (process.env.STORE_MODE === "json") {
    console.warn(
      "[UYARI] STORE_MODE=json — `npm run dev` şu an açık bir process'te " +
        "çalışıyorsa bu scripti ÇALIŞTIRMAYIN (cross-process dosya kilidi yok, " +
        "bkz. src/lib/atomic-json-file.ts). Önce dev server'ı durdurun."
    );
  }

  await runWithTenantAsync(DEFAULT_TENANT_ID, async () => {
    const data = await readData();
    const activeStudents = data.students.filter((s) => s.active && !s.archivedAt);
    const studentsWithActiveSeries = new Set(
      data.lessonSeries.filter((s) => s.status === "active").map((s) => s.studentId)
    );

    let created = 0;
    let skippedHasSchedule = 0;
    let skippedNoMatch = 0;

    for (const student of activeStudents) {
      if (studentsWithActiveSeries.has(student.id)) {
        skippedHasSchedule += 1;
        continue;
      }

      const teacher = data.teachers.find((t) => t.id === student.teacherId && t.active);
      const instrument = student.instruments[0] ?? teacher?.instruments[0];
      if (!teacher || !instrument) {
        console.log(`Atlandı (uygun öğretmen/enstrüman yok): ${student.name}`);
        skippedNoMatch += 1;
        continue;
      }

      const candidateRooms = data.rooms.filter(
        (r) => r.branchId === student.branchId && (r.active ?? true) && r.instruments.includes(instrument)
      );
      if (candidateRooms.length === 0) {
        console.log(`Atlandı (şubede uygun oda yok): ${student.name}`);
        skippedNoMatch += 1;
        continue;
      }

      // Demo eşleştirici — her müsaitlik penceresi, durationMinutes adımlarla
      // TÜM olası başlangıç saatleri VE şubedeki enstrümanı destekleyen TÜM
      // odalar denenerek taranır (yalnızca pencere başlangıcı/ilk oda değil);
      // çakışırsa bir sonrakine geçilir, hiçbiri uymazsa öğrenci atlanır.
      const durationMinutes = student.lessonDurationMinutes ?? 40;
      const candidateWindows = (teacher.availability ?? []).filter(
        (w) => w.dayOfWeek !== 1 && (!w.branchId || w.branchId === student.branchId)
      );

      let matched = false;
      for (const window of candidateWindows) {
        const startsOn = nextDateForWeekday(today, window.dayOfWeek);
        const endsOn = addDays(startsOn, (WEEKS - 1) * 7);

        for (const startTime of candidateStartTimes(window, durationMinutes)) {
          for (const room of candidateRooms) {
            const res = await createLessonSeriesTool(ctx, {
              studentId: student.id,
              teacherId: teacher.id,
              roomId: room.id,
              branchId: student.branchId,
              instrument,
              weekday: window.dayOfWeek,
              startTime,
              durationMinutes,
              startsOn: iso(startsOn),
              endsOn: iso(endsOn),
              demoTag: DEMO_TAG,
            });

            if (res.ok) {
              matched = true;
              created += 1;
              console.log(
                `Oluşturuldu: ${student.name} (${teacher.name}) — ${iso(startsOn)}'dan ${iso(endsOn)}'a, ` +
                  `${res.data.createdLessonIds.length} ders`
              );
              break;
            }
          }
          if (matched) break;
        }
        if (matched) break;
      }

      if (!matched) {
        console.log(`Atlandı (uygun boş slot bulunamadı): ${student.name}`);
        skippedNoMatch += 1;
      }
    }

    console.log(
      `Tamamlandı. Oluşturulan: ${created}, zaten programı olan: ${skippedHasSchedule}, ` +
        `uygun eşleşme bulunamayan: ${skippedNoMatch}.`
    );
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * P0-2D — aynı öğrenci/aynı takvim ayı/aynı tenant için "işlenmiş ders"
 * risk bildiriminin İKİNCİ KEZ üretilmesini engelleyen idempotent
 * tekilleştirme kaydı. AYNI desen: `lesson-homework-reminder-log.ts`
 * (`recordHomeworkReminderIfNew`) — DB modda `@@unique([tenantId,
 * studentId, calendarMonth])` ihlalini (P2002) ATOMİK olarak yakalar,
 * json/memory modda var-mı kontrolüyle aynı garanti. Yeni, paralel, zayıf
 * bir dedupe sistemi İCAT EDİLMEDİ.
 */
import path from "path";
import { isDbMode, resolveDataDir } from "./config";
import { uid } from "./utils";

const FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "student-attendance-risk-log.json");
export const STUDENT_ATTENDANCE_RISK_LOG_FILE = FILE;

type StoredEntry = {
  id: string;
  tenantId: string;
  studentId: string;
  calendarMonth: string;
  threshold: number;
  triggeredByLessonId: string;
  triggeredAt: string;
};

async function loadAll(): Promise<StoredEntry[]> {
  try {
    const fs = await import("fs/promises");
    return JSON.parse(await fs.readFile(FILE, "utf8")) as StoredEntry[];
  } catch {
    return [];
  }
}

async function saveAll(rows: StoredEntry[]): Promise<void> {
  const fs = await import("fs/promises");
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(rows, null, 2));
}

/**
 * Bu (tenant, öğrenci, ay) için daha önce hiç kaydedilmemişse kaydeder ve
 * `true` döner (= çağıran bildirimi göndermeli); zaten varsa `false` döner
 * (= duplicate, bildirim GÖNDERİLMEMELİ).
 */
export async function recordAttendanceRiskLogIfNew(input: {
  tenantId: string;
  studentId: string;
  calendarMonth: string;
  threshold: number;
  triggeredByLessonId: string;
}): Promise<boolean> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    try {
      await prisma.studentAttendanceRiskLog.create({
        data: {
          id: uid("attrisk"),
          tenantId: input.tenantId,
          studentId: input.studentId,
          calendarMonth: input.calendarMonth,
          threshold: input.threshold,
          triggeredByLessonId: input.triggeredByLessonId,
        },
      });
      return true;
    } catch (e) {
      const code = (e as { code?: string } | null)?.code;
      if (code === "P2002") return false;
      throw e;
    }
  }
  const all = await loadAll();
  const exists = all.some(
    (r) =>
      r.tenantId === input.tenantId && r.studentId === input.studentId && r.calendarMonth === input.calendarMonth
  );
  if (exists) return false;
  await saveAll([
    ...all,
    {
      id: uid("attrisk"),
      tenantId: input.tenantId,
      studentId: input.studentId,
      calendarMonth: input.calendarMonth,
      threshold: input.threshold,
      triggeredByLessonId: input.triggeredByLessonId,
      triggeredAt: new Date().toISOString(),
    },
  ]);
  return true;
}

/** Demo/kurulum sıfırlaması + testler için. */
export async function clearStudentAttendanceRiskLog(tenantId: string): Promise<void> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    await prisma.studentAttendanceRiskLog.deleteMany({ where: { tenantId } });
    return;
  }
  const all = await loadAll();
  const remaining = all.filter((r) => r.tenantId !== tenantId);
  if (remaining.length !== all.length) await saveAll(remaining);
}

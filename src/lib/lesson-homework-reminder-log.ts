/**
 * Faz 3C — "ders işlendi ama ödev verilmedi" hatırlatmasının idempotent
 * tekilleştirme kaydı. Aynı desen: task-reminder-log.ts recordReminderIfNew
 * — ama bu olay ders başına EN FAZLA BİR KEZ olur (günlük tekrar yok).
 * DB modda `@@unique([tenantId, lessonId])` ihlali (P2002) yarışı ATOMİK
 * olarak çözer; json/memory modda var-mı kontrolü ile aynı garanti.
 */
import path from "path";
import { isDbMode, resolveDataDir } from "./config";
import { uid } from "./utils";

const FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "lesson-homework-reminder-log.json");
export const LESSON_HOMEWORK_REMINDER_LOG_FILE = FILE;

type StoredEntry = { id: string; tenantId: string; lessonId: string; createdAt: string };

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

/** Bu ders için daha önce hiç kaydedilmemişse kaydeder ve `true` döner; zaten varsa `false`. */
export async function recordHomeworkReminderIfNew(tenantId: string, lessonId: string): Promise<boolean> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    try {
      await prisma.lessonHomeworkReminderLog.create({
        data: { id: uid("hwremind"), tenantId, lessonId },
      });
      return true;
    } catch (e) {
      const code = (e as { code?: string } | null)?.code;
      if (code === "P2002") return false;
      throw e;
    }
  }
  const all = await loadAll();
  const exists = all.some((r) => r.tenantId === tenantId && r.lessonId === lessonId);
  if (exists) return false;
  await saveAll([...all, { id: uid("hwremind"), tenantId, lessonId, createdAt: new Date().toISOString() }]);
  return true;
}

/** Demo/kurulum sıfırlaması + testler için. */
export async function clearLessonHomeworkReminderLog(tenantId: string): Promise<void> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    await prisma.lessonHomeworkReminderLog.deleteMany({ where: { tenantId } });
    return;
  }
  const all = await loadAll();
  const remaining = all.filter((r) => r.tenantId !== tenantId);
  if (remaining.length !== all.length) await saveAll(remaining);
}

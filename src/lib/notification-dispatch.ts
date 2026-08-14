import type { NotificationCategory } from "./notification-categories";
import { createNotification, listNotificationsForUser } from "./notifications";
import { isCategoryEnabledForUser } from "./notification-preferences";

const DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function notifyUserIfEnabled(input: {
  tenantId: string;
  userId: string;
  category: NotificationCategory;
  title: string;
  body: string;
  dedupeKey: string;
  windowMs?: number;
}): Promise<"created" | "skipped" | "duplicate"> {
  try {
    const enabled = await isCategoryEnabledForUser(input.tenantId, input.userId, input.category);
    if (!enabled) return "skipped";
    const since = Date.now() - (input.windowMs ?? DEFAULT_WINDOW_MS);
    const existing = await listNotificationsForUser({ tenantId: input.tenantId, userId: input.userId });
    const dup = existing.some(
      (n) =>
        n.kind === input.category &&
        n.body.includes(input.dedupeKey) &&
        new Date(n.createdAt).getTime() >= since
    );
    if (dup) return "duplicate";
    await createNotification({
      tenantId: input.tenantId,
      targetUserId: input.userId,
      kind: input.category,
      title: input.title,
      body: input.body,
    });
    return "created";
  } catch {
    return "skipped";
  }
}

export async function notifyStudentIfEnabled(input: {
  tenantId: string;
  studentId: string;
  category: NotificationCategory;
  title: string;
  body: string;
  dedupeKey: string;
  windowMs?: number;
}): Promise<void> {
  try {
    const { getUserIdByStudentId, getParentUserIdsByStudentId } = await import("./auth/users");
    const studentUserId = await getUserIdByStudentId(input.tenantId, input.studentId);
    const parentIds = await getParentUserIdsByStudentId(input.tenantId, input.studentId);
    const ids = new Set<string>([...parentIds, ...(studentUserId ? [studentUserId] : [])]);
    for (const userId of ids) {
      await notifyUserIfEnabled({ ...input, userId });
    }
  } catch {
    // best-effort
  }
}

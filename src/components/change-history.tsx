import { listAuditLogs } from "@/lib/audit/log";
import { describeAuditEvent, fieldLabel, formatAuditValue, readAuditChanges } from "@/lib/audit/humanize";
import { resolveActorLabels } from "@/lib/contract-payment-plan-view";
import { formatDateTime } from "@/lib/utils";
import type { Teacher } from "@/lib/types";

/**
 * Kritik varlıklar için değişiklik geçmişi (öğrenci, ödeme, hakediş…).
 * Kaynak: AuditLog (tenant + entityType + entityId indeksi) — en yeni `limit` kayıt.
 * Her satır: kim · ne zaman · ne yaptı (Türkçe cümle) + varsa alan-düzeyi "önce → sonra".
 */
export async function ChangeHistory({
  tenantId,
  entityType,
  entityIds,
  entityName,
  teachers,
  limit = 25,
  title = "Değişiklik geçmişi",
}: {
  tenantId: string;
  entityType: string;
  /** Bir ekran birden çok kaydın geçmişini gösterebilir (ör. öğrencinin tüm ödemeleri). */
  entityIds: string[];
  entityName?: string;
  teachers: Pick<Teacher, "id" | "name" | "email">[];
  limit?: number;
  title?: string;
}) {
  const ids = Array.from(new Set(entityIds)).slice(0, 200);
  const logs = ids.length ? await listAuditLogs(tenantId, { entityType, entityIds: ids, limit }) : [];
  const names = await resolveActorLabels({ tenantId, userIds: logs.map((l) => l.actorUserId), teachers });

  return (
    <section aria-label={title}>
      <h2 className="mb-2 text-sm font-semibold text-[var(--color-text)]">{title}</h2>
      {logs.length === 0 ? (
        <p className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] px-3 py-3 text-xs text-[var(--color-text-muted)]">
          Henüz kayıtlı değişiklik yok. Bu özellik açılmadan önceki düzenlemeler burada görünmez.
        </p>
      ) : (
        <ol className="divide-y divide-[var(--color-border)] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
          {logs.map((log) => {
            const changes = readAuditChanges(log.meta);
            const metaName = typeof log.meta?.entityName === "string" ? (log.meta.entityName as string) : undefined;
            return (
              <li key={log.id} className="px-3 py-2">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <p className="text-sm text-[var(--color-text)]">
                    {describeAuditEvent({
                      action: log.action,
                      entityType: log.entityType,
                      outcome: log.outcome,
                      actorName: names.get(log.actorUserId) ?? "Bilinmeyen kullanıcı",
                      entityName: metaName ?? entityName,
                    })}
                  </p>
                  <time className="shrink-0 text-[11px] tabular-nums text-[var(--color-text-muted)]" dateTime={log.createdAt.toISOString()}>
                    {formatDateTime(log.createdAt.toISOString())}
                  </time>
                </div>
                {changes.length > 0 ? (
                  <ul className="mt-1 space-y-0.5 text-xs text-[var(--color-text-muted)]">
                    {changes.slice(0, 12).map((c) => (
                      <li key={c.field}>
                        <span className="font-medium text-[var(--color-text)]">{fieldLabel(c.field)}:</span>{" "}
                        <span className="line-through decoration-[var(--color-border-strong)]">{formatAuditValue(c.from)}</span> →{" "}
                        <span className="text-[var(--color-text)]">{formatAuditValue(c.to)}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {typeof log.meta?.reason === "string" && log.meta.reason ? (
                  <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">Gerekçe: {log.meta.reason as string}</p>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

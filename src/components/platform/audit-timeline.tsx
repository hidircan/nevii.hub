import { Card } from "@/components/ui";
import type { PlatformAuditEvent } from "@/lib/platform/types";
import { auditActionLabel, auditEntityLabel, auditOutcomeLabel } from "@/lib/platform/audit-labels";
import { roleLabelTr } from "@/lib/auth/role-labels";
import type { AppRole } from "@/lib/auth/types";

const OUTCOME_COLOR: Record<string, string> = {
  success: "var(--color-success)",
  denied: "var(--color-danger)",
  error: "var(--color-danger)",
};

function short(v: unknown): string {
  if (v === null || v === undefined) return "—";
  const s = JSON.stringify(v);
  return s.length > 400 ? `${s.slice(0, 400)}…` : s;
}

/** Denetim zaman çizelgesi — kim, ne zaman, hangi kurum (okunabilir dil; ham kod ipucunda). */
export function AuditTimeline({ events, tenantNames }: { events: PlatformAuditEvent[]; tenantNames: Record<string, string> }) {
  if (events.length === 0) return <Card><p className="text-sm text-[var(--color-text-muted)]">Kayıt yok</p></Card>;
  return (
    <ol className="space-y-2">
      {events.map((e) => (
        <li key={e.id}>
          <Card>
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <span className="font-medium" title={e.action}>
                {auditActionLabel(e.action)}
              </span>
              <span className="text-xs text-[var(--color-text-muted)]">{new Date(e.createdAt).toLocaleString("tr-TR")}</span>
            </div>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              <span style={{ color: OUTCOME_COLOR[e.outcome] ?? "var(--color-text-muted)" }}>{auditOutcomeLabel(e.outcome)}</span>
              {" · "}
              {roleLabelTr(e.actorRole as AppRole)}
              {" · "}
              {e.targetTenantId ? (tenantNames[e.targetTenantId] ?? e.targetTenantId) : "Platform geneli"}
              {" · "}
              {auditEntityLabel(e.entityType)}
            </p>
            <details className="mt-1 text-xs">
              <summary className="cursor-pointer text-[var(--color-text-muted)] hover:underline">Teknik ayrıntı</summary>
              <p className="mt-1 font-mono text-[11px] text-[var(--color-text-muted)]">
                {e.action} · aktör {e.actorUserId} · {e.entityType}:{e.entityId} · istek {e.requestId}
              </p>
              {e.before !== null || e.after !== null ? (
                <div className="mt-1 grid gap-2 sm:grid-cols-2">
                  <pre className="overflow-auto whitespace-pre-wrap break-all rounded bg-[var(--color-surface-muted)] p-2">{short(e.before)}</pre>
                  <pre className="overflow-auto whitespace-pre-wrap break-all rounded bg-[var(--color-surface-muted)] p-2">{short(e.after)}</pre>
                </div>
              ) : null}
            </details>
          </Card>
        </li>
      ))}
    </ol>
  );
}

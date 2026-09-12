import { Card } from "@/components/ui";
import type { PlatformAuditEvent } from "@/lib/platform/types";

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

/** Denetim zaman çizelgesi — kim, ne zaman, hangi kurum, önceki/yeni değer (secret redakte). */
export function AuditTimeline({ events }: { events: PlatformAuditEvent[] }) {
  if (events.length === 0) return <Card><p className="text-sm text-[var(--color-text-muted)]">Kayıt yok</p></Card>;
  return (
    <ol className="space-y-2">
      {events.map((e) => (
        <li key={e.id}>
          <Card>
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <span className="font-medium">{e.action}</span>
              <span className="text-xs text-[var(--color-text-muted)]">{new Date(e.createdAt).toLocaleString("tr-TR")}</span>
            </div>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              <span style={{ color: OUTCOME_COLOR[e.outcome] }}>{e.outcome}</span> · aktör {e.actorRole} ({e.actorUserId}) · hedef{" "}
              {e.targetTenantId ?? "platform"} · {e.entityType}:{e.entityId} · istek {e.requestId}
            </p>
            {e.before !== null || e.after !== null ? (
              <details className="mt-1 text-xs">
                <summary className="cursor-pointer text-[var(--color-primary)]">Önceki / yeni değer</summary>
                <div className="mt-1 grid gap-2 sm:grid-cols-2">
                  <pre className="overflow-auto whitespace-pre-wrap break-all rounded bg-[var(--color-surface-muted)] p-2">{short(e.before)}</pre>
                  <pre className="overflow-auto whitespace-pre-wrap break-all rounded bg-[var(--color-surface-muted)] p-2">{short(e.after)}</pre>
                </div>
              </details>
            ) : null}
          </Card>
        </li>
      ))}
    </ol>
  );
}

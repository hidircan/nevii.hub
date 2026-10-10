import { PageHeader, Card, Badge } from "@/components/ui";
import { listAiExecutions } from "@/lib/ai/metrics";
import { listAiAuditLogs } from "@/lib/ai/audit-hook";
import { AiCapabilityLogTable, type CapabilityLogRow } from "@/components/ai/ai-capability-log-table";
import { requireSessionContext } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import Link from "@/components/link";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AiLogsPage() {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/ai/logs");
  }

  const [logs, capabilityLogs] = await Promise.all([
    listAiExecutions({ tenantId: session.tenantId, limit: 150 }),
    listAiAuditLogs(session.tenantId, 150),
  ]);

  const capabilityRows: CapabilityLogRow[] = capabilityLogs.map((log) => ({
    id: log.id,
    createdAtIso: log.createdAt.toISOString(),
    capabilityId: log.capabilityId,
    callerRole: log.callerRole,
    chosenProvider: log.chosenProvider,
    usedFallback: log.usedFallback,
    approvalStatus: log.approvalStatus,
    success: log.success,
    errorMessage: log.errorMessage,
  }));

  return (
    <div>
      <PageHeader
        title="AI Logları"
        actions={
          <Link
            href="/panel/ai"
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2 text-sm font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
          >
            Dashboard
          </Link>
        }
      />

      <AiCapabilityLogTable rows={capabilityRows} />

      <details className="group mt-8">
        <summary className="cursor-pointer text-sm font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)] dark:text-[var(--color-text-muted)] dark:hover:text-slate-100">
          Sohbet / araç yürütmeleri ({logs.length}) — AI Asistan (/panel/chat) geçmişi, ayrı gösterge
        </summary>
        <Card className="mt-3 overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] text-xs uppercase tracking-wide text-[var(--color-text-muted)] dark:border-slate-800 dark:bg-slate-900/60 dark:text-[var(--color-text-muted)]">
                <tr>
                  <th className="px-3 py-2">Zaman</th>
                  <th className="px-3 py-2">Faz</th>
                  <th className="px-3 py-2">Tool</th>
                  <th className="px-3 py-2">Provider</th>
                  <th className="px-3 py-2">Süre</th>
                  <th className="px-3 py-2">Durum</th>
                  <th className="px-3 py-2">Conv / User</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
                      Kayıt yok. AI Asistan ile bir sohbet başlatın.
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="border-b border-slate-50 dark:border-slate-800">
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
                        {formatDateTime(log.at)}
                      </td>
                      <td className="px-3 py-2">
                        <Badge>{log.phase}</Badge>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{log.toolName || "—"}</td>
                      <td className="px-3 py-2 text-xs">
                        {log.provider}
                        <span className="block text-[10px] text-[var(--color-text-muted)]">{log.model}</span>
                      </td>
                      <td className="px-3 py-2 text-xs">{log.durationMs} ms</td>
                      <td className="px-3 py-2">
                        <Badge status={log.success ? "completed" : "expired"}>
                          {log.success ? "ok" : "error"}
                        </Badge>
                        {!log.success && log.error ? (
                          <span className="mt-0.5 block max-w-[180px] truncate text-[10px] text-rose-600">
                            {log.error}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-[10px] text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
                        <div className="max-w-[120px] truncate">{log.conversationId || "—"}</div>
                        <div className="truncate">{log.userId}</div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </details>
    </div>
  );
}
